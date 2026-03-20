import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createPromptSession, installPlugin, runCli } from "../src/cli.js";
import { OPENCODE_TBOT_VERSION } from "../src/app/package-info.js";
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

test("installPlugin prints a single success line on normal completion", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-success-"));
    const originalCwd = process.cwd();
    const originalWrite = process.stdout.write.bind(process.stdout);
    let output = "";

    process.chdir(homeDir);
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
    }) as typeof process.stdout.write;

    try {
        await installPlugin({
            homeDir,
            botToken: "telegram-token",
            enableVoice: false,
        });
    } finally {
        process.chdir(originalCwd);
        process.stdout.write = originalWrite;
    }

    assert.match(output, /Success\.\n/u);
    assert.doesNotMatch(output, /Registered .* in /u);
    assert.doesNotMatch(output, /Wrote plugin defaults to /u);
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

test("updatePlugin replaces stale opencode-tbot plugin specs and keeps unrelated plugins", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-update-"));
    const openCodeConfigPath = getOpenCodeConfigFilePath(homeDir);

    mkdirSync(join(homeDir, ".config", "opencode"), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        plugin: [
            "other-plugin",
            "opencode-tbot@0.1.0",
            "opencode-tbot",
        ],
    }, null, 2));

    const exitCode = await runCli([
        "update",
        "--home-dir",
        homeDir,
        "--plugin-spec",
        "opencode-tbot@latest",
    ]);

    assert.equal(exitCode, 0);
    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as { plugin: string[] },
        {
            plugin: [
                "other-plugin",
                "opencode-tbot@latest",
            ],
        },
    );
});

test("runCli update prints a single success line on normal completion", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-update-output-"));
    const openCodeConfigPath = getOpenCodeConfigFilePath(homeDir);
    const originalCwd = process.cwd();
    const originalWrite = process.stdout.write.bind(process.stdout);
    let output = "";

    mkdirSync(join(homeDir, ".config", "opencode"), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        plugin: ["opencode-tbot@0.1.0"],
    }, null, 2));
    process.chdir(homeDir);
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
        process.chdir(originalCwd);
        process.stdout.write = originalWrite;
    }

    assert.match(output, /Success\.\n/u);
    assert.doesNotMatch(output, /Updated plugin registration to /u);
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
    const secretPromise = prompt.askSecret("OpenRouter API key: ");

    input.write("\u0003");

    await assert.rejects(secretPromise, /Prompt cancelled\./u);
    assert.deepEqual(rawModes, [true, false]);
});

test("installPlugin warns when a legacy local npm install can affect the plugin display name", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-legacy-"));
    const legacyPackageDir = join(homeDir, "node_modules", "opencode-tbot");
    let output = "";
    const originalCwd = process.cwd();
    const originalWrite = process.stdout.write.bind(process.stdout);

    mkdirSync(legacyPackageDir, { recursive: true });
    writeFileSync(join(legacyPackageDir, "package.json"), JSON.stringify({ name: "opencode-tbot" }));
    process.chdir(homeDir);
    process.stdout.write = ((chunk: string | Uint8Array) => {
        output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
    }) as typeof process.stdout.write;

    try {
        await installPlugin({
            homeDir,
            botToken: "telegram-token",
            enableVoice: false,
        });
    } finally {
        process.chdir(originalCwd);
        process.stdout.write = originalWrite;
    }

    assert.match(output, /Detected local opencode-tbot npm installation\(s\)/u);
    assert.match(output, /npm uninstall opencode-tbot/u);
    assert.match(output, /npm exec --package opencode-tbot@latest opencode-tbot -- install/u);
});
