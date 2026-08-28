// Legacy shared-login helpers retained only for old deployment history.
// The public app no longer imports this module or accepts a shared password.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { json } from "./http.mjs";

const COOKIE = "momo_session";
const ATTEMPT_COOKIE = "momo_login_attempt";

function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32) throw new Error("服务器尚未完成安全配置。SESSION_SECRET 至少需要 32 个字符。");
  return value;
}

function sign(value) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function equalText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map(part => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

function appendCookie(response, value) {
  const current = response.getHeader("Set-Cookie");
  const values = current ? (Array.isArray(current) ? current : [current]) : [];
  response.setHeader("Set-Cookie", [...values, value]);
}

export function validSession(request) {
  try {
    const token = cookies(request)[COOKIE] || "";
    const [expires, signature] = token.split(".");
    if (!expires || !signature || Number(expires) < Date.now()) return false;
    return equalText(signature, sign(expires));
  } catch {
    return false;
  }
}

export function requireSession(request, response) {
  if (validSession(request)) return true;
  json(response, 401, { ok: false, error: "登录已过期，请重新登录。" });
  return false;
}

export function checkPassword(candidate) {
  const expectedHash = process.env.APP_PASSWORD_HASH || "";
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error("服务器尚未设置网页登录密码摘要。");
  const candidateHash = createHash("sha256").update(String(candidate), "utf8").digest("hex");
  return equalText(candidateHash, expectedHash.toLowerCase());
}

export function loginAttempt(request) {
  try {
    const token = cookies(request)[ATTEMPT_COOKIE] || "";
    const [count, startedAt, signature] = token.split(".");
    const payload = `${count}.${startedAt}`;
    if (!count || !startedAt || !signature || !equalText(signature, sign(payload))) return null;
    return { count: Math.max(0, Number(count) || 0), startedAt: Number(startedAt) || Date.now() };
  } catch { return null; }
}

export function setLoginAttempt(response, record) {
  const payload = `${record.count}.${record.startedAt}`;
  appendCookie(response, `${ATTEMPT_COOKIE}=${encodeURIComponent(`${payload}.${sign(payload)}`)}; Path=/api/login; HttpOnly; Secure; SameSite=Strict; Max-Age=900`);
}

export function clearLoginAttempt(response) {
  appendCookie(response, `${ATTEMPT_COOKIE}=; Path=/api/login; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

export function setSession(response) {
  const expires = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const token = `${expires}.${sign(expires)}`;
  appendCookie(response, `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
}

export function clearSession(response) {
  appendCookie(response, `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}
