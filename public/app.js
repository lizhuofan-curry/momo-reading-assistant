const $ = id => document.getElementById(id);
let selectedFile = null;
let words = [];
let allSelected = true;
let freeRemaining = 0;

function toast(message, error = false) {
  const element = $("toast");
  element.textContent = message;
  element.className = `toast show${error ? " error" : ""}`;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => { element.className = "toast"; }, 4500);
}

function setBusy(button, busy, label) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.label;
}

async function post(path, payload = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "操作失败");
  return data;
}

function sessionJson(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; }
}

function ownAiConfig() {
  const value = sessionJson("momo_ai_config");
  return value && value.provider && value.api_key && value.model ? value : null;
}

function memoToken() {
  return sessionStorage.getItem("momo_token") || "";
}

function updateConnectionUI() {
  const ai = ownAiConfig();
  const token = memoToken();
  $("ai-mode-note").innerHTML = $("ai-mode").value === "free"
    ? `此浏览器还可免费分析 <strong>${freeRemaining}</strong> 次，成功一次才扣一次。`
    : ai ? `已连接 ${escapeHtml(ai.label || ai.provider)} · ${escapeHtml(ai.model)}` : `尚未连接自己的模型，<a href="/connections/">前往连接设置</a>。`;
  $("memo-status").innerHTML = token
    ? `已在当前标签页连接你的墨墨 Token。本站是非官方工具，关闭标签页后会自动清除。`
    : `需要先在<a href="/connections/">连接设置</a>中测试你自己的墨墨 Access Token。本站是非官方工具，不保存 Token。`;
  $("quota-badge").innerHTML = `<span>免费体验 ${freeRemaining}/5</span>`;
}

