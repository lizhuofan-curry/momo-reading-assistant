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

function normalize(raw, article, limit) {
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
      sentence,
      selected: true
    });
    if (result.length >= limit) break;
  }
  if (!result.length) throw new Error("没有得到可用生词。可以提高难度、增加数量或换一份材料。");
  return result;
}

async function analyzeWithModel(config, article, level, maxWords) {
  const prompt = `你是一名严谨的英语词汇编辑。请从下面材料中为“${level}”学习者挑选最多 ${maxWords} 个值得学习的英文单词。

要求：
1. 只选择材料真实出现的单词，word 使用材料中的形式，lemma 使用词典原形。
2. 删除基础词、纯数字、人名、品牌名、地名、网址、乱码和无学习价值的缩写。
3. 优先选择学术词汇、熟词僻义、主题核心词和常见但容易误解的词。
4. meaning 必须是该词在本文语境中的简洁中文释义。
5. mnemonic 是不超过 40 个汉字的可靠助记；无法可靠助记时留空，不要编造词源。
6. reason 用不超过 24 个汉字说明为什么值得学习。
7. 只返回 JSON 对象：{"words":[{"word":"...","lemma":"...","meaning":"...","mnemonic":"...","reason":"..."}]}

材料：
---
${article}
---`;
  const content = await chatCompletion(config, [
    { role: "system", content: "输出必须是有效 JSON，不要使用 Markdown 代码块。" },
    { role: "user", content: prompt }
  ], { jsonMode: true });
  let decoded;
  try { decoded = JSON.parse(content); } catch { throw new Error("AI 没有按要求返回结构化词汇，请重试。"); }
  return normalize(decoded.words, article, maxWords);
}

export default async function handler(request, response) {
  if (!method(response, request)) return;
  try {
    const data = body(request);
    const useFree = String(data.mode || "free") === "free";
    const used = usedFreeUses(request);
    if (useFree && used >= FREE_LIMIT) return json(response, 402, { ok: false, error: "此浏览器的 5 次免费体验已用完，请连接你自己的 AI API。", remaining: 0 });
    const article = String(data.article || "").trim();
    const level = String(data.level || "专业论文阅读").slice(0, 40);
    const maxWords = Number(data.max_words || 20);
    if (article.length < 20) throw new Error("请先导入或粘贴足够的英文材料。");
    if (article.length > MAX_CHARS) throw new Error(`材料过长，最多支持 ${MAX_CHARS.toLocaleString()} 个字符。`);
    if (!Number.isInteger(maxWords) || maxWords < 3 || maxWords > 50) throw new Error("提取数量必须在 3 到 50 之间。");
    const config = providerConfig(data, useFree);
    const words = await analyzeWithModel(config, article, level, maxWords);
    const nextUsed = useFree ? used + 1 : used;
    if (useFree) setFreeUses(response, nextUsed);
    json(response, 200, { ok: true, words, mode: useFree ? "free" : "own", provider: config.label, remaining: FREE_LIMIT - nextUsed });
  } catch (error) { fail(response, error); }
}
