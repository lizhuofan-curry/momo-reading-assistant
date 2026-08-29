import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, normalize } from "../api/analyze.mjs";

const article = "The robust model generalizes well across noisy recording sessions.";

test("beginner prompt keeps useful common words", () => {
  const prompt = buildPrompt(article, "基础入门（A1）", 10, "none");
  assert.match(prompt, /日常基础词和常用动词/);
  assert.match(prompt, /derivatives 和 phrases 都返回空数组/);
  const customPrompt = buildPrompt(article, "只认识最常见的 500 个词", 10, "none");
  assert.match(customPrompt, /日常基础词和常用动词/);
});

test("subtitle prompt prioritizes reusable spoken English", () => {
  const prompt = buildPrompt("[00:04:12] That really put me on the spot.", "美剧日常口语", 10, "full");
  assert.match(prompt, /熟词口语义、俚语核心词和固定搭配/);
  assert.match(prompt, /排除角色名/);
});

test("music prompt prioritizes idioms and filters lyric noise", () => {
  const prompt = buildPrompt("[01:05] You light up every corner of my mind.", "英文歌曲与歌词", 10, "phrases");
  assert.match(prompt, /动词短语、习语、隐喻核心词/);
  assert.match(prompt, /排除歌手名、歌曲名、拟声词/);
});

test("full expansion is normalized and bounded", () => {
  const words = normalize([{
    word: "robust",
    lemma: "robust",
    meaning: "稳健的",
    derivatives: [
      { word: "robustness", meaning: "稳健性" },
      { word: "robustness", meaning: "重复项" },
      { word: "bad item!", meaning: "无效" }
    ],
    phrases: [
      { phrase: "robust to noise", meaning: "对噪声稳健" },
      { phrase: "robust to noise", meaning: "重复项" }
    ]
  }], article, 10, "full");
  assert.equal(words.length, 1);
  assert.deepEqual(words[0].derivatives, [{ word: "robustness", meaning: "稳健性" }]);
  assert.deepEqual(words[0].phrases, [{ phrase: "robust to noise", meaning: "对噪声稳健" }]);
});

test("none expansion discards model extras", () => {
  const words = normalize([{
    word: "robust",
    lemma: "robust",
    meaning: "稳健的",
    derivatives: [{ word: "robustness", meaning: "稳健性" }],
    phrases: [{ phrase: "robust to noise", meaning: "对噪声稳健" }]
  }], article, 10, "none");
  assert.deepEqual(words[0].derivatives, []);
  assert.deepEqual(words[0].phrases, []);
});
