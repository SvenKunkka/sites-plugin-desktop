# STEP to STL Batch Converter

## English Overview

STEP to STL Batch Converter is a local-first tool for converting multiple `.step` or `.stp` CAD files into binary `.stl` meshes. It is available as a browser application and a macOS desktop application. Files are parsed and converted on the user's device and are never uploaded to a server.

The interface supports drag-and-drop batch input, adjustable linear and angular tolerances, millimeter/centimeter/meter/inch/foot units, per-file status and mesh statistics, individual downloads, ZIP export, cancellation, retry, and queue management. Conversion runs in a Web Worker using OpenCascade WASM so that heavy geometry processing does not block the main interface.

For the browser version, install Node.js 22.13 or newer, run `npm install`, and then run `npm run dev`. The Tauri 2 desktop build additionally requires Rust and the macOS system dependencies documented by Tauri. See the Chinese sections below for complete development and packaging commands.

一个支持浏览器和 macOS 桌面端的 STEP/STP 批量转 STL 工具。所有模型都在本机解析和转换，不会上传到服务器。

![STEP to STL Batch Converter 界面](public/screenshot.jpeg)

## 功能

- 拖放或多选 `.step`、`.stp` 文件
- 批量转换为二进制 `.stl`
- 调整线性偏差和角度偏差，控制网格精度
- 支持毫米、厘米、米、英寸和英尺
- 显示每个文件的转换状态、耗时、网格数和三角面数
- 单独下载 STL，或将全部结果打包为 ZIP
- 停止任务、重试失败项目和管理转换队列
- 通过 Web Worker 在本机执行 OpenCascade WASM 转换

## 隐私

输入文件、模型几何和转换结果都保留在本机。浏览器版和桌面版均不需要把 CAD 文件上传到服务器。

## 运行浏览器版本

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 运行 macOS 桌面版本

桌面版基于 Tauri 2，需要安装 Rust 工具链和 Tauri 在 macOS 上所需的系统依赖。

```bash
npm install
npm run tauri:dev
```

生成 `.app` 和 `.dmg`：

```bash
npm run tauri:build
```

当前桌面版最低支持 macOS 10.15。

## 技术栈

- Next.js 16、React 19、TypeScript、vinext
- OpenCascade WASM、Web Workers、JSZip
- Tauri 2、Rust、Vite
- Cloudflare Workers 与 OpenAI Workspace Sites 托管配置

## 项目结构

- `app/step-converter.tsx`：转换队列与用户界面
- `public/converter-worker.js`：STEP/STP 解析及 STL 生成
- `desktop/`：Tauri 桌面版前端入口
- `src-tauri/`：macOS 桌面应用配置与 Rust 入口
- `.openai/hosting.json`：OpenAI Workspace Sites 托管配置
