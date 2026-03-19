import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";
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
        ssr: "src/index.ts",
        target: "node22",
        rollupOptions: {
            external,
            output: {
                entryFileNames: "index.js",
                format: "es",
            },
        },
    },
    ssr: {
        target: "node",
    },
});
