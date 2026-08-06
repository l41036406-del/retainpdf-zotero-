import { BasicTool } from "zotero-plugin-toolkit";
import { config } from "../package.json";
import hooks from "./hooks";

const tool = new BasicTool();
if (!(tool.getGlobal("Zotero") as any)[config.addonInstance]) {
    const addon = { hooks, config, menuIDs: [] as string[] };
    (globalThis as any).addon = addon;
    (Zotero as any)[config.addonInstance] = addon;
}
