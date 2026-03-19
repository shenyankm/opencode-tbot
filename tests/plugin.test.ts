import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import type { AppContainer } from "../src/app/container.js";
import {
    DEFAULT_OPENROUTER_MODEL,
    loadAppConfig,
    type AppConfig,
    type PluginConfigSource,
} from "../src/app/config.js";
import {
    mergePluginConfigSources,
    PLUGIN_CONFIG_FILE_NAME,
    preparePluginConfiguration,
    serializePluginConfig,
} from "../src/app/plugin-config.js";
import {
    ensureTelegramBotPluginRuntime,
    resetTelegramBotPluginRuntimeForTests,
} from "../src/plugin.js";
import type { OpenCodeSdkClientLike } from "../src/services/opencode/opencode.client.js";

function createConfig(overrides: PluginConfigSource = {}): PluginConfigSource {
    return mergePluginConfigSources({
        telegram: {
            botToken: "telegram-token",
        },
        state: {
            path: "./data/opencode-tbot.state.json",
        },
        logLevel: "info",
    }, overrides);
}

function createSdkClientStub(): OpenCodeSdkClientLike {
    return {
        app: {
            agents: async () => [],
        },
        config: {
            get: async () => ({ provider: {} }),
            providers: async () => ({ providers: [], default: {} }),
        },
        global: {
            health: async () => ({ healthy: true, version: "1.0.0" }),
        },
        lsp: {
            status: async () => [],
        },
        mcp: {
            status: async () => ({}),
        },
        path: {
            get: async () => ({
                home: "E:/Users/demo",
                state: "E:/Users/demo/.opencode",
                config: "E:/repo/opencode.json",
                worktree: "E:/repo",
                directory: "E:/repo",
            }),
        },
        project: {
            current: async () => ({
                id: "project-1",
                worktree: "E:/repo",
                time: { created: 1, updated: 1 },
                sandboxes: [],
            }),
            list: async () => [],
        },
        session: {
            abort: async () => false,
            create: async () => ({
                id: "session-1",
                slug: "session-1",
                projectID: "project-1",
                directory: "E:/repo",
                title: "Session",
                version: "1",
                time: { created: 1, updated: 1 },
            }),
            list: async () => [],
            prompt: async () => ({
                info: {} as never,
                parts: [],
            }),
            status: async () => ({}),
            update: async () => ({
                id: "session-1",
                slug: "session-1",
                projectID: "project-1",
                directory: "E:/repo",
                title: "Session",
                version: "1",
                time: { created: 1, updated: 1 },
            }),
        },
    } as never;
}

function createContainerStub(cwd = "E:/workspace") {
    const calls = {
        dispose: 0,
    };
    const container = {
        __cwd: cwd,
        logger: {
            error() { },
            info() { },
            warn() { },
        },
        dispose() {
            calls.dispose += 1;
        },
    } as AppContainer & { __cwd: string };

    return { calls, container };
}

test("loadAppConfig resolves plugin configuration from the config file shape", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-app-config-"));
    const config = loadAppConfig(createConfig(), { cwd });

    assert.equal(config.telegramBotToken, "telegram-token");
    assert.equal(config.telegramApiRoot, "https://api.telegram.org");
    assert.equal(config.stateFilePath, join(cwd, "data/opencode-tbot.state.json"));
    assert.equal(config.openrouter.configured, false);
    assert.equal(config.openrouter.model, DEFAULT_OPENROUTER_MODEL);
});

test("loadAppConfig enables OpenRouter voice transcription when apiKey is configured", () => {
    const config = loadAppConfig(createConfig({
        openrouter: {
            apiKey: "openrouter-key",
        },
    }));

    assert.equal(config.openrouter.configured, true);
    assert.equal(config.openrouter.apiKey, "openrouter-key");
    assert.equal(config.openrouter.model, DEFAULT_OPENROUTER_MODEL);
});

test("preparePluginConfiguration loads telegram.botToken from cwd config file", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-plugin-config-"));
    writeFileSync(
        join(cwd, PLUGIN_CONFIG_FILE_NAME),
        serializePluginConfig({
            telegram: {
                botToken: "file-token",
            },
            logLevel: "debug",
        }),
        "utf8",
    );

    const prepared = await preparePluginConfiguration({
        cwd,
    });

    assert.equal(prepared.config.telegram?.botToken, "file-token");
    assert.equal(prepared.config.logLevel, "debug");
});

