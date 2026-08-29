const $ = id => document.getElementById(id);
const providers = {
  deepseek: { label: "DeepSeek", mark: "DS", model: "deepseek-v4-flash", description: "国内服务 · DeepSeek 官方 API" },
  doubao: { label: "火山方舟 Doubao", mark: "DB", model: "doubao-seed-2-0-lite-260215", description: "国内服务 · 字节跳动火山方舟" },
  kimi: { label: "Kimi 开放平台", mark: "KM", model: "kimi-k2.5", description: "国内服务 · Moonshot AI 官方 API" },
  qwen: { label: "千问开放平台 Qwen", mark: "QW", model: "qwen-plus", description: "国内服务 · 阿里云百炼兼容接口" },
  minimax: { label: "MiniMax 开放平台", mark: "MM", model: "MiniMax-M2.7", description: "国内服务 · MiniMax 官方 API" },
  mimo: { label: "小米 MiMo", mark: "MO", model: "mimo-v2.5-pro", description: "国内服务 · Xiaomi MiMo 官方 API" },
  glm: { label: "智谱 GLM", mark: "GL", model: "glm-5", description: "国内服务 · 智谱开放平台" },
  siliconflow: { label: "硅基流动 SiliconFlow", mark: "SF", model: "Qwen/Qwen3-8B", description: "国内服务 · 多模型聚合平台" },
  openai: { label: "OpenAI", mark: "OA", model: "gpt-5.4-mini", description: "国际服务 · OpenAI 官方 API" },
  gemini: { label: "Google Gemini", mark: "GE", model: "gemini-3.7-flash", description: "国际服务 · Google AI Studio API" },
  openrouter: { label: "OpenRouter", mark: "OR", model: "openai/gpt-4.1-mini", description: "国际服务 · 多模型统一入口" },
  groq: { label: "Groq", mark: "GQ", model: "openai/gpt-oss-20b", description: "国际服务 · 高速推理平台" },
  together: { label: "Together AI", mark: "TA", model: "openai/gpt-oss-120b", description: "国际服务 · 开放模型平台" },
  mistral: { label: "Mistral AI", mark: "MI", model: "mistral-small-latest", description: "国际服务 · Mistral 官方 API" },
  xai: { label: "xAI", mark: "xAI", model: "grok-4.6", description: "国际服务 · Grok 官方 API" }
};
let modelCatalog = [];
let discoverySequence = 0;
let lastDiscoverySignature = "";

function status(id, message, kind = "") {
  const element = $(id);
  element.textContent = message;
  element.className = `status ${kind}`;
}

function busy(button, value, text) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = value;
  button.textContent = value ? text : button.dataset.label;
}

async function post(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "连接失败");
  return data;
}

function closeMenu(name) {
  const trigger = $(`${name}-trigger`);
  trigger.setAttribute("aria-expanded", "false");
  $(`${name}-menu`).classList.add("hidden");
}

function toggleMenu(name) {
  const trigger = $(`${name}-trigger`);
  const opening = trigger.getAttribute("aria-expanded") !== "true";
  closeMenu(name === "provider" ? "model" : "provider");
  trigger.setAttribute("aria-expanded", String(opening));
  $(`${name}-menu`).classList.toggle("hidden", !opening);
  if (opening && name === "model") setTimeout(() => $("model-search").focus(), 0);
}

function chooseModel(id, meta = "已选择") {
  $("model").value = id;
  $("model-name").textContent = id;
  $("model-meta").textContent = meta;
  $("manual-model-field").classList.add("hidden");
  $("model-options").querySelectorAll(".model-option").forEach(option => option.classList.toggle("selected", option.dataset.model === id));
  closeMenu("model");
}

function renderModels(query = "") {
  const needle = query.trim().toLowerCase();
  const models = modelCatalog.filter(item => !needle || item.id.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle));
  $("model-options").innerHTML = models.length ? models.map(item => `<button class="model-option${item.id === $("model").value ? " selected" : ""}" type="button" role="option" data-model="${item.id.replaceAll('"', "&quot;")}"><span>${item.id}</span><i>✓</i></button>`).join("") : `<div class="status">没有匹配的模型</div>`;
  $("model-options").querySelectorAll(".model-option").forEach(option => option.addEventListener("click", () => chooseModel(option.dataset.model)));
}

