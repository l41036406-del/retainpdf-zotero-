import { RetainPDFClient, OutputKind } from "./retainpdf";

const MENU_ID = "zotero-itemmenu-retainpdf-zotero";

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
        for (const item of items) await client.translateAndAttach(item, kind);
        Services.prompt.alert(
            Zotero.getMainWindow() as unknown as mozIDOMWindowProxy,
            "RetainPDF",
            "任务已提交。翻译完成后会自动作为子附件添加到原文献。",
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
    },
    onMainWindowLoad: addMenu,
    onMainWindowUnload() {},
    onShutdown() {
        Zotero.getMainWindows().forEach((win) => win.document.getElementById(MENU_ID)?.remove());
        delete (Zotero as any).retainPDFZotero;
    },
};
