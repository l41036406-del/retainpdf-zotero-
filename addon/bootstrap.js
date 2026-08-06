/* global Components, Services, APP_SHUTDOWN, Cc, Cu */
var chromeHandle;
function install() {}
async function startup({ resourceURI, rootURI }) {
    await Zotero.initializationPromise;
    rootURI = rootURI || resourceURI.spec;
    const aom = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
        .getService(Components.interfaces.amIAddonManagerStartup);
    chromeHandle = aom.registerChrome(Services.io.newURI(rootURI + "manifest.json"), [
        ["content", "__addonRef__", rootURI + "content/"],
    ]);
    const ctx = { rootURI };
    ctx._globalThis = ctx;
    Services.scriptloader.loadSubScript(`${rootURI}content/scripts/__addonRef__.js`, ctx);
    Zotero.__addonInstance__.rootURI = rootURI;
    await Zotero.__addonInstance__.hooks.onStartup();
}
async function onMainWindowLoad({ window }) { Zotero.__addonInstance__?.hooks.onMainWindowLoad(window); }
async function onMainWindowUnload({ window }) { Zotero.__addonInstance__?.hooks.onMainWindowUnload(window); }
function shutdown({ rootURI }, reason) {
    if (reason === APP_SHUTDOWN) return;
    Zotero.__addonInstance__?.hooks.onShutdown();
    Cu.unload(`${rootURI}content/scripts/__addonRef__.js`);
    chromeHandle?.destruct();
    chromeHandle = null;
}
function uninstall() {}
