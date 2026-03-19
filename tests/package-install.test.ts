import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

interface PackageJson {
    private?: boolean;
    license?: string;
    main?: string;
    files?: string[];
    exports?: Record<string, string>;
    scripts?: Record<string, string>;
    keywords?: string[];
    dependencies?: Record<string, string>;
}

test("package.json exposes publishable plugin entrypoints", () => {
    const packageJson = JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageJson;

    assert.equal(packageJson.private, undefined);
    assert.equal(packageJson.license, "MIT");
    assert.equal(packageJson.main, "./dist/index.js");
    assert.deepEqual(packageJson.exports, {
        ".": "./dist/index.js",
        "./plugin": "./dist/plugin.js",
    });
    assert.deepEqual(packageJson.files, [
        "dist",
        "README.md",
        "README.zh-CN.md",
        "INSTALL.md",
        "tbot.config.example.json",
        "LICENSE",
    ]);
    assert.equal(
        packageJson.scripts?.prepublishOnly,
        "pnpm build && pnpm typecheck && pnpm test",
    );
    assert.ok(packageJson.keywords?.includes("opencode"));
    assert.ok(packageJson.keywords?.includes("plugin"));
    assert.equal(packageJson.dependencies?.["@openrouter/sdk"], "0.9.11");
    assert.equal(packageJson.dependencies?.dotenv, undefined);
});

test("package root entry re-exports the plugin module", async () => {
    const rootModule = await import("../src/index.js");
    const pluginModule = await import("../src/plugin.js");

    assert.equal(rootModule.default, pluginModule.default);
    assert.equal(rootModule.TelegramBotPlugin, pluginModule.TelegramBotPlugin);
    assert.equal(
        rootModule.ensureTelegramBotPluginRuntime,
        pluginModule.ensureTelegramBotPluginRuntime,
    );
    assert.equal(
        rootModule.resetTelegramBotPluginRuntimeForTests,
        pluginModule.resetTelegramBotPluginRuntimeForTests,
    );
});

test("vite build keeps both npm and explicit plugin entrypoints", async () => {
    const viteConfigModule = await import("../vite.config.ts");
    const viteConfig = viteConfigModule.default;

    assert.deepEqual(
        Object.keys(viteConfig.build?.rollupOptions?.input ?? {}).sort(),
        ["index", "plugin"],
    );
    assert.equal(viteConfig.build?.outDir, "dist");
    assert.equal(viteConfig.build?.rollupOptions?.output?.entryFileNames, "[name].js");
});
