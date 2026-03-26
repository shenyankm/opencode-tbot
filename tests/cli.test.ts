import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPromptSession, installPlugin, runCli, uninstallPlugin } from "../src/cli.js";
import { OPENCODE_TBOT_VERSION } from "../src/app/package-info.js";
import {
    getGlobalPluginConfigFilePath,
    getOpenCodeConfigDirectory,
} from "../src/app/plugin-config.js";
import { getGlobalOpenCodeConfigFilePath } from "../src/app/opencode-paths.js";

function getLegacyOpenCodeConfigFilePath(homeDir: string): string {
    return getGlobalOpenCodeConfigFilePath(homeDir);
}

function runCliInSubprocess(argv: string[]) {
    const tsxCliPath = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
    const cliModuleUrl = new URL("../src/cli.ts", import.meta.url).href;
    const script = [
        "(async () => {",
        `  const { runCli } = await import(${JSON.stringify(cliModuleUrl)});`,
        `  const exitCode = await runCli(${JSON.stringify(argv)});`,
        "  process.exitCode = exitCode;",
        "})();",
    ].join("\n");

    return spawnSync(
        process.execPath,
        [tsxCliPath, "--eval", script],
        {
            cwd: process.cwd(),
            encoding: "utf8",
        },
    );
}

test("installPlugin writes the OpenCode config and runtime config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-"));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
        telegramApiRoot: "http://127.0.0.1:9000",
    });

    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);
    const openCodeConfig = JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as {
        $schema: string;
        plugin: string[];
    };
    const pluginConfig = JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
        telegram: { botToken: string; apiRoot: string };
    };

    assert.deepEqual(openCodeConfig, {
        $schema: "https://opencode.ai/config.json",
        plugin: ["opencode-tbot"],
    });
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

test("installPlugin merges existing OpenCode npm plugins and normalizes opencode-tbot", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-open-code-merge-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        model: "openai/gpt-5.4",
        plugin: ["other-plugin", "opencode-tbot@0.1.0"],
    }, null, 2));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
    });

    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as {
            $schema: string;
            model: string;
            plugin: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            model: "openai/gpt-5.4",
            plugin: ["other-plugin", "opencode-tbot"],
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
    ]);

    assert.equal(exitCode, 0);
    assert.deepEqual(
        JSON.parse(readFileSync(getLegacyOpenCodeConfigFilePath(homeDir), "utf8")) as {
            plugin: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            plugin: ["opencode-tbot"],
        },
    );
    assert.equal(
        (JSON.parse(readFileSync(getGlobalPluginConfigFilePath(homeDir), "utf8")) as {
            telegram: { botToken: string };
        }).telegram.botToken,
        "telegram-token",
    );
});

test("runCli returns success for --version", async () => {
    const exitCode = await runCli(["--version"]);

    assert.equal(exitCode, 0);
    assert.equal(OPENCODE_TBOT_VERSION.length > 0, true);
});

test("runCli install prints only a minimal success message", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-output-install-"));
    const result = runCliInSubprocess([
        "--home-dir",
        homeDir,
        "--bot-token",
        "telegram-token",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "Success.\n");
});

test("runCli update refreshes the OpenCode config without modifying plugin config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-update-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        plugin: ["other-plugin", "opencode-tbot@0.1.0"],
    }, null, 2));
    writeFileSync(pluginConfigPath, JSON.stringify({
        telegram: {
            botToken: "old-token",
        },
    }, null, 2));

    const exitCode = await runCli([
        "update",
        "--home-dir",
        homeDir,
    ]);

    assert.equal(exitCode, 0);
    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as { plugin: string[] },
        {
            $schema: "https://opencode.ai/config.json",
            plugin: ["other-plugin", "opencode-tbot"],
        },
    );
    assert.deepEqual(
        JSON.parse(readFileSync(pluginConfigPath, "utf8")) as { telegram: { botToken: string } },
        {
            telegram: {
                botToken: "old-token",
            },
        },
    );
});

test("runCli update rewrites the OpenCode config without changing the bot config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-update-output-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        plugin: ["other-plugin"],
    }, null, 2));
    writeFileSync(pluginConfigPath, JSON.stringify({
        telegram: {
            botToken: "old-token",
        },
    }, null, 2));

    const exitCode = await runCli([
        "update",
        "--home-dir",
        homeDir,
    ]);

    assert.equal(exitCode, 0);
    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as {
            $schema: string;
            plugin: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            plugin: ["other-plugin", "opencode-tbot"],
        },
    );
    assert.equal(
        (JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
            telegram: { botToken: string };
        }).telegram.botToken,
        "old-token",
    );
});

test("uninstallPlugin removes opencode-tbot from the OpenCode config and keeps plugin config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-uninstall-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        model: "openai/gpt-5.4",
        plugin: ["other-plugin", "opencode-tbot@0.1.0"],
    }, null, 2));
    writeFileSync(pluginConfigPath, JSON.stringify({
        telegram: {
            botToken: "old-token",
        },
    }, null, 2));

    await uninstallPlugin({
        homeDir,
    });

    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as {
            $schema: string;
            model: string;
            plugin: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            model: "openai/gpt-5.4",
            plugin: ["other-plugin"],
        },
    );
    assert.deepEqual(
        JSON.parse(readFileSync(pluginConfigPath, "utf8")) as { telegram: { botToken: string } },
        {
            telegram: {
                botToken: "old-token",
            },
        },
    );
});

test("runCli uninstall removes the sole plugin entry and preserves plugin config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-uninstall-run-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        plugin: ["opencode-tbot"],
    }, null, 2));
    writeFileSync(pluginConfigPath, JSON.stringify({
        telegram: {
            botToken: "old-token",
        },
    }, null, 2));

    const exitCode = await runCli([
        "uninstall",
        "--home-dir",
        homeDir,
    ]);

    assert.equal(exitCode, 0);
    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as { $schema: string },
        {
            $schema: "https://opencode.ai/config.json",
        },
    );
    assert.equal(
        (JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
            telegram: { botToken: string };
        }).telegram.botToken,
        "old-token",
    );
});

test("runCli uninstall prints only a minimal success message", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-output-uninstall-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        plugin: ["opencode-tbot"],
    }, null, 2));

    const result = runCliInSubprocess([
        "uninstall",
        "--home-dir",
        homeDir,
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "Success.\n");
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

    input.destroy();
    output.destroy();
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

    input.destroy();
    output.destroy();
});
