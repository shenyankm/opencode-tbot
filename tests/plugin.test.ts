import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import type { AppContainer } from "../src/app/container.js";
import {
    loadAppConfig,
    type AppConfig,
    type PluginConfigSource,
} from "../src/app/config.js";
import {
    mergePluginConfigSources,
    preparePluginConfiguration,
    serializePluginConfig,
    type PreparedPluginConfiguration,
} from "../src/app/plugin-config.js";
import {
    ensureTelegramBotPluginRuntime,
    resetTelegramBotPluginRuntimeForTests,
} from "../src/plugin.js";
import { getDefaultPluginLogDirectory } from "../src/app/opencode-paths.js";
import type { OpenCodeSdkClientLike } from "../src/services/opencode/opencode.client.js";

function createConfig(overrides: PluginConfigSource = {}): PluginConfigSource {
    return mergePluginConfigSources({
        telegram: {
            botToken: "telegram-token",
        },
        state: {
            path: "./data/opencode-tbot.state.json",
        },
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
        info: [] as Array<{ input: unknown; message: string | undefined }>,
        warn: [] as Array<{ input: unknown; message: string | undefined }>,
    };
    const container = {
        __cwd: cwd,
        logger: {
            child() {
                return this;
            },
            error() { },
            async flush() { },
            info(input?: unknown, message?: string) {
                calls.info.push({ input, message });
            },
            warn(input?: unknown, message?: string) {
                calls.warn.push({ input, message });
            },
        },
        async dispose() {
            calls.dispose += 1;
        },
    } as unknown as AppContainer & { __cwd: string };

    return { calls, container };
}

type ContainerStubCalls = ReturnType<typeof createContainerStub>["calls"];

function createPreparedConfiguration(
    cwd: string,
    config: PluginConfigSource | undefined,
    fallbackConfig: PluginConfigSource,
    overrides: Partial<PreparedPluginConfiguration> = {},
): PreparedPluginConfiguration {
    const configFilePath = join("E:/Users/demo", ".config", "opencode", "opencode-tbot", "config.json");

    return {
        cwd,
        config: config ?? fallbackConfig,
        configFilePath,
        ...overrides,
    };
}

test("loadAppConfig resolves plugin configuration from the config file shape", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-app-config-"));
    const config = loadAppConfig(createConfig(), { cwd });

    assert.equal(config.telegramBotToken, "telegram-token");
    assert.equal(config.telegramApiRoot, "https://api.telegram.org");
    assert.equal(config.stateFilePath, join(cwd, "data/opencode-tbot.state.json"));
});

test("loadAppConfig applies prompt timeout defaults and overrides", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-prompt-config-"));
    const config = loadAppConfig(createConfig({
        prompt: {
            waitTimeoutMs: 90_000,
        },
    }), { cwd });

    assert.equal(config.promptWaitTimeoutMs, 90_000);
    assert.equal(config.promptPollRequestTimeoutMs, 15_000);
    assert.equal(config.promptRecoveryInactivityTimeoutMs, 120_000);
});

test("loadAppConfig maps the structured logging section", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-logging-config-"));
    const config = loadAppConfig(createConfig({
        logging: {
            level: "debug",
            file: {
                retention: {
                    maxFiles: 7,
                    maxTotalBytes: 2048,
                },
            },
            sinks: {
                file: false,
                host: true,
            },
        },
    }), { cwd });

    assert.equal(config.loggingLevel, "debug");
    assert.equal(config.loggingHostSinkEnabled, true);
    assert.equal(config.loggingFileSinkEnabled, false);
    assert.equal(config.loggingRetentionMaxFiles, 7);
    assert.equal(config.loggingRetentionMaxTotalBytes, 2048);
    assert.equal(config.loggingFileDir, getDefaultPluginLogDirectory());
});

test("mergePluginConfigSources merges prompt configuration by key", () => {
    const merged = mergePluginConfigSources(
        {
            prompt: {
                waitTimeoutMs: 10,
                pollRequestTimeoutMs: 20,
            },
        },
        {
            prompt: {
                recoveryInactivityTimeoutMs: 30,
            },
        },
    );

    assert.deepEqual(merged.prompt, {
        waitTimeoutMs: 10,
        pollRequestTimeoutMs: 20,
        recoveryInactivityTimeoutMs: 30,
    });
});

