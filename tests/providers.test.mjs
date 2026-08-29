import assert from "node:assert/strict";
import test from "node:test";
import { listProviderModels, PROVIDERS, providerConfig } from "../api/_lib/providers.mjs";

test("provider allowlist contains ten supported services", () => {
  assert.equal(Object.keys(PROVIDERS).length, 10);
  for (const provider of ["deepseek", "qwen", "siliconflow", "openai", "gemini", "openrouter", "groq", "together", "mistral", "xai"]) {
    assert.ok(PROVIDERS[provider]);
    assert.doesNotThrow(() => providerConfig({ provider, api_key: "test-key", model: PROVIDERS[provider].defaultModel }));
  }
});

test("model discovery uses allowlisted endpoint and filters non-text models", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    return { ok: true, json: async () => ({ data: [
      { id: "chat-model", type: "chat" },
      { id: "text-embedding-3-small", type: "embedding" },
      { id: "second/model", type: "language" }
    ] }) };
  };
  try {
    const models = await listProviderModels({ provider: "openai", api_key: "test-key" });
    assert.equal(requestedUrl, "https://api.openai.com/v1/models");
    assert.deepEqual(models.map(item => item.id), ["chat-model", "second/model"]);
  } finally { globalThis.fetch = originalFetch; }
});
