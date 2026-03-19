import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";

interface PackageJson {
    dependencies?: Record<string, string>;
}

const packageJson = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as PackageJson;

const external = [...new Set([
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
    ...Object.keys(packageJson.dependencies ?? {}),
])];

export default defineConfig({
    build: {
        emptyOutDir: true,
        minify: false,
        outDir: "dist",
        sourcemap: true,
        ssr: true,
        target: "node22",
        rollupOptions: {
            external,
            input: {
                index: resolve("src/index.ts"),
                plugin: resolve("src/plugin.ts"),
            },
            output: {
                entryFileNames: "[name].js",
                format: "es",
            },
        },
    },
    ssr: {
        target: "node",
    },
});
