import { body, fail, json, method } from "./_lib/http.mjs";

export default async function handler(request, response) {
  if (!method(response, request)) return;
  try {
    const token = String(body(request).token || "").trim();
    if (!token) throw new Error("请填写你自己的墨墨 Access Token。");
    const remote = await fetch("https://open.maimemo.com/open/api/v1/memo/notepads?limit=1&offset=0", {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
      signal: AbortSignal.timeout(30000)
    });
    const payload = await remote.json().catch(() => ({}));
    if (!remote.ok) throw new Error(`墨墨返回 ${remote.status}：${payload?.error?.message || payload?.message || "Token 无效"}`);
    json(response, 200, { ok: true, message: "墨墨 Access Token 连接成功" });
  } catch (error) { fail(response, error); }
}
