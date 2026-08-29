const $ = id => document.getElementById(id);
let selectedFile = null;
let words = [];
let allSelected = true;
let freeRemaining = 0;
let imagePreviewUrl = "";

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

function setResultStatus(kind, title, detail) {
  const element = $("result-status");
  const marks = { loading: "···", success: "✓", error: "!" };
  element.className = `result-status ${kind}`;
  $("state-mark").textContent = marks[kind] || "·";
  $("state-title").textContent = title;
  $("state-detail").textContent = detail;
  $("state-skeleton").classList.toggle("hidden", kind !== "loading");
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

function storedJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || "null"); } catch { return null; }
}

function ownAiConfig() {
  const value = storedJson("momo_ai_config");
  return value && value.provider && value.api_key && value.model ? value : null;
}

function memoToken() {
  return localStorage.getItem("momo_token") || sessionStorage.getItem("momo_token") || "";
}

function updateConnectionUI() {
  const ai = ownAiConfig();
  const token = memoToken();
  $("ai-mode-note").innerHTML = $("ai-mode").value === "free"
    ? `此浏览器还可免费分析 <strong>${freeRemaining}</strong> 次，成功一次才扣一次。`
    : ai ? `已连接 ${escapeHtml(ai.label || ai.provider)} · ${escapeHtml(ai.model)}` : `尚未连接自己的模型，<a href="/connections/">前往连接设置</a>。`;
  $("memo-status").innerHTML = token
    ? `已在此浏览器连接你的墨墨 Token。可在连接设置中清除或改为仅当前标签页保存。`
    : `需要先在<a href="/connections/">连接设置</a>中测试你自己的墨墨 Access Token。本站不会把 Token 写入服务器数据库。`;
  $("quota-badge").innerHTML = `<span>免费体验 ${freeRemaining}/5</span>`;
  refreshPrettySelect($("ai-mode"));
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

const selectDescriptions = {
  level: () => "按你的学习目标判断词汇价值",
  "max-words": value => `最多生成 ${value} 个候选词`,
  "ai-mode": value => value === "free" ? "使用本站免费体验额度" : "使用已保存的模型连接"
};

function closePrettySelects(except = null) {
  document.querySelectorAll(".select-trigger[aria-expanded=true]").forEach(trigger => {
    if (trigger === except) return;
    trigger.setAttribute("aria-expanded", "false");
    document.getElementById(trigger.getAttribute("aria-controls"))?.classList.add("hidden");
  });
}

function refreshPrettySelect(select) {
  select?._prettyRefresh?.();
}

function enhanceSelect(select) {
  const wrapper = document.createElement("div");
  wrapper.className = "pretty-select";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add("select-native-hidden");
  select.tabIndex = -1;

  const menuId = `${select.id}-menu`;
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", menuId);
  const menu = document.createElement("div");
  menu.id = menuId;
  menu.className = "select-menu hidden";
  menu.setAttribute("role", "listbox");
  wrapper.append(trigger, menu);

  const render = () => {
    const selected = select.selectedOptions[0];
    const description = selectDescriptions[select.id]?.(select.value) || "点击展开更多选项";
    trigger.innerHTML = `<span class="select-mark">${escapeHtml(select.dataset.mark || "⌄")}</span><span class="select-copy"><strong>${escapeHtml(selected?.textContent || "请选择")}</strong><small>${escapeHtml(description)}</small></span><span class="select-chevron" aria-hidden="true">⌄</span>`;
    menu.querySelectorAll(".select-option").forEach((option, index) => {
      const active = index === select.selectedIndex;
      option.classList.toggle("selected", active);
      option.setAttribute("aria-selected", String(active));
    });
  };

  [...select.options].forEach((option, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "select-option";
    item.setAttribute("role", "option");
    item.dataset.value = option.value;
    item.innerHTML = `<span>${escapeHtml(option.textContent)}</span><span class="select-check" aria-hidden="true">✓</span>`;
    item.addEventListener("click", () => {
      select.selectedIndex = index;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closePrettySelects();
      trigger.focus();
    });
    menu.appendChild(item);
  });

  const open = () => {
    closePrettySelects(trigger);
    trigger.setAttribute("aria-expanded", "true");
    menu.classList.remove("hidden");
    const active = menu.querySelector(".selected") || menu.firstElementChild;
    active?.focus();
  };
  trigger.addEventListener("click", () => trigger.getAttribute("aria-expanded") === "true" ? closePrettySelects() : open());
  trigger.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); open(); }
  });
  menu.addEventListener("keydown", event => {
    const options = [...menu.querySelectorAll(".select-option")];
    const current = options.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      options[(current + offset + options.length) % options.length]?.focus();
    }
  });
  const label = document.querySelector(`label[for="${select.id}"]`);
  label?.addEventListener("click", event => { event.preventDefault(); trigger.focus(); });
  select.addEventListener("change", render);
  select._prettyRefresh = render;
  render();
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
  const image = ["png", "jpg", "jpeg", "webp", "bmp"].includes(extension);
  if (!["pdf", "docx", "txt", "md", "markdown", "png", "jpg", "jpeg", "webp", "bmp"].includes(extension)) {
    toast("当前支持 PDF、DOCX、TXT、Markdown、PNG、JPG、WEBP 和 BMP", true);
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
  $("file-card").classList.toggle("image-file", image);
  $("extract-file").textContent = image ? "识别图片中的英文" : "读取文件文字";
  $("extract-file").dataset.label = $("extract-file").textContent;
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  imagePreviewUrl = image ? URL.createObjectURL(file) : "";
  $("image-preview").classList.toggle("hidden", !image);
  if (image) $("image-preview").src = imagePreviewUrl;
  else $("image-preview").removeAttribute("src");
  $("file-result").classList.add("hidden");
}

