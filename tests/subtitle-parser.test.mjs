import assert from "node:assert/strict";
import test from "node:test";
import { cleanSubtitleText, parseSubtitles } from "../public/subtitle-parser.js";

test("SRT subtitles keep timestamps, remove Chinese and deduplicate cues", () => {
  const source = `1\n00:00:01,000 --> 00:00:03,000\nJOEY: How are you doing?\n你好吗？\n\n2\n00:00:04,000 --> 00:00:06,000\nHow are you doing?\n\n3\n00:00:07,000 --> 00:00:09,000\nThis is awkward. 这太尴尬了。`;
  const result = parseSubtitles(source, { filename: "episode.srt" });
  assert.equal(result.format, "SRT");
  assert.equal(result.cues.length, 2);
  assert.equal(result.duplicateCount, 1);
  assert.match(result.text, /^\[00:00:01\] How are you doing\?/);
  assert.doesNotMatch(result.text, /[\u3400-\u9fff]/);
});

test("ASS subtitles use the declared events format and strip style tags", () => {
  const source = `[Script Info]\nTitle: Demo\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:02.00,0:00:04.20,Default,Ross,0,0,0,,{\\i1}We were on a break!{\\i0}\n`;
  const result = parseSubtitles(source, { filename: "episode.ass" });
  assert.equal(result.format, "ASS");
  assert.equal(result.cues[0].text, "We were on a break!");
  assert.match(result.text, /^\[00:00:02\]/);
});

test("split lowercase subtitle cues merge across a short gap", () => {
  const source = `00:00:01.000 --> 00:00:02.000\nI thought we could\n\n00:00:02.400 --> 00:00:04.000\nwatch the movie together.`;
  const result = parseSubtitles(source, { filename: "episode.vtt" });
  assert.equal(result.cues.length, 1);
  assert.equal(result.cues[0].text, "I thought we could watch the movie together.");
});

test("plain bilingual text keeps only useful English", () => {
  assert.equal(cleanSubtitleText("[door closes]\n- Joey: Hello there!\n你好！"), "Hello there!");
});
