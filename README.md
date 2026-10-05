# CAD / Office 助手

用自然语言生成 AutoCAD AutoLISP 与 Microsoft Office / WPS VBA 宏代码的 AI 助手：描述需求，AI 帮你生成可直接运行的绘图自动化脚本与办公宏代码。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Deploy](https://github.com/yifenqian1990-wq/cad-office-assistant/actions/workflows/deploy.yml/badge.svg)](https://github.com/yifenqian1990-wq/cad-office-assistant/actions)
[![Live](https://img.shields.io/website?url=https%3A%2F%2Fyifenqian1990-wq.github.io%2Fcad-office-assistant%2F&label=online)](https://yifenqian1990-wq.github.io/cad-office-assistant/)

## 🚀 在线体验

**https://yifenqian1990-wq.github.io/cad-office-assistant/**

打开即用，纯前端应用，数据只保存在浏览器本地。

## ✨ 功能特性

- **代码模式**：直接生成 AutoLISP / VBA 宏代码，自动包裹主命令、带错误处理，参数通过 `getpoint`、`getreal` 等交互函数在运行时输入
- **技能模式**：按"感知 → 决策 → 执行 → 评估"流程工作，先给方案计划、经你确认后再生成代码，沉淀为可复用的技能
- **多 AI 接口**：支持 Gemini 及 OpenAI 兼容接口（DeepSeek、OpenRouter 等），在设置中配置 Base URL + Key + 模型
- **绘图 / 办公知识库**：内置常用 AutoLISP 与 VBA 代码片段、快捷指令与最佳实践
- **隐私优先**：所有对话与配置只存浏览器本地，不上传任何服务器

## 💻 本地运行

环境要求：Node.js ≥ 20

```bash
npm install
npm run dev      # http://localhost:3000
```

生产构建：

```bash
npm run build    # 产物在 dist/，可直接用任意静态服务器托管
```

## 🔑 AI 接口配置

打开页面右上角「设置」，选择服务商并填写 API Key：

| 服务商 | 说明 |
|---|---|
| Gemini | Google AI Studio 申请 Key |
| DeepSeek / OpenRouter | OpenAI 兼容接口，填写 Base URL + Key + 模型名 |
| 自定义 | 任意 OpenAI 兼容的接口地址均可 |

Key 只保存在浏览器本地，不会上传到任何服务器。不配置 Key 不影响浏览界面，但无法生成代码。

## 🛠️ 技术栈

React 19 + Vite 6 + TypeScript + TailwindCSS 4

## 📦 部署

本仓库通过 GitHub Pages 自动发布：推送到 `main` 分支后，GitHub Actions 自动构建并上线，全程无需人工干预。

## ❓ 常见问题

**Q: 生成的代码在 AutoCAD 里怎么用？**
A: 将代码粘贴到 AutoCAD 命令行的 VLISP 编辑器或保存为 `.lsp` 文件后 `APPLOAD` 加载，按提示输入参数即可运行。

**Q: 支持 WPS 吗？**
A: 支持。生成的 VBA 宏在 Microsoft Office 与 WPS Office 的宏编辑器中均可使用（WPS 需开启宏功能）。

**Q: 为什么 AI 没有回复？**
A: 请检查「设置」中的 API Key、Base URL 与模型名是否填写正确，以及 Key 是否有可用额度。

## 📄 许可证

本项目采用 [MIT](LICENSE) 开源许可证。
