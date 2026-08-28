import { FREE_LIMIT, usedFreeUses } from "./_lib/quota.mjs";
import { json } from "./_lib/http.mjs";

export default function handler(request, response) {
  if (request.method !== "GET") return json(response, 405, { ok: false, error: "请求方式不支持。" });
  const used = usedFreeUses(request);
  json(response, 200, { ok: true, limit: FREE_LIMIT, used, remaining: FREE_LIMIT - used });
}

