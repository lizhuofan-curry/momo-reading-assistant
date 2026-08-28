import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "momo_free_uses";
export const FREE_LIMIT = 5;

function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32) throw new Error("服务器免费体验计数尚未配置。");
  return value;
}

function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function equal(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const part of cookies) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === COOKIE) return decodeURIComponent(part.slice(index + 1));
  }
  return "";
}

export function usedFreeUses(request) {
  try {
    const [count, signature] = cookieValue(request).split(".");
    if (!count || !signature || !equal(signature, sign(count))) return 0;
    return Math.min(FREE_LIMIT, Math.max(0, Number(count) || 0));
  } catch { return 0; }
}

export function setFreeUses(response, count) {
  const safeCount = Math.min(FREE_LIMIT, Math.max(0, Number(count) || 0));
  const value = `${safeCount}.${sign(String(safeCount))}`;
  response.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
}

