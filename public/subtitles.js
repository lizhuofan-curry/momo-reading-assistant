import { formatTimestamp, parseSubtitles } from "./subtitle-parser.js";

const $ = id => document.getElementById(id);
let selectedFile = null;
let parsed = null;

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value ?? "";
  return node.innerHTML;
}

function toast(message, error = false) {
  const node = $("subtitle-toast");
  node.textContent = message;
  node.className = `subtitle-toast show${error ? " error" : ""}`;
  clearTimeout(window.subtitleToastTimer);
  window.subtitleToastTimer = setTimeout(() => { node.className = "subtitle-toast"; }, 4200);
}

function episodeCode() {
  const season = Number($("season-number").value);
  const episode = Number($("episode-number").value);
  if (!season && !episode) return "";
  return `${season ? `S${String(season).padStart(2, "0")}` : ""}${episode ? `E${String(episode).padStart(2, "0")}` : ""}`;
}

function wordbookTitle() {
  return [$("series-name").value.trim(), episodeCode(), "台词生词"].filter(Boolean).join(" · ").slice(0, 80) || "美剧台词生词";
}

function updateFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return toast("字幕文件不能超过 10 MB。", true);
  if (!/\.(srt|vtt|ass|ssa|txt)$/i.test(file.name)) return toast("请选择 SRT、VTT、ASS、SSA 或 TXT 字幕。", true);
  selectedFile = file;
  $("subtitle-file-title").textContent = file.name;
  $("subtitle-file-note").textContent = `${(file.size / 1024).toFixed(1)} KB · 点击可重新选择`;
  if (!$("series-name").value) $("series-name").value = file.name.replace(/\.(srt|vtt|ass|ssa|txt)$/i, "").replace(/[._-]+/g, " ").slice(0, 50);
  $("subtitle-status").textContent = "文件已就绪，点击“整理英文字幕”。";
}

function renderResult(result) {
  parsed = result;
  const stats = $("subtitle-stats").children;
  stats[0].querySelector("strong").textContent = result.cues.length.toLocaleString();
  stats[1].querySelector("strong").textContent = result.wordCount.toLocaleString();
  stats[2].querySelector("strong").textContent = result.duplicateCount.toLocaleString();
  stats[3].querySelector("strong").textContent = result.format;
  $("timeline-empty").classList.add("hidden");
  $("timeline").classList.remove("hidden");
  $("subtitle-output-wrap").classList.remove("hidden");
  const visible = result.cues.slice(0, 240);
  $("timeline").innerHTML = visible.map((cue, index) => `<article class="timeline-cue"><time>${Number.isFinite(cue.start) ? formatTimestamp(cue.start) : String(index + 1).padStart(3, "0")}</time><p>${escapeHtml(cue.text)}</p></article>`).join("") + (result.cues.length > visible.length ? `<p class="timeline-more">还有 ${result.cues.length - visible.length} 条台词未在预览中展开，但会完整送往工作台。</p>` : "");
  $("subtitle-output").value = result.text.slice(0, 150000);
  const truncated = result.text.length > 150000;
  $("subtitle-status").className = "status ok";
  $("subtitle-status").textContent = `整理完成：保留 ${result.cues.length} 条英文台词，约 ${result.wordCount.toLocaleString()} 个词${truncated ? "；内容超过工作台上限，已截取前 150,000 字符" : ""}。`;
}

async function parseCurrentSource() {
  const button = $("parse-subtitles");
  button.disabled = true;
  button.textContent = "正在本地整理…";
  try {
    const source = selectedFile ? await selectedFile.text() : $("subtitle-source").value;
    if (!source.trim()) throw new Error("请先选择字幕文件，或粘贴字幕文字。");
    if (selectedFile) $("subtitle-source").value = source.slice(0, 500000);
    const result = parseSubtitles(source, {
      filename: selectedFile?.name || "pasted.txt",
      mergeSplit: $("merge-split").checked,
      keepDuplicates: !$("remove-duplicates").checked,
      keepTimestamps: $("keep-timestamps").checked
    });
    if (!result.cues.length) throw new Error("没有找到可用的英文台词。请检查字幕语言或文件格式。");
    renderResult(result);
    toast("英文字幕已经整理好，可以检查时间轴");
  } catch (error) {
    $("subtitle-status").textContent = error.message;
    $("subtitle-status").className = "status error";
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "整理英文字幕";
  }
}

function loadDemo() {
  selectedFile = null;
  $("subtitle-file-title").textContent = "选择字幕文件";
  $("subtitle-file-note").textContent = "当前使用页面内示例，可随时换成自己的字幕";
  $("series-name").value = "City Stories";
  $("season-number").value = "1";
  $("episode-number").value = "3";
  $("subtitle-source").value = `1\n00:00:04,200 --> 00:00:06,800\nMAYA: I didn't mean to put you on the spot.\n我不是故意让你难堪。\n\n2\n00:00:07,100 --> 00:00:09,000\nIt's just been a really\n\n3\n00:00:09,300 --> 00:00:11,500\nawkward week for everyone.\n这周大家都很尴尬。\n\n4\n00:00:15,000 --> 00:00:17,600\nWe should figure this out before Friday.\n\n5\n00:00:20,000 --> 00:00:22,000\nWe should figure this out before Friday.`;
  parseCurrentSource();
}

$("subtitle-file").addEventListener("change", event => updateFile(event.target.files[0]));
["dragenter", "dragover"].forEach(name => $("subtitle-drop").addEventListener(name, event => { event.preventDefault(); $("subtitle-drop").classList.add("dragging"); }));
["dragleave", "drop"].forEach(name => $("subtitle-drop").addEventListener(name, event => { event.preventDefault(); $("subtitle-drop").classList.remove("dragging"); }));
$("subtitle-drop").addEventListener("drop", event => updateFile(event.dataTransfer.files[0]));
$("subtitle-source").addEventListener("input", () => { if ($("subtitle-source").value.trim()) selectedFile = null; });
$("parse-subtitles").addEventListener("click", parseCurrentSource);
$("load-subtitle-demo").addEventListener("click", loadDemo);
$("send-to-workspace").addEventListener("click", () => {
  const text = $("subtitle-output").value.trim();
  if (!parsed || text.length < 20) return toast("请先整理字幕，并保留足够的英文台词。", true);
  try {
    sessionStorage.setItem("momo_subtitle_import", JSON.stringify({
      text: text.slice(0, 150000),
      title: wordbookTitle(),
      level: "美剧日常口语",
      expansion: "full",
      importedAt: Date.now()
    }));
    location.href = "/?import=subtitle";
  } catch {
    toast("字幕内容太大，浏览器无法暂存。请删减后重试。", true);
  }
});
