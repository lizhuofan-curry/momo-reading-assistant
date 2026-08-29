import assert from "node:assert/strict";
import test from "node:test";
import { freeTrialStatus, startFreeTrial, TRIAL_DAYS, TRIAL_MS } from "../api/_lib/quota.mjs";
import { providerConfig } from "../api/_lib/providers.mjs";

process.env.SESSION_SECRET = "test-secret-that-is-longer-than-thirty-two-characters";

test("free trial starts on first successful analysis and lasts seven days", () => {
  const startedAt = Date.UTC(2026, 7, 29, 8, 0, 0);
  const fresh = freeTrialStatus({ headers: {} }, startedAt);
  assert.deepEqual(fresh, { started: false, active: true, daysRemaining: TRIAL_DAYS, endsAt: null });

  let header = "";
  const started = startFreeTrial({ setHeader: (_name, value) => { header = value; } }, startedAt);
  const cookie = header.split(";")[0];
  assert.equal(started.started, true);
  assert.equal(freeTrialStatus({ headers: { cookie } }, startedAt + TRIAL_MS - 1).active, true);
  assert.equal(freeTrialStatus({ headers: { cookie } }, startedAt + TRIAL_MS).active, false);
  assert.equal(freeTrialStatus({ headers: { cookie } }, startedAt + TRIAL_MS).daysRemaining, 0);
});

test("tampered trial cookie cannot change a signed start time", () => {
  let header = "";
  startFreeTrial({ setHeader: (_name, value) => { header = value; } }, Date.UTC(2026, 7, 29));
  const tampered = `${header.split(";")[0]}tampered`;
  assert.equal(freeTrialStatus({ headers: { cookie: tampered } }).started, false);
});

test("own API accepts only allowlisted providers", () => {
  assert.throws(() => providerConfig({ provider: "custom", api_key: "secret", model: "model" }), /受支持/);
  const config = providerConfig({ provider: "openai", api_key: "secret", model: "gpt-5.4-mini" });
  assert.equal(config.baseUrl, "https://api.openai.com/v1");
});
