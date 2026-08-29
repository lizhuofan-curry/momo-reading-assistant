import { formatAudioTime, makeAudioChunks } from "./audio-utils.js";
import { providerName, SPEECH_PROVIDERS } from "./speech-providers.js";

const $ = id => document.getElementById(id);
const CONFIG_KEY = "momo_audio_config";
const REMEMBER_KEY = "momo_remember_audio";
let provider = "qwen";
let selectedFile = null;
let videoUrl = "";
let preparedAudio = null;
let controller = null;
let extractedItems = [];

function toast(message, error = false) {
  const node = $("video-toast");
  node.textContent = message;
  node.className = `subtitle-toast show${error ? " error" : ""}`;
  clearTimeout(window.videoToastTimer);
  window.videoToastTimer = setTimeout(() => { node.className = "subtitle-toast"; }, 4500);
}

function status(message, kind = "") {
  $("video-status").textContent = message;
  $("video-status").className = `status ${kind}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
}

function chooseProvider(next, savedModel = "") {
  provider = next in SPEECH_PROVIDERS ? next : "qwen";
  document.querySelectorAll(".speech-provider-button").forEach(button => button.classList.toggle("selected", button.dataset.provider === provider));
  $("speech-model").innerHTML = SPEECH_PROVIDERS[provider].models.map(model => `<option value="${model.id}">${model.label}</option>`).join("");
  if (SPEECH_PROVIDERS[provider].models.some(model => model.id === savedModel)) $("speech-model").value = savedModel;
  $("speech-key-link").href = SPEECH_PROVIDERS[provider].keyUrl;
  $("speech-key-link").textContent = `前往 ${providerName(provider)} 获取 API Key ↗`;
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

function restoreConfig() {
  $("remember-speech").checked = localStorage.getItem(REMEMBER_KEY) !== "false";
  const saved = storedConfig();
  chooseProvider(saved?.provider || "qwen", saved?.model || "");
  $("speech-key").value = saved?.api_key || "";
  if (saved?.api_key) status(`已恢复 ${providerName(provider)} 连接；原视频仍只保留在本地。`, "ok");
}

function waitFor(video, event) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("浏览器无法读取这个视频编码。")); };
    const cleanup = () => { video.removeEventListener(event, done); video.removeEventListener("error", failed); };
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

async function setVideoFile(file) {
  if (!file) return;
  if (file.size > 150 * 1024 * 1024) return toast("视频文件不能超过 150 MB。", true);
  if (!/\.(mp4|webm|mov|m4v)$/i.test(file.name)) return toast("请选择 MP4、WebM、MOV 或 M4V 视频。", true);
  selectedFile = file;
  preparedAudio = null;
  extractedItems = [];
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  const video = $("video-preview");
  video.src = videoUrl;
  video.classList.remove("hidden");
  $("video-file-title").textContent = file.name;
  $("video-file-status").textContent = "正在读取视频信息并在本地准备音轨…";
  $("video-file-status").className = "status loading";
  try {
    if (video.readyState < 1) await waitFor(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 3600) throw new Error("当前版本只处理 60 分钟以内的视频。");
    let audioNote = "未能预先读取音轨，仍可使用画面 OCR";
    try {
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      await context.close();
      preparedAudio = makeAudioChunks(decoded);
      audioNote = `${preparedAudio.chunks.length} 个本地音频分片`;
    } catch { preparedAudio = null; }
    $("video-file-note").textContent = `${(file.size / 1048576).toFixed(1)} MB · ${formatAudioTime(video.duration)} · ${audioNote}`;
    $("video-file-status").textContent = `视频已就绪：${formatAudioTime(video.duration)}。可同时识别语音与画面字幕。`;
    $("video-file-status").className = "status ok";
  } catch (error) {
    selectedFile = null;
    $("video-file-status").textContent = error.message;
    $("video-file-status").className = "status error";
    toast(error.message, true);
  }
}

async function transcribeChunk(chunk, signal) {
  const response = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ provider, api_key: $("speech-key").value.trim(), model: $("speech-model").value, audio_base64: bytesToBase64(chunk.bytes), prompt: "English speech from a video. Transcribe only words that are actually audible." }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "视频语音识别失败。");
  return data;
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("无法抽取视频画面。")); };
    const cleanup = () => { video.removeEventListener("seeked", done); video.removeEventListener("error", failed); };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - .05));
  });
}

function cleanOcrText(value) {
  return String(value || "").split(/\r?\n/).map(line => line.replace(/[^A-Za-z0-9'.,!?;:\- ]+/g, " ").replace(/\s+/g, " ").trim()).filter(line => (line.match(/[A-Za-z]{2,}/g) || []).length >= 2).join(" ").trim();
}

async function recognizeFrames(signal) {
  if (!window.Tesseract?.createWorker) throw new Error("本地画面 OCR 没有加载成功，请刷新后重试。");
  const video = $("video-preview");
  const canvas = $("frame-canvas");
  const interval = Number($("frame-interval").value) || 10;
  const count = Math.min(36, Math.max(1, Math.ceil(video.duration / interval)));
  const step = video.duration / count;
  const width = Math.min(1280, video.videoWidth || 1280);
  const sourceHeight = Math.max(1, Math.round((video.videoHeight || 720) * .45));
  const height = Math.round(sourceHeight * width / (video.videoWidth || 1280));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let worker;
  const items = [];
  let previous = "";
  try {
    worker = await window.Tesseract.createWorker("eng", 1, { workerPath: "/vendor/tesseract/worker.min.js", corePath: "/vendor/tesseract/core", langPath: "/vendor/tesseract/lang" });
    await worker.setParameters({ user_defined_dpi: "300", preserve_interword_spaces: "1" });
    for (let index = 0; index < count; index += 1) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const time = Math.min(video.duration - .05, (index + .5) * step);
      $("video-progress-title").textContent = `正在本地识别画面 ${formatAudioTime(time)}`;
      $("video-progress-detail").textContent = `${index + 1} / ${count} 帧`;
      $("video-progress-bar").style.width = `${Math.round((index + 1) / count * 100)}%`;
      await seekVideo(video, time);
      context.drawImage(video, 0, (video.videoHeight || 720) - sourceHeight, video.videoWidth || 1280, sourceHeight, 0, 0, width, height);
      const { data } = await worker.recognize(canvas);
      const text = cleanOcrText(data?.text);
      const key = text.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
      if (key && key !== previous) items.push({ start: time, text, source: "画面" });
      if (key) previous = key;
    }
  } finally { await worker?.terminate().catch(() => {}); }
  return items;
}

function renderResults() {
  const seen = new Set();
  const items = extractedItems.sort((a, b) => a.start - b.start).filter(item => {
    const key = item.text.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
    if (!key || seen.has(`${item.source}:${key}`)) return false;
    seen.add(`${item.source}:${key}`);
    return /[a-z]{2}/i.test(item.text);
  });
  $("video-empty").classList.toggle("hidden", Boolean(items.length));
  $("video-result").classList.toggle("hidden", !items.length);
  const voice = items.filter(item => item.source === "语音").length;
  const frame = items.filter(item => item.source === "画面").length;
  $("video-result-summary").innerHTML = `<span>语音 ${voice} 段</span><span>画面 ${frame} 段</span><span>共 ${items.length} 条</span>`;
  $("video-output").value = items.map(item => `[${formatAudioTime(item.start)} · ${item.source}] ${item.text}`).join("\n").slice(0, 150000);
  return items.length;
}

async function recognizeVideo() {
  if (!selectedFile) return toast("请先选择并成功读取视频。", true);
  const useAudio = $("use-audio").checked;
  const useFrames = $("use-frames").checked;
  if (!useAudio && !useFrames) return toast("请至少选择一种识别来源。", true);
  if (useAudio && !preparedAudio) return toast("浏览器无法读取这个视频的音轨；可以只使用画面 OCR，或换成 MP4/WebM。", true);
  if (useAudio && !$("speech-key").value.trim()) return toast(`请填写 ${providerName(provider)} API Key，或关闭语音识别。`, true);
  saveConfig();
  controller = new AbortController();
  $("recognize-video").disabled = true;
  $("stop-video").classList.remove("hidden");
  $("video-progress").classList.remove("hidden");
  extractedItems = [];
  try {
    if (useAudio) {
      for (let index = 0; index < preparedAudio.chunks.length; index += 1) {
        const chunk = preparedAudio.chunks[index];
        $("video-progress-title").textContent = `正在识别语音 ${formatAudioTime(chunk.start)}–${formatAudioTime(chunk.end)}`;
        $("video-progress-detail").textContent = `${index + 1} / ${preparedAudio.chunks.length} 段`;
        $("video-progress-bar").style.width = `${Math.round((index + 1) / preparedAudio.chunks.length * 100)}%`;
        const data = await transcribeChunk(chunk, controller.signal);
        const relative = data.segments?.length ? data.segments : data.text ? [{ start: 0, text: data.text }] : [];
        extractedItems.push(...relative.map(item => ({ start: chunk.start + Number(item.start || 0), text: String(item.text || "").trim(), source: "语音" })));
        renderResults();
      }
    }
    if (useFrames) extractedItems.push(...await recognizeFrames(controller.signal));
    const count = renderResults();
    if (!count) throw new Error("没有提取到可靠的英文。可以调整抽帧间隔、只选一种来源或更换视频。");
    $("video-progress-title").textContent = "视频英文提取完成";
    $("video-progress-detail").textContent = `${count} 条`;
    $("video-progress-bar").style.width = "100%";
    status(`已生成 ${count} 条可编辑内容，请检查识别错误后再送往工作台。`, "ok");
    toast(`视频英文提取完成，共 ${count} 条`);
  } catch (error) {
    const stopped = error.name === "AbortError";
    status(stopped ? "识别已停止，已经完成的结果仍可编辑。" : error.message, stopped ? "" : "error");
    if (!stopped) toast(error.message, true);
  } finally { controller = null; $("recognize-video").disabled = false; $("stop-video").classList.add("hidden"); }
}

function sendToWorkspace() {
  const text = $("video-output").value.trim();
  if (text.length < 20) return toast("请先识别并检查足够的英文内容。", true);
  try {
    sessionStorage.setItem("momo_video_import", JSON.stringify({ text: text.slice(0, 150000), title: `${selectedFile?.name.replace(/\.[^.]+$/, "") || "英文视频"} · 视频生词`.slice(0, 80), level: "美剧日常口语", expansion: "phrases", importedAt: Date.now() }));
    location.href = "/?import=video";
  } catch { toast("提取内容太大，浏览器无法暂存。请删减后重试。", true); }
}

$("video-file").addEventListener("change", event => setVideoFile(event.target.files[0]));
["dragenter", "dragover"].forEach(name => $("video-drop").addEventListener(name, event => { event.preventDefault(); $("video-drop").classList.add("dragging"); }));
["dragleave", "drop"].forEach(name => $("video-drop").addEventListener(name, event => { event.preventDefault(); $("video-drop").classList.remove("dragging"); }));
$("video-drop").addEventListener("drop", event => setVideoFile(event.dataTransfer.files[0]));
document.querySelectorAll(".speech-provider-button").forEach(button => button.addEventListener("click", () => { chooseProvider(button.dataset.provider); saveConfig(); }));
$("speech-model").addEventListener("change", saveConfig);
$("speech-key").addEventListener("change", saveConfig);
$("remember-speech").addEventListener("change", saveConfig);
$("recognize-video").addEventListener("click", recognizeVideo);
$("stop-video").addEventListener("click", () => controller?.abort());
$("clear-speech").addEventListener("click", () => { localStorage.removeItem(CONFIG_KEY); sessionStorage.removeItem(CONFIG_KEY); $("speech-key").value = ""; status("语音连接已从此浏览器清除。", "ok"); });
$("send-video-workspace").addEventListener("click", sendToWorkspace);
restoreConfig();
