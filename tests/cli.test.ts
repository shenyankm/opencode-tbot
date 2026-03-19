import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installPlugin, runCli } from "../src/cli.js";
import { getGlobalPluginConfigFilePath, getOpenCodeConfigFilePath } from "../src/app/plugin-config.js";

test("installPlugin registers the npm plugin and writes the global runtime config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-"));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
        enableVoice: false,
        telegramApiRoot: "http://127.0.0.1:9000",
    });

    const openCodeConfigPath = getOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);
    const openCodeConfig = JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as { plugin: string[] };
    const pluginConfig = JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
        telegram: { botToken: string; apiRoot: string };
        openrouter?: { apiKey?: string };
    };

    assert.deepEqual(openCodeConfig.plugin, ["opencode-tbot@latest"]);
    assert.equal(pluginConfig.telegram.botToken, "telegram-token");
    assert.equal(pluginConfig.telegram.apiRoot, "http://127.0.0.1:9000");
    assert.equal(pluginConfig.openrouter?.apiKey, undefined);
});

test("installPlugin is idempotent and stores the OpenRouter key when voice is enabled", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-voice-"));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
        enableVoice: true,
        openrouterApiKey: "openrouter-key",
    });
    await installPlugin({
        homeDir,
        botToken: "telegram-token",
        enableVoice: true,
        openrouterApiKey: "openrouter-key",
    });

    const openCodeConfig = JSON.parse(readFileSync(getOpenCodeConfigFilePath(homeDir), "utf8")) as { plugin: string[] };
    const pluginConfig = JSON.parse(readFileSync(getGlobalPluginConfigFilePath(homeDir), "utf8")) as {
        openrouter: { apiKey: string };
    };

    assert.deepEqual(openCodeConfig.plugin, ["opencode-tbot@latest"]);
    assert.equal(pluginConfig.openrouter.apiKey, "openrouter-key");
});

test("installPlugin can skip plugin registration for local integration tests", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-local-"));

    await installPlugin({
        homeDir,
        botToken: "telegram-token",
        enableVoice: false,
        registerPlugin: false,
    });

    assert.equal(existsSync(getOpenCodeConfigFilePath(homeDir)), false);
    assert.equal(existsSync(getGlobalPluginConfigFilePath(homeDir)), true);
});

test("runCli defaults to install mode", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-default-"));

    const exitCode = await runCli([
        "--home-dir",
        homeDir,
        "--bot-token",
        "telegram-token",
        "--disable-voice",
        "--skip-register",
    ]);

    assert.equal(exitCode, 0);
    assert.equal(existsSync(getGlobalPluginConfigFilePath(homeDir)), true);
});
