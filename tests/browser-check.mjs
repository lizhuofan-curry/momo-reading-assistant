import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const output = new URL("../artifacts/", import.meta.url);
const baseUrl = process.env.BROWSER_BASE_URL || "http://127.0.0.1:4173";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", error => pageErrors.push(error.message));
await page.goto(baseUrl, { waitUntil: "networkidle" });
if (!(await page.locator("body").innerText()).trim()) throw new Error("页面为空白");
if (!await page.getByRole("heading", { name: /从一份材料/ }).isVisible()) throw new Error("公开首页未显示");
if (!await page.locator("#quota-badge").isVisible()) throw new Error("免费次数未显示");
await page.getByRole("button", { name: "查看结果示例" }).click();
if (await page.locator(".word-entry").count() < 3) throw new Error("免登录示例未渲染");
for (const path of ["/guide/", "/privacy/", "/help/", "/connections/"]) {
  const child = await context.newPage();
  child.on("pageerror", error => pageErrors.push(`${path}: ${error.message}`));
  await child.goto(new URL(path, baseUrl).href, { waitUntil: "networkidle" });
  if (!(await child.locator("main").innerText()).trim()) throw new Error(`${path} 页面为空`);
  await child.close();
}
await page.screenshot({ path: fileURLToPath(new URL("online-home.png", output)), fullPage: true });

const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(baseUrl, { waitUntil: "networkidle" });
if (!await mobile.getByRole("heading", { name: /从一份材料/ }).isVisible()) throw new Error("移动端首页未显示");
await mobile.screenshot({ path: fileURLToPath(new URL("online-mobile.png", output)), fullPage: true });
await browser.close();
if (consoleErrors.length || pageErrors.length) throw new Error(`浏览器错误：${[...consoleErrors, ...pageErrors].join(" | ")}`);
console.log("BROWSER_CHECK_OK");
