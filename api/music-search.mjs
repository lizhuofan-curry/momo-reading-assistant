import { fail, json } from "./_lib/http.mjs";

export async function searchMusic(term, fetchImpl = fetch) {
  const query = String(term || "").replace(/[\r\n]/g, " ").trim().slice(0, 80);
  if (query.length < 2) throw new Error("请输入至少两个字符的歌曲名或歌手名。");
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("country", "US");
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "8");
  url.searchParams.set("explicit", "Yes");
  const remote = await fetchImpl(url, { headers: { "User-Agent": "MomoReadingAssistant/1.0" }, signal: AbortSignal.timeout(12000) });
  const payload = await remote.json().catch(() => ({}));
  if (!remote.ok) throw new Error(`歌曲目录返回 ${remote.status}，请稍后重试。`);
  return (Array.isArray(payload.results) ? payload.results : []).flatMap(item => {
    const id = Number(item.trackId);
    const title = String(item.trackName || "").trim();
    const artist = String(item.artistName || "").trim();
    if (!Number.isSafeInteger(id) || !title || !artist) return [];
    const previewUrl = /^https:\/\/[^\s]+\.itunes\.apple\.com\//i.test(String(item.previewUrl || "")) ? String(item.previewUrl) : "";
    const artworkUrl = /^https:\/\/[^\s]+\.mzstatic\.com\//i.test(String(item.artworkUrl100 || ""))
      ? String(item.artworkUrl100).replace(/100x100bb/i, "300x300bb") : "";
    return [{
      id, title, artist,
      album: String(item.collectionName || "").trim().slice(0, 120),
      artworkUrl,
      previewUrl,
      durationMs: Math.max(0, Number(item.trackTimeMillis) || 0),
      explicit: String(item.trackExplicitness || "") === "explicit",
      storeUrl: /^https:\/\/[^\s]+$/i.test(String(item.trackViewUrl || "")) ? String(item.trackViewUrl) : ""
    }];
  });
}

export default async function handler(request, response) {
  if (request.method !== "GET") return json(response, 405, { ok: false, error: "请求方式不支持。" });
  try {
    const results = await searchMusic(request.query?.q);
    json(response, 200, { ok: true, results, source: "Apple iTunes Search" });
  } catch (error) { fail(response, error); }
}
