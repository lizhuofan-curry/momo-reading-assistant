import test from "node:test";
import assert from "node:assert/strict";
import { buildTranslationPrompt, normalizeTranslation, translationKind, translateWithModel } from "../api/translate.mjs";

test("translation mode distinguishes a single English word from a sentence", () => {
  assert.equal(translationKind("robust"), "word");
  assert.equal(translationKind("The model is robust."), "sentence");
  assert.equal(translationKind("稳健的模型"), "sentence");
});

test("word translation is normalized and bounded", () => {
  const result = normalizeTranslation({ word: "robust", phonetic: "[rəʊˈbʌst]", partOfSpeech: "adjective", meanings: ["稳健的", "强健的"], usage: "常用于系统和方法。", example: "The method is robust to noise.", exampleTranslation: "该方法对噪声具有稳健性。", phrases: ["robust to noise — 对噪声稳健"] }, "robust", "word");
  assert.equal(result.phonetic, "rəʊˈbʌst");
  assert.deepEqual(result.meanings, ["稳健的", "强健的"]);
  assert.equal(result.kind, "word");
});

test("sentence prompt reverses direction for Chinese and model JSON is parsed", async () => {
  assert.match(buildTranslationPrompt("这个模型很稳健。", "sentence"), /中文自然地翻译成英文/);
  const result = await translateWithModel({}, "Could you give me a hand?", "sentence", async () => JSON.stringify({ kind: "sentence", translation: "你能帮我一下吗？", literal: "", tone: "日常请求", keyExpressions: ["give me a hand — 帮我一下"], alternatives: [] }));
  assert.equal(result.translation, "你能帮我一下吗？");
  assert.deepEqual(result.keyExpressions, ["give me a hand — 帮我一下"]);
});
