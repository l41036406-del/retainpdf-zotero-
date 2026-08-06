# RetainPDF for Zotero

面向 **Zotero 9** 的精简插件：在条目或 PDF 附件的右键菜单中只提供“生成译文 PDF”和“生成双语对照 PDF”。它将源文件上传至本地 RetainPDF (`http://127.0.0.1:41000`)，完成后自动作为原条目的子附件保存。

双语对照版由插件在本地将原文放在左侧、译文放在右侧生成；不会把文献传到 RetainPDF 以外的服务。

## 配置

在 Zotero 高级配置编辑器设置以下首选项：

- `extensions.zotero.retainpdfzotero.baseURL`
- `extensions.zotero.retainpdfzotero.apiKey`
- `extensions.zotero.retainpdfzotero.jobTemplate`（RetainPDF grouped job JSON，填入你的 OCR/模型配置）

## Build

`npm install` 后运行 `npm run build`，在 `build/` 目录取得 XPI。

RetainPDF 基于 MIT 许可证；本项目同样采用 MIT 许可证。
