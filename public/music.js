import { formatAudioTime, makeAudioChunks } from "./audio-utils.js";
import { providerName, SPEECH_PROVIDERS } from "./speech-providers.js";

const $ = id => document.getElementById(id);
const CONFIG_KEY = "momo_audio_config";
const REMEMBER_KEY = "momo_remember_audio";
const MODELS = Object.fromEntries(Object.entries(SPEECH_PROVIDERS).map(([id, item]) => [id, item.models]));
let provider = "qwen";
let selectedFile = null;
let preparedAudio = null;
let localAudioUrl = "";
let transcriptSegments = [];
let recognitionController = null;

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value ?? "";
  return node.innerHTML;
}

function toast(message, error = false) {
  const node = $("music-toast");
  node.textContent = message;
  node.className = `subtitle-toast show${error ? " error" : ""}`;
  clearTimeout(window.musicToastTimer);
  window.musicToastTimer = setTimeout(() => { node.className = "subtitle-toast"; }, 4500);
}

function status(id, message, kind = "") {
  $(id).textContent = message;
  $(id).className = `status ${kind}`;
}

function storedConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || sessionStorage.getItem(CONFIG_KEY) || "null"); } catch { return null; }
}

function saveConfig() {
  const value = JSON.stringify({ provider, model: $("speech-model").value, api_key: $("speech-key").value.trim() });
  const selected = $("remember-speech").checked ? localStorage : sessionStorage;
  const other = $("remember-speech").checked ? sessionStorage : localStorage;
  if ($("speech-key").value.trim()) selected.setItem(CONFIG_KEY, value);
  other.removeItem(CONFIG_KEY);
  localStorage.setItem(REMEMBER_KEY, String($("remember-speech").checked));
}

function chooseProvider(next, savedModel = "") {
  provider = next in MODELS ? next : "qwen";
  document.querySelectorAll(".speech-provider-button").forEach(button => button.classList.toggle("selected", button.dataset.provider === provider));
  $("speech-model").innerHTML = MODELS[provider].map(model => `<option value="${model.id}">${model.label}</option>`).join("");
  if (MODELS[provider].some(model => model.id === savedModel)) $("speech-model").value = savedModel;
  $("speech-key-link").href = SPEECH_PROVIDERS[provider].keyUrl;
  $("speech-key-link").textContent = `前往 ${providerName(provider)} 获取 API Key ↗`;
}

function restoreConfig() {
  $("remember-speech").checked = localStorage.getItem(REMEMBER_KEY) !== "false";
  let saved = storedConfig();
  if (!saved) {
    try {
      const textConfig = JSON.parse(localStorage.getItem("momo_ai_config") || sessionStorage.getItem("momo_ai_config") || "null");
      if (textConfig?.provider in SPEECH_PROVIDERS) saved = { provider: textConfig.provider, api_key: textConfig.api_key };
    } catch { /* no compatible text configuration */ }
  }
  chooseProvider(saved?.provider || "qwen", saved?.model || "");
  $("speech-key").value = saved?.api_key || "";
  if (saved?.api_key) status("speech-status", `已恢复 ${providerName(provider)} 语音连接；首次识别会验证模型权限。`, "ok");
}