test("preparePluginConfiguration merges global defaults with project overrides", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-plugin-merge-"));
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-home-"));
    const globalConfigFilePath = join(homeDir, ".config", "opencode", "opencode-tbot", "config.json");

    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(
        globalConfigFilePath,
        serializePluginConfig({
            telegram: {
                botToken: "global-token",
            },
            state: {
                path: "./global-state.json",
            },
            logLevel: "debug",
        }),
        "utf8",
    );
    writeFileSync(
        join(cwd, PLUGIN_CONFIG_FILE_NAME),
        serializePluginConfig({
            state: {
                path: "./project-state.json",
            },
            openrouter: {
                model: "openai/gpt-audio-mini",
            },
        }),
        "utf8",
    );

    const prepared = await preparePluginConfiguration({
        cwd,
        homeDir,
    });

    assert.equal(prepared.config.telegram?.botToken, "global-token");
    assert.equal(prepared.config.logLevel, "debug");
    assert.equal(prepared.config.state?.path, "./project-state.json");
    assert.equal(prepared.config.openrouter?.model, "openai/gpt-audio-mini");
    assert.equal(prepared.globalConfigFilePath, globalConfigFilePath);
});

test("preparePluginConfiguration keeps missing tokens unresolved for the installer flow", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-plugin-no-tty-"));
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-home-empty-"));
    const prepared = await preparePluginConfiguration({
        cwd,
        homeDir,
        config: {
            logLevel: "info",
        },
    });

    assert.equal(prepared.config.telegram?.botToken, undefined);
    assert.equal(prepared.config.logLevel, "info");
});

test("ensureTelegramBotPluginRuntime starts the Telegram runtime only once per worktree", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        const starts: Array<{ cwd: string; token: string }> = [];
        const sdkClient = createSdkClientStub();
        const configSource = createConfig();
        const bootstrapApp = (
            client: OpenCodeSdkClientLike,
            runtimeConfig: PluginConfigSource | undefined,
            options: { cwd?: string } = {},
        ) => {
            assert.equal(client, sdkClient);
            assert.equal(options.cwd, "E:/workspace");
            const { container } = createContainerStub(options.cwd);

            return {
                config: loadAppConfig(runtimeConfig, options),
                container,
            };
        };
        const startRuntime = async (input: { config: AppConfig; container: AppContainer }) => {
            starts.push({
                cwd: (input.container as AppContainer & { __cwd: string }).__cwd,
                token: input.config.telegramBotToken,
            });

            return {
                bot: {} as never,
                container: input.container,
                stop() { },
                dispose() {
                    input.container.dispose();
                },
            };
        };

        const first = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                worktree: "E:/workspace",
            },
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => ({
                cwd,
                config: config ?? configSource,
                configFilePath: join(cwd, PLUGIN_CONFIG_FILE_NAME),
            }),
            startRuntime,
        });
        const second = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                worktree: "E:/workspace",
            },
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => ({
                cwd,
                config: config ?? configSource,
                configFilePath: join(cwd, PLUGIN_CONFIG_FILE_NAME),
            }),
            startRuntime,
        });

        assert.equal(first, second);
        assert.deepEqual(starts, [{
            cwd: "E:/workspace",
            token: "telegram-token",
        }]);
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});

