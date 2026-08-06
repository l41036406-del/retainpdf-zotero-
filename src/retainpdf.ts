import { PDFDocument } from "pdf-lib";
import { config } from "../package.json";
import { ProgressReporter } from "./progress";

export type OutputKind = "translated" | "bilingual";
type ApiResponse<T> = { code: number; message: string; data: T };
type Job = { job_id: string; status: string; stage?: string; artifacts?: { output_pdf?: { ready?: boolean } } };

const defaults = {
    baseURL: "http://127.0.0.1:41000",
    apiKey: "",
    desktopExePath: "D:\\retainpdf\\RetainPDF.exe",
    aiBaseURL: "",
    aiModel: "",
    aiAPIKey: "",
    targetLanguage: "zh",
    engineMode: "desktop",
    pageRanges: "",
    maxConcurrency: "1",
    jobTemplate: JSON.stringify({
        workflow: "book",
        ocr: { provider: "paddle", language: "ch", page_ranges: "" },
        translation: { mode: "sci", math_mode: "direct_typst", model: "", base_url: "", api_key: "", batch_size: 1, workers: 8 },
        render: { render_mode: "auto", compile_workers: 4 },
        runtime: { timeout_seconds: 3600 },
    }),
};

function pref(name: keyof typeof defaults): string {
    const value = Zotero.Prefs.get(`${config.prefsPrefix}.${name}`, true);
    return value ? String(value) : defaults[name];
}

function sleep(ms: number) { return new Promise<void>((resolve) => setTimeout(resolve, ms)); }

export class RetainPDFClient {
    private baseURL: string;
    private apiKey: string;
    private desktopExePath = pref("desktopExePath");

    constructor(endpoint?: { baseURL: string; apiKey: string }) {
        this.baseURL = (endpoint?.baseURL || pref("baseURL")).replace(/\/$/, "");
        this.apiKey = endpoint?.apiKey || pref("apiKey");
    }

    private get effectiveApiKey(): string {
        // The official desktop app exposes its loopback Rust API with this key.
        // Use it directly so a stale/manual preference cannot break desktop use.
        if (/^http:\/\/(127\.0\.0\.1|localhost):41000$/i.test(this.baseURL)) {
            return "retain-pdf-desktop";
        }
        return this.apiKey;
    }

    private headers(json = true): Record<string, string> {
        return {
            ...(json ? { "Content-Type": "application/json" } : {}),
            ...(this.effectiveApiKey ? { "X-API-Key": this.effectiveApiKey } : {}),
        };
    }

    private get isLocalDesktop(): boolean {
        return /^http:\/\/(127\.0\.0\.1|localhost):41000$/i.test(this.baseURL);
    }

