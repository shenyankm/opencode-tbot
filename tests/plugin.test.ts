import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import type { Plugin } from "@opencode/plugin";
import { Service } from "@opencode/client/service";
import type { PermissionEvaluation } from "@opencode/plugin/promise/permission";
import { InMemoryPermissionApprovalRepository } from "../src/repositories/permission-approval.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import type { AppContainer } from "../src/app/container.js";
import {
    loadAppConfig,
    type AppConfig,
    type PluginConfigSource,
} from "../src/app/config.js";
import { DEFAULT_TOKEN_SHOW_BREAKDOWN } from "../src/domain/token/token-settings.entity.js";
import {
    mergePluginConfigSources,
    preparePluginConfiguration,
    serializePluginConfig,
    type PreparedPluginConfiguration,
} from "../src/app/plugin-config.js";
import {
    ensureTelegramBotPluginRuntime,
    resetTelegramBotPluginRuntimeForTests,
    TelegramBotPlugin,
} from "../src/plugin.js";
import entryPlugin, * as entryModule from "../src/index.js";
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
    return {} as never;
}

function createContainerStub(cwd = "E:/workspace") {
    const calls = {
        dispose: 0,
        info: [] as Array<{ input: unknown; message: string | undefined }>,
        warn: [] as Array<{ input: unknown; message: string | undefined }>,
    };
    const container = {
        __cwd: cwd,
        isChatAuthorized: () => true,
        sessionRepo: new InMemorySessionRepository(),
        permissionApprovalRepo: new InMemoryPermissionApprovalRepository(),
        foregroundSessionTracker: new ForegroundSessionTracker(),
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

test("loadAppConfig applies the default token breakdown visibility", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-token-config-default-"));
    const config = loadAppConfig(createConfig(), { cwd });

    assert.equal(config.tokenShowBreakdown, DEFAULT_TOKEN_SHOW_BREAKDOWN);
});

test("loadAppConfig reads token breakdown visibility from the structured config", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-token-config-enabled-"));
    const config = loadAppConfig(createConfig({
        tokens: {
            showBreakdown: true,
        },
    }), { cwd });

    assert.equal(config.tokenShowBreakdown, true);
});

