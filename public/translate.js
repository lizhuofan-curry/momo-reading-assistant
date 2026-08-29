const $ = id => document.getElementById(id);
let kind = "auto";
let mode = "free";
let lastResult = null;
let trial = { started: false, active: true, daysRemaining: 7 };
const examples = ["robust", "serendipity", "Could you give me a hand?", "The findings should be interpreted with caution.", "这个方法对噪声具有很强的鲁棒性。"];
let exampleIndex = 0;

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function storedJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || "null"); } catch { return null; }
}

function toast(message, error = false) {
  const element = $("translation-toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2800);
}

function setStatus(message, state = "") {
  $("translation-status").textContent = message;
  $("translation-status").className = `status ${state}`;
}

function ownConfig() {
  return storedJson("momo_ai_config");
}

function refreshSource() {
  const own = ownConfig();
  document.querySelectorAll(".source-choice").forEach(button => button.classList.toggle("selected", button.dataset.mode === mode));
  if (mode === "own") {
    $("translation-source-note").innerHTML = own?.api_key && own?.model
      ? `使用已保存的 ${escapeHtml(own.label || own.provider)} · ${escapeHtml(own.model)}`
      : `尚未保存可用连接，<a href="/connections/">前往连接设置</a>`;
  } else {
    $("translation-source-note").textContent = !trial.active ? "一周免费体验已结束，请切换到自己的 API。" : trial.started ? `免费体验剩余 ${trial.daysRemaining} 天` : "首次成功翻译后开启连续 7 天体验";
  }
}

function inputText(value) {
  $("translation-input").value = value;
  $("translation-count").textContent = `${value.length} / 1200`;
  $("translation-input").focus();
}

function wordResult(result) {
  const meanings = result.meanings.map((meaning, index) => `<li><i>${String(index + 1).padStart(2, "0")}</i><span>${escapeHtml(meaning)}</span></li>`).join("");
  const phrases = result.phrases.length ? `<section class="translation-detail"><h3>常用搭配</h3><div class="expression-list">${result.phrases.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>` : "";
  return `<article class="word-translation"><header><div><span>WORD</span><h2>${escapeHtml(result.word)}</h2></div><div class="word-sound">${result.phonetic ? `/${escapeHtml(result.phonetic)}/` : ""}<small>${escapeHtml(result.partOfSpeech)}</small></div></header><ol class="meaning-list">${meanings}</ol>${result.usage ? `<p class="usage-note">${escapeHtml(result.usage)}</p>` : ""}${result.example ? `<blockquote><p>${escapeHtml(result.example)}</p><cite>${escapeHtml(result.exampleTranslation)}</cite></blockquote>` : ""}${phrases}</article>`;
}

function sentenceResult(result) {
  const expressions = result.keyExpressions.length ? `<section class="translation-detail"><h3>关键表达</h3><div class="expression-list">${result.keyExpressions.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div></section>` : "";
  const alternatives = result.alternatives.length ? `<section class="translation-detail"><h3>其他自然译法</h3><ol class="alternative-list">${result.alternatives.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol></section>` : "";
  return `<article class="sentence-translation"><div class="bilingual-strip original-strip"><span>ORIGINAL</span><p>${escapeHtml(result.original)}</p></div><div class="translation-fold"><i></i><span>${escapeHtml(result.tone || "自然表达")}</span><i></i></div><div class="bilingual-strip translated-strip"><span>TRANSLATION</span><p>${escapeHtml(result.translation)}</p></div>${result.literal ? `<div class="literal-note"><strong>较直译</strong><span>${escapeHtml(result.literal)}</span></div>` : ""}${expressions}${alternatives}</article>`;
}

function render(result) {
  lastResult = result;
  $("translation-empty").classList.add("hidden");
  $("translation-result").classList.remove("hidden");
  $("copy-translation").classList.remove("hidden");
  $("translation-result").innerHTML = result.kind === "word" ? wordResult(result) : sentenceResult(result);
}

async function translate() {
  const text = $("translation-input").value.trim();
  if (!text) return toast("请先输入一个单词或句子。", true);
  const own = ownConfig();
  if (mode === "own" && (!own?.api_key || !own?.model)) return toast("请先在连接设置中保存自己的 AI API。", true);
  const button = $("translate-now");
  button.disabled = true;
  button.innerHTML = "正在翻译…";
  setStatus("正在理解语境并组织译文…", "loading");
  try {
    const payload = { text, kind, mode };
    if (mode === "own") Object.assign(payload, own);
    const response = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "翻译失败，请稍后重试。");
    if (data.trial) trial = data.trial;
    refreshSource();
    render(data.result);
    setStatus(`翻译完成 · ${data.provider}`, "ok");
    toast(data.result.kind === "word" ? "单词释义已整理" : "句子翻译已完成");
  } catch (error) {
    setStatus(error.message, "error");
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.innerHTML = "开始翻译 <span>⌘ Enter</span>";
  }
}

document.querySelectorAll(".translation-mode").forEach(button => button.addEventListener("click", () => {
  kind = button.dataset.kind;
  document.querySelectorAll(".translation-mode").forEach(item => item.classList.toggle("selected", item === button));
}));
document.querySelectorAll(".source-choice").forEach(button => button.addEventListener("click", () => { mode = button.dataset.mode; refreshSource(); }));
document.querySelectorAll(".inline-example").forEach(button => button.addEventListener("click", () => inputText(button.dataset.example)));
$("swap-example").addEventListener("click", () => { exampleIndex = (exampleIndex + 1) % examples.length; inputText(examples[exampleIndex]); });
$("translation-input").addEventListener("input", event => $("translation-count").textContent = `${event.target.value.length} / 1200`);
$("translation-input").addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") translate(); });
$("translate-now").addEventListener("click", translate);
$("copy-translation").addEventListener("click", async () => {
  if (!lastResult) return;
  const text = lastResult.kind === "word" ? `${lastResult.word} ${lastResult.phonetic ? `/${lastResult.phonetic}/ ` : ""}${lastResult.meanings.join("；")}` : `${lastResult.original}\n${lastResult.translation}`;
  try { await navigator.clipboard.writeText(text); toast("翻译结果已复制"); } catch { toast("浏览器未允许复制，请手动选择文本。", true); }
});

fetch("/api/quota", { cache: "no-store" }).then(response => response.json()).then(data => { if (data.trial) trial = data.trial; if (!trial.active && ownConfig()) mode = "own"; refreshSource(); }).catch(refreshSource);
refreshSource();
