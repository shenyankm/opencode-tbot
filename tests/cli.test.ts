import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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

const TEST_TELEGRAM_BOT_TOKEN = "123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
type TelegramApiHandler = (
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
) => void;

function getLegacyOpenCodeConfigFilePath(homeDir: string): string {
    return getGlobalOpenCodeConfigFilePath(homeDir);
}

async function runCliInSubprocess(argv: string[]): Promise<{
    status: number | null;
    stderr: string;
    stdout: string;
}> {
    const tsxCliPath = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
    const cliModuleUrl = new URL("../src/cli.ts", import.meta.url).href;
    const script = [
        "(async () => {",
        `  const { runCli } = await import(${JSON.stringify(cliModuleUrl)});`,
        `  const exitCode = await runCli(${JSON.stringify(argv)});`,
        "  process.exitCode = exitCode;",
        "})();",
    ].join("\n");

    return await new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [tsxCliPath, "--eval", script],
            {
                cwd: process.cwd(),
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        let stdout = "";
        let stderr = "";

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (status) => {
            resolve({
                status,
                stderr,
                stdout,
            });
        });
    });
}

async function withTelegramApiServer(
    handler: TelegramApiHandler,
    run: (apiRoot: string) => Promise<void>,
): Promise<void> {
    const server = createServer(handler);
    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    if (!address || typeof address === "string") {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
        throw new Error("Failed to allocate a local Telegram API mock server.");
    }

    try {
        await run(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }
}

async function withSuccessfulTelegramApi(
    run: (apiRoot: string) => Promise<void>,
): Promise<void> {
    await withTelegramApiServer((request, response) => {
        if (request.url?.endsWith("/getMe")) {
            response.writeHead(200, {
                "content-type": "application/json",
            });
            response.end(JSON.stringify({
                ok: true,
                result: {
                    id: 42,
                    is_bot: true,
                    first_name: "OpenCode",
                    username: "opencode_tbot",
                    can_join_groups: true,
                    can_read_all_group_messages: false,
                    supports_inline_queries: false,
                },
            }));
            return;
        }

        response.writeHead(404, {
            "content-type": "application/json",
        });
        response.end(JSON.stringify({
            ok: false,
            error_code: 404,
            description: "Not Found",
        }));
    }, run);
}

async function getUnusedLocalApiRoot(): Promise<string> {
    const server = createServer((_request, response) => {
        response.writeHead(204);
        response.end();
    });
    await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();

    if (!address || typeof address === "string") {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
        throw new Error("Failed to allocate an unused local port.");
    }

    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });

    return `http://127.0.0.1:${address.port}`;
}

test("installPlugin writes the OpenCode config and runtime config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-"));

    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        await installPlugin({
            ownerId: "1",
            homeDir,
            botToken: TEST_TELEGRAM_BOT_TOKEN,
            telegramApiRoot,
        });
    });

    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);
    const openCodeConfig = JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as {
        $schema: string;
        plugins: string[];
    };
    const pluginConfig = JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
        telegram: { botToken: string; apiRoot: string };
    };

    assert.deepEqual(openCodeConfig, {
        $schema: "https://opencode.ai/config.json",
        plugins: ["opencode-tbot"],
    });
    assert.equal(pluginConfig.telegram.botToken, TEST_TELEGRAM_BOT_TOKEN);
    assert.match(pluginConfig.telegram.apiRoot, /^http:\/\/127\.0\.0\.1:\d+$/u);
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

    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        await installPlugin({
            ownerId: "1",
            homeDir,
            botToken: TEST_TELEGRAM_BOT_TOKEN,
            telegramApiRoot,
        });
        await installPlugin({
            ownerId: "1",
            homeDir,
            botToken: TEST_TELEGRAM_BOT_TOKEN,
            telegramApiRoot,
        });
    });

    const pluginConfig = JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
        state?: { path?: string };
        telegram?: { botToken?: string };
    };

    assert.equal(pluginConfig.state?.path, "./custom-state.json");
    assert.equal(pluginConfig.telegram?.botToken, TEST_TELEGRAM_BOT_TOKEN);
});

