export const PROVIDERS = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-v4-flash", group: "国内服务" },
  doubao: { label: "火山方舟 Doubao", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultModel: "doubao-seed-2-0-lite-260215", group: "国内服务", presetModels: ["doubao-seed-2-0-lite-260215", "doubao-seed-2-0-pro-260215"] },
  kimi: { label: "Kimi 开放平台", baseUrl: "https://api.moonshot.cn/v1", defaultModel: "kimi-k2.5", group: "国内服务" },
  qwen: { label: "千问开放平台 Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", modelsUrl: "https://dashscope.aliyuncs.com/api/v1/models?capabilities=TG&page_size=100", defaultModel: "qwen-plus", group: "国内服务" },
  minimax: { label: "MiniMax 开放平台", baseUrl: "https://api.minimaxi.com/v1", defaultModel: "MiniMax-M2.7", group: "国内服务" },
  mimo: { label: "小米 MiMo", baseUrl: "https://api.xiaomimimo.com/v1", defaultModel: "mimo-v2.5-pro", group: "国内服务" },
  glm: { label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-5", group: "国内服务" },
  siliconflow: { label: "硅基流动 SiliconFlow", baseUrl: "https://api.siliconflow.cn/v1", modelsUrl: "https://api.siliconflow.cn/v1/models?type=text", defaultModel: "Qwen/Qwen3-8B", group: "国内服务", jsonMode: false },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5.4-mini", group: "国际服务" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-3.7-flash", group: "国际服务" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4.1-mini", group: "国际服务" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", defaultModel: "openai/gpt-oss-20b", group: "国际服务" },
  together: { label: "Together AI", baseUrl: "https://api.together.xyz/v1", defaultModel: "openai/gpt-oss-120b", group: "国际服务", jsonMode: false },
  mistral: { label: "Mistral AI", baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest", group: "国际服务" },
  xai: { label: "xAI", baseUrl: "https://api.x.ai/v1", defaultModel: "grok-4.6", group: "国际服务" }
};

function providerHeaders(config) {
  const headers = { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://momo.zhuofan.me";
    headers["X-OpenRouter-Title"] = "拾词";
  }
  return headers;
}

function modelItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.models)) return payload.data.models;
  if (Array.isArray(payload?.models)) return payload.models;
  if (Array.isArray(payload?.output?.models)) return payload.output.models;
  return [];
}

function isTextModel(item, id) {
  const type = String(item?.type || item?.model_type || "").toLowerCase();
  if (type && !["chat", "language", "text", "llm", "text-generation"].includes(type)) return false;
  return !/(embedding|rerank|moderation|whisper|transcri|speech|tts|image|video|dall-e|sora)/i.test(id);
}

export async function listProviderModels(data) {
  const config = providerConfig({ ...data, model: "temporary-model" }, false);
  const preset = PROVIDERS[config.provider];
  if (preset.presetModels) {
    return {
      models: preset.presetModels.map(id => ({ id, name: id, type: "text" })),
      source: "preset",
      note: "该服务商未通过推理 API 返回账号模型列表，下面是官方候选模型；也可以手填模型 ID 或推理接入点 ID。"
    };
  }
  const remote = await fetch(preset.modelsUrl || `${config.baseUrl}/models`, {
    headers: providerHeaders(config),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await remote.json().catch(() => ({}));
  if (!remote.ok) throw new Error(`${config.label} 返回 ${remote.status}：${payload?.error?.message || payload?.message || "无法读取模型列表"}`);
  const models = modelItems(payload).map(item => {
    const id = String(item?.id || item?.model || item?.name || "").replace(/^models\//, "").trim();
    return { id, name: String(item?.display_name || item?.name || id).replace(/^models\//, "").trim(), type: item?.type || "" };
  }).filter(item => item.id && /^[A-Za-z0-9._:/-]{2,160}$/.test(item.id) && isTextModel(item, item.id));
  const unique = [...new Map(models.map(item => [item.id, item])).values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  if (!unique.length) throw new Error(`${config.label} 已连接，但没有返回可用于文本对话的模型。你仍可手动填写模型名称。`);
  return { models: unique.slice(0, 300), source: "live", note: "" };
}

export function providerConfig(data, free = false) {
  if (free) {
    const apiKey = process.env.DEEPSEEK_API_KEY || "";
    if (!apiKey) throw new Error("免费体验模型暂时不可用，请改用自己的 API。");
    return {
      label: "免费体验模型",
      apiKey,
      baseUrl: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, ""),
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      provider: "deepseek"
    };
  }
  const provider = String(data.provider || "");
  const preset = PROVIDERS[provider];
  if (!preset) throw new Error("请选择受支持的 API 服务商。");
  const apiKey = String(data.api_key || "").trim();
  const model = String(data.model || "").trim();
  if (!apiKey) throw new Error(`请填写 ${preset.label} API Key。`);
  if (!/^[A-Za-z0-9._:/-]{2,160}$/.test(model)) throw new Error("请填写有效的模型名称。");
  return { ...preset, apiKey, model, provider };
}

export async function chatCompletion(config, messages, { jsonMode = false, timeout = 55000, maxTokens = 4096 } = {}) {
  const headers = providerHeaders(config);
  const requestBody = { model: config.model, messages, temperature: 0.2, max_tokens: maxTokens };
  if (config.provider === "deepseek") requestBody.thinking = { type: "disabled" };
  if (jsonMode && config.jsonMode !== false) requestBody.response_format = { type: "json_object" };
  const remote = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeout)
  });
  const payload = await remote.json().catch(() => ({}));
  if (!remote.ok) throw new Error(`${config.label} 返回 ${remote.status}：${payload?.error?.message || payload?.message || "请求失败"}`);
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${config.label} 已连接，但没有返回有效内容。`);
  return content;
}
