import { body, fail, json, method } from "./_lib/http.mjs";
import { chatCompletion, providerConfig } from "./_lib/providers.mjs";
import { freeTrialStatus, startFreeTrial } from "./_lib/quota.mjs";

const MAX_CHARS = 1200;

function clean(value, limit = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanList(value, limit = 5, itemLimit = 120) {
  if (!Array.isArray(value)) return [];
  return value.map(item => clean(item, itemLimit)).filter(Boolean).slice(0, limit);
}

export function translationKind(text, requested = "auto") {
  if (["word", "sentence"].includes(requested)) return requested;
  return /^[A-Za-z][A-Za-z'-]{0,49}$/.test(text.trim()) ? "word" : "sentence";
}

export function buildTranslationPrompt(text, kind) {
  const direction = /[\u3400-\u9fff]/.test(text) ? "把中文自然地翻译成英文" : "把英文准确、自然地翻译成简体中文";
  if (kind === "word") {
    return `你是一名严谨的英汉词典编辑。请解释英文单词“${text}”。只返回 JSON 对象：
{"kind":"word","word":"词典原形","phonetic":"IPA 音标，不含方括号","partOfSpeech":"主要词性，可用斜杠分隔","meanings":["按常用程度排列的简明中文释义"],"usage":"一句简洁的用法或易错点","example":"自然、真实的英文例句","exampleTranslation":"例句的简体中文翻译","phrases":["最多 4 个常用搭配 — 中文释义"]}
不要编造词源，不要使用 Markdown，不确定的字段返回空字符串或空数组。`;
  }
  return `你是一名严谨的双语编辑。${direction}。保留语气、时态、否定、称谓和专有名词，不逐字硬译。只返回 JSON 对象：
{"kind":"sentence","translation":"自然译文","literal":"仅在有助于理解时给出较直译版本，否则为空","tone":"用不超过 20 个汉字说明语气或使用场景","keyExpressions":["最多 4 个关键表达 — 对应含义"],"alternatives":["最多 2 个确有价值的不同语气译法"]}
不要使用 Markdown。待翻译内容：
---
${text}
---`;
}

export function normalizeTranslation(raw, text, kind) {
  if (!raw || typeof raw !== "object") throw new Error("AI 没有返回有效翻译。");
  if (kind === "word") {
    const word = clean(raw.word || text, 60);
    const meanings = cleanList(raw.meanings, 6, 100);
    if (!word || !meanings.length) throw new Error("AI 没有返回可用的单词释义，请重试。");
    return {
      kind,
      original: text,
      word,
      phonetic: clean(raw.phonetic, 80).replace(/^\[|\]$/g, ""),
      partOfSpeech: clean(raw.partOfSpeech, 60),
      meanings,
      usage: clean(raw.usage, 240),
      example: clean(raw.example, 400),
      exampleTranslation: clean(raw.exampleTranslation, 400),
      phrases: cleanList(raw.phrases, 4, 160)
    };
  }
  const translation = clean(raw.translation, 1200);
  if (!translation) throw new Error("AI 没有返回可用译文，请重试。");
  return {
    kind,
    original: text,
    translation,
    literal: clean(raw.literal, 1200),
    tone: clean(raw.tone, 80),
    keyExpressions: cleanList(raw.keyExpressions, 4, 180),
    alternatives: cleanList(raw.alternatives, 2, 1200)
  };
}

export async function translateWithModel(config, text, kind, chat = chatCompletion) {
  const content = await chat(config, [
    { role: "system", content: "输出必须是有效 JSON，不要使用 Markdown 代码块。" },
    { role: "user", content: buildTranslationPrompt(text, kind) }
  ], { jsonMode: true, maxTokens: 2048 });
  let decoded;
  try { decoded = JSON.parse(content); } catch { throw new Error("AI 没有按要求返回结构化翻译，请重试。"); }
  return normalizeTranslation(decoded, text, kind);
}

export default async function handler(request, response) {
  if (!method(response, request)) return;
  try {
    const data = body(request);
    const useFree = String(data.mode || "free") === "free";
    const trial = freeTrialStatus(request);
    if (useFree && trial.started && !trial.active) return json(response, 402, { ok: false, error: "此浏览器的一周免费体验已结束，请连接你自己的 AI API。", trial });
    const text = String(data.text || "").trim();
    if (!text) throw new Error("请输入要翻译的单词或句子。");
    if (text.length > MAX_CHARS) throw new Error(`单次最多翻译 ${MAX_CHARS} 个字符。`);
    const kind = translationKind(text, String(data.kind || "auto"));
    if (kind === "word" && !/^[A-Za-z][A-Za-z'-]{0,49}$/.test(text)) throw new Error("单词模式请输入一个英文单词；短语或句子请切换到句子模式。");
    const config = providerConfig(data, useFree);
    const result = await translateWithModel(config, text, kind);
    const nextTrial = useFree && !trial.started ? startFreeTrial(response) : trial;
    json(response, 200, { ok: true, result, mode: useFree ? "free" : "own", provider: config.label, trial: nextTrial });
  } catch (error) { fail(response, error); }
}
