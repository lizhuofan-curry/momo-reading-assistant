const CJK = /[\u3400-\u9fff\uf900-\ufaff]/g;
const TIME_ARROW = /((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{2,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{2,3})/;

export function parseTimestamp(value) {
  const parts = String(value).trim().replace(",", ".").split(":").map(Number);
  if (parts.some(Number.isNaN) || parts.length < 2 || parts.length > 3) return null;
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, ...parts];
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds)) return "--:--:--";
  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return [hours, minutes, secs].map(value => String(value).padStart(2, "0")).join(":");
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function cleanSubtitleText(value) {
  const lines = decodeEntities(String(value))
    .replace(/<[^>]*>/g, " ")
    .replace(/\{\\[^}]+\}/g, " ")
    .replace(/\\[Nn]/g, "\n")
    .replace(/\[[^\]]+\]|\([^)]*\)/g, " ")
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*[-–—]\s*/, "").trim())
    .filter(line => /[A-Za-z]/.test(line))
    .map(line => line
      .replace(/^[A-Za-z][A-Za-z0-9 _.\-']{1,24}:\s*/, "")
      .replace(CJK, " ")
      .replace(/[，。！？；：、【】（）《》“”]/g, " ")
      .replace(/[♪♫]+/g, " ")
      .replace(/\s+([,.;!?])/g, "$1")
      .replace(/\s+/g, " ")
      .trim())
    .filter(line => /[A-Za-z]{2}/.test(line));
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function parseTimedBlocks(source) {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const cues = [];
  for (let index = 0; index < lines.length; index += 1) {
    const timing = lines[index].match(TIME_ARROW);
    if (!timing) continue;
    const text = [];
    for (index += 1; index < lines.length && lines[index].trim() && !TIME_ARROW.test(lines[index]); index += 1) {
      text.push(lines[index]);
    }
    cues.push({ start: parseTimestamp(timing[1]), end: parseTimestamp(timing[2]), text: text.join("\n") });
    if (index < lines.length && TIME_ARROW.test(lines[index])) index -= 1;
  }
  return cues;
}

function splitAssDialogue(line, count) {
  const values = [];
  let rest = line;
  for (let index = 0; index < count - 1; index += 1) {
    const comma = rest.indexOf(",");
    if (comma < 0) break;
    values.push(rest.slice(0, comma));
    rest = rest.slice(comma + 1);
  }
  values.push(rest);
  return values;
}

function parseAss(source) {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  let inEvents = false;
  let fields = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"];
  const cues = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[events\]$/i.test(line)) { inEvents = true; continue; }
    if (/^\[/.test(line)) { inEvents = false; continue; }
    if (!inEvents) continue;
    if (/^format\s*:/i.test(line)) {
      fields = line.replace(/^format\s*:/i, "").split(",").map(field => field.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(line)) continue;
    const values = splitAssDialogue(line.replace(/^dialogue\s*:/i, ""), fields.length);
    const entry = Object.fromEntries(fields.map((field, index) => [field, values[index] || ""]));
    cues.push({ start: parseTimestamp(entry.start), end: parseTimestamp(entry.end), text: entry.text });
  }
  return cues;
}

function parsePlain(source) {
  return source.replace(/^\uFEFF/, "").replace(/\r/g, "").split(/\n+/).map(text => ({ start: null, end: null, text }));
}

function detectFormat(source, filename) {
  const extension = String(filename).toLowerCase().split(".").pop();
  if (["ass", "ssa"].includes(extension) || /\[events\][\s\S]*dialogue\s*:/i.test(source)) return "ASS";
  if (extension === "vtt" || /^\s*WEBVTT/i.test(source)) return "VTT";
  if (extension === "srt" || TIME_ARROW.test(source)) return "SRT";
  return "TEXT";
}

function cueKey(text) {
  return text.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
}

function shouldMerge(previous, current) {
  if (!Number.isFinite(previous.end) || !Number.isFinite(current.start)) return false;
  const gap = current.start - previous.end;
  if (gap < -0.2 || gap > 1.5 || /[.!?][\"']?$/.test(previous.text)) return false;
  return /[,;:–—-]$/.test(previous.text) || /^[a-z]/.test(current.text);
}

function mergeSplitCues(cues) {
  const merged = [];
  for (const cue of cues) {
    const previous = merged.at(-1);
    if (previous && shouldMerge(previous, cue)) {
      previous.text = `${previous.text} ${cue.text}`.replace(/\s+/g, " ");
      previous.end = cue.end;
      previous.parts += 1;
    } else {
      merged.push({ ...cue, parts: 1 });
    }
  }
  return merged;
}

export function parseSubtitles(source, options = {}) {
  const format = detectFormat(source, options.filename || "");
  const rawCues = format === "ASS" ? parseAss(source) : format === "TEXT" ? parsePlain(source) : parseTimedBlocks(source);
  const cleaned = rawCues
    .map(cue => ({ ...cue, text: cleanSubtitleText(cue.text) }))
    .filter(cue => cue.text);
  const maybeMerged = options.mergeSplit === false ? cleaned : mergeSplitCues(cleaned);
  const seen = new Set();
  let duplicateCount = 0;
  const cues = maybeMerged.filter(cue => {
    if (options.keepDuplicates) return true;
    const key = cueKey(cue.text);
    if (!key || seen.has(key)) { duplicateCount += 1; return false; }
    seen.add(key);
    return true;
  });
  const wordCount = cues.reduce((total, cue) => total + (cue.text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length || 0), 0);
  return {
    format,
    cues,
    rawCount: rawCues.length,
    duplicateCount,
    wordCount,
    text: cues.map(cue => `${options.keepTimestamps === false || !Number.isFinite(cue.start) ? "" : `[${formatTimestamp(cue.start)}] `}${cue.text}`).join("\n")
  };
}