test("loadAppConfig ignores deprecated token total includes settings", () => {
    const cwd = mkdtempSync(join(tmpdir(), "opencode-tbot-token-config-legacy-"));
    const config = loadAppConfig(createConfig({
        tokens: {
            totalIncludes: ["input", "output"] as never,
        },
    }), { cwd });

    assert.equal(config.tokenShowBreakdown, false);
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

test("mergePluginConfigSources merges token configuration by key", () => {
    const merged = mergePluginConfigSources(
        {
            telegram: {
                botToken: "token-a",
            },
        },
        {
            tokens: {
                showBreakdown: true,
            },
        },
    );

    assert.deepEqual(merged, {
        telegram: {
            botToken: "token-a",
        },
        tokens: {
            showBreakdown: true,
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

test("package root only exports the plugin entrypoint at runtime", () => {
    assert.deepEqual(Object.keys(entryModule), ["default"]);
    assert.equal(entryModule.default, entryPlugin);
    assert.equal(entryPlugin, TelegramBotPlugin);
    assert.equal(entryPlugin.id, "opencode-tbot");
    assert.equal(typeof entryPlugin.setup, "function");
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
            context: { location: { directory: "E:/workspace" } } as never,
            client: sdkClient,
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime,
        });
        const second = await ensureTelegramBotPluginRuntime({
            context: { location: { directory: "E:/workspace" } } as never,
            client: sdkClient,
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
            context: { location: { directory: "E:/workspace-reuse" } } as never,
            client: sdkClient,
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
            context: { location: { directory: "E:/workspace-directory-only" } } as never,
            client: sdkClient,
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

test("ensureTelegramBotPluginRuntime throws a readable error when the first runtime call lacks context and client", async () => {
    await resetTelegramBotPluginRuntimeForTests();

    try {
        await assert.rejects(
            ensureTelegramBotPluginRuntime({
                config: createConfig(),
            }),
            /OpenCode plugin context is required\./u,
        );
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});

test("TelegramBotPlugin logs a non-fatal startup failure without registering hooks", async (t) => {
    t.mock.method(Service, "discover", async () => undefined);
    await resetTelegramBotPluginRuntimeForTests();

    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    const logCalls: string[] = [];
    const originalConsoleError = console.error;
    console.error = (message: string) => logCalls.push(message);
    const tempHome = mkdtempSync(join(tmpdir(), "opencode-tbot-plugin-inert-"));

    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;

    try {
        const cleanup = await TelegramBotPlugin.setup({
            location: { directory: "E:/workspace-plugin-inert" },
            permission: { hook: () => assert.fail("Startup failure must not register hooks.") },
        } as never);

        assert.equal(cleanup, undefined);
        assert.equal(logCalls.length, 1);
        const event = JSON.parse(logCalls[0] ?? "{}");
        assert.equal(event.reason, "startup_failed");
        assert.match(event.error?.message ?? "", /OpenCode V2 service is unavailable/u);
        assert.equal(event.message, "telegram bot plugin disabled during startup");
    } finally {
        console.error = originalConsoleError;
        if (typeof originalHome === "string") {
            process.env.HOME = originalHome;
        } else {
            delete process.env.HOME;
        }

        if (typeof originalUserProfile === "string") {
            process.env.USERPROFILE = originalUserProfile;
        } else {
            delete process.env.USERPROFILE;
        }

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
                context: { location: { directory: "E:/workspace" } } as never,
                client: sdkClient,
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
            context: { location: { directory: "E:/workspace" } } as never,
            client: sdkClient,
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
            context: { location: { directory: "E:/workspace-a" } } as never,
            client: sdkClient,
            config: configSource,
            bootstrapApp,
            prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
            startRuntime,
        });
        const second = await ensureTelegramBotPluginRuntime({
            context: { location: { directory: "E:/workspace-b" } } as never,
            client: sdkClient,
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
        context: { location: { directory: "E:/workspace" } } as never,
        client: sdkClient,
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

test("TelegramBotPlugin registers V2 permission and event handlers and releases them when the worktree changes", async () => {
    await resetTelegramBotPluginRuntimeForTests();
    const firstStub = createContainerStub("E:/workspace-events");
    const secondStub = createContainerStub("E:/workspace-next");
    const configSource = createConfig();
    const messages: string[] = [];
    let permissionHook: ((event: PermissionEvaluation) => Promise<void> | void) | undefined;
    let eventSignal: AbortSignal | undefined;
    let registrationDisposals = 0;
    let eventStreamStopped = false;
    const context = {
        location: { directory: "E:/workspace-events" },
        permission: {
            async hook(name: string, callback: typeof permissionHook) {
                assert.equal(name, "evaluate");
                permissionHook = callback;
                return {
                    async dispose() {
                        registrationDisposals += 1;
                    },
                };
            },
        },
        event: {
            async *subscribe({ signal }: { signal: AbortSignal }) {
                eventSignal = signal;
                yield {
                    id: "event-permission-1",
                    created: 1,
                    type: "permission.asked",
                    data: {
                        id: "request-1",
                        sessionID: "session-foreground",
                        action: "read",
                        resources: ["README.md"],
                    },
                };
                await new Promise<void>((resolve) => {
                    signal.addEventListener("abort", () => resolve(), { once: true });
                });
                eventStreamStopped = true;
            },
        },
    } as unknown as Plugin.Context;
    const start = (stub: typeof firstStub, pluginContext: Plugin.Context) => ensureTelegramBotPluginRuntime({
        context: pluginContext,
        client: createSdkClientStub(),
        config: configSource,
        prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
        bootstrapApp: (_client, config, options) => ({
            config: loadAppConfig(config, options),
            container: stub.container,
        }),
        startRuntime: async () => ({
            bot: {
                api: {
                    async sendMessage(_chatId: number, text: string) {
                        messages.push(text);
                        return { message_id: 1 };
                    },
                },
            } as never,
            container: stub.container,
            stop() { },
            async dispose() {
                await stub.container.dispose();
            },
        }),
    });

    try {
        await start(firstStub, context);
        firstStub.container.foregroundSessionTracker.begin(777, "session-foreground");
        const cleanup = await TelegramBotPlugin.setup(context);
        assert.equal(typeof cleanup, "function");
        await setImmediate();
        assert.equal(messages.length, 1);
        assert.match(messages[0] ?? "", /Permission Request/u);
        assert.equal(eventSignal?.aborted, false);
        assert.ok(permissionHook);

        const foreground: PermissionEvaluation = {
            sessionID: "session-foreground" as never,
            action: "read",
            resources: ["README.md"],
            effect: "allow",
        };
        await permissionHook(foreground);
        assert.equal(foreground.effect, "ask");
        const denied = { ...foreground, effect: "deny" as const };
        await permissionHook(denied);
        assert.equal(denied.effect, "deny");
        const unrelated = { ...foreground, sessionID: "session-unrelated" as never, effect: "allow" as const };
        await permissionHook(unrelated);
        assert.equal(unrelated.effect, "allow");

        await start(secondStub, { location: { directory: "E:/workspace-next" } } as never);
        assert.equal(eventSignal?.aborted, true);
        assert.equal(eventStreamStopped, true);
        assert.equal(registrationDisposals, 1);
        assert.equal(firstStub.calls.dispose, 1);
        assert.equal(secondStub.calls.dispose, 0);
        await cleanup?.();
        assert.equal(firstStub.calls.dispose, 1);
        assert.equal(secondStub.calls.dispose, 0);

        const secondCleanup = await TelegramBotPlugin.setup({
            ...context,
            location: { directory: "E:/workspace-next" },
        } as Plugin.Context);
        await setImmediate();
        assert.equal(eventSignal?.aborted, false);
        await secondCleanup?.();
        await secondCleanup?.();
        assert.equal(eventSignal?.aborted, true);
        assert.equal(registrationDisposals, 2);
        assert.equal(secondStub.calls.dispose, 1);
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }

    assert.equal(secondStub.calls.dispose, 1);
});


test("TelegramBotPlugin releases resources when permission registration is delayed or fails", async (t) => {
    await resetTelegramBotPluginRuntimeForTests();
    const configSource = createConfig();
    const containers = new Map<string, ReturnType<typeof createContainerStub>>();
    let enteredHook: () => void = () => { };
    const hookEntered = new Promise<void>((resolve) => { enteredHook = resolve; });
    let releaseHook: (registration: { dispose(): Promise<void> }) => void = () => { };
    const hookRegistration = new Promise<{ dispose(): Promise<void> }>((resolve) => { releaseHook = resolve; });
    let registrationDisposals = 0;
    let subscriptionCalls = 0;
    const start = (directory: string) => ensureTelegramBotPluginRuntime({
        context: { location: { directory } } as never,
        client: createSdkClientStub(),
        config: configSource,
        prepareConfiguration: async ({ cwd, config }) => createPreparedConfiguration(cwd, config, configSource),
        bootstrapApp: (_client, config, options) => {
            const stub = createContainerStub(options?.cwd);
            containers.set(String(options?.cwd), stub);
            return { config: loadAppConfig(config, options), container: stub.container };
        },
        startRuntime: async ({ container }) => ({
            bot: {} as never,
            container,
            stop() { },
            async dispose() { await container.dispose(); },
        }),
    });

    try {
        await start("E:/workspace-registering");
        const setup = TelegramBotPlugin.setup({
            location: { directory: "E:/workspace-registering" },
            permission: {
                hook() {
                    enteredHook();
                    return hookRegistration;
                },
            },
            event: {
                subscribe() {
                    subscriptionCalls += 1;
                    assert.fail("A replaced runtime must not subscribe to events.");
                },
            },
        } as never);
        await hookEntered;
        await start("E:/workspace-current");
        releaseHook({ async dispose() { registrationDisposals += 1; } });
        assert.equal(await setup, undefined);
        assert.equal(subscriptionCalls, 0);
        assert.equal(registrationDisposals, 1);
        assert.equal(containers.get("E:/workspace-registering")?.calls.dispose, 1);
        assert.equal(containers.get("E:/workspace-current")?.calls.dispose, 0);

        const errors: string[] = [];
        t.mock.method(console, "error", (message: string) => errors.push(message));
        const cleanup = await TelegramBotPlugin.setup({
            location: { directory: "E:/workspace-current" },
            permission: {
                async hook() { throw new Error("registration failed"); },
            },
        } as never);
        assert.equal(cleanup, undefined);
        assert.equal(containers.get("E:/workspace-current")?.calls.dispose, 1);
        assert.equal(JSON.parse(errors[0] ?? "{}").error?.message, "registration failed");
    } finally {
        await resetTelegramBotPluginRuntimeForTests();
    }
});
