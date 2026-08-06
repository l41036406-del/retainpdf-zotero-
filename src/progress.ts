import { ProgressWindowHelper } from "zotero-plugin-toolkit";

export type TranslationStage = "准备" | "上传" | "解析/OCR" | "翻译" | "渲染" | "写入 Zotero" | "完成";

export type ProgressReporter = (stage: TranslationStage, detail?: string, percent?: number) => void;

export class TranslationProgressWindow {
    private readonly window: any;

    constructor() {
        this.window = new ProgressWindowHelper("RetainPDF 翻译").createLine({
            text: "准备翻译任务…",
            type: "default",
            progress: 0,
        });
        this.window.show();
    }

    report: ProgressReporter = (stage, detail, percent = 0) => {
        this.window.changeLine({
            text: `${stage}${detail ? `：${detail}` : "…"}`,
            type: "default",
            progress: percent,
        });
    };

    succeed(message = "译文已添加到 Zotero") {
        this.window.changeLine({ text: message, type: "success", progress: 100 });
        this.window.startCloseTimer(8000);
    }

    fail(message: string) {
        this.window.changeLine({ text: message, type: "error", progress: 100 });
    }
}
