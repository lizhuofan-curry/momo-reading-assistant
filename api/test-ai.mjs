import { body, fail, json, method } from "./_lib/http.mjs";
import { chatCompletion, providerConfig } from "./_lib/providers.mjs";

export default async function handler(request, response) {
  if (!method(response, request)) return;
  try {
    const config = providerConfig(body(request), false);
    await chatCompletion(config, [{ role: "user", content: "只回复 OK" }], { timeout: 30000, maxTokens: 32 });
    json(response, 200, { ok: true, message: `${config.label} · ${config.model} 连接成功` });
  } catch (error) { fail(response, error); }
}
