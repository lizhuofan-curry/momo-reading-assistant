import assert from "node:assert/strict";
import test from "node:test";
import { listProviderModels, PROVIDERS, providerConfig } from "../api/_lib/providers.mjs";

test("provider allowlist contains fifteen supported services", () => {
  assert.equal(Object.keys(PROVIDERS).length, 15);
  for (const provider of ["deepseek", "doubao", "kimi", "qwen", "minimax", "mimo", "glm", "siliconflow", "openai", "gemini", "openrouter", "groq", "together", "mistral", "xai"]) {
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
    const result = await listProviderModels({ provider: "openai", api_key: "test-key" });
    assert.equal(requestedUrl, "https://api.openai.com/v1/models");
    assert.equal(result.source, "live");
    assert.deepEqual(result.models.map(item => item.id), ["chat-model", "second/model"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("Doubao uses official candidates and allows an endpoint ID fallback", async () => {
  const result = await listProviderModels({ provider: "doubao", api_key: "test-key" });
  assert.equal(result.source, "preset");
  assert.ok(result.models.some(item => item.id === "doubao-seed-2-0-lite-260215"));
  assert.match(result.note, /推理接入点 ID/);
});

test("new domestic providers use official allowlisted endpoints", () => {
  assert.equal(PROVIDERS.kimi.baseUrl, "https://api.moonshot.cn/v1");
  assert.equal(PROVIDERS.minimax.baseUrl, "https://api.minimaxi.com/v1");
  assert.equal(PROVIDERS.mimo.baseUrl, "https://api.xiaomimimo.com/v1");
  assert.equal(PROVIDERS.glm.baseUrl, "https://open.bigmodel.cn/api/paas/v4");
});