    private async desktopIsReady(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseURL}/health`, { headers: this.headers(false) });
            return response.ok;
        } catch (_error) {
            return false;
        }
    }

    private async startDesktop(): Promise<void> {
        if (!this.desktopExePath || !await IOUtils.exists(this.desktopExePath)) {
            throw new Error(`未找到 RetainPDF 桌面版：${this.desktopExePath || "未配置路径"}。请在高级配置中设置 extensions.zotero.retainpdfzotero.desktopExePath。`);
        }
        const classes = Components.classes as any;
        const executable = classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
        executable.initWithPath(this.desktopExePath);
        const process = classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
        process.init(executable);
        process.run(false, [], 0);
    }

    private async ensureDesktopRunning(): Promise<void> {
        if (!this.isLocalDesktop || await this.desktopIsReady()) return;
        await this.startDesktop();
        for (let attempt = 0; attempt < 30; attempt++) {
            await sleep(2000);
            if (await this.desktopIsReady()) return;
        }
        throw new Error("RetainPDF 桌面版已尝试启动，但 60 秒内未准备就绪。请检查桌面版是否显示启动错误。");
    }

    private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.baseURL}/api/v1${path}`, {
            ...init,
            headers: { ...this.headers(false), ...(init.headers || {}) },
        });
        const body = await response.json() as unknown as ApiResponse<T>;
        if (!response.ok || body.code !== 0) throw new Error(body.message || `RetainPDF 请求失败 (${response.status})`);
        return body.data;
    }

    private async attachmentFor(item: Zotero.Item): Promise<Zotero.Item> {
        const attachment = item.isAttachment() ? item : await item.getBestAttachment();
        if (!attachment || !attachment.isAttachment() || attachment.attachmentContentType !== "application/pdf") throw new Error("所选条目没有可用的本地 PDF 附件。");
        const path = attachment.getFilePath();
        if (!path || !await IOUtils.exists(path)) throw new Error("PDF 附件文件不存在于本地。");
        return attachment;
    }

    private async upload(attachment: Zotero.Item): Promise<{ upload_id: string }> {
        const path = attachment.getFilePath();
        if (!path) throw new Error("PDF 附件文件不存在于本地。");
        const bytes = await IOUtils.read(path);
        const browserWindow = Zotero.getMainWindow() as any;
        const form = new browserWindow.FormData();
        const file = new browserWindow.File(
            [bytes.buffer as ArrayBuffer],
            PathUtils.filename(path),
            { type: "application/pdf" },
        );
        form.append("file", file);
        const response = await fetch(`${this.baseURL}/api/v1/uploads`, { method: "POST", headers: this.headers(false), body: form });
        const body = await response.json() as unknown as ApiResponse<{ upload_id: string }>;
        if (!response.ok || body.code !== 0) throw new Error(body.message || "上传 PDF 失败。");
        return body.data;
    }

    private async waitForJob(jobID: string, report?: ProgressReporter): Promise<Job> {
        let lastStage = "";
        for (let attempt = 0; attempt < 720; attempt++) {
            const job = await this.api<Job>(`/jobs/${encodeURIComponent(jobID)}`);
            if (job.status === "succeeded") return job;
            if (["failed", "cancelled"].includes(job.status)) throw new Error(`RetainPDF 任务失败：${job.stage || job.status}`);
            if (job.stage && job.stage !== lastStage) {
                lastStage = job.stage;
                const stage = /ocr|extract|parse/i.test(job.stage) ? "解析/OCR" : /render|compile/i.test(job.stage) ? "渲染" : "翻译";
                report?.(stage, job.stage, stage === "翻译" ? 55 : stage === "渲染" ? 85 : 30);
            }
            await sleep(5000);
        }
        throw new Error("等待 RetainPDF 任务超时。");
    }

    private async download(path: string): Promise<Uint8Array> {
        const response = await fetch(`${this.baseURL}/api/v1${path}`, { headers: this.headers(false) });
        if (!response.ok) throw new Error(`下载翻译产物失败 (${response.status})`);
        return new Uint8Array(await response.arrayBuffer());
    }

    private async bilingual(source: Uint8Array, translated: Uint8Array): Promise<Uint8Array> {
        // IOUtils and fetch can yield typed arrays from different Firefox
        // compartments. pdf-lib requires an array owned by this add-on realm.
        const original = await PDFDocument.load(Uint8Array.from(source));
        const translation = await PDFDocument.load(Uint8Array.from(translated));
        if (original.getPageCount() !== translation.getPageCount()) throw new Error("原文与译文页数不同，无法生成逐页双语对照版。");
        const output = await PDFDocument.create();
        for (let index = 0; index < original.getPageCount(); index++) {
            const [left] = await output.copyPages(original, [index]);
            const [right] = await output.copyPages(translation, [index]);
            const size = left.getSize();
            const page = output.addPage([size.width * 2, Math.max(size.height, right.getHeight())]);
            const leftEmbedded = await output.embedPage(left);
            const rightEmbedded = await output.embedPage(right);
            page.drawPage(leftEmbedded, { x: 0, y: 0, width: size.width, height: size.height });
            page.drawPage(rightEmbedded, { x: size.width, y: 0, width: right.getWidth(), height: right.getHeight() });
        }
        return await output.save();
    }

    private async attach(source: Zotero.Item, bytes: Uint8Array, title: string): Promise<void> {
        const file = PathUtils.join(PathUtils.tempDir, `${Date.now()}-${title}`);
        await IOUtils.write(file, bytes);
        try {
            const parentItemID = source.isAttachment() ? source.parentItemID || undefined : source.id;
            await Zotero.Attachments.importFromFile({ file, libraryID: source.libraryID, parentItemID, title });
        } finally { await IOUtils.remove(file); }
    }

    private async deleteRemoteBook(jobID: string): Promise<void> {
        await this.api<void>(`/library/books/${encodeURIComponent(jobID)}`, {
            method: "DELETE",
        });
    }

    async translateAndAttach(item: Zotero.Item, kind: OutputKind, report?: ProgressReporter): Promise<void> {
        report?.("准备", "检查本地 PDF", 5);
        await this.ensureDesktopRunning();
        const attachment = await this.attachmentFor(item);
        report?.("上传", PathUtils.filename(attachment.getFilePath() || "PDF"), 15);
        const uploaded = await this.upload(attachment);
        const template = JSON.parse(pref("jobTemplate"));
        const configuredPageRanges = pref("pageRanges");
        if (configuredPageRanges) template.ocr = { ...template.ocr, page_ranges: configuredPageRanges };
        // The v2 settings page owns API credentials. Keep the v1 template as a
        // fallback during the migration to the bundled local engine.
        if (pref("aiBaseURL")) template.translation = { ...template.translation, base_url: pref("aiBaseURL") };
        if (pref("aiModel")) template.translation = { ...template.translation, model: pref("aiModel") };
        if (pref("aiAPIKey")) template.translation = { ...template.translation, api_key: pref("aiAPIKey") };
        const submitted = await this.api<{ job_id: string }>("/jobs", { method: "POST", headers: this.headers(), body: JSON.stringify({ ...template, source: { upload_id: uploaded.upload_id } }) });
        report?.("解析/OCR", "任务已提交", 25);
        await this.waitForJob(submitted.job_id, report);
        report?.("渲染", "下载译文 PDF", 90);
        const translated = await this.download(`/jobs/${encodeURIComponent(submitted.job_id)}/pdf`);
        const sourcePath = attachment.getFilePath();
        if (!sourcePath) throw new Error("PDF 附件文件不存在于本地。");
        report?.("写入 Zotero", kind === "translated" ? "生成译文版附件" : "生成双语版附件", 95);
        if (kind === "translated") {
            await this.attach(attachment, translated, "译文版-PDF");
        } else {
            const source = await IOUtils.read(sourcePath);
            await this.attach(
                attachment,
                await this.bilingual(source, translated),
                "双语版-PDF",
            );
        }
        // Zotero imports a managed copy before this point. Only delete the
        // RetainPDF book after its corresponding attachment is safely saved.
        await this.deleteRemoteBook(submitted.job_id);
        report?.("完成", "已清理本地翻译任务", 100);
    }
}
