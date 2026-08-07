import { config } from "../package.json";
import { PendingJob, RetainPDFClient, OutputKind } from "./retainpdf";

const MENU_ID = "zotero-itemmenu-retainpdf-zotero";
const PENDING_PREF = `${config.prefsPrefix}.pendingJobs`;

function getPendingJobs(): PendingJob[] {
    const value = Zotero.Prefs.get(PENDING_PREF, true);
    if (!value) return [];
    try {
        const jobs = JSON.parse(String(value));
        return Array.isArray(jobs) ? jobs : [];
    } catch (_error) {
        return [];
    }
}

function savePendingJobs(jobs: PendingJob[]): void {
    Zotero.Prefs.set(PENDING_PREF, JSON.stringify(jobs), true);
}

function addPendingJob(job: PendingJob): void {
    const jobs = getPendingJobs().filter((entry) => entry.jobID !== job.jobID);
    jobs.push(job);
    savePendingJobs(jobs);
}

function removePendingJob(jobID: string): void {
    savePendingJobs(getPendingJobs().filter((entry) => entry.jobID !== jobID));
}

async function recoverPendingJobs(): Promise<void> {
    const client = new RetainPDFClient();
    for (const pending of getPendingJobs()) {
        const item = (Zotero.Items as any).getByLibraryAndKey(pending.libraryID, pending.itemKey) as Zotero.Item | false;
        if (!item) {
            Zotero.debug(`RetainPDF: cannot recover ${pending.jobID}; Zotero item ${pending.itemKey} is unavailable.`);
            continue;
        }
        try {
            await client.resumeAndAttach(item, pending);
            removePendingJob(pending.jobID);
        } catch (error) {
            // Keep the record and remote data: the next Zotero startup can retry.
            Zotero.debug(`RetainPDF: recovery for ${pending.jobID} deferred: ${String(error)}`);
        }
    }
}

function selectedItems(): Zotero.Item[] {
    const mainWindow = Zotero.getMainWindow() as any;
    const pane = mainWindow?.ZoteroPane;
    return pane?.getSelectedItems?.() || [];
}

async function run(kind: OutputKind) {
    try {
        const items = selectedItems();
        if (!items.length) {
            throw new Error("请先选择一个文献条目或 PDF 附件。");
        }
        const client = new RetainPDFClient();
        for (const item of items) {
            await client.translateAndAttach(item, kind, {
                submitted: addPendingJob,
                completed: removePendingJob,
            });
        }
        Services.prompt.alert(
            Zotero.getMainWindow() as unknown as mozIDOMWindowProxy,
            "RetainPDF",
            "翻译完成，PDF 已作为子附件添加到原文献；RetainPDF 中对应数据已清理。",
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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

export default {
    async onStartup() {
        await Promise.all([Zotero.initializationPromise, Zotero.uiReadyPromise]);
        Zotero.getMainWindows().forEach(addMenu);
        void recoverPendingJobs();
    },
    onMainWindowLoad: addMenu,
    onMainWindowUnload() {},
    onShutdown() {
        Zotero.getMainWindows().forEach((win) => win.document.getElementById(MENU_ID)?.remove());
        delete (Zotero as any).retainPDFZotero;
    },
};
