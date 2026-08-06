# RetainPDF for Zotero

面向 **Zotero 9** 的精简插件。当前仅维护 **v0.1.6**；请勿使用此前的历史发行版。

## 使用条件

- 必须先启动并保持 **RetainPDF 桌面版**运行。
- 该插件通过本机服务 `http://127.0.0.1:41000` 提交任务；不支持独立运行，也不支持远程 RetainPDF 服务。

在条目或 PDF 附件的右键菜单中只有两项：

- **生成译文 PDF**：完成后自动回写为子附件，标题为“译文版-PDF”。
- **生成双语对照 PDF**：原文左、译文右；完成后自动回写为子附件，标题为“双语版-PDF”。

双语对照文件仅在本机生成；不会将文献上传到 RetainPDF 以外的服务。

## 配置

在 Zotero 高级配置编辑器设置以下首选项：

- `extensions.zotero.retainpdfzotero.baseURL`
- `extensions.zotero.retainpdfzotero.apiKey`（桌面版可填 `retain-pdf-desktop`）
- `extensions.zotero.retainpdfzotero.jobTemplate`（RetainPDF grouped job JSON，填入你的 OCR/模型配置）

## Build

`npm install` 后运行 `npm run build`，在 `build/` 目录取得 XPI。

RetainPDF 基于 MIT 许可证；本项目同样采用 MIT 许可证。
