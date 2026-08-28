export function json(response, status, payload) {
  response.status(status);
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.json(payload);
}

export function method(response, request, allowed = "POST") {
  if (request.method === allowed) return true;
  response.setHeader("Allow", allowed);
  json(response, 405, { ok: false, error: "请求方式不支持。" });
  return false;
}

export function body(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  return {};
}

export function fail(response, error) {
  const message = error instanceof Error ? error.message : "操作失败，请稍后重试。";
  json(response, 400, { ok: false, error: message.slice(0, 500) });
}

