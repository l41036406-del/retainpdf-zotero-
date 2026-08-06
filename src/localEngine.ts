/**
 * Runtime manager for the v2 headless RetainPDF core.
 *
 * The production XPI will contain a portable runtime in the layout below. The
 * executable cannot run from inside an XPI archive, so the installer extracts
 * this directory to the Zotero profile before this manager starts it.
 *
 *   engine/
 *     bin/rust_api.exe
 *     scripts/
 *     fonts/
 *     typst/bin/typst.exe
 */

const ENGINE_PORT = 41001;
const ENGINE_SIMPLE_PORT = 42001;
const ENGINE_AI_PORT = 41101;
const ENGINE_API_KEY = "retainpdf-zotero-local";

declare const Subprocess: any;

export type LocalEngineStatus =
    | { ready: true; baseURL: string }
    | { ready: false; reason: string };

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class LocalEngineManager {
    private starting?: Promise<void>;

    get baseURL() {
        return `http://127.0.0.1:${ENGINE_PORT}`;
    }

    get apiKey() {
        return ENGINE_API_KEY;
    }

    get runtimeRoot() {
        return PathUtils.join(PathUtils.profileDir, "retainpdf-zotero", "engine");
    }

    private get executable() {
        return PathUtils.join(this.runtimeRoot, "bin", "rust_api.exe");
    }

    private get scriptsDir() {
        return PathUtils.join(this.runtimeRoot, "scripts");
    }

    private get dataRoot() {
        return PathUtils.join(PathUtils.profileDir, "retainpdf-zotero", "data");
    }

    async status(): Promise<LocalEngineStatus> {
        if (!await IOUtils.exists(this.executable)) {
            return { ready: false, reason: "未安装内置本地引擎。" };
        }
        try {
            const response = await fetch(`${this.baseURL}/health`, {
                headers: { "X-API-Key": this.apiKey },
            });
            if (response.ok) return { ready: true, baseURL: this.baseURL };
        } catch (_error) {
            // A stopped engine is expected before the first task.
        }
        return { ready: false, reason: "本地引擎尚未启动。" };
    }

    async ensureReady(): Promise<{ baseURL: string; apiKey: string }> {
        const current = await this.status();
        if (current.ready) return { baseURL: current.baseURL, apiKey: this.apiKey };
        if (!await IOUtils.exists(this.executable)) {
            throw new Error("内置本地引擎尚未安装。请在 RetainPDF 设置中安装引擎后重试。");
        }
        if (!this.starting) this.starting = this.start();
        await this.starting;
        return { baseURL: this.baseURL, apiKey: this.apiKey };
    }

    private async start(): Promise<void> {
        await IOUtils.makeDirectory(this.dataRoot, { ignoreExisting: true });
        const environment: Record<string, string> = {
            RUST_API_BIND_HOST: "127.0.0.1",
            RUST_API_PORT: String(ENGINE_PORT),
            RUST_API_SIMPLE_PORT: String(ENGINE_SIMPLE_PORT),
            RUST_API_KEYS: ENGINE_API_KEY,
            RUST_API_DATA_ROOT: this.dataRoot,
            RUST_API_ROOT: PathUtils.join(this.dataRoot, "rust_api"),
            RUST_API_PROJECT_ROOT: this.runtimeRoot,
            RUST_API_SCRIPTS_DIR: this.scriptsDir,
            RUST_API_AI_SERVICE_BASE: `http://127.0.0.1:${ENGINE_AI_PORT}`,
            PYTHONUTF8: "1",
            PYTHONUNBUFFERED: "1",
            PYTHONDONTWRITEBYTECODE: "1",
            RETAIN_PDF_TYPST_FONT_DIRS: PathUtils.join(this.runtimeRoot, "fonts"),
            TYPST_BIN: PathUtils.join(this.runtimeRoot, "typst", "bin", "typst.exe"),
        };

        // Subprocess keeps running after the returned promise is stored. We do
        // not await its completion: the engine is intentionally long-lived.
        void Subprocess.call({
            command: this.executable,
            arguments: [],
            workdir: this.runtimeRoot,
            environment,
        }).catch((error: unknown) => Zotero.debug(`RetainPDF local engine exited: ${String(error)}`));

        for (let attempt = 0; attempt < 30; attempt++) {
            await sleep(1000);
            const status = await this.status();
            if (status.ready) return;
        }
        throw new Error("内置本地引擎启动超时。请在设置中查看运行时诊断信息。");
    }
}
