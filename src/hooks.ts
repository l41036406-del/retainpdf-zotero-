import { RetainPDFClient, OutputKind } from "./retainpdf";
import { TranslationProgressWindow } from "./progress";
import { LocalEngineManager } from "./localEngine";
import { config } from "../package.json";

const MENU_ID = "zotero-itemmenu-retainpdf-zotero";

function selectedItems(): Zotero.Item[] {
    const mainWindow = Zotero.getMainWindow() as any;
    const pane = mainWindow?.ZoteroPane;
    return pane?.getSelectedItems?.() || [];
}

function engineMode(): string {
    return String(Zotero.Prefs.get(`${config.prefsPrefix}.engineMode`, true) || "desktop");
}

async function run(kind: OutputKind) {
    const progress = new TranslationProgressWindow();
    try {
        const items = selectedItems();
        if (!items.length) {
            throw new Error("请先选择一个文献条目或 PDF 附件。");
        }
        let client: RetainPDFClient;
        if (engineMode() === "bundled") {
            progress.report("准备", "启动内置本地引擎", 3);
            const engine = await new LocalEngineManager().ensureReady();
            client = new RetainPDFClient(engine);
        } else {
            client = new RetainPDFClient();
        }
        for (let index = 0; index < items.length; index++) {
            progress.report("准备", `队列任务 ${index + 1}/${items.length}`, 0);
            await client.translateAndAttach(items[index], kind, progress.report);
        }
        progress.succeed("翻译完成，PDF 已写入 Zotero");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        progress.fail(message);
        Services.prompt.alert(
            Zotero.getMainWindow() as unknown as mozIDOMWindowProxy,
            "RetainPDF 翻译失败",
            message,
        );
    }
}

function addMenu(win: Window) {
    if (win.document.getElementById(MENU_ID)) return;
    const itemMenu = win.document.getElementById("zotero-itemmenu");
    if (!itemMenu) return;
    const menu = win.document.createXULElement("menu");
    menu.id = MENU_ID;
    menu.setAttribute("label", "RetainPDF 翻译");
    const popup = win.document.createXULElement("menupopup");
    for (const [label, kind] of [["生成译文 PDF", "translated"], ["生成双语对照 PDF", "bilingual"]] as const) {
        const entry = win.document.createXULElement("menuitem");
        entry.setAttribute("label", label);
        entry.addEventListener("command", () => void run(kind));
        popup.appendChild(entry);
    }
    menu.appendChild(popup);
    itemMenu.appendChild(menu);
}

function registerPreferences() {
    const addon = (Zotero as any)[config.addonInstance];
    if (!addon?.rootURI) return;
    Zotero.PreferencePanes.register({
        pluginID: config.addonID,
        src: `${addon.rootURI}content/preferences.xhtml`,
        label: "RetainPDF 翻译",
    });
}

async function refreshEngineStatus(win: Window) {
    const status = await new LocalEngineManager().status();
    const label = win.document.getElementById("retainpdf-engine-status");
    if (label) label.textContent = status.ready ? "内置本地引擎已就绪。" : status.reason;
}

export default {
    async onStartup() {
        await Promise.all([Zotero.initializationPromise, Zotero.uiReadyPromise]);
        registerPreferences();
        Zotero.getMainWindows().forEach(addMenu);
    },
    onMainWindowLoad: addMenu,
    onMainWindowUnload() {},
    onPreferencesLoad(win: Window) {
        void refreshEngineStatus(win);
        const button = win.document.getElementById("retainpdf-install-engine") as HTMLButtonElement | null;
        if (!button || button.dataset.retainpdfBound) return;
        button.dataset.retainpdfBound = "true";
        button.addEventListener("click", () => void (async () => {
            button.disabled = true;
            button.textContent = "正在安装本地引擎…";
            try {
                await new LocalEngineManager().ensureReady();
                Zotero.Prefs.set(`${config.prefsPrefix}.engineMode`, "bundled", true);
                await refreshEngineStatus(win);
                button.textContent = "内置本地引擎已安装";
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const label = win.document.getElementById("retainpdf-engine-status");
                if (label) label.textContent = `安装失败：${message}`;
                button.textContent = "重试安装内置本地引擎";
                button.disabled = false;
            }
        })());
    },
    onShutdown() {
        Zotero.getMainWindows().forEach((win) => win.document.getElementById(MENU_ID)?.remove());
        delete (Zotero as any).retainPDFZotero;
    },
};