async function searchMusic(event) {
  event.preventDefault();
  const query = $("music-query").value.trim();
  if (query.length < 2) return status("music-search-status", "请输入至少两个字符的歌曲名或歌手名。", "error");
  const button = $("music-search-form").querySelector("button");
  button.disabled = true;
  button.textContent = "正在搜索…";
  status("music-search-status", "正在查询歌曲目录…", "loading");
  try {
    const response = await fetch(`/api/music-search?q=${encodeURIComponent(query)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "歌曲搜索失败。");
    renderSearchResults(data.results || []);
    status("music-search-status", data.results?.length ? `找到 ${data.results.length} 个结果，请选择正确版本。` : "没有找到匹配歌曲，请尝试加入歌手名。", data.results?.length ? "ok" : "");
  } catch (error) { status("music-search-status", error.message, "error"); }
  finally { button.disabled = false; button.textContent = "搜索歌曲"; }
}

function renderSearchResults(results) {
  $("music-results").classList.toggle("hidden", !results.length);
  $("music-results").innerHTML = results.map((item, index) => `<button class="music-result" type="button" data-index="${index}">${item.artworkUrl ? `<img src="${escapeHtml(item.artworkUrl)}" alt="">` : `<span class="result-artwork">♫</span>`}<span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.artist)} · ${escapeHtml(item.album || "单曲")}</small></span><i>选择</i></button>`).join("");
  $("music-results").querySelectorAll(".music-result").forEach(button => button.addEventListener("click", () => selectTrack(results[Number(button.dataset.index)])));
}

function selectTrack(track) {
  $("track-title").value = track.title;
  $("track-artist").value = track.artist;
  $("selected-title").textContent = track.title;
  $("selected-meta").textContent = [track.artist, track.album, track.explicit ? "Explicit" : ""].filter(Boolean).join(" · ");
  $("selected-artwork").src = track.artworkUrl || "";
  $("selected-artwork").classList.toggle("hidden", !track.artworkUrl);
  $("selected-store").href = track.storeUrl || "https://music.apple.com/";
  $("catalog-preview").src = track.previewUrl || "";
  $("catalog-preview").classList.toggle("hidden", !track.previewUrl);
  $("selected-track").classList.remove("hidden");
  $("sleeve-title").innerHTML = escapeHtml(track.title).replace(/\s+/g, "<br>");
  $("sleeve-artist").textContent = track.artist;
  toast("歌曲信息已填写，接下来上传你持有的完整音频");
}

function drawWaveform(samples) {
  const canvas = $("music-wave");
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(300, canvas.clientWidth || 800);
  const height = 118;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f4f6fb";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#4457dd";
  context.lineWidth = 1.5;
  context.beginPath();
  const step = Math.max(1, Math.floor(samples.length / width));
  for (let x = 0; x < width; x += 1) {
    let peak = 0;
    const start = x * step;
    for (let index = start; index < Math.min(samples.length, start + step); index += 1) peak = Math.max(peak, Math.abs(samples[index]));
    const size = Math.max(1, peak * (height - 22));
    context.moveTo(x + 0.5, (height - size) / 2);
    context.lineTo(x + 0.5, (height + size) / 2);
  }
  context.stroke();
}

async function setMusicFile(file) {
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) return toast("音乐文件不能超过 30 MB。", true);
  if (!/\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)) return toast("请选择 MP3、WAV、M4A、OGG 或 FLAC 音频。", true);
  status("music-file-status", "正在浏览器本地解码音频…", "loading");
  try {
    const audioContext = new AudioContext();
    const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
    await audioContext.close();
    if (decoded.duration > 12 * 60) throw new Error("当前版本每首歌最多识别 12 分钟。");
    preparedAudio = makeAudioChunks(decoded);
    selectedFile = file;
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    localAudioUrl = URL.createObjectURL(file);
    $("local-player").src = localAudioUrl;
    $("local-player").classList.remove("hidden");
    $("music-wave").classList.remove("hidden");
    drawWaveform(preparedAudio.samples);
    $("music-file-title").textContent = file.name;
    $("music-file-note").textContent = `${(file.size / 1048576).toFixed(1)} MB · ${formatAudioTime(decoded.duration)} · ${preparedAudio.chunks.length} 个本地分片`;
    if (!$("track-title").value) $("track-title").value = file.name.replace(/\.[^.]+$/, "").slice(0, 80);
    status("music-file-status", `音频已就绪：${formatAudioTime(decoded.duration)}，识别时将依次发送 ${preparedAudio.chunks.length} 个 30 秒以内的轻量分片。`, "ok");
  } catch (error) {
    selectedFile = null;
    preparedAudio = null;
    status("music-file-status", `无法读取音频：${error.message}`, "error");
    toast(error.message, true);
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + step)));
  return btoa(binary);
}

async function transcribeChunk(chunk, signal) {
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      provider,
      api_key: $("speech-key").value.trim(),
      model: $("speech-model").value,
      audio_base64: bytesToBase64(chunk.bytes),
      prompt: `English song lyrics. Song: ${$("track-title").value.trim() || "unknown"}. Artist: ${$("track-artist").value.trim() || "unknown"}. Transcribe only words that are actually audible.`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "歌词识别失败。");
  return data;
}

function normalizedKey(text) {
  return text.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
}

function renderLyrics() {
  const seen = new Set();
  const dedupe = $("dedupe-lyrics").checked;
  const segments = transcriptSegments.filter(segment => {
    const key = normalizedKey(segment.text);
    if (!key || (dedupe && seen.has(key))) return false;
    seen.add(key);
    return /[a-z]{2}/i.test(segment.text);
  });
  $("lyrics-empty").classList.add("hidden");
  $("lyrics-result").classList.remove("hidden");
  $("lyrics-timeline").innerHTML = segments.slice(0, 200).map(segment => `<article><time>${formatAudioTime(segment.start)}</time><p>${escapeHtml(segment.text)}</p></article>`).join("");
  $("lyrics-output").value = segments.map(segment => `[${formatAudioTime(segment.start)}] ${segment.text}`).join("\n").slice(0, 150000);
  return segments.length;
}

async function recognizeMusic() {
  if (!selectedFile || !preparedAudio) return toast("请先选择并成功解码本地音乐。", true);
  if (!$("speech-key").value.trim()) return toast(`请填写 ${providerName(provider)} API Key。`, true);
  saveConfig();
  recognitionController = new AbortController();
  $("recognize-music").disabled = true;
  $("stop-recognition").classList.remove("hidden");
  $("recognition-progress").classList.remove("hidden");
  transcriptSegments = [];
  try {
    for (let index = 0; index < preparedAudio.chunks.length; index += 1) {
      const chunk = preparedAudio.chunks[index];
      const current = index + 1;
      $("recognition-progress-title").textContent = `正在听 ${formatAudioTime(chunk.start)}–${formatAudioTime(chunk.end)}`;
      $("recognition-progress-detail").textContent = `${current} / ${preparedAudio.chunks.length}`;
      $("recognition-progress-bar").style.width = `${Math.round(index / preparedAudio.chunks.length * 100)}%`;
      const data = await transcribeChunk(chunk, recognitionController.signal);
      const relative = data.segments?.length ? data.segments.filter(segment => Number(segment.noSpeech || 0) < .75) : data.text ? [{ start: 0, end: chunk.end - chunk.start, text: data.text }] : [];
      transcriptSegments.push(...relative.map(segment => ({ ...segment, start: chunk.start + Number(segment.start || 0), end: chunk.start + Number(segment.end || 0) })));
      renderLyrics();
    }
    const count = renderLyrics();
    if (!count) throw new Error("没有识别到可靠的英文歌词。可以换用人声更清晰的音频或其他模型。");
    $("recognition-progress-bar").style.width = "100%";
    $("recognition-progress-title").textContent = "英文歌词识别完成";
    status("speech-status", `已生成 ${count} 段可编辑歌词。请先检查听错的词，再送往工作台。`, "ok");
    toast(`歌词识别完成，共 ${count} 段`);
  } catch (error) {
    const stopped = error.name === "AbortError";
    status("speech-status", stopped ? "识别已停止，已完成的歌词仍可编辑和使用。" : error.message, stopped ? "" : "error");
    if (!stopped) toast(error.message, true);
  } finally {
    recognitionController = null;
    $("recognize-music").disabled = false;
    $("stop-recognition").classList.add("hidden");
  }
}

function sendToWorkspace() {
  const text = $("lyrics-output").value.trim();
  if (text.length < 20) return toast("请先识别并检查足够的英文歌词。", true);
  try {
    sessionStorage.setItem("momo_music_import", JSON.stringify({
      text: text.slice(0, 150000),
      title: `${$("track-title").value.trim() || "英文歌曲"} · 歌词生词`.slice(0, 80),
      level: "英文歌曲与歌词",
      expansion: "phrases",
      importedAt: Date.now()
    }));
    location.href = "/?import=music";
  } catch { toast("歌词内容太大，浏览器无法暂存。请删减后重试。", true); }
}

$("music-search-form").addEventListener("submit", searchMusic);
$("music-file").addEventListener("change", event => setMusicFile(event.target.files[0]));
["dragenter", "dragover"].forEach(name => $("music-drop").addEventListener(name, event => { event.preventDefault(); $("music-drop").classList.add("dragging"); }));
["dragleave", "drop"].forEach(name => $("music-drop").addEventListener(name, event => { event.preventDefault(); $("music-drop").classList.remove("dragging"); }));
$("music-drop").addEventListener("drop", event => setMusicFile(event.dataTransfer.files[0]));
document.querySelectorAll(".speech-provider-button").forEach(button => button.addEventListener("click", () => { chooseProvider(button.dataset.provider); saveConfig(); }));
$("speech-model").addEventListener("change", saveConfig);
$("speech-key").addEventListener("change", saveConfig);
$("remember-speech").addEventListener("change", saveConfig);
$("dedupe-lyrics").addEventListener("change", () => { if (transcriptSegments.length) renderLyrics(); });
$("recognize-music").addEventListener("click", recognizeMusic);
$("stop-recognition").addEventListener("click", () => recognitionController?.abort());
$("clear-speech").addEventListener("click", () => { localStorage.removeItem(CONFIG_KEY); sessionStorage.removeItem(CONFIG_KEY); $("speech-key").value = ""; status("speech-status", "语音连接已从此浏览器清除。", "ok"); });
$("send-music-workspace").addEventListener("click", sendToWorkspace);
["catalog-preview", "local-player"].forEach(id => {
  $(id).addEventListener("play", () => $("record-sleeve").classList.add("playing"));
  $(id).addEventListener("pause", () => $("record-sleeve").classList.remove("playing"));
  $(id).addEventListener("ended", () => $("record-sleeve").classList.remove("playing"));
});
restoreConfig();
