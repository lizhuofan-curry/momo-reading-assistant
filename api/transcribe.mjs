import { body, fail, json, method } from "./_lib/http.mjs";

export const AUDIO_PROVIDERS = {
  qwen: {
    label: "阿里云百炼 · 千问 ASR",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    models: ["qwen3-asr-flash"],
    defaultModel: "qwen3-asr-flash",
    protocol: "qwen-chat"
  },
  siliconflow: {
    label: "硅基流动",
    endpoint: "https://api.siliconflow.cn/v1/audio/transcriptions",
    models: ["FunAudioLLM/SenseVoiceSmall", "TeleAI/TeleSpeechASR"],
    defaultModel: "FunAudioLLM/SenseVoiceSmall"
  },
  groq: {
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
    models: ["whisper-large-v3-turbo", "whisper-large-v3"],
    defaultModel: "whisper-large-v3-turbo"
  },
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    models: ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"],
    defaultModel: "gpt-4o-mini-transcribe"
  }
};

function audioBuffer(value) {
  const encoded = String(value || "");
  if (!encoded || encoded.length > 3_200_000 || !/^[A-Za-z0-9+/]+=*$/.test(encoded)) throw new Error("音频分片无效或过大，请重新选择歌曲。");
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length < 48 || buffer.length > 2_400_000 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("只接受浏览器生成的 WAV 音频分片。");
  }
  return buffer;
}

export async function transcribeAudioChunk(data, fetchImpl = fetch) {
  const provider = String(data.provider || "");
  const preset = AUDIO_PROVIDERS[provider];
  if (!preset) throw new Error("请选择受支持的语音识别服务商。");
  const apiKey = String(data.api_key || "").trim();
  if (!apiKey || apiKey.length > 500) throw new Error(`请填写 ${preset.label} API Key。`);
  const model = String(data.model || preset.defaultModel).trim();
  if (!preset.models.includes(model)) throw new Error("请选择页面提供的语音识别模型。");
  const audio = audioBuffer(data.audio_base64);
  if (preset.protocol === "qwen-chat") {
    const remote = await fetchImpl(preset.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [{ type: "input_audio", input_audio: { data: `data:audio/wav;base64,${audio.toString("base64")}` } }]
        }],
        asr_options: { language: "en", enable_itn: true },
        stream: false
      }),
      signal: AbortSignal.timeout(55000)
    });
    const payload = await remote.json().catch(() => ({}));
    if (!remote.ok) throw new Error(`${preset.label} 返回 ${remote.status}：${payload?.error?.message || payload?.message || "转写失败"}`);
    const content = payload?.choices?.[0]?.message?.content;
    const text = String(Array.isArray(content) ? content.map(item => item?.text || "").join(" ") : content || payload?.output?.text || "").replace(/\s+/g, " ").trim();
    if (!text) throw new Error(`${preset.label} 没有返回有效英文文本。`);
    return { text, segments: [], provider: preset.label, model };
  }
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "music-chunk.wav");
  form.append("model", model);
  if (data.provider !== "siliconflow") {
    form.append("language", "en");
    form.append("temperature", "0");
  }
  const prompt = String(data.prompt || "").replace(/[\r\n]/g, " ").trim().slice(0, 200);
  if (prompt && data.provider !== "siliconflow") form.append("prompt", prompt);
  const timestamps = provider === "groq" || model === "whisper-1";
  if (timestamps) {
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
  } else {
    form.append("response_format", "json");
  }
  const remote = await fetchImpl(preset.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(55000)
  });
  const payload = await remote.json().catch(() => ({}));
  if (!remote.ok) throw new Error(`${preset.label} 返回 ${remote.status}：${payload?.error?.message || payload?.message || "转写失败"}`);
  const text = String(payload.text || "").replace(/\s+/g, " ").trim();
  const segments = Array.isArray(payload.segments) ? payload.segments.flatMap(segment => {
    const value = String(segment?.text || "").replace(/\s+/g, " ").trim();
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    if (!value || !Number.isFinite(start)) return [];
    return [{ text: value, start: Math.max(0, start), end: Number.isFinite(end) ? Math.max(start, end) : null, noSpeech: Number(segment?.no_speech_prob) || 0 }];
  }) : [];
  return { text, segments, provider: preset.label, model };
}

export default async function handler(request, response) {
  if (!method(response, request)) return;
  try { json(response, 200, { ok: true, ...(await transcribeAudioChunk(body(request))) }); }
  catch (error) { fail(response, error); }
}
