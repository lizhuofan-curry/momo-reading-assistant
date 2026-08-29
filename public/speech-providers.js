export const SPEECH_PROVIDERS = {
  qwen: {
    label: "千问 ASR",
    short: "QW",
    description: "国内推荐 · 英文与多语种",
    keyUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
    models: [{ id: "qwen3-asr-flash", label: "Qwen3-ASR-Flash · 国内推荐" }]
  },
  siliconflow: {
    label: "硅基流动",
    short: "SF",
    description: "国内平台 · 两种 ASR 模型",
    keyUrl: "https://cloud.siliconflow.cn/account/ak",
    models: [
      { id: "FunAudioLLM/SenseVoiceSmall", label: "SenseVoiceSmall · 推荐" },
      { id: "TeleAI/TeleSpeechASR", label: "TeleSpeechASR" }
    ]
  },
  groq: {
    label: "Groq",
    short: "GQ",
    description: "速度快 · Whisper Turbo",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "whisper-large-v3-turbo", label: "Whisper Large V3 Turbo · 推荐" },
      { id: "whisper-large-v3", label: "Whisper Large V3 · 更注重准确率" }
    ]
  },
  openai: {
    label: "OpenAI",
    short: "OA",
    description: "GPT-4o Transcribe 与 Whisper",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o-mini-transcribe", label: "GPT-4o mini Transcribe · 推荐" },
      { id: "gpt-4o-transcribe", label: "GPT-4o Transcribe · 更高准确率" },
      { id: "whisper-1", label: "Whisper-1 · 支持片内时间段" }
    ]
  }
};

export function providerName(provider) {
  return SPEECH_PROVIDERS[provider]?.label || "语音服务商";
}