function clearFile() {
  selectedFile = null;
  $("file-input").value = "";
  $("dropzone").classList.remove("hidden");
  $("file-card").classList.add("hidden");
  $("file-card").classList.remove("image-file");
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  imagePreviewUrl = "";
  $("image-preview").removeAttribute("src");
  $("image-preview").classList.add("hidden");
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
  if (["png", "jpg", "jpeg", "webp", "bmp"].includes(extension)) return readImage(file);
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

async function readImage(file) {
  if (!window.Tesseract?.createWorker) throw new Error("本地图片识别组件没有加载成功，请刷新页面后重试。");
  const result = $("file-result");
  const button = $("extract-file");
  const statusNames = {
    "loading tesseract core": "正在加载本地识别引擎",
    "initializing tesseract": "正在初始化识别引擎",
    "loading language traineddata": "正在加载英文识别数据",
    "initializing api": "正在准备英文识别",
    "recognizing text": "正在识别图片文字"
  };
  let worker;
  try {
    worker = await window.Tesseract.createWorker("eng", 1, {
      workerPath: "/vendor/tesseract/worker.min.js",
      corePath: "/vendor/tesseract/core",
      langPath: "/vendor/tesseract/lang",
      logger: message => {
        const label = statusNames[message.status] || "正在本地识别图片";
        const percent = Number.isFinite(message.progress) ? ` ${Math.round(message.progress * 100)}%` : "";
        result.textContent = `${label}${percent} · 原图不会上传`;
        if (message.status === "recognizing text") button.textContent = `${label}${percent}`;
      }
    });
    await worker.setParameters({ user_defined_dpi: "300", preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(file, { rotateAuto: true });
    const text = String(data.text || "").replace(/[^\S\r\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    const englishWords = text.match(/[A-Za-z][A-Za-z'-]{1,}/g) || [];
    if (text.length < 20 || englishWords.length < 3) throw new Error("没有识别到足够的英文文字。请换一张更清晰、文字更大、背景更干净的图片。");
    return { text, range: `图片 OCR · 识别到约 ${englishWords.length} 个英文词` };
  } finally {
    await worker?.terminate().catch(() => {});
  }
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
  setResultStatus("success", "结果示例已载入", "这是静态示例，不消耗免费次数，也不会自动同步。");
  $("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  toast("已载入结果示例；同步时需要你自己的墨墨 Token");
}

$("hero-start").addEventListener("click", () => $("workspace").scrollIntoView({ behavior: "smooth", block: "start" }));
$("try-demo").addEventListener("click", loadDemo);
$("quota-badge").addEventListener("click", () => {
  const expanded = $("quota-badge").getAttribute("aria-expanded") === "true";
  $("quota-badge").setAttribute("aria-expanded", String(!expanded));
  $("quota-panel").classList.toggle("hidden", expanded);
});
$("token-help").addEventListener("click", () => {
  const expanded = $("token-help").getAttribute("aria-expanded") === "true";
  $("token-help").setAttribute("aria-expanded", String(!expanded));
  $("token-explainer").classList.toggle("hidden", expanded);
});
document.addEventListener("click", event => {
  if (!event.target.closest(".pretty-select")) closePrettySelects();
  if (!event.target.closest(".top-actions")) {
    $("quota-badge").setAttribute("aria-expanded", "false");
    $("quota-panel").classList.add("hidden");
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    $("quota-badge").setAttribute("aria-expanded", "false");
    $("quota-panel").classList.add("hidden");
    $("token-help").setAttribute("aria-expanded", "false");
    $("token-explainer").classList.add("hidden");
    closePrettySelects();
  }
});
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
  $("file-result").textContent = "正在浏览器本地解析文件，不会上传原文件…";
  $("file-result").className = "file-result loading";
  try {
    const data = await readFile(selectedFile);
    const truncated = data.text.length > 150000;
    setSourceText(data.text);
    $("file-result").textContent = `读取成功 · ${data.range} · ${$("source-text").value.length.toLocaleString()} 个字符${truncated ? " · 内容过长，已截取" : ""}`;
    $("file-result").className = "file-result success";
    $("title").value = selectedFile.name.replace(/\.[^.]+$/, "").slice(0, 70);
    toast("文字已在浏览器本地读取，可以开始筛词");
  } catch (error) {
    $("file-result").textContent = `读取失败：${error.message}`;
    $("file-result").className = "file-result error";
    toast(error.message, true);
  } finally { setBusy(button, false); }
});

$("analyze").addEventListener("click", async () => {
  const mode = $("ai-mode").value;
  const config = mode === "own" ? ownAiConfig() : null;
  if (mode === "free" && freeRemaining <= 0) return toast("免费体验已用完，请连接你自己的 AI API。", true);
  if (mode === "own" && !config) { toast("请先连接并测试你自己的 AI API。", true); setTimeout(() => { location.href = "/connections/"; }, 900); return; }
  const button = $("analyze");
  setBusy(button, true, "AI 正在阅读这份材料…");
  setResultStatus("loading", "AI 正在筛选生词", "正在结合语境、学习目标和词汇价值生成候选结果。");
  try {
    const data = await post("/api/analyze", { mode, ...(config || {}), article: $("source-text").value, level: $("level").value, max_words: Number($("max-words").value) });
    words = data.words;
    if (mode === "free") freeRemaining = Number(data.remaining ?? Math.max(0, freeRemaining - 1));
    updateConnectionUI();
    renderWords();
    setResultStatus("success", "生词已生成，可以开始审核", `共得到 ${words.length} 个候选词；取消不需要的词后再同步。`);
    if (!$("title").value) $("title").value = `阅读生词 ${new Date().toLocaleDateString("zh-CN").replaceAll("/", "-")}`;
    toast(`筛选完成，共得到 ${words.length} 个生词`);
  } catch (error) {
    setResultStatus("error", "本次分析没有完成", error.message);
    toast(error.message, true);
  } finally { setBusy(button, false); }
});

$("toggle-all").addEventListener("click", () => { words.forEach(word => { word.selected = !allSelected; }); renderWords(); });
$("sync").addEventListener("click", async () => {
  const token = memoToken();
  if (!token) { toast("请先连接并测试你自己的墨墨 Access Token。", true); setTimeout(() => { location.href = "/connections/"; }, 900); return; }
  const chosen = words.filter(word => word.selected).map(word => word.lemma);
  if (!chosen.length) return toast("请至少选择一个生词", true);
  const button = $("sync");
  setBusy(button, true, "正在创建云词本…");
  setResultStatus("loading", "正在同步至墨墨", `正在创建“${$("title").value || "未命名词本"}”，请不要关闭页面。`);
  try {
    const data = await post("/api/sync", { token, title: $("title").value, tags: [$("tag").value], words: chosen, brief: `由拾词生成，共 ${chosen.length} 个词` });
    setResultStatus("success", "已同步到墨墨云词本", `${data.title} · ${data.count} 个词。现在可在墨墨 App 中搜索该名称。`);
    toast(`${data.title} 已创建，共 ${data.count} 个词`);
  } catch (error) {
    setResultStatus("error", "同步没有完成", error.message);
    toast(error.message, true);
  } finally { setBusy(button, false); }
});

document.querySelectorAll("select.pretty-native").forEach(enhanceSelect);
window.addEventListener("pageshow", updateConnectionUI);
await loadQuota();
