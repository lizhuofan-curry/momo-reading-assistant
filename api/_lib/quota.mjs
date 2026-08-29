import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "momo_free_trial";
const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 7;
export const TRIAL_MS = TRIAL_DAYS * DAY_MS;

function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32) throw new Error("服务器免费体验计时尚未配置。");
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

function freshTrial() {
  return { started: false, active: true, daysRemaining: TRIAL_DAYS, endsAt: null };
}

export function freeTrialStatus(request, now = Date.now()) {
  try {
    const [startedAtValue, signature] = cookieValue(request).split(".");
    if (!startedAtValue || !signature || !equal(signature, sign(startedAtValue))) return freshTrial();
    const startedAt = Number(startedAtValue);
    if (!Number.isSafeInteger(startedAt) || startedAt <= 0 || startedAt > now + 60_000) return freshTrial();
    const endsAtMs = startedAt + TRIAL_MS;
    const remainingMs = Math.max(0, endsAtMs - now);
    return {
      started: true,
      active: remainingMs > 0,
      daysRemaining: remainingMs > 0 ? Math.ceil(remainingMs / DAY_MS) : 0,
      endsAt: new Date(endsAtMs).toISOString()
    };
  } catch { return freshTrial(); }
}

export function startFreeTrial(response, now = Date.now()) {
  const startedAt = Math.trunc(now);
  const value = `${startedAt}.${sign(String(startedAt))}`;
  response.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
  return {
    started: true,
    active: true,
    daysRemaining: TRIAL_DAYS,
    endsAt: new Date(startedAt + TRIAL_MS).toISOString()
  };
}
