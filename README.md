# RetainPDF for Zotero

RetainPDF for Zotero 是一个面向 **Zotero 9** 的本地翻译插件。它将 PDF 发送给本机已安装的 RetainPDF 桌面版处理，再将结果回写为 Zotero 子附件。

正式第一版：**v1.0.0**。

## 功能

- 右键菜单只提供两项：**生成译文 PDF** 与 **生成双语对照 PDF**。
- RetainPDF 桌面版未运行时，自动启动桌面版并最多等待 60 秒。
- 译文成功导入 Zotero 后，自动清理 RetainPDF 桌面版中的对应书籍、任务和产物。
- Zotero 中保留原始 PDF，以及名称为“译文版-PDF”或“双语版-PDF”的输出附件。

双语对照版在本机合成：原文在左、译文在右。插件不会连接远程 RetainPDF 服务。

## 使用环境

使用插件时需要：

- Windows 10/11。
- Zotero 9。
- 已安装 RetainPDF 桌面版，并已在桌面版中配置可用的 OCR 与翻译模型。
- Zotero 条目中有已下载到本机的 PDF 附件。

本项目不包含 RetainPDF 桌面版、OCR 模型或第三方大模型密钥。请不要把 API Key 提交到 GitHub、截图或写入公开的 issue。

## 安装插件

1. 在 [Releases](https://github.com/l41036406-del/retainpdf-zotero-/releases) 下载 `retain-pdf-for-zotero.xpi`。
2. 在 Zotero 中打开 **工具 → 插件**。
3. 点击右上角齿轮，选择“从文件安装插件…”，选择下载的 XPI。
4. 重启 Zotero。

## 配置 Zotero

打开 **编辑 → 设置 → 高级 → 设置编辑器**，逐项搜索并设置以下首选项。

| 首选项 | 推荐值 | 说明 |
| --- | --- | --- |
| `extensions.zotero.retainpdfzotero.baseURL` | `http://127.0.0.1:41000` | RetainPDF 桌面版的本机服务地址。|
| `extensions.zotero.retainpdfzotero.apiKey` | `retain-pdf-desktop` | 桌面版本机接口密钥。|
| `extensions.zotero.retainpdfzotero.desktopExePath` | `D:\retainpdf\RetainPDF.exe` | 桌面版程序路径；实际安装在其他位置时改为对应的 `RetainPDF.exe` 完整路径。|
| `extensions.zotero.retainpdfzotero.jobTemplate` | 见下方模板 | RetainPDF 的任务配置 JSON。|

### jobTemplate 示例

在 `jobTemplate` 中粘贴下方 JSON，再将 `YOUR_PADDLE_TOKEN` 与 `YOUR_MODEL_API_KEY` 替换成自己在 RetainPDF 桌面版使用的凭据。模型、接口地址与 OCR 参数必须与桌面版实际可用配置一致。

```json
{
  "workflow": "book",
  "ocr": {
    "provider": "paddle",
    "paddle_token": "YOUR_PADDLE_TOKEN",
    "language": "ch",
    "page_ranges": ""
  },
  "translation": {
    "mode": "sci",
    "math_mode": "direct_typst",
    "model": "deepseek-v4-flash",
    "base_url": "https://api.deepseek.com/v1",
    "api_key": "YOUR_MODEL_API_KEY",
    "batch_size": 1,
    "workers": 8
  },
  "render": {
    "render_mode": "auto",
    "compile_workers": 4
  },
  "runtime": {
    "timeout_seconds": 3600
  }
}
```

如果 RetainPDF 桌面版中“翻译整本”能够正常完成，通常直接复用其对应的 OCR、模型与渲染配置即可。

## 翻译操作

1. 在 Zotero 中选中一个文献条目，或直接选中它的 PDF 附件。
2. 右键选择 **生成译文 PDF** 或 **生成双语对照 PDF**。
3. 插件会在 RetainPDF 不在运行时自行启动它，完成后把 PDF 回写为 Zotero 子附件。
4. 回写成功后，RetainPDF 桌面版库中对应书籍会被删除；文献只保留在 Zotero。

若提示未找到桌面版，请检查 `desktopExePath` 是否指向真实的 `RetainPDF.exe`。若提示服务 60 秒内未就绪，请直接启动 RetainPDF 桌面版并检查其启动错误。

## 开发与构建

开发环境需要 Node.js 20+ 与 npm。安装依赖并构建：

```powershell
npm install
npm run build
```

构建产物位于 `build/retain-pdf-for-zotero.xpi`。源码包 `source.zip` 不包含 `node_modules` 或参考项目；解压后运行 `npm install` 即可恢复构建依赖。

## 许可证

本项目采用 [MIT License](LICENSE)。RetainPDF 本体的许可证与本项目相互独立。
