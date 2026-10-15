import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const ENV_RUNTIME_PATTERNS = [
    /dotenv/u,
    /process\.env/u,
    /import\.meta\.env/u,
    /(?:^|[^A-Za-z0-9])\.env(?:$|[^A-Za-z0-9])/u,
];

test("package.json exposes publishable plugin entrypoints", () => {
    const packageJson = JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as PackageJson;

    assert.equal(packageJson.private, undefined);
    assert.equal(packageJson.license, "MIT");
    assert.equal(packageJson.main, "./dist/index.js");
    assert.deepEqual(packageJson.exports, {
        ".": "./dist/index.js",
        "./cli": "./dist/cli.js",
        "./plugin": "./dist/plugin.js",
    });
    assert.deepEqual(packageJson.files, [
        "bin",
        "dist",
        "README.md",
        "README.ja.md",
        "README.zh-CN.md",
        "CHANGELOG.md",
        "LICENSE",
    ]);
    assert.equal(
        packageJson.scripts?.prepublishOnly,
        "pnpm build && pnpm typecheck && pnpm test",
    );
    assert.ok(packageJson.keywords?.includes("opencode"));
    assert.ok(packageJson.keywords?.includes("plugin"));
    assert.equal(packageJson.dependencies?.["@openrouter/sdk"], undefined);
    assert.equal(packageJson.dependencies?.dotenv, undefined);
});

test("runtime source does not depend on .env-based configuration", () => {
    const sourceRoots = [
        new URL("../src/", import.meta.url),
        new URL("../scripts/", import.meta.url),
    ];
    const sourceFiles = sourceRoots.flatMap((root) => collectSourceFiles(root));

    for (const file of sourceFiles) {
        const content = readFileSync(file, "utf8");

        for (const pattern of ENV_RUNTIME_PATTERNS) {
            assert.equal(
                pattern.test(content),
                false,
                `${file.pathname} unexpectedly matches ${pattern}`,
            );
        }
    }
});

test("package root entry only exposes the plugin function", async () => {
    const rootModule = await import("../src/index.js");
    const pluginModule = await import("../src/plugin.js");

    assert.equal(rootModule.default, pluginModule.default);
    assert.deepEqual(Object.keys(rootModule), ["default"]);
    assert.equal(pluginModule.TelegramBotPlugin, pluginModule.default);
    assert.equal(typeof pluginModule.ensureTelegramBotPluginRuntime, "function");
    assert.equal(typeof pluginModule.resetTelegramBotPluginRuntimeForTests, "function");
});

test("vite build keeps both npm and explicit plugin entrypoints", async () => {
    const viteConfigModule = await import("../vite.config.ts");
    const viteConfig = viteConfigModule.default;
    const output = viteConfig.build?.rollupOptions?.output;

    assert.deepEqual(
        Object.keys(viteConfig.build?.rollupOptions?.input ?? {}).sort(),
        ["cli", "index", "plugin"],
    );
    assert.equal(viteConfig.build?.outDir, "dist");
    assert.ok(output && !Array.isArray(output));
    assert.equal(output.entryFileNames, "[name].js");
});

function collectSourceFiles(directory: URL): URL[] {
    if (!existsSync(directory)) {
        return [];
    }

    const files: URL[] = [];

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryUrl = new URL(entry.name, directory);

        if (entry.isDirectory()) {
            files.push(...collectSourceFiles(new URL(`${entry.name}/`, directory)));
            continue;
        }

        if (entry.isFile() && /\.(?:ts|js|mts|cts)$/u.test(entry.name)) {
            files.push(entryUrl);
        }
    }

    return files;
}
