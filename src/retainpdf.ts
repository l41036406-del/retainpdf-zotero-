import { PDFDocument } from "pdf-lib";
import { config } from "../package.json";

export type OutputKind = "translated" | "bilingual";
type ApiResponse<T> = { code: number; message: string; data: T };
type Job = { job_id: string; status: string; stage?: string; artifacts?: { output_pdf?: { ready?: boolean } } };

const defaults = {
    baseURL: "http://127.0.0.1:41000",
    apiKey: "",
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
    private baseURL = pref("baseURL").replace(/\/$/, "");
    private apiKey = pref("apiKey");

    private headers(json = true): Record<string, string> {
        return { ...(json ? { "Content-Type": "application/json" } : {}), ...(this.apiKey ? { "X-API-Key": this.apiKey } : {}) };
    }

    private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.baseURL}/api/v1${path}`, init);
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

    private async waitForJob(jobID: string): Promise<Job> {
        for (let attempt = 0; attempt < 720; attempt++) {
            const job = await this.api<Job>(`/jobs/${encodeURIComponent(jobID)}`);
            if (job.status === "succeeded") return job;
            if (["failed", "cancelled"].includes(job.status)) throw new Error(`RetainPDF 任务失败：${job.stage || job.status}`);
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
        const original = await PDFDocument.load(source);
        const translation = await PDFDocument.load(translated);
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

    async translateAndAttach(item: Zotero.Item, kind: OutputKind): Promise<void> {
        const attachment = await this.attachmentFor(item);
        const uploaded = await this.upload(attachment);
        const template = JSON.parse(pref("jobTemplate"));
        const submitted = await this.api<{ job_id: string }>("/jobs", { method: "POST", headers: this.headers(), body: JSON.stringify({ ...template, source: { upload_id: uploaded.upload_id } }) });
        await this.waitForJob(submitted.job_id);
        const translated = await this.download(`/jobs/${encodeURIComponent(submitted.job_id)}/pdf`);
        const sourcePath = attachment.getFilePath();
        if (!sourcePath) throw new Error("PDF 附件文件不存在于本地。");
        const stem = PathUtils.filename(sourcePath).replace(/\.pdf$/i, "");
        if (kind === "translated") return this.attach(attachment, translated, `${stem} - 译文.pdf`);
        const source = await IOUtils.read(sourcePath);
        return this.attach(attachment, await this.bilingual(source, translated), `${stem} - 双语对照.pdf`);
    }
}
