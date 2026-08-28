# 拾词 · 阅读生词助手

在线地址：[momo.zhuofan.me](https://momo.zhuofan.me)

从 PDF、DOCX、TXT、Markdown 或粘贴文本中提取英文内容，通过 AI 筛选值得学习的生词，人工审核后使用访问者自己的墨墨 Access Token 创建云词本。

## 当前功能

- 每个浏览器设备可免费成功分析 5 次；计数保存在签名的 HttpOnly Cookie 中。
- 支持接入访问者自己的 DeepSeek、OpenAI、阿里云百炼 Qwen 或 OpenRouter API。
- AI API Key 和墨墨 Token 只保存在当前浏览器标签页的 `sessionStorage`，关闭标签页后清除。
- PDF、DOCX、TXT 和 Markdown 在浏览器本地提取；只有确认分析的文字会发送给所选 AI 服务商。
- 使用教程、隐私说明、常见问题和连接设置均为独立页面。

> 本项目是非官方学习工具，与墨墨背单词官方无隶属或背书关系。

## 生产环境变量

- `DEEPSEEK_API_KEY`：站点免费体验使用的服务端密钥。
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `SESSION_SECRET`：至少 32 字符，用于签署免费次数 Cookie。

访问者密钥不应配置为生产环境变量。不要把 `.env.local`、API Key 或 Access Token 提交到仓库。

## 验证

```powershell
npm install
npm run build
npm test
npm audit --omit=dev
```

浏览器检查需要先启动 `vercel dev`，再运行 `node .\tests\browser-check.mjs`。生产检查会发起一次真实的免费 AI 分析，但不会创建墨墨云词本。
