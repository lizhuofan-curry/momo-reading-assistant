<div align="center">

# 🐴 拾词 · Momo Reading Assistant

### 把读过的英文，变成真正记得住的词

<p>
  <a href="https://momo.zhuofan.me"><strong>🌐 在线体验</strong></a>
  ·
  <a href="https://momo.zhuofan.me/guide/">使用教程</a>
  ·
  <a href="https://momo.zhuofan.me/privacy/">隐私说明</a>
  ·
  <a href="https://momo.zhuofan.me/help/">常见问题</a>
</p>

<p>
  <img src="https://img.shields.io/badge/AI-Context--Aware-4457DD?style=flat-square" alt="AI Context-Aware">
  <img src="https://img.shields.io/badge/Privacy-Local--First-177E72?style=flat-square" alt="Privacy Local First">
  <img src="https://img.shields.io/badge/Reading-English--Learning-FF6B57?style=flat-square" alt="English Learning">
  <img src="https://img.shields.io/badge/License-Private--Project-59657D?style=flat-square" alt="Private Project">
</p>

</div>

> **拾词不是又一个单词列表。**
> 它从你的论文、讲义、报告和英文笔记中，筛选真正值得记住的词，保留原文语境，经过你审核后，再同步到墨墨云词本。

<div align="center">

![拾词工作台预览](docs/preview.png)

<sub>从真实英文材料开始，在语境中理解，在复习中记住。</sub>

</div>

## ✨ 为什么做拾词？

很多单词工具告诉你“这个词是什么意思”，但很少告诉你：

> **为什么这个词值得在这份材料里被记住？**

拾词把英文阅读和词汇复习连成一个闭环：

```text
论文 / 讲义 / 电子书 / 笔记
              ↓
       本地提取真实语境
              ↓
      AI 筛选值得学习的生词
              ↓
        你审核、编辑和确认
              ↓
          同步到墨墨复习
```

## 🎯 核心功能

| 功能 | 说明 |
| --- | --- |
| 📄 多格式导入 | 支持 PDF、DOCX、TXT、Markdown，也可以直接粘贴英文文本 |
| 🧠 语境筛词 | 根据四级、六级、考研、雅思、托福、专业论文阅读等目标筛选生词 |
| ✍️ 人工审核 | AI 只负责建议，你决定哪些词真正进入词本 |
| 📌 保留语境 | 每个单词都保留原文例句、中文释义和筛选理由 |
| ☁️ 墨墨同步 | 使用你自己的墨墨 Access Token 创建云词本 |
| 🔌 自选 AI 来源 | 支持免费体验模型，也支持 DeepSeek、OpenAI、阿里云百炼 Qwen、OpenRouter 等自有 API |
| 🔒 Local-first | PDF、DOCX、TXT 和 Markdown 优先在浏览器本地提取文字 |
| 📱 响应式界面 | 桌面端和移动端均可使用，适合学习、阅读和快速复习 |

## 🧪 一个简单例子

输入一段真实的技术英文：

```text
The model learns robust temporal representations from noisy signals.
```

拾词不会机械地返回整篇文章，而是结合阅读目标筛选：

| Word | Meaning | Why it matters |
| --- | --- | --- |
| **robust** | 稳健的 | 科研论文中高频出现，用于描述模型或方法的抗干扰能力 |
| **representation** | 表征 | 深度学习和机器学习论文中的核心术语 |
| **temporal** | 时间的 | EEG、信号处理和时序建模场景中的重要词汇 |

## 🔐 隐私设计

拾词处理英文材料时遵循“先本地、后分析”的原则：

- 文件文字优先在浏览器本地提取；
- 只有你确认分析的文本才会发送给所选 AI 服务商；
- 访问者自己的 AI API Key 和墨墨 Token 保存在当前浏览器标签页的 `sessionStorage`；
- 关闭标签页后，访问者凭据会被清除；
- 网站不会替你悄悄把词加入墨墨词本，必须经过人工审核；
- 不要把 `.env.local`、API Key 或 Access Token 提交到仓库。

> 请注意：扫描版 PDF 暂不支持 OCR；超长材料会截取前 150,000 个字符用于分析。

## 🚀 快速开始

### 在线使用

打开 [momo.zhuofan.me](https://momo.zhuofan.me)，可以先查看结果示例，再导入自己的阅读材料。

### 本地开发

```bash
npm install
npm run build
npm test
```

如果要进行本地浏览器检查：

```bash
vercel dev
node .\tests\browser-check.mjs
```

安全依赖检查：

```bash
npm audit --omit=dev
```

## 🧱 技术栈

- **Frontend**：原生 HTML / CSS / JavaScript
- **Backend**：Vercel Serverless Functions
- **Document parsing**：`pdfjs-dist`、`mammoth`
- **AI integration**：OpenAI-compatible API
- **Deployment**：Vercel
- **Design direction**：Local-first、privacy-aware、context-aware learning

## 🗂️ 项目结构

```text
momo-reading-assistant/
├── api/
│   ├── analyze.mjs       # AI 语境筛词接口
│   ├── quota.mjs         # 免费体验额度接口
│   └── sync.mjs          # 墨墨云词本同步接口
├── public/
│   ├── index.html        # 拾词工作台
│   ├── app.js            # 前端交互逻辑
│   ├── connections.js    # AI 与墨墨连接设置
│   └── site.css          # 页面样式
├── tests/                # 单元测试与浏览器检查
├── docs/
│   └── preview.png       # 项目截图
├── build.mjs
├── vercel.json
└── package.json
```

## ⚙️ 生产环境变量

| 变量 | 用途 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 免费体验使用的服务端 AI 密钥 |
| `DEEPSEEK_BASE_URL` | 免费体验模型的 API 地址 |
| `DEEPSEEK_MODEL` | 免费体验使用的模型名称 |
| `SESSION_SECRET` | 至少 32 字符，用于签署免费次数 Cookie |

访问者自己的 API Key 和墨墨 Token **不应配置为生产环境变量**。

## 🧭 产品原则

```text
AI 提供建议，但不替你做决定。
材料先留在本地，发送前明确告知。
单词不脱离语境，复习不脱离目标。
```

## 📌 项目状态

当前版本已经上线，支持从英文材料中提取文本、AI 语境筛词、人工审核以及墨墨云词本同步。后续可以继续完善：

- 扫描 PDF 的 OCR 支持；
- 更丰富的词汇难度和领域标签；
- 生词结果导出与复习统计；
- 更细粒度的隐私和数据管理控制；
- 更完整的演示数据和自动化测试。

## ⚠️ 免责声明

本项目是个人开发的**非官方学习工具**，与墨墨背单词官方没有隶属、合作或背书关系。请妥善保管自己的 API Key、Access Token 和阅读材料。

## 💬 一句话介绍

> **拾词：从真实英文阅读里，筛出值得记住的词。**

<div align="center">

Made with 📚 · 🧠 · 🐴

</div>