function chooseProvider(id, { keepKey = false, model } = {}) {
  const preset = providers[id] || providers.deepseek;
  $("provider").value = id in providers ? id : "deepseek";
  $("provider-mark").textContent = preset.mark;
  $("provider-name").textContent = preset.label;
  $("provider-description").textContent = preset.description;
  document.querySelectorAll(".provider-option").forEach(option => {
    const selected = option.dataset.provider === $("provider").value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
  if (!keepKey) $("api-key").value = "";
  modelCatalog = [{ id: model || preset.model, name: model || preset.model }];
  renderModels();
  chooseModel(model || preset.model, "默认推荐 · 输入 Key 后可自动识别");
  status("ai-status", "");
  closeMenu("provider");
}

function currentModel() {
  return $("manual-model-field").classList.contains("hidden") ? $("model").value.trim() : $("manual-model").value.trim();
}

function useManualModel() {
  closeMenu("model");
  $("manual-model-field").classList.remove("hidden");
  $("manual-model").value = currentModel() || providers[$("provider").value].model;
  $("model-name").textContent = "手动填写";
  $("model-meta").textContent = "填写模型 ID 或推理接入点 ID";
  $("manual-model").focus();
}

async function discoverModels({ force = false } = {}) {
  const button = $("load-models");
  const apiKey = $("api-key").value.trim();
  const provider = $("provider").value;
  if (!apiKey) {
    if (force) status("ai-status", "请先填写 API Key，再识别可用模型。", "error");
    return;
  }
  const signature = `${provider}:${apiKey}`;
  if (!force && signature === lastDiscoverySignature) return;
  lastDiscoverySignature = signature;
  const sequence = ++discoverySequence;
  busy(button, true, "正在识别…");
  status("ai-status", `检测到 API Key，正在读取 ${providers[provider].label} 的可用模型…`, "loading");
  try {
    const data = await post("/api/models", { provider, api_key: apiKey });
    if (sequence !== discoverySequence) return;
    modelCatalog = data.models;
    renderModels();
    const selected = modelCatalog.some(item => item.id === $("model").value) ? $("model").value : modelCatalog[0].id;
    const meta = data.source === "preset" ? "官方候选 · 请测试账号权限" : `已识别 ${modelCatalog.length} 个文本模型`;
    chooseModel(selected, meta);
    status("ai-status", data.source === "preset" ? data.note : `已自动识别 ${modelCatalog.length} 个模型，请选择后测试连接。`, data.source === "preset" ? "" : "ok");
  } catch (error) {
    if (sequence !== discoverySequence) return;
    useManualModel();
    status("ai-status", `${error.message} 已切换为手填模式。`, "error");
  } finally {
    if (sequence === discoverySequence) busy(button, false);
  }
}

function restore() {
  let ai = null;
  try { ai = JSON.parse(sessionStorage.getItem("momo_ai_config") || "null"); } catch { /* ignore invalid tab data */ }
  if (ai && providers[ai.provider]) {
    chooseProvider(ai.provider, { keepKey: true, model: ai.model });
    $("api-key").value = ai.api_key;
    status("ai-status", `当前标签页已连接 ${providers[ai.provider].label} · ${ai.model}`, "ok");
  } else chooseProvider("deepseek", { keepKey: true });
  const token = sessionStorage.getItem("momo_token") || "";
  if (token) {
    $("memo-token").value = token;
    status("memo-status", "当前标签页已连接墨墨 Token", "ok");
  }
}

$("provider-trigger").addEventListener("click", () => toggleMenu("provider"));
$("model-trigger").addEventListener("click", () => toggleMenu("model"));
document.querySelectorAll(".provider-option").forEach(option => option.addEventListener("click", () => chooseProvider(option.dataset.provider)));
$("model-search").addEventListener("input", event => renderModels(event.target.value));
$("manual-option").addEventListener("click", useManualModel);
$("api-key").addEventListener("change", () => discoverModels());
$("api-key").addEventListener("paste", () => setTimeout(() => discoverModels(), 0));
document.addEventListener("click", event => {
  if (!event.target.closest("#provider-select")) closeMenu("provider");
  if (!event.target.closest("#model-select")) closeMenu("model");
});
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMenu("provider"); closeMenu("model"); } });

$("load-models").addEventListener("click", () => discoverModels({ force: true }));

$("test-ai").addEventListener("click", async () => {
  const button = $("test-ai");
  const provider = $("provider").value;
  const config = { provider, model: currentModel(), api_key: $("api-key").value.trim(), label: providers[provider].label };
  busy(button, true, "正在测试…");
  status("ai-status", "正在向服务商发送最小测试请求…", "loading");
  try {
    const data = await post("/api/test-ai", config);
    sessionStorage.setItem("momo_ai_config", JSON.stringify(config));
    $("model").value = config.model;
    status("ai-status", data.message, "ok");
  } catch (error) { status("ai-status", error.message, "error"); } finally { busy(button, false); }
});

$("test-memo").addEventListener("click", async () => {
  const button = $("test-memo");
  const token = $("memo-token").value.trim();
  busy(button, true, "正在测试…");
  status("memo-status", "正在验证 Token…", "loading");
  try {
    const data = await post("/api/test-maimemo", { token });
    sessionStorage.setItem("momo_token", token);
    status("memo-status", data.message, "ok");
  } catch (error) { status("memo-status", error.message, "error"); } finally { busy(button, false); }
});

$("clear-ai").addEventListener("click", () => {
  sessionStorage.removeItem("momo_ai_config");
  lastDiscoverySignature = "";
  discoverySequence += 1;
  chooseProvider($("provider").value, { keepKey: false });
  status("ai-status", "已清除当前标签页的 AI 连接");
});
$("clear-memo").addEventListener("click", () => {
  sessionStorage.removeItem("momo_token");
  $("memo-token").value = "";
  status("memo-status", "已清除当前标签页的墨墨 Token");
});

restore();
