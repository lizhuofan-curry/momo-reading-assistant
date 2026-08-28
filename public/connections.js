const $ = id => document.getElementById(id);
const providers = {
  deepseek: { label: "DeepSeek", model: "deepseek-v4-flash" },
  openai: { label: "OpenAI", model: "gpt-5.4-mini" },
  qwen: { label: "阿里云百炼 Qwen", model: "qwen-plus" },
  openrouter: { label: "OpenRouter", model: "openai/gpt-4.1-mini" }
};

function status(id, message, kind = "") { const el = $(id); el.textContent = message; el.className = `status ${kind}`; }
function busy(button, value, text) { if (!button.dataset.label) button.dataset.label = button.textContent; button.disabled = value; button.textContent = value ? text : button.dataset.label; }
async function post(path, body) { const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok || !data.ok) throw new Error(data.error || "连接失败"); return data; }
function applyProvider(force = false) { const preset = providers[$("provider").value]; if (force || !$("model").value) $("model").value = preset.model; }
function restore() { try { const ai = JSON.parse(sessionStorage.getItem("momo_ai_config") || "null"); if (ai) { $("provider").value = ai.provider; $("model").value = ai.model; $("api-key").value = ai.api_key; status("ai-status", `当前标签页已连接 ${ai.label} · ${ai.model}`, "ok"); } else applyProvider(true); } catch { applyProvider(true); } const token = sessionStorage.getItem("momo_token") || ""; if (token) { $("memo-token").value = token; status("memo-status", "当前标签页已连接墨墨 Token", "ok"); } }
$("provider").addEventListener("change", () => applyProvider(true));
$("test-ai").addEventListener("click", async () => { const button = $("test-ai"); const config = { provider: $("provider").value, model: $("model").value.trim(), api_key: $("api-key").value.trim(), label: providers[$("provider").value].label }; busy(button, true, "正在测试…"); status("ai-status", "正在向服务商发送最小测试请求…"); try { const data = await post("/api/test-ai", config); sessionStorage.setItem("momo_ai_config", JSON.stringify(config)); status("ai-status", data.message, "ok"); } catch (error) { status("ai-status", error.message, "error"); } finally { busy(button, false); } });
$("test-memo").addEventListener("click", async () => { const button = $("test-memo"); const token = $("memo-token").value.trim(); busy(button, true, "正在测试…"); status("memo-status", "正在验证 Token…"); try { const data = await post("/api/test-maimemo", { token }); sessionStorage.setItem("momo_token", token); status("memo-status", data.message, "ok"); } catch (error) { status("memo-status", error.message, "error"); } finally { busy(button, false); } });
$("clear-ai").addEventListener("click", () => { sessionStorage.removeItem("momo_ai_config"); $("api-key").value = ""; applyProvider(true); status("ai-status", "已清除当前标签页的 AI 连接"); });
$("clear-memo").addEventListener("click", () => { sessionStorage.removeItem("momo_token"); $("memo-token").value = ""; status("memo-status", "已清除当前标签页的墨墨 Token"); });
restore();