async function loadQuota() {
  const data = await fetch("/api/quota", { cache: "no-store" }).then(response => response.json()).catch(() => ({ remaining: 0 }));
  freeRemaining = Number(data.remaining || 0);
  if (!freeRemaining && !ownAiConfig()) $("ai-mode").value = "own";
  updateConnectionUI();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function showMode(mode) {
  const upload = mode === "upload";
  $("upload-tab").classList.toggle("active", upload);
  $("paste-tab").classList.toggle("active", !upload);
  $("upload-view").classList.toggle("hidden", !upload);
  $("paste-view").classList.toggle("hidden", upload);
  $("source-preview").classList.toggle("hidden", !upload);
  if (!upload && $("paste-text").value.trim()) setSourceText($("paste-text").value);
}

function updateCharCount() {
  $("char-count").textContent = `${$("source-text").value.length.toLocaleString()} 个字符`;
}

function setSourceText(text) {
  $("source-text").value = text.slice(0, 150000);
  updateCharCount();
}

function formatBytes(bytes) {
  return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

function setFile(file) {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (!["pdf", "docx", "txt", "md", "markdown"].includes(extension)) {
    toast("当前支持 PDF、DOCX、TXT 和 Markdown 文件", true);
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    toast("文件不能超过 25 MB", true);
    return;
  }
  selectedFile = file;
  $("dropzone").classList.add("hidden");
  $("file-card").classList.remove("hidden");
  $("file-type").textContent = extension.toUpperCase();
  $("file-name").textContent = file.name;
  $("file-size").textContent = formatBytes(file.size);
  $("page-range").classList.toggle("hidden", extension !== "pdf");
  $("file-result").classList.add("hidden");
}

function clearFile() {
  selectedFile = null;
  $("file-input").value = "";
  $("dropzone").classList.remove("hidden");
  $("file-card").classList.add("hidden");
  $("file-result").classList.add("hidden");
}

async function readPdf(file) {
  const pdfjs = await import("/vendor/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const start = Math.max(1, Number($("start-page").value || 1));
  const requestedEnd = Number($("end-page").value || document.numPages);
  const end = Math.min(document.numPages, requestedEnd, start + 59);
  if (start > document.numPages || end < start) throw new Error(`页码范围无效，这份 PDF 共 ${document.numPages} 页。`);
  const pages = [];
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
    if (text) pages.push(`--- PDF page ${pageNumber} ---\n${text}`);
  }
  const text = pages.join("\n\n");
  if (text.length < 200) throw new Error("几乎没有提取到文字。这可能是扫描版 PDF，目前需要可复制文字的 PDF。");
  return { text, range: `共 ${document.numPages} 页，本次读取 ${start}-${end} 页` };
}

async function readFile(file) {
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (extension === "pdf") return readPdf(file);
  if (extension === "docx") {
    const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: result.value, range: "DOCX 文档" };
  }
  const buffer = await file.arrayBuffer();
  let text = "";
  for (const encoding of ["utf-8", "gb18030"]) {
    try { text = new TextDecoder(encoding, { fatal: true }).decode(buffer); break; } catch { /* try next */ }
  }
  if (!text) throw new Error("文本编码无法识别，请另存为 UTF-8 后重试。");
  return { text, range: "文本文件" };
}

function updateCount() {
  const count = words.filter(word => word.selected).length;
  $("result-count").textContent = `已选 ${count} / ${words.length} 个词`;
  allSelected = count === words.length;
  $("toggle-all").textContent = allSelected ? "全部取消" : "全部选择";
}

function renderWords() {
  $("empty").classList.add("hidden");
  $("results").classList.remove("hidden");
  $("word-list").innerHTML = words.map((item, index) => `<label class="word-entry"><input type="checkbox" data-index="${index}" ${item.selected ? "checked" : ""}><div><div class="word-line"><strong>${escapeHtml(item.word)}</strong><span class="lemma">${escapeHtml(item.lemma)}</span></div><div class="meaning">${escapeHtml(item.meaning || "未生成释义")}</div><p class="sentence">${escapeHtml(item.sentence)}</p><div class="chips">${item.mnemonic ? `<span class="chip">助记：${escapeHtml(item.mnemonic)}</span>` : ""}${item.reason ? `<span class="chip reason">${escapeHtml(item.reason)}</span>` : ""}</div></div></label>`).join("");
  $("word-list").querySelectorAll("input").forEach(input => input.addEventListener("change", event => {
    words[Number(event.target.dataset.index)].selected = event.target.checked;
    updateCount();
  }));
  updateCount();
}

function loadDemo() {
  const article = "The model learns robust temporal representations from noisy signals. Contextual embeddings improve generalization across recording sessions, while regularization reduces overfitting.";
  showMode("paste");
  $("paste-text").value = article;
  setSourceText(article);
  words = [
    { word: "robust", lemma: "robust", meaning: "稳健的；对噪声不敏感的", sentence: "The model learns robust temporal representations from noisy signals.", mnemonic: "面对扰动仍保持稳定", reason: "论文高频核心形容词", selected: true },
    { word: "temporal", lemma: "temporal", meaning: "时间的；时序的", sentence: "The model learns robust temporal representations from noisy signals.", mnemonic: "与 time 时间相关", reason: "理解时序模型必备", selected: true },
    { word: "representations", lemma: "representation", meaning: "表征；模型学习到的特征表示", sentence: "The model learns robust temporal representations from noisy signals.", mnemonic: "把原始数据重新表示", reason: "机器学习核心术语", selected: true },
    { word: "generalization", lemma: "generalization", meaning: "泛化；适应未见数据的能力", sentence: "Contextual embeddings improve generalization across recording sessions, while regularization reduces overfitting.", mnemonic: "从训练样本推广到新样本", reason: "评价模型能力的关键概念", selected: true }
  ];
  $("title").value = "示例词本（不会自动同步）";
  renderWords();
  $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("已载入结果示例；同步时需要你自己的墨墨 Token");
}

$("hero-start").addEventListener("click", () => $("workspace").scrollIntoView({ behavior: "smooth", block: "start" }));
$("try-demo").addEventListener("click", loadDemo);
$("ai-mode").addEventListener("change", updateConnectionUI);
$("upload-tab").addEventListener("click", () => showMode("upload"));
$("paste-tab").addEventListener("click", () => showMode("paste"));
$("paste-text").addEventListener("input", () => setSourceText($("paste-text").value));
$("source-text").addEventListener("input", updateCharCount);
$("file-input").addEventListener("change", event => { if (event.target.files[0]) setFile(event.target.files[0]); });
$("remove-file").addEventListener("click", clearFile);
["dragenter", "dragover"].forEach(name => $("dropzone").addEventListener(name, event => { event.preventDefault(); $("dropzone").classList.add("dragging"); }));
["dragleave", "drop"].forEach(name => $("dropzone").addEventListener(name, event => { event.preventDefault(); $("dropzone").classList.remove("dragging"); }));
$("dropzone").addEventListener("drop", event => { if (event.dataTransfer.files[0]) setFile(event.dataTransfer.files[0]); });

$("extract-file").addEventListener("click", async () => {
  if (!selectedFile) return toast("请先选择文件", true);
  const button = $("extract-file");
  setBusy(button, true, "正在本地读取…");
  try {
    const data = await readFile(selectedFile);
    const truncated = data.text.length > 150000;
    setSourceText(data.text);
    $("file-result").textContent = `读取成功 · ${data.range} · ${$("source-text").value.length.toLocaleString()} 个字符${truncated ? " · 内容过长，已截取" : ""}`;
    $("file-result").classList.remove("hidden");
    $("title").value = selectedFile.name.replace(/\.[^.]+$/, "").slice(0, 70);
    toast("文字已在浏览器本地读取，可以开始筛词");
  } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
});

$("analyze").addEventListener("click", async () => {
  const mode = $("ai-mode").value;
  const config = mode === "own" ? ownAiConfig() : null;
  if (mode === "free" && freeRemaining <= 0) return toast("免费体验已用完，请连接你自己的 AI API。", true);
  if (mode === "own" && !config) { toast("请先连接并测试你自己的 AI API。", true); setTimeout(() => { location.href = "/connections/"; }, 900); return; }
  const button = $("analyze");
  setBusy(button, true, "AI 正在阅读这份材料…");
  try {
    const data = await post("/api/analyze", { mode, ...(config || {}), article: $("source-text").value, level: $("level").value, max_words: Number($("max-words").value) });
    words = data.words;
    if (mode === "free") freeRemaining = Number(data.remaining ?? Math.max(0, freeRemaining - 1));
    updateConnectionUI();
    renderWords();
    if (!$("title").value) $("title").value = `阅读生词 ${new Date().toLocaleDateString("zh-CN").replaceAll("/", "-")}`;
    toast(`筛选完成，共得到 ${words.length} 个生词`);
  } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
});

$("toggle-all").addEventListener("click", () => { words.forEach(word => { word.selected = !allSelected; }); renderWords(); });
$("sync").addEventListener("click", async () => {
  const token = memoToken();
  if (!token) { toast("请先连接并测试你自己的墨墨 Access Token。", true); setTimeout(() => { location.href = "/connections/"; }, 900); return; }
  const chosen = words.filter(word => word.selected).map(word => word.lemma);
  if (!chosen.length) return toast("请至少选择一个生词", true);
  const button = $("sync");
  setBusy(button, true, "正在创建云词本…");
  try {
    const data = await post("/api/sync", { token, title: $("title").value, tags: [$("tag").value], words: chosen, brief: `由拾词生成，共 ${chosen.length} 个词` });
    toast(`${data.title} 已创建，共 ${data.count} 个词`);
  } catch (error) { toast(error.message, true); } finally { setBusy(button, false); }
});

window.addEventListener("pageshow", updateConnectionUI);
await loadQuota();
