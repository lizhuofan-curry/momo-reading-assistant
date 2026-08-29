import { body, fail, json, method } from "./_lib/http.mjs";
import { listProviderModels, PROVIDERS } from "./_lib/providers.mjs";

export default async function handler(request, response) {
  if (!method(response, request)) return;
  try {
    const data = body(request);
    const models = await listProviderModels(data);
    const provider = PROVIDERS[String(data.provider || "")];
    json(response, 200, { ok: true, models, provider: provider?.label || "模型服务商" });
  } catch (error) { fail(response, error); }
}
