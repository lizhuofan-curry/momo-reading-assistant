import { body, fail, json, method } from "./_lib/http.mjs";
import { chatCompletion, providerConfig } from "./_lib/providers.mjs";
import { FREE_LIMIT, setFreeUses, usedFreeUses } from "./_lib/quota.mjs";

const MAX_CHARS = 150000;

function sentenceFor(article, word, lemma) {
  const parts = article.trim().split(/(?<=[.!?])\s+|[\r\n]+/);
  for (const value of [word, lemma]) {
    if (!value) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}(?:s|es|ed|ing)?\\b`, "i");
    const found = parts.find(item => pattern.test(item));
    if (found) return found.replace(/\s+/g, " ").trim().slice(0, 500);
  }
  return "";
}

function normalizeDerivatives(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const word = String(item.word || "").trim().toLowerCase();
    const meaning = String(item.meaning || "").trim().slice(0, 80);
    if (!/^[a-z][a-z'-]{1,49}$/.test(word) || !meaning || seen.has(word)) return [];
    seen.add(word);
    return [{ word, meaning }];
  }).slice(0, 4);
}

function normalizePhrases(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const phrase = String(item.phrase || "").replace(/\s+/g, " ").trim().toLowerCase();
    const meaning = String(item.meaning || "").trim().slice(0, 80);
    if (!/^[a-z][a-z' -]{2,79}$/.test(phrase) || !meaning || seen.has(phrase)) return [];
    seen.add(phrase);
    return [{ phrase, meaning }];
  }).slice(0, 4);
}

export function normalize(raw, article, limit, expansion = "none") {
  if (!Array.isArray(raw)) throw new Error("AI 返回的 words 不是列表。");
  const result = [];
  const seen = new Set();
  const valid = /^[A-Za-z][A-Za-z'-]{1,49}$/;
  const lower = article.toLowerCase();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const word = String(item.word || "").trim();
    const lemma = String(item.lemma || word).trim().toLowerCase();
    if (!valid.test(word) || !valid.test(lemma) || !lower.includes(word.toLowerCase()) || seen.has(lemma)) continue;
    const sentence = sentenceFor(article, word, lemma);
    if (!sentence) continue;
    seen.add(lemma);
    result.push({
      word,
      lemma,
      meaning: String(item.meaning || "").trim().slice(0, 160),
      mnemonic: String(item.mnemonic || "").trim().slice(0, 160),
      reason: String(item.reason || "").trim().slice(0, 100),
      derivatives: expansion === "full" ? normalizeDerivatives(item.derivatives) : [],
      phrases: expansion === "phrases" || expansion === "full" ? normalizePhrases(item.phrases) : [],
      sentence,
      selected: true
    });
    if (result.length >= limit) break;
  }
  if (!result.length) throw new Error("没有得到可用生词。可以提高难度、增加数量或换一份材料。");
  return result;
}

export function buildPrompt(article, level, maxWords, expansion = "none") {
  const vocabularySize = level.match(/词汇量\D{0,5}(\d{2,5})/i);
  const beginner = /A1|A2|基础|小学|初中|入门|初学|只认识|较差|较弱|不会/i.test(level)
    || (vocabularySize && Number(vocabularySize[1]) <= 3000);
  const levelRule = beginner
    ? "学习者目前处于基础阶段：可以选择材料中的日常基础词和常用动词，不要因为词频高就一律删除；优先保证可理解、可复用。"
    : "学习者已有一定基础：删除其水平下通常已经掌握的简单词，优先保留有语境价值的词。";
  const extensionRule = expansion === "full"
    ? "为每个生词补充最多 4 个常见派生词 derivatives 和最多 4 个实用短语 phrases；只给确定、常用且与该词直接相关的内容。"
    : expansion === "phrases"
      ? "为每个生词补充最多 4 个实用短语 phrases；derivatives 返回空数组。只给确定、常用且与该词直接相关的搭配。"
      : "derivatives 和 phrases 都返回空数组，不做额外扩展。";
  return `你是一名严谨的英语词汇编辑。请从下面材料中为“${level}”学习者挑选最多 ${maxWords} 个值得学习的英文单词。

要求：
1. 只选择材料真实出现的单词，word 使用材料中的形式，lemma 使用词典原形。
2. ${levelRule}
3. 优先选择学术词汇、熟词僻义、主题核心词和常见但容易误解的词。
4. meaning 必须是该词在本文语境中的简洁中文释义。
5. mnemonic 是不超过 40 个汉字的可靠助记；无法可靠助记时留空，不要编造词源。
6. reason 用不超过 24 个汉字说明为什么值得学习。
7. 无论学习水平如何，都排除纯数字、人名、品牌名、地名、网址、乱码和无学习价值的缩写。
8. ${extensionRule}
9. 只返回 JSON 对象：{"words":[{"word":"...","lemma":"...","meaning":"...","mnemonic":"...","reason":"...","derivatives":[{"word":"...","meaning":"..."}],"phrases":[{"phrase":"...","meaning":"..."}]}]}

材料：
---
${article}
---`;
}

async function analyzeWithModel(config, article, level, maxWords, expansion) {
  const prompt = buildPrompt(article, level, maxWords, expansion);
  const content = await chatCompletion(config, [
    { role: "system", content: "输出必须是有效 JSON，不要使用 Markdown 代码块。" },
    { role: "user", content: prompt }
  ], { jsonMode: true, maxTokens: expansion === "none" ? 4096 : 8192 });
  let decoded;
  try { decoded = JSON.parse(content); } catch { throw new Error("AI 没有按要求返回结构化词汇，请重试。"); }
  return normalize(decoded.words, article, maxWords, expansion);
}

export default async function handler(request, response) {
  if (!method(response, request)) return;
  try {
    const data = body(request);
    const useFree = String(data.mode || "free") === "free";
    const used = usedFreeUses(request);
    if (useFree && used >= FREE_LIMIT) return json(response, 402, { ok: false, error: "此浏览器的 5 次免费体验已用完，请连接你自己的 AI API。", remaining: 0 });
    const article = String(data.article || "").trim();
    const level = String(data.level || "专业论文阅读").replace(/[\r\n]/g, " ").trim().slice(0, 40);
    const maxWords = Number(data.max_words || 20);
    const expansion = ["none", "phrases", "full"].includes(String(data.expansion)) ? String(data.expansion) : "none";
    if (article.length < 20) throw new Error("请先导入或粘贴足够的英文材料。");
    if (article.length > MAX_CHARS) throw new Error(`材料过长，最多支持 ${MAX_CHARS.toLocaleString()} 个字符。`);
    if (!Number.isInteger(maxWords) || maxWords < 3 || maxWords > 50) throw new Error("提取数量必须在 3 到 50 之间。");
    const config = providerConfig(data, useFree);
    const words = await analyzeWithModel(config, article, level, maxWords, expansion);
    const nextUsed = useFree ? used + 1 : used;
    if (useFree) setFreeUses(response, nextUsed);
    json(response, 200, { ok: true, words, mode: useFree ? "free" : "own", provider: config.label, remaining: FREE_LIMIT - nextUsed });
  } catch (error) { fail(response, error); }
}
