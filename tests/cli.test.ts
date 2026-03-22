import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createPromptSession, installPlugin, runCli } from "../src/cli.js";
import { OPENCODE_TBOT_VERSION } from "../src/app/package-info.js";
import {
    getGlobalPluginBridgeFilePath,
    getGlobalPluginConfigFilePath,
    getOpenCodeConfigDirectory,
} from "../src/app/plugin-config.js";
import { getDefaultPluginLogDirectory } from "../src/app/opencode-paths.js";

function getLegacyOpenCodeConfigFilePath(homeDir: string): string {
    return join(getOpenCodeConfigDirectory(homeDir), "opencode.json");
}

test("installPlugin writes the global plugin bridge and runtime config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-"));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
        telegramApiRoot: "http://127.0.0.1:9000",
    });

    const pluginBridgePath = getGlobalPluginBridgeFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);
    const pluginBridgeSource = readFileSync(pluginBridgePath, "utf8");
    const pluginConfig = JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
        telegram: { botToken: string; apiRoot: string };
    };

    assert.equal(existsSync(getLegacyOpenCodeConfigFilePath(homeDir)), false);
    assert.match(pluginBridgeSource, /^export \{ default \} from "file:\/\/\/.+\/(?:src\/plugin\.ts|dist\/plugin\.js)";\n$/u);
    assert.equal(pluginConfig.telegram.botToken, "telegram-token");
    assert.equal(pluginConfig.telegram.apiRoot, "http://127.0.0.1:9000");
});

test("installPlugin preserves unrelated plugin config keys and is idempotent", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-cleanup-"));
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);

    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(pluginConfigPath, JSON.stringify({
        state: {
            path: "./custom-state.json",
        },
        telegram: {
            botToken: "old-token",
        },
    }, null, 2));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
    });
    await installPlugin({
        homeDir,
        botToken: "telegram-token",
    });

    const pluginConfig = JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
        state?: { path?: string };
        telegram?: { botToken?: string };
    };

    assert.equal(pluginConfig.state?.path, "./custom-state.json");
    assert.equal(pluginConfig.telegram?.botToken, "telegram-token");
});

test("installPlugin can skip plugin registration for local integration tests", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-local-"));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
        registerPlugin: false,
    });

    assert.equal(existsSync(getGlobalPluginBridgeFilePath(homeDir)), false);
    assert.equal(existsSync(getGlobalPluginConfigFilePath(homeDir)), true);
});

test("installPlugin prints bridge, config, and log directories without mentioning OpenCode config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-success-"));
    const originalWrite = process.stdout.write.bind(process.stdout);
    let output = "";

    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
    }) as typeof process.stdout.write;

    try {
        await installPlugin({
            homeDir,
            botToken: "telegram-token",
        });
    } finally {
        process.stdout.write = originalWrite;
    }

    assert.match(output, /Success\.\n/u);
    assert.doesNotMatch(output, /OpenCode config:/u);
    assert.match(output, new RegExp(`Plugin bridge: ${escapeRegExp(getGlobalPluginBridgeFilePath(homeDir))}`));
    assert.match(output, new RegExp(`Plugin config: ${escapeRegExp(getGlobalPluginConfigFilePath(homeDir))}`));
    assert.match(output, new RegExp(`Plugin logs: ${escapeRegExp(getDefaultPluginLogDirectory(homeDir))}`));
});

test("installPlugin leaves existing OpenCode config files untouched", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-legacy-config-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        plugin: ["other-plugin", "opencode-tbot@0.1.0"],
    }, null, 2));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
    });

    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as { plugin: string[] },
        {
            plugin: ["other-plugin", "opencode-tbot@0.1.0"],
        },
    );
});

test("runCli defaults to install mode", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-default-"));

    const exitCode = await runCli([
        "--home-dir",
        homeDir,
        "--bot-token",
        "telegram-token",
        "--skip-register",
    ]);

    assert.equal(exitCode, 0);
    assert.equal(existsSync(getGlobalPluginConfigFilePath(homeDir)), true);
});