test("installPlugin tolerates UTF-8 BOM in existing OpenCode and plugin config files", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-bom-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(
        openCodeConfigPath,
        `\ufeff${JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            plugins: ["other-plugin"],
        }, null, 2)}\n`,
        "utf8",
    );
    writeFileSync(
        pluginConfigPath,
        `\ufeff${JSON.stringify({
            telegram: {
                botToken: "old-token",
            },
        }, null, 2)}\n`,
        "utf8",
    );

    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        await installPlugin({
            ownerId: "1",
            homeDir,
            botToken: TEST_TELEGRAM_BOT_TOKEN,
            telegramApiRoot,
        });
    });

    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as {
            $schema: string;
            plugins: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            plugins: ["other-plugin", "opencode-tbot"],
        },
    );
    assert.equal(
        (JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
            telegram: { botToken: string };
        }).telegram.botToken,
        TEST_TELEGRAM_BOT_TOKEN,
    );
});

test("installPlugin keeps existing OpenCode package-manager files untouched", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-preserve-host-files-"));
    const configDir = getOpenCodeConfigDirectory(homeDir);

    mkdirSync(join(configDir, "node_modules", "@opencode-ai", "plugin"), { recursive: true });
    writeFileSync(join(configDir, "package.json"), JSON.stringify({
        dependencies: {
            "@opencode-ai/plugin": "1.3.2",
        },
    }, null, 2));
    writeFileSync(join(configDir, "bun.lock"), "lockfile-version = 1\n");
    writeFileSync(join(configDir, ".gitignore"), "node_modules\n");

    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        await installPlugin({
            ownerId: "1",
            homeDir,
            botToken: TEST_TELEGRAM_BOT_TOKEN,
            telegramApiRoot,
        });
    });

    assert.equal(existsSync(join(configDir, "package.json")), true);
    assert.equal(existsSync(join(configDir, "bun.lock")), true);
    assert.equal(existsSync(join(configDir, "node_modules")), true);
    assert.equal(existsSync(getLegacyOpenCodeConfigFilePath(homeDir)), true);
});

test("installPlugin fails without writing config when Telegram rejects the token", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-invalid-token-"));

    await withTelegramApiServer((request, response) => {
        if (request.url?.endsWith("/getMe")) {
            response.writeHead(401, {
                "content-type": "application/json",
            });
            response.end(JSON.stringify({
                ok: false,
                error_code: 401,
                description: "Unauthorized",
            }));
            return;
        }

        response.writeHead(404, {
            "content-type": "application/json",
        });
        response.end(JSON.stringify({
            ok: false,
            error_code: 404,
            description: "Not Found",
        }));
    }, async (telegramApiRoot) => {
        await assert.rejects(
            installPlugin({
                homeDir,
                botToken: TEST_TELEGRAM_BOT_TOKEN,
                telegramApiRoot,
            }),
            /Telegram bot token is invalid or revoked/u,
        );
    });

    assert.equal(existsSync(getLegacyOpenCodeConfigFilePath(homeDir)), false);
    assert.equal(existsSync(getGlobalPluginConfigFilePath(homeDir)), false);
});

test("installPlugin fails without writing config when the Telegram API root is unreachable", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-api-root-unreachable-"));
    const telegramApiRoot = await getUnusedLocalApiRoot();

    await assert.rejects(
        installPlugin({
            homeDir,
            botToken: TEST_TELEGRAM_BOT_TOKEN,
            telegramApiRoot,
        }),
        /Unable to reach the Telegram Bot API/u,
    );

    assert.equal(existsSync(getLegacyOpenCodeConfigFilePath(homeDir)), false);
    assert.equal(existsSync(getGlobalPluginConfigFilePath(homeDir)), false);
});

test("installPlugin rejects conflicting local file plugins without modifying other files", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-local-plugin-conflict-"));
    const configDir = getOpenCodeConfigDirectory(homeDir);
    const pluginsDir = join(configDir, "plugins");

    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(join(pluginsDir, "opencode-tbot.ts"), "export default async () => ({})\n");

    await assert.rejects(
        installPlugin({
            homeDir,
            botToken: TEST_TELEGRAM_BOT_TOKEN,
            telegramApiRoot: "http://127.0.0.1:65535",
        }),
        /Detected a conflicting local OpenCode plugin file:/u,
    );
    assert.equal(existsSync(getLegacyOpenCodeConfigFilePath(homeDir)), false);
    assert.equal(existsSync(join(pluginsDir, "opencode-tbot.ts")), true);
});

test("installPlugin merges existing OpenCode npm plugins and normalizes opencode-tbot", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-open-code-merge-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        model: "openai/gpt-5.4",
        plugins: ["other-plugin", "opencode-tbot@0.1.0"],
    }, null, 2));

    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        await installPlugin({
            ownerId: "1",
            homeDir,
            botToken: TEST_TELEGRAM_BOT_TOKEN,
            telegramApiRoot,
        });
    });

    assert.deepEqual(
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as {
            $schema: string;
            model: string;
            plugins: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            model: "openai/gpt-5.4",
            plugins: ["other-plugin", "opencode-tbot"],
        },
    );
});

