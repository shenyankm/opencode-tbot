import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: "utf8", timeout: 120_000, shell: process.platform === "win32" });
const registryIndex = process.argv.indexOf("--registry");
const registryVersion = registryIndex >= 0 ? process.argv[registryIndex + 1] : undefined;
if (registryIndex >= 0) assert.match(registryVersion ?? "", /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u);
if (process.argv.includes("--release")) {
    assert.equal(run("git", ["status", "--porcelain"]).trim(), "", "Commit the validated release before publishing.");
    assert.equal(run("git", ["rev-parse", `v${pkg.version}^{commit}`]).trim(), run("git", ["rev-parse", "HEAD"]).trim(), "Release tag must point to HEAD.");
    assert.ok(readFileSync(join(root, "CHANGELOG.md"), "utf8").includes(`## ${pkg.version} —`), "Finalize the version's changelog.");
}
const directory = mkdtempSync(join(tmpdir(), "tbot-consumer-"));
try {
    const packed = JSON.parse(run(npm, ["pack", "--ignore-scripts", "--json", "--pack-destination", directory]));
    assert.ok(packed[0].files.every(({ path }) => /^(?:bin\/|dist\/|README|CHANGELOG|LICENSE|package\.json$)/u.test(path)), "Unexpected packaged files.");
    writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
    const spec = registryVersion ? `${pkg.name}@${registryVersion}` : join(directory, packed[0].filename);
    run(npm, ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline", "--cache", join(tmpdir(), "opencode-tbot-npm-cache"), spec], directory);
    const installed = join(directory, "node_modules", pkg.name);
    const version = registryVersion ?? pkg.version;
    assert.equal(run(process.execPath, [join(installed, "bin", "opencode-tbot.js"), "--version"], directory).trim(), version);
    const script = `for (const name of ["opencode-tbot", "opencode-tbot/cli", "opencode-tbot/plugin"]) await import(name);`;
    run(process.execPath, ["--input-type=module", "--eval", script], directory);
    console.log(`Verified ${spec}: clean production install, CLI and all exports.`);
} finally {
    rmSync(directory, { recursive: true, force: true });
}
