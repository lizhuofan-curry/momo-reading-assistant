import assert from "node:assert/strict";
import test from "node:test";
import { downmixChannels, encodeWav, formatAudioTime, resampleLinear } from "../public/audio-utils.js";
import { AUDIO_PROVIDERS, transcribeAudioChunk } from "../api/transcribe.mjs";
import { searchMusic } from "../api/music-search.mjs";

test("audio utilities downmix, resample and create valid PCM WAV", () => {
  const mono = downmixChannels([new Float32Array([1, 0, -1]), new Float32Array([0, 0, 0])]);
  assert.deepEqual([...mono], [0.5, 0, -0.5]);
  const sampled = resampleLinear(mono, 48000, 16000);
  assert.equal(sampled.length, 1);
  const wav = encodeWav(new Float32Array([0, 0.5, -0.5]));
  assert.equal(Buffer.from(wav).toString("ascii", 0, 4), "RIFF");
  assert.equal(Buffer.from(wav).toString("ascii", 8, 12), "WAVE");
  assert.equal(formatAudioTime(65), "01:05");
});

test("music search normalizes official catalog results", async () => {
  let requested = "";
  const results = await searchMusic("Yellow", async url => {
    requested = String(url);
    return { ok: true, json: async () => ({ results: [{ trackId: 1, trackName: "Yellow", artistName: "Coldplay", collectionName: "Parachutes", artworkUrl100: "https://is1-ssl.mzstatic.com/image/100x100bb.jpg", previewUrl: "https://audio-ssl.itunes.apple.com/example.m4a", trackTimeMillis: 260000 }] }) };
  });
  assert.match(requested, /entity=song/);
  assert.equal(results[0].title, "Yellow");
  assert.match(results[0].artworkUrl, /300x300bb/);
});

test("audio transcription uses an allowlisted endpoint and model", async () => {
  const wav = encodeWav(new Float32Array(100));
  let request;
  const result = await transcribeAudioChunk({ provider: "groq", api_key: "secret", model: "whisper-large-v3-turbo", audio_base64: Buffer.from(wav).toString("base64") }, async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ text: "Hello from the other side.", segments: [{ start: 0.2, end: 2.5, text: "Hello from the other side." }] }) };
  });
  assert.equal(request.url, AUDIO_PROVIDERS.groq.endpoint);
  assert.equal(request.options.body.get("model"), "whisper-large-v3-turbo");
  assert.equal(request.options.body.get("language"), "en");
  assert.equal(result.segments[0].start, 0.2);
  await assert.rejects(() => transcribeAudioChunk({ provider: "deepseek", api_key: "x", audio_base64: "abc" }), /受支持/);
});

test("domestic audio providers use their documented request protocols", async () => {
  const wav = encodeWav(new Float32Array(100));
  const audio = Buffer.from(wav).toString("base64");
  let qwenRequest;
  const qwen = await transcribeAudioChunk({ provider: "qwen", api_key: "sk-qwen", model: "qwen3-asr-flash", audio_base64: audio }, async (url, options) => {
    qwenRequest = { url: String(url), body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: "English dialogue from the video." } }] }) };
  });
  assert.match(qwenRequest.url, /dashscope\.aliyuncs\.com/);
  assert.match(qwenRequest.body.messages[0].content[0].input_audio.data, /^data:audio\/wav;base64,/);
  assert.equal(qwenRequest.body.asr_options.language, "en");
  assert.equal(qwen.text, "English dialogue from the video.");

  let siliconRequest;
  const silicon = await transcribeAudioChunk({ provider: "siliconflow", api_key: "sk-sf", model: "FunAudioLLM/SenseVoiceSmall", audio_base64: audio }, async (url, options) => {
    siliconRequest = { url: String(url), form: options.body };
    return { ok: true, json: async () => ({ text: "A clear English sentence." }) };
  });
  assert.match(siliconRequest.url, /siliconflow\.cn\/v1\/audio\/transcriptions/);
  assert.equal(siliconRequest.form.get("model"), "FunAudioLLM/SenseVoiceSmall");
  assert.equal(siliconRequest.form.get("language"), null);
  assert.equal(silicon.text, "A clear English sentence.");
});
