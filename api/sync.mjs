import { body, fail, json, method } from "./_lib/http.mjs";

export default async function handler(request, response) {
  if (!method(response, request)) return;
  try {
    const data = body(request);
    const token = String(data.token || "").trim();
    if (!token) throw new Error("请先在连接设置中填写并测试你自己的墨墨 Access Token。");
    const title = String(data.title || "").trim().slice(0, 80);
    if (!title) throw new Error("请填写云词本名称。");
    const seen = new Set();
    const words = (Array.isArray(data.words) ? data.words : []).map(value => String(value).trim().toLowerCase()).filter(word => {
      if (!/^[a-z][a-z'-]{1,49}$/.test(word) || seen.has(word)) return false;
      seen.add(word); return true;
    }).slice(0, 50);
    if (!words.length) throw new Error("请至少选择一个生词。");
    const payload = {
      notepad: {
        status: "PUBLISHED",
        content: `# AI 精选\n${words.join("\n")}`,
        title,
        brief: String(data.brief || "由拾词生成").trim().slice(0, 200),
        tags: (Array.isArray(data.tags) ? data.tags : []).map(tag => String(tag).trim().slice(0, 30)).filter(Boolean).slice(0, 5)
      }
    };
    const remote = await fetch("https://open.maimemo.com/open/api/v1/memo/notepads", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000)
    });
    const result = await remote.json().catch(() => ({}));
    if (!remote.ok) throw new Error(`墨墨返回 ${remote.status}：${result?.error?.message || result?.message || "请求失败"}`);
    const notepad = result.notepad || {};
    json(response, 200, { ok: true, message: "云词本创建成功", count: words.length, title: notepad.title || title, id: notepad.id || "" });
  } catch (error) { fail(response, error); }
}