test("mergePluginConfigSources merges logging configuration by key", () => {
    const merged = mergePluginConfigSources(
        {
            logging: {
                level: "warn",
                sinks: {
                    host: false,
                },
            },
        },
        {
            logging: {
                file: {
                    retention: {
                        maxFiles: 5,
                    },
                },
                sinks: {
                    file: true,
                },
            },
        },
    );

    assert.deepEqual(merged.logging, {
        level: "warn",
        sinks: {
            host: false,
            file: true,
        },
        file: {
            retention: {
                maxFiles: 5,
            },
        },
    });
});

test("preparePluginConfiguration loads telegram.botToken from the global config file", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-plugin-config-"));
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-home-config-"));
    const configFilePath = join(homeDir, ".config", "opencode", "opencode-tbot", "config.json");

    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(
        configFilePath,
        serializePluginConfig({
            telegram: {
                botToken: "global-token",
            },
            logging: {
                level: "debug",
            },
        }),
        "utf8",
    );

    const prepared = await preparePluginConfiguration({
        cwd,
        homeDir,
    });

    assert.equal(prepared.config.telegram?.botToken, "global-token");
    assert.equal(prepared.config.logging?.level, "debug");
    assert.equal(prepared.configFilePath, configFilePath);
});

test("preparePluginConfiguration accepts a global config file with a UTF-8 BOM", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-plugin-bom-"));
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-home-bom-"));
    const configFilePath = join(homeDir, ".config", "opencode", "opencode-tbot", "config.json");

    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(
        configFilePath,
        `\ufeff${serializePluginConfig({
            telegram: {
                botToken: "global-token",
            },
        })}`,
        "utf8",
    );

    const prepared = await preparePluginConfiguration({
        cwd,
        homeDir,
    });

    assert.equal(prepared.config.telegram?.botToken, "global-token");
    assert.equal(prepared.configFilePath, configFilePath);
});

test("preparePluginConfiguration merges explicit overrides on top of the global config file", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-plugin-merge-"));
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-home-"));
    const configFilePath = join(homeDir, ".config", "opencode", "opencode-tbot", "config.json");

    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(
        configFilePath,
        serializePluginConfig({
            telegram: {
                botToken: "global-token",
            },
            state: {
                path: "./global-state.json",
            },
            logging: {
                level: "debug",
            },
        }),
        "utf8",
    );

    const prepared = await preparePluginConfiguration({
        cwd,
        homeDir,
        config: {
            state: {
                path: "./override-state.json",
            },
            logging: {
                sinks: {
                    file: false,
                },
            },
        },
    });

    assert.equal(prepared.config.telegram?.botToken, "global-token");
    assert.equal(prepared.config.logging?.level, "debug");
    assert.equal(prepared.config.logging?.sinks?.file, false);
    assert.equal(prepared.config.state?.path, "./override-state.json");
    assert.equal(prepared.configFilePath, configFilePath);
});

test("preparePluginConfiguration keeps missing tokens unresolved for the installer flow", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-plugin-no-tty-"));
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-home-empty-"));

    const prepared = await preparePluginConfiguration({
        cwd,
        homeDir,
        config: {
            logging: {
                level: "info",
            },
        },
    });

    assert.equal(prepared.config.telegram?.botToken, undefined);
    assert.equal(prepared.config.logging?.level, "info");
});

test("ensureTelegramBotPluginRuntime starts the Telegram runtime only once per worktree", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        const starts: Array<{ cwd: string; token: string }> = [];
        const sdkClient = createSdkClientStub();
        const configSource = createConfig();
        let containerCalls: ContainerStubCalls | undefined;
        const bootstrapApp = (
            client: OpenCodeSdkClientLike,
            runtimeConfig: PluginConfigSource | undefined,
            options: { cwd?: string } = {},
        ) => {
            assert.equal(client, sdkClient);
            assert.equal(options.cwd, "E:/workspace");
            const stub = createContainerStub(options.cwd);
            containerCalls = stub.calls;

            return {
                config: loadAppConfig(runtimeConfig, options),
                container: stub.container,
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
                async dispose() {
                    await input.container.dispose();
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
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime,
        });
        const second = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                worktree: "E:/workspace",
            },
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime,
        });

        assert.equal(first, second);
        assert.deepEqual(starts, [{
            cwd: "E:/workspace",
            token: "telegram-token",
        }]);
        assert.equal(containerCalls?.warn.length, 0);
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});

