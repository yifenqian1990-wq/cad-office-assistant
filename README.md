# CAD / Office 助手

AutoCAD AutoLISP 与 Microsoft Office / WPS VBA 宏代码的智能生成助手：
用自然语言描述需求，AI 帮你生成可直接运行的绘图自动化脚本与办公宏代码。

## 功能特性

- **代码模式**：直接生成 AutoLISP / VBA 宏代码，自动包裹主命令、带错误处理，参数通过 `getpoint`、`getreal` 等交互函数在运行时输入
- **技能模式**：按"感知 → 决策 → 执行 → 评估"流程工作，先给方案计划、经你确认后再生成代码，沉淀为可复用的技能
- **多 AI 接口**：支持 Gemini 及 OpenAI 兼容接口（DeepSeek、OpenRouter 等），在设置中配置 Base URL + Key + 模型
- **本地运行**：纯前端应用，数据只保存在浏览器本地

## 技术栈

React 19 + Vite 6 + TypeScript + TailwindCSS 4

## 本地运行

环境要求：Node.js ≥ 20

```bash
npm install
npm run dev      # http://localhost:3000
```

生产构建：

```bash
npm run build    # 产物在 dist/，可直接用任意静态服务器托管
```

## AI 接口配置

打开页面右上角「设置」，选择服务商并填写 API Key（Gemini / OpenAI / DeepSeek / OpenRouter / 自定义兼容接口均可）。
Key 只保存在浏览器本地，不会上传到任何服务器。

## 在线访问

本仓库通过 GitHub Pages 自动发布，推送到 `main` 分支后自动构建上线。

## 许可证

本项目采用 [MIT](LICENSE) 开源许可证。