test("runCli prints the package version for --version", async () => {
    let output = "";
    const originalWrite = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
    }) as typeof process.stdout.write;

    try {
        const exitCode = await runCli(["--version"]);

        assert.equal(exitCode, 0);
        assert.equal(output, `${OPENCODE_TBOT_VERSION}\n`);
    } finally {
        process.stdout.write = originalWrite;
    }
});

test("runCli update refreshes the global plugin bridge without modifying OpenCode config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-update-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        plugin: ["other-plugin", "opencode-tbot@0.1.0"],
    }, null, 2));

    const exitCode = await runCli([
        "update",
        "--home-dir",
        homeDir,
    ]);

    assert.equal(exitCode, 0);
    assert.equal(existsSync(getGlobalPluginBridgeFilePath(homeDir)), true);
    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as { plugin: string[] },
        {
            plugin: ["other-plugin", "opencode-tbot@0.1.0"],
        },
    );
});

test("runCli update prints bridge, config, and log directories without mentioning OpenCode config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-update-output-"));
    const originalWrite = process.stdout.write.bind(process.stdout);
    let output = "";

    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
    }) as typeof process.stdout.write;

    try {
        const exitCode = await runCli([
            "update",
            "--home-dir",
            homeDir,
        ]);

        assert.equal(exitCode, 0);
    } finally {
        process.stdout.write = originalWrite;
    }

    assert.match(output, /Success\.\n/u);
    assert.doesNotMatch(output, /OpenCode config:/u);
    assert.match(output, new RegExp(`Plugin bridge: ${escapeRegExp(getGlobalPluginBridgeFilePath(homeDir))}`));
    assert.match(output, new RegExp(`Plugin config: ${escapeRegExp(getGlobalPluginConfigFilePath(homeDir))}`));
    assert.match(output, new RegExp(`Plugin logs: ${escapeRegExp(getDefaultPluginLogDirectory(homeDir))}`));
});

test("createPromptSession masks secret input with stars and supports backspace", async () => {
    const input = new PassThrough() as PassThrough & NodeJS.ReadStream;
    const output = new PassThrough() as PassThrough & NodeJS.WriteStream;
    const rawModes: boolean[] = [];
    let rendered = "";

    input.isTTY = true;
    input.setRawMode = (mode: boolean) => {
        rawModes.push(mode);
        return input;
    };
    output.isTTY = true;
    output.on("data", (chunk: Buffer | string) => {
        rendered += chunk.toString();
    });

    const prompt = createPromptSession({
        input,
        output,
    });
    const secretPromise = prompt.askSecret("Telegram bot token: ");

    input.write("abc");
    input.write("\b");
    input.write("d\r");

    const secret = await secretPromise;

    assert.equal(secret, "abd");
    assert.deepEqual(rawModes, [true, false]);
    assert.match(rendered, /Telegram bot token: /u);
    assert.match(rendered, /\*\*\*/u);
    assert.match(rendered, /\u0008 \u0008/u);
    assert.doesNotMatch(rendered, /abd|abc/u);
});

test("createPromptSession aborts masked input on Ctrl+C", async () => {
    const input = new PassThrough() as PassThrough & NodeJS.ReadStream;
    const output = new PassThrough() as PassThrough & NodeJS.WriteStream;
    const rawModes: boolean[] = [];

    input.isTTY = true;
    input.setRawMode = (mode: boolean) => {
        rawModes.push(mode);
        return input;
    };
    output.isTTY = true;

    const prompt = createPromptSession({
        input,
        output,
    });
    const secretPromise = prompt.askSecret("OpenCode token: ");

    input.write("\u0003");

    await assert.rejects(secretPromise, /Prompt cancelled\./u);
    assert.deepEqual(rawModes, [true, false]);
});

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
