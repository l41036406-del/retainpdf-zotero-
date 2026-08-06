# RetainPDF-Zotero

面向 **Zotero 9 / Windows 10、11** 的本地 PDF 翻译插件。正式第二版为 **v2.0.0**：无需打开 RetainPDF 桌面界面，插件可下载并启动本地翻译引擎，将译文直接回写到 Zotero。

## 功能

- 右键菜单：**生成译文 PDF**、**生成双语对照 PDF**。
- 设置页填写 Paddle OCR Token、兼容 OpenAI 的翻译 API 地址、模型和 API Key；凭证仅保存在本机 Zotero 配置中。
- 首次下载约 165 MB 的 Windows 本地引擎；引擎只监听 `127.0.0.1`。
- 翻译显示准备、上传、OCR、翻译、修复、渲染和写入 Zotero 的进度。
- 原文与译文逐页合成为双语对照 PDF；输出附件名为“译文版-PDF”或“双语版-PDF”。
- 写入 Zotero 成功后，清理本地引擎的对应任务产物。

## 安装

1. 从 [Releases](https://github.com/l41036406-del/RetainPDF-Zotero/releases) 下载 `retain-pdf-for-zotero.xpi`。
2. Zotero → **工具 → 插件** → 齿轮 → **从文件安装插件…**，选择 XPI 后重启 Zotero。
3. Zotero → **编辑 → 设置 → RetainPDF 翻译**，选择“内置本地引擎”，点击“安装/检查内置本地引擎”。

## 配置

在同一设置页填写：

- **Paddle API Token**：OCR 服务 Token。
- **兼容 OpenAI 的接口地址 / 模型 / API Key**：例如 DeepSeek 等兼容服务。
- **页码范围**：留空翻译全文。

旧版 `jobTemplate` 只作为兼容回退；第二版正常使用不需要打开 Zotero 高级设置编辑器。

> OCR 和翻译会调用你配置的第三方服务，可能产生额度费用。请勿将 Token 或 API Key 提交到 GitHub。

## 翻译

选中文献条目或本地 PDF 附件，右键选择所需输出。完成后在原条目下查看生成的 PDF 附件。

如果 Paddle 报网络/TLS 下载错误，请确认网络或系统代理可访问 Paddle OCR；引擎会使用 Windows 原生 TLS 并允许系统代理。

## 开发

```powershell
npm install
npm run build
```

输出文件：`build/retain-pdf-for-zotero.xpi`。构建内置引擎包还需已准备好的 RetainPDF 运行时与 Rust 工具链，运行 `scripts/package-local-engine.ps1`。

## 许可证

[MIT](LICENSE)。RetainPDF 与第三方 OCR / AI 服务各自遵循其许可证与服务条款。
