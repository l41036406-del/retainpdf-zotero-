import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
    source: ["src", "addon"],
    dist: "build",
    name: pkg.config.addonName,
    id: pkg.config.addonID,
    namespace: pkg.config.addonRef,
    updateURL:
        "https://github.com/{{owner}}/retainpdf-zotero/releases/download/release/update.json",
    xpiDownloadLink:
        "https://github.com/{{owner}}/retainpdf-zotero/releases/download/v{{version}}/{{xpiName}}.xpi",
    build: {
        assets: ["addon/**/*.*"],
        define: { ...pkg.config, buildVersion: pkg.version },
        esbuildOptions: [{
            entryPoints: ["src/index.ts"],
            bundle: true,
            target: "firefox115",
            outfile: `build/addon/content/scripts/${pkg.config.addonRef}.js`,
        }],
    },
});