test("runCli defaults to install mode", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-default-"));

    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        const exitCode = await runCli([
            "--home-dir",
            homeDir,
            "--owner-id", "1",
            "--bot-token",
            TEST_TELEGRAM_BOT_TOKEN,
            "--telegram-api-root",
            telegramApiRoot,
        ]);

        assert.equal(exitCode, 0);
    });

    assert.deepEqual(
        JSON.parse(readFileSync(getLegacyOpenCodeConfigFilePath(homeDir), "utf8")) as {
            plugins: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            plugins: ["opencode-tbot"],
        },
    );
    assert.equal(
        (JSON.parse(readFileSync(getGlobalPluginConfigFilePath(homeDir), "utf8")) as {
            telegram: { botToken: string };
        }).telegram.botToken,
        TEST_TELEGRAM_BOT_TOKEN,
    );
});

test("runCli install prints only a minimal success message", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-output-install-"));

    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        const result = await runCliInSubprocess([
            "--home-dir",
            homeDir,
            "--owner-id", "1",
            "--bot-token",
            TEST_TELEGRAM_BOT_TOKEN,
            "--telegram-api-root",
            telegramApiRoot,
        ]);

        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "Authorized chats: 1\nSuccess.\n");
    });
});

test("runCli returns success for --version", async () => {
    const exitCode = await runCli(["--version"]);

    assert.equal(exitCode, 0);
    assert.equal(OPENCODE_TBOT_VERSION.length > 0, true);
});

test("runCli update refreshes the OpenCode config without modifying plugin config", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-update-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);
    const pluginConfigPath = getGlobalPluginConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        plugins: ["other-plugin", "opencode-tbot@0.1.0"],
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
        JSON.parse(readFileSync(openCodeConfigPath, "utf8")) as { plugins: string[] },
        {
            $schema: "https://opencode.ai/config.json",
            plugins: ["other-plugin", "opencode-tbot"],
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
        plugins: ["other-plugin"],
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
            plugins: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            plugins: ["other-plugin", "opencode-tbot"],
        },
    );
    assert.equal(
        (JSON.parse(readFileSync(pluginConfigPath, "utf8")) as {
            telegram: { botToken: string };
        }).telegram.botToken,
        "old-token",
    );
});

test("runCli update migrates legacy plugin entries and preserves V2 options without duplicates", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-v2-migrate-"));
    const openCodeConfigPath = getGlobalOpenCodeConfigFilePath(homeDir);
    const botOptions = { tokens: { showBreakdown: true } };

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        model: "openai/gpt-5.4",
        plugin: [
            " other-plugin ",
            ["./plugin/local.ts", { enabled: true }],
            "opencode-tbot@0.1.0",
            "@scope/another-plugin@1.0.0",
        ],
        plugins: [
            { package: "other-plugin", options: { strict: true } },
            { package: "opencode-tbot@0.2.0", options: botOptions },
            "other-plugin",
            { package: "opencode-tbot", options: botOptions },
        ],
    }, null, 2));

    await runCli(["update", "--home-dir", homeDir]);
    const updated = readFileSync(openCodeConfigPath, "utf8");

    assert.deepEqual(JSON.parse(updated), {
        $schema: "https://opencode.ai/config.json",
        model: "openai/gpt-5.4",
        plugins: [
            { package: "other-plugin", options: { strict: true } },
            { package: "./plugin/local.ts", options: { enabled: true } },
            "@scope/another-plugin@1.0.0",
            { package: "opencode-tbot", options: botOptions },
        ],
    });

    await runCli(["update", "--home-dir", homeDir]);
    assert.equal(readFileSync(openCodeConfigPath, "utf8"), updated);
});

test("runCli update rejects conflicting plugin options without rewriting the config", async () => {
    for (const packageName of ["other-plugin", "opencode-tbot"]) {
        const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-v2-conflict-"));
        const openCodeConfigPath = getGlobalOpenCodeConfigFilePath(homeDir);
        const original = JSON.stringify({
            plugin: [[packageName, { enabled: true }]],
            plugins: [{ package: packageName, options: { enabled: false } }],
        }, null, 2);

        mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
        writeFileSync(openCodeConfigPath, original);

        await assert.rejects(
            runCli(["update", "--home-dir", homeDir]),
            /Conflicting OpenCode plugin options/u,
        );
        assert.equal(readFileSync(openCodeConfigPath, "utf8"), original);
    }
});