test("ensureTelegramBotPluginRuntime reuses the active runtime when a later plugin call omits context", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        const sdkClient = createSdkClientStub();
        const configSource = createConfig();
        let started = 0;

        const first = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                worktree: "E:/workspace-reuse",
            },
            config: configSource,
            bootstrapApp: (
                client: OpenCodeSdkClientLike,
                runtimeConfig: PluginConfigSource | undefined,
                options: { cwd?: string } = {},
            ) => {
                assert.equal(client, sdkClient);

                return {
                    config: loadAppConfig(runtimeConfig, options),
                    container: createContainerStub(String(options.cwd)).container,
                };
            },
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime: async (input) => {
                started += 1;

                return {
                    bot: {} as never,
                    container: input.container,
                    stop() { },
                    async dispose() {
                        await input.container.dispose();
                    },
                };
            },
        });
        const second = await ensureTelegramBotPluginRuntime({
            context: undefined,
            config: configSource,
            bootstrapApp: (
                _client: OpenCodeSdkClientLike,
                runtimeConfig: PluginConfigSource | undefined,
                options: { cwd?: string } = {},
            ) => ({
                config: loadAppConfig(runtimeConfig, options),
                container: createContainerStub(String(options.cwd)).container,
            }),
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime: async (input) => ({
                bot: {} as never,
                container: input.container,
                stop() { },
                async dispose() {
                    await input.container.dispose();
                },
            }),
        });

        assert.equal(first, second);
        assert.equal(started, 1);
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});

test("ensureTelegramBotPluginRuntime starts when only directory is provided", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        const sdkClient = createSdkClientStub();
        const configSource = createConfig();
        let startedCwd: string | null = null;

        const runtime = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                directory: "E:/workspace-directory-only",
            },
            config: configSource,
            bootstrapApp: (
                client: OpenCodeSdkClientLike,
                runtimeConfig: PluginConfigSource | undefined,
                options: { cwd?: string } = {},
            ) => {
                assert.equal(client, sdkClient);

                return {
                    config: loadAppConfig(runtimeConfig, options),
                    container: createContainerStub(String(options.cwd)).container,
                };
            },
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime: async (input) => {
                startedCwd = (input.container as AppContainer & { __cwd: string }).__cwd;

                return {
                    bot: {} as never,
                    container: input.container,
                    stop() { },
                    async dispose() {
                        await input.container.dispose();
                    },
                };
            },
        });

        assert.ok(runtime);
        assert.equal(startedCwd, "E:/workspace-directory-only");
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});

test("ensureTelegramBotPluginRuntime throws a readable error when the first plugin call is missing client", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        await assert.rejects(
            ensureTelegramBotPluginRuntime({
                context: {
                    worktree: "E:/workspace-missing-client",
                },
                config: createConfig(),
            }),
            /OpenCode plugin context\.client is required\./u,
        );
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});

test("ensureTelegramBotPluginRuntime clears the singleton and disposes the container when startup fails", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        const sdkClient = createSdkClientStub();
        const configSource = createConfig();
        const containerCalls: ContainerStubCalls[] = [];
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
                prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
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
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime: async (input) => {
                attempts += 1;

                return {
                    bot: {} as never,
                    container: input.container,
                    stop() { },
                    async dispose() {
                        await input.container.dispose();
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
        const containerRecords = new Map<string, ContainerStubCalls>();
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
                async dispose() {
                    record.dispose += 1;
                    record.stop += 1;
                    await input.container.dispose();
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
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime,
        });
        const second = await ensureTelegramBotPluginRuntime({
            context: {
                client: sdkClient,
                worktree: "E:/workspace-b",
            },
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
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
        prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
        startRuntime: async (input) => ({
            bot: {} as never,
            container: input.container,
            stop() { },
            async dispose() {
                runtimeCalls.dispose += 1;
                await input.container.dispose();
            },
        }),
    });

    await resetTelegramBotPluginRuntimeForTests();

    assert.equal(runtimeCalls.dispose, 1);
});
