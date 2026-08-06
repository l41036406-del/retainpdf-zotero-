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
const ENGINE_VERSION = "2.0.0";
// Alpha builds must use an explicit release tag so stable users never download
// a preview engine through the `latest` release alias.
const ENGINE_ARCHIVE_URL = "https://github.com/l41036406-del/RetainPDF-Zotero/releases/download/v2.0.0/retainpdf-zotero-engine-win32.zip";

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
        // Keep each engine in a versioned folder. Windows may retain a handle
        // on an old rust_api.exe, so replacing it in place is unreliable.
        return PathUtils.join(PathUtils.profileDir, "retainpdf-zotero", `engine-${ENGINE_VERSION}`);
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

    private get archivePath() {
        return PathUtils.join(PathUtils.tempDir, "retainpdf-zotero-engine-win32.zip");
    }

    private get versionPath() {
        return PathUtils.join(this.runtimeRoot, ".retainpdf-zotero-engine-version");
    }

    private async needsInstall(): Promise<boolean> {
        if (!await IOUtils.exists(this.executable) || !await IOUtils.exists(this.versionPath)) return true;
        return (await IOUtils.readUTF8(this.versionPath)).trim() !== ENGINE_VERSION;
    }

    async status(): Promise<LocalEngineStatus> {
        if (await this.needsInstall()) {
            return { ready: false, reason: "内置本地引擎需要更新。" };
        }
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
        if (await this.needsInstall()) await this.install();
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
            PYTHON_BIN: PathUtils.join(this.runtimeRoot, "python", "python.exe"),
            PYTHONHOME: PathUtils.join(this.runtimeRoot, "python"),
            PYTHONPATH: [
                this.scriptsDir,
                PathUtils.join(this.runtimeRoot, "ai_service"),
                PathUtils.join(this.runtimeRoot, "python", "Lib", "site-packages"),
            ].join(";"),
            PYTHONUTF8: "1",
            PYTHONUNBUFFERED: "1",
            PYTHONDONTWRITEBYTECODE: "1",
            RETAIN_PDF_TYPST_FONT_DIRS: PathUtils.join(this.runtimeRoot, "fonts"),
            TYPST_BIN: PathUtils.join(this.runtimeRoot, "typst", "bin", "typst.exe"),
            TYPST_PACKAGE_PATH: PathUtils.join(this.runtimeRoot, "typst-packages"),
            TYPST_PACKAGE_CACHE_PATH: PathUtils.join(this.dataRoot, "typst-package-cache"),
            RETAIN_PDF_FONT_PATH: PathUtils.join(this.runtimeRoot, "fonts", "SourceHanSerifSC-Regular.otf"),
            RETAIN_PDF_TITLE_BOLD_FONT_PATH: PathUtils.join(this.runtimeRoot, "fonts", "SourceHanSerifSC-Bold.otf"),
        };

        // `Subprocess` is not exported to every Zotero add-on context. Use the
        // native XPCOM process service, which is also used by the desktop-mode
        // compatibility path. nsIProcess inherits this environment at launch.
        const classes = Components.classes as any;
        const processEnv = classes["@mozilla.org/process/environment;1"].getService(
            Components.interfaces.nsIEnvironment,
        );
        for (const [name, value] of Object.entries(environment)) processEnv.set(name, value);
        const executable = classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
        executable.initWithPath(this.executable);
        const process = classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
        process.init(executable);
        process.run(false, [], 0);

        for (let attempt = 0; attempt < 30; attempt++) {
            await sleep(1000);
            const status = await this.status();
            if (status.ready) return;
        }
        throw new Error("内置本地引擎启动超时。请在设置中查看运行时诊断信息。");
    }

    private async install(): Promise<void> {
        const response = await fetch(ENGINE_ARCHIVE_URL);
        if (!response.ok) {
            throw new Error(`下载内置本地引擎失败（${response.status}）。请检查网络后重试。`);
        }
        await IOUtils.write(this.archivePath, new Uint8Array(await response.arrayBuffer()));
        try {
            await IOUtils.makeDirectory(this.runtimeRoot, { ignoreExisting: true });
            const classes = Components.classes as any;
            const file = classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
            file.initWithPath(this.archivePath);
            const zip = classes["@mozilla.org/libjar/zip-reader;1"].createInstance(Components.interfaces.nsIZipReader);
            const ensureDirectory = (directory: any): void => {
                if (directory.exists()) return;
                ensureDirectory(directory.parent);
                directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0o755);
            };
            zip.open(file);
            try {
                const entries = zip.findEntries(null);
                while (entries.hasMore()) {
                    const entryName = String(entries.getNext());
                    if (entryName.includes("..") || entryName.startsWith("/") || entryName.startsWith("\\")) {
                        throw new Error("内置本地引擎压缩包包含不安全路径。");
                    }
                    if (entryName.endsWith("/")) continue;
                    const output = classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
                    output.initWithPath(this.runtimeRoot);
                    for (const component of entryName.split("/")) output.append(component);
                    ensureDirectory(output.parent);
                    zip.extract(entryName, output);
                }
            } finally {
                zip.close();
            }
        } finally {
            await IOUtils.remove(this.archivePath, { ignoreAbsent: true });
        }
        if (!await IOUtils.exists(this.executable)) {
            throw new Error("内置本地引擎安装不完整，未找到 Rust API。请重新安装。 ");
        }
        await IOUtils.writeUTF8(this.versionPath, ENGINE_VERSION);
    }
}