test("runCli update rejects invalid plugin registrations without rewriting the config", async () => {
    const invalidConfigs = [
        { plugin: {} },
        { plugins: {} },
        { plugins: [42] },
        { plugins: [["local-plugin", {}]] },
        { plugins: [{ package: " " }] },
        { plugins: [{ package: "local-plugin", options: null }] },
        { plugins: [{ package: "local-plugin", options: "invalid" }] },
        { plugin: [["local-plugin", {}, "extra"]] },
    ];

    for (const config of invalidConfigs) {
        const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-v2-invalid-"));
        const openCodeConfigPath = getGlobalOpenCodeConfigFilePath(homeDir);
        const original = JSON.stringify(config, null, 2);

        mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
        writeFileSync(openCodeConfigPath, original);

        await assert.rejects(
            runCli(["update", "--home-dir", homeDir]),
            /OpenCode config plugins?/u,
        );
        assert.equal(readFileSync(openCodeConfigPath, "utf8"), original);
    }
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
        plugins: ["other-plugin", "opencode-tbot@0.1.0"],
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
            plugins: string[];
        },
        {
            $schema: "https://opencode.ai/config.json",
            model: "openai/gpt-5.4",
            plugins: ["other-plugin"],
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
        plugins: ["opencode-tbot"],
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

test("uninstallPlugin removes legacy and V2 bot registrations while migrating other plugin options", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-v2-uninstall-"));
    const openCodeConfigPath = getGlobalOpenCodeConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        model: "openai/gpt-5.4",
        plugin: [
            "opencode-tbot@0.1.0",
            ["opencode-tbot", { tokens: { showBreakdown: true } }],
            ["./local-plugin.ts", { enabled: true }],
        ],
        plugins: [
            "other-plugin",
            { package: "opencode-tbot@0.2.0", options: { tokens: { showBreakdown: false } } },
        ],
    }, null, 2));

    await uninstallPlugin({ homeDir });

    assert.deepEqual(JSON.parse(readFileSync(openCodeConfigPath, "utf8")), {
        model: "openai/gpt-5.4",
        plugins: [
            { package: "./local-plugin.ts", options: { enabled: true } },
            "other-plugin",
        ],
    });
});

test("runCli uninstall prints only a minimal success message", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-cli-output-uninstall-"));
    const openCodeConfigPath = getLegacyOpenCodeConfigFilePath(homeDir);

    mkdirSync(getOpenCodeConfigDirectory(homeDir), { recursive: true });
    writeFileSync(openCodeConfigPath, JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        plugins: ["opencode-tbot"],
    }, null, 2));

    const result = await runCliInSubprocess([
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

test("installPlugin rejects a missing owner before writing an unconfigured installation", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-owner-"));
    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        await assert.rejects(installPlugin({ homeDir, botToken: TEST_TELEGRAM_BOT_TOKEN, telegramApiRoot }), /owner Telegram user ID/u);
    });
    assert.equal(existsSync(getGlobalPluginConfigFilePath(homeDir)), false);
    assert.equal(existsSync(getGlobalOpenCodeConfigFilePath(homeDir)), false);
});

test("installPlugin preserves existing authorized chats when no replacement owner is supplied", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-owner-preserve-"));
    const path = getGlobalPluginConfigFilePath(homeDir);
    mkdirSync(getOpenCodeConfigDirectory(homeDir) + "/opencode-tbot", { recursive: true });
    writeFileSync(path, JSON.stringify({ telegram: { botToken: "old", allowedChatIds: [101, -202] } }));
    await withSuccessfulTelegramApi(async (telegramApiRoot) => {
        await installPlugin({ homeDir, botToken: TEST_TELEGRAM_BOT_TOKEN, telegramApiRoot });
    });
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")).telegram.allowedChatIds, [101, -202]);
});

test("update repairs legacy token-file permissions while retaining configuration", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-upgrade-mode-"));
    const path = getGlobalPluginConfigFilePath(homeDir);
    mkdirSync(getOpenCodeConfigDirectory(homeDir) + "/opencode-tbot", { recursive: true });
    const previous = { telegram: { botToken: TEST_TELEGRAM_BOT_TOKEN, allowedChatIds: [101] }, custom: true };
    writeFileSync(path, JSON.stringify(previous));
    chmodSync(path, 0o644);
    assert.equal(await runCli(["update", "--home-dir", homeDir]), 0);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), previous);
    if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600);
});
