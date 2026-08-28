export const PROVIDERS = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  qwen: { label: "阿里云百炼 Qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" }
};

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

export async function chatCompletion(config, messages, { jsonMode = false, timeout = 55000 } = {}) {
  const headers = { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://momo.zhuofan.me";
    headers["X-OpenRouter-Title"] = "拾词";
  }
  const requestBody = { model: config.model, messages, temperature: 0.2 };
  if (jsonMode) requestBody.response_format = { type: "json_object" };
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

