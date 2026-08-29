import { freeTrialStatus, TRIAL_DAYS } from "./_lib/quota.mjs";
import { json } from "./_lib/http.mjs";

export default function handler(request, response) {
  if (request.method !== "GET") return json(response, 405, { ok: false, error: "请求方式不支持。" });
  json(response, 200, { ok: true, trialDays: TRIAL_DAYS, trial: freeTrialStatus(request) });
}
