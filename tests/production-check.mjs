import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.BROWSER_BASE_URL;
if (!baseUrl) throw new Error("Missing BROWSER_BASE_URL");
const output = new URL("../artifacts/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const browserErrors = [];
page.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
page.on("pageerror", error => browserErrors.push(error.message));
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "粘贴文本" }).click();
await page.locator("#paste-text").fill("Modern transformer architectures use self-attention to model contextual dependencies across long sequences. The encoder produces contextualized representations, while optimization techniques such as regularization and gradient clipping improve convergence and generalization. Researchers evaluate robustness, interpretability, scalability, and computational efficiency when deploying these models in practical systems.");
await page.locator("#max-words").selectOption("10");
await page.locator("#expansion").selectOption("full");
const [analysisResponse] = await Promise.all([
  page.waitForResponse(response => response.url().endsWith("/api/analyze"), { timeout: 65000 }),
  page.getByRole("button", { name: "从这份材料中提取生词" }).click()
]);
if (!analysisResponse.ok()) {
  const payload = await analysisResponse.json().catch(() => ({}));
  await page.screenshot({ path: fileURLToPath(new URL("production-error.png", output)), fullPage: true });
  throw new Error(`分析接口 ${analysisResponse.status()}：${payload.error || "未知错误"}`);
}
await page.locator(".word-entry").first().waitFor({ state: "visible", timeout: 10000 });
const count = await page.locator(".word-entry").count();
if (!await page.locator("#result-status.success").isVisible()) throw new Error("生产环境未显示分析成功状态");
if (count < 1) throw new Error("生产环境未生成生词");
if (await page.locator(".word-expansion").count() < 1) throw new Error("生产环境未生成派生词或常用短语");
await page.screenshot({ path: fileURLToPath(new URL("production-result.png", output)), fullPage: true });
await browser.close();
if (browserErrors.length) throw new Error(`浏览器错误：${browserErrors.join(" | ")}`);
console.log(`PRODUCTION_CHECK_OK words=${count}`);
