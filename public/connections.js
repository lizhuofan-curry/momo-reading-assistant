const $ = id => document.getElementById(id);
const providers = {
  deepseek: { label: "DeepSeek", mark: "DS", model: "deepseek-v4-flash", description: "国内服务 · DeepSeek 官方 API", keyUrl: "https://platform.deepseek.com/api_keys" },
  doubao: { label: "火山方舟 Doubao", mark: "DB", model: "doubao-seed-2-0-lite-260215", description: "国内服务 · 字节跳动火山方舟", keyUrl: "https://console.volcengine.com/ark/apiKey" },
  kimi: { label: "Kimi 开放平台", mark: "KM", model: "kimi-k2.5", description: "国内服务 · Moonshot AI 官方 API", keyUrl: "https://platform.kimi.com/console/api-keys" },
  qwen: { label: "千问开放平台 Qwen", mark: "QW", model: "qwen-plus", description: "国内服务 · 阿里云百炼兼容接口", keyUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key" },
  minimax: { label: "MiniMax 开放平台", mark: "MM", model: "MiniMax-M2.7", description: "国内服务 · MiniMax 官方 API", keyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key" },
  mimo: { label: "小米 MiMo", mark: "MO", model: "mimo-v2.5-pro", description: "国内服务 · Xiaomi MiMo 官方 API", keyUrl: "https://mimo.mi.com/console/api-keys" },
  glm: { label: "智谱 GLM", mark: "GL", model: "glm-5", description: "国内服务 · 智谱开放平台", keyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys" },
  siliconflow: { label: "硅基流动 SiliconFlow", mark: "SF", model: "Qwen/Qwen3-8B", description: "国内服务 · 多模型聚合平台", keyUrl: "https://cloud.siliconflow.cn/account/ak" },
  openai: { label: "OpenAI", mark: "OA", model: "gpt-5.4-mini", description: "国际服务 · OpenAI 官方 API", keyUrl: "https://platform.openai.com/api-keys" },
  gemini: { label: "Google Gemini", mark: "GE", model: "gemini-3.7-flash", description: "国际服务 · Google AI Studio API", keyUrl: "https://aistudio.google.com/app/apikey" },
  openrouter: { label: "OpenRouter", mark: "OR", model: "openai/gpt-4.1-mini", description: "国际服务 · 多模型统一入口", keyUrl: "https://openrouter.ai/settings/keys" },
  groq: { label: "Groq", mark: "GQ", model: "openai/gpt-oss-20b", description: "国际服务 · 高速推理平台", keyUrl: "https://console.groq.com/keys" },
  together: { label: "Together AI", mark: "TA", model: "openai/gpt-oss-120b", description: "国际服务 · 开放模型平台", keyUrl: "https://api.together.ai/settings/api-keys" },
  mistral: { label: "Mistral AI", mark: "MI", model: "mistral-small-latest", description: "国际服务 · Mistral 官方 API", keyUrl: "https://console.mistral.ai/api-keys" },
  xai: { label: "xAI", mark: "xAI", model: "grok-4.6", description: "国际服务 · Grok 官方 API", keyUrl: "https://console.x.ai/" }
};
let modelCatalog = [];
let discoverySequence = 0;
let lastDiscoverySignature = "";
const credentialKeys = ["momo_ai_config", "momo_token"];
const rememberKey = "momo_remember_connections";

function rememberEnabled() {
  return $("remember-connections").checked;
}

function storedValue(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
}

function storedJson(key) {
  try { return JSON.parse(storedValue(key) || "null"); } catch { return null; }
}

function saveCredential(key, value) {
  const selected = rememberEnabled() ? localStorage : sessionStorage;
  const other = rememberEnabled() ? sessionStorage : localStorage;
  selected.setItem(key, value);
  other.removeItem(key);
}

function removeCredential(key) {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}

function migrateCredentials() {
  localStorage.setItem(rememberKey, String(rememberEnabled()));
  for (const key of credentialKeys) {
    const value = storedValue(key);
    if (value) saveCredential(key, value);
  }
}

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
  if (opening && name === "model") {
    $("model-search").value = "";
    renderModels();
    setTimeout(() => $("model-search").focus(), 0);
  }
}

function persistModelSelection(model) {
  const saved = storedJson("momo_ai_config");
  const provider = $("provider").value;
  const apiKey = $("api-key").value.trim();
  if (!saved || saved.provider !== provider || saved.api_key !== apiKey || !model) return;
  saveCredential("momo_ai_config", JSON.stringify({ ...saved, model }));
  status("ai-status", `已切换为 ${model}，建议测试连接后再开始分析。`, "ok");
}

function chooseModel(id, meta = "已选择", { persist = true } = {}) {
  $("model").value = id;
  $("model-name").textContent = id;
  $("model-meta").textContent = meta;
  $("manual-model-field").classList.add("hidden");
  $("model-options").querySelectorAll(".model-option").forEach(option => option.classList.toggle("selected", option.dataset.model === id));
  closeMenu("model");
  if (persist) persistModelSelection(id);
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
  $("api-key-link").href = preset.keyUrl;
  $("api-key-link-label").textContent = `前往 ${preset.label} 获取 API Key`;
  $("api-key-link").setAttribute("aria-label", `在新标签页打开 ${preset.label} 官方 API Key 页面`);
  document.querySelectorAll(".provider-option").forEach(option => {
    const selected = option.dataset.provider === $("provider").value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
  if (!keepKey) $("api-key").value = "";
  modelCatalog = [{ id: model || preset.model, name: model || preset.model }];
  renderModels();
  chooseModel(model || preset.model, "默认推荐 · 输入 Key 后可自动识别", { persist: false });
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
    chooseModel(selected, meta, { persist: false });
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
  $("remember-connections").checked = localStorage.getItem(rememberKey) !== "false";
  migrateCredentials();
  const ai = storedJson("momo_ai_config");
  if (ai && providers[ai.provider]) {
    chooseProvider(ai.provider, { keepKey: true, model: ai.model });
    $("api-key").value = ai.api_key;
    status("ai-status", `已恢复 ${providers[ai.provider].label} · ${ai.model}`, "ok");
    setTimeout(() => discoverModels(), 0);
  } else chooseProvider("deepseek", { keepKey: true });
  const token = storedValue("momo_token");
  if (token) {
    $("memo-token").value = token;
    status("memo-status", "已恢复墨墨 Token", "ok");
  }
}

$("provider-trigger").addEventListener("click", () => toggleMenu("provider"));
$("model-trigger").addEventListener("click", () => toggleMenu("model"));
document.querySelectorAll(".provider-option").forEach(option => option.addEventListener("click", () => chooseProvider(option.dataset.provider)));
$("model-search").addEventListener("input", event => renderModels(event.target.value));
$("manual-option").addEventListener("click", useManualModel);
$("manual-model").addEventListener("change", event => persistModelSelection(event.target.value.trim()));
$("api-key").addEventListener("change", () => discoverModels());
$("api-key").addEventListener("paste", () => setTimeout(() => discoverModels(), 0));
$("remember-connections").addEventListener("change", () => {
  migrateCredentials();
  const place = rememberEnabled() ? "此浏览器" : "当前标签页";
  status("ai-status", `连接信息将保存在${place}。`, "ok");
  if ($("memo-token").value.trim()) status("memo-status", `墨墨 Token 将保存在${place}。`, "ok");
});
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
    saveCredential("momo_ai_config", JSON.stringify(config));
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
    saveCredential("momo_token", token);
    status("memo-status", data.message, "ok");
  } catch (error) { status("memo-status", error.message, "error"); } finally { busy(button, false); }
});

$("clear-ai").addEventListener("click", () => {
  removeCredential("momo_ai_config");
  lastDiscoverySignature = "";
  discoverySequence += 1;
  chooseProvider($("provider").value, { keepKey: false });
  status("ai-status", "已从此浏览器清除 AI 连接");
});
$("clear-memo").addEventListener("click", () => {
  removeCredential("momo_token");
  $("memo-token").value = "";
  status("memo-status", "已从此浏览器清除墨墨 Token");
});

restore();
