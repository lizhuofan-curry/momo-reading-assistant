import assert from "node:assert/strict";
import test from "node:test";
import { FREE_LIMIT, setFreeUses, usedFreeUses } from "../api/_lib/quota.mjs";
import { providerConfig } from "../api/_lib/providers.mjs";

process.env.SESSION_SECRET = "test-secret-that-is-longer-than-thirty-two-characters";

test("free-use cookie is signed and capped", () => {
  let header = "";
  setFreeUses({ setHeader: (_name, value) => { header = value; } }, 99);
  const cookie = header.split(";")[0];
  assert.equal(usedFreeUses({ headers: { cookie } }), FREE_LIMIT);
  assert.equal(usedFreeUses({ headers: { cookie: `${cookie}tampered` } }), 0);
});

test("own API accepts only allowlisted providers", () => {
  assert.throws(() => providerConfig({ provider: "custom", api_key: "secret", model: "model" }), /受支持/);
  const config = providerConfig({ provider: "openai", api_key: "secret", model: "gpt-5.4-mini" });
  assert.equal(config.baseUrl, "https://api.openai.com/v1");
});
