export const TARGET_SAMPLE_RATE = 16000;
export const CHUNK_SECONDS = 30;

export function downmixChannels(channels) {
  if (!Array.isArray(channels) || !channels.length || !channels[0]?.length) throw new Error("音频没有可用声道。");
  const length = Math.min(...channels.map(channel => channel.length));
  const output = new Float32Array(length);
  for (const channel of channels) {
    for (let index = 0; index < length; index += 1) output[index] += channel[index] / channels.length;
  }
  return output;
}

export function resampleLinear(samples, sourceRate, targetRate = TARGET_SAMPLE_RATE) {
  if (!(samples instanceof Float32Array) || !samples.length || !Number.isFinite(sourceRate) || sourceRate <= 0) throw new Error("无法读取音频采样率。");
  if (sourceRate === targetRate) return samples.slice();
  const length = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const output = new Float32Array(length);
  const ratio = sourceRate / targetRate;
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.min(samples.length - 1, Math.floor(position));
    const right = Math.min(samples.length - 1, left + 1);
    const weight = position - left;
    output[index] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return output;
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function encodeWav(samples, sampleRate = TARGET_SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export function makeAudioChunks(audioBuffer, chunkSeconds = CHUNK_SECONDS) {
  if (!audioBuffer || audioBuffer.duration <= 0 || audioBuffer.numberOfChannels < 1) throw new Error("无法解码这份音频。");
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index));
  const resampled = resampleLinear(downmixChannels(channels), audioBuffer.sampleRate);
  const chunkSize = TARGET_SAMPLE_RATE * chunkSeconds;
  const chunks = [];
  for (let offset = 0; offset < resampled.length; offset += chunkSize) {
    chunks.push({
      start: offset / TARGET_SAMPLE_RATE,
      end: Math.min(resampled.length, offset + chunkSize) / TARGET_SAMPLE_RATE,
      bytes: encodeWav(resampled.subarray(offset, Math.min(resampled.length, offset + chunkSize)))
    });
  }
  return { chunks, samples: resampled, sampleRate: TARGET_SAMPLE_RATE };
}

export function formatAudioTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