test("ensureTelegramBotPluginRuntime clears the singleton and disposes the container when startup fails", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        const sdkClient = createSdkClientStub();
        const configSource = createConfig();
        const containerCalls: Array<{ dispose: number }> = [];
        const bootstrapApp = (
            _client: OpenCodeSdkClientLike,
            runtimeConfig: PluginConfigSource | undefined,
            options: { cwd?: string } = {},
        ) => {
            const { calls, container } = createContainerStub(options.cwd);
            containerCalls.push(calls);

            return {
                config: loadAppConfig(runtimeConfig, options),
                container,
            };
        };
        let attempts = 0;

        await assert.rejects(
            ensureTelegramBotPluginRuntime({
                context: {
                    client: sdkClient,
                    directory: "E:/workspace",
                },
                config: configSource,
                bootstrapApp,
                prepareConfiguration: async ({ cwd, config }) => ({
                    cwd,
                    config: config ?? configSource,
                    configFilePath: join(cwd, PLUGIN_CONFIG_FILE_NAME),
                }),
                startRuntime: async () => {
                    attempts += 1;
                    throw new Error("startup failed");
                },
            }),
            /startup failed/,
        );

        const runtime = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                directory: "E:/workspace",
            },
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => ({
                cwd,
                config: config ?? configSource,
                configFilePath: join(cwd, PLUGIN_CONFIG_FILE_NAME),
            }),
            startRuntime: async (input) => {
                attempts += 1;

                return {
                    bot: {} as never,
                    container: input.container,
                    stop() { },
                    dispose() {
                        input.container.dispose();
                    },
                };
            },
        });

        assert.ok(runtime);
        assert.equal(attempts, 2);
        assert.equal(containerCalls[0]?.dispose, 1);
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});

test("ensureTelegramBotPluginRuntime rebuilds the runtime when the worktree changes", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        const sdkClient = createSdkClientStub();
        const configSource = createConfig();
        const runtimeRecords = new Map<string, { dispose: number; stop: number }>();
        const containerRecords = new Map<string, { dispose: number }>();
        const bootstrapApp = (
            _client: OpenCodeSdkClientLike,
            runtimeConfig: PluginConfigSource | undefined,
            options: { cwd?: string } = {},
        ) => {
            const cwd = String(options.cwd);
            const { calls, container } = createContainerStub(cwd);
            containerRecords.set(cwd, calls);

            return {
                config: loadAppConfig(runtimeConfig, options),
                container,
            };
        };
        const startRuntime = async (input: { config: AppConfig; container: AppContainer }) => {
            const cwd = (input.container as AppContainer & { __cwd: string }).__cwd;
            const record = { dispose: 0, stop: 0 };
            runtimeRecords.set(cwd, record);

            return {
                bot: {} as never,
                container: input.container,
                stop() {
                    record.stop += 1;
                },
                dispose() {
                    record.dispose += 1;
                    record.stop += 1;
                    input.container.dispose();
                },
            };
        };

        const first = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                worktree: "E:/workspace-a",
            },
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => ({
                cwd,
                config: config ?? configSource,
                configFilePath: join(cwd, PLUGIN_CONFIG_FILE_NAME),
            }),
            startRuntime,
        });
        const second = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                worktree: "E:/workspace-b",
            },
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => ({
                cwd,
                config: config ?? configSource,
                configFilePath: join(cwd, PLUGIN_CONFIG_FILE_NAME),
            }),
            startRuntime,
        });

        assert.notEqual(first, second);
        assert.equal(runtimeRecords.get("E:/workspace-a")?.dispose, 1);
        assert.equal(containerRecords.get("E:/workspace-a")?.dispose, 1);
        assert.equal(runtimeRecords.get("E:/workspace-b")?.dispose, 0);
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});

test("resetTelegramBotPluginRuntimeForTests disposes the active runtime", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    const sdkClient = createSdkClientStub();
    const configSource = createConfig();
    const runtimeCalls = {
        dispose: 0,
    };

    await ensureTelegramBotPluginRuntime({
        context: {
            client: sdkClient,
            worktree: "E:/workspace",
        },
        config: configSource,
        bootstrapApp: (
            _client: OpenCodeSdkClientLike,
            runtimeConfig: PluginConfigSource | undefined,
            options: { cwd?: string } = {},
        ) => ({
            config: loadAppConfig(runtimeConfig, options),
            container: createContainerStub(String(options.cwd)).container,
        }),
        prepareConfiguration: async ({ cwd, config }) => ({
            cwd,
            config: config ?? configSource,
            configFilePath: join(cwd, PLUGIN_CONFIG_FILE_NAME),
        }),
        startRuntime: async (input) => ({
            bot: {} as never,
            container: input.container,
            stop() { },
            dispose() {
                runtimeCalls.dispose += 1;
                input.container.dispose();
            },
        }),
    });

    await resetTelegramBotPluginRuntimeForTests();

    assert.equal(runtimeCalls.dispose, 1);
});
