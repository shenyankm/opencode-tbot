import assert from "node:assert/strict";
import test from "node:test";
import { GrammyError } from "grammy";
import {
    resetTelegramBotRuntimeRegistryForTests,
    startTelegramBotRuntime,
} from "../src/app/runtime.js";
import type { AppConfig } from "../src/app/config.js";
import type { AppContainer } from "../src/app/container.js";

interface BotStub {
    api: {
        getMe(): Promise<{ id: number; username?: string }>;
        getUpdates(options?: unknown, signal?: unknown): Promise<unknown[]>;
        setMyCommands(): Promise<boolean>;
    };
    catch(handler: (error: unknown) => unknown): BotStub;
    readonly errorHandler?: (error: unknown) => unknown;
}

function createConfig(): AppConfig {
    return {
        loggingFileDir: "E:/repo/.logs/opencode-tbot",
        loggingFileSinkEnabled: true,
        loggingHostSinkEnabled: true,
        loggingLevel: "info",
        loggingRetentionMaxFiles: 30,
        loggingRetentionMaxTotalBytes: 314_572_800,
        promptPollRequestTimeoutMs: 15_000,
        promptRecoveryInactivityTimeoutMs: 120_000,
        promptWaitTimeoutMs: 1_800_000,
        stateFilePath: "E:/repo/data/opencode-tbot.state.json",
        telegramAllowedChatIds: [],
        telegramApiRoot: "https://api.telegram.org",
        telegramBotToken: "telegram-token",
        worktreePath: "E:/repo",
    };
}

function createContainer() {
    const calls = {
        dispose: 0,
        error: [] as Array<{ input: unknown; message?: string }>,
        info: [] as Array<{ input: unknown; message?: string }>,
        warn: [] as Array<{ input: unknown; message?: string }>,
    };
    const container = {
        logger: {
            child() {
                return this;
            },
            error(input?: unknown, message?: string) {
                calls.error.push({ input, message });
            },
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
    } as unknown as AppContainer;

    return { calls, container };
}

function createBotStub(): BotStub {
    let errorHandler: ((error: unknown) => unknown) | undefined;
    const bot = {
        api: {
            async getMe() {
                return {
                    id: 42,
                    username: "opencode_tbot",
                };
            },
            async getUpdates() {
                return [];
            },
            async setMyCommands() {
                return true;
            },
        },
        catch(handler: (error: unknown) => unknown) {
            errorHandler = handler;
            return this;
        },
        get errorHandler() {
            return errorHandler;
        },
    };

    return bot;
}

function createRunnerHandle() {
    let running = true;

    return {
        isRunning: () => running,
        size: () => 0,
        start() {
            running = true;
        },
        stop: async () => {
            running = false;
        },
        task: () => undefined,
    };
}

test("startTelegramBotRuntime starts polling before command sync and only warns when command sync fails", async () => {
    resetTelegramBotRuntimeRegistryForTests();
    const steps: string[] = [];
    const { calls, container } = createContainer();

    const runtime = await startTelegramBotRuntime({
        config: createConfig(),
        container,
        botFactory: () => createBotStub() as never,
        registerBotHandlers: () => {
            steps.push("register");
        },
        runBot: () => {
            steps.push("run");
            return createRunnerHandle();
        },
        syncCommandsHandler: async () => {
            steps.push("sync");
            throw new Error("setMyCommands failed");
        },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(steps, ["register", "run", "sync"]);
    assert.equal(calls.warn.length, 1);
    assert.match(calls.warn[0]?.message ?? "", /failed to sync telegram commands/u);

    await runtime.dispose();
    resetTelegramBotRuntimeRegistryForTests();
});

test("startTelegramBotRuntime reuses the active runtime for the same Telegram bot within one process", async () => {
    resetTelegramBotRuntimeRegistryForTests();
    let runCount = 0;
    const first = createContainer();
    const second = createContainer();

    const firstRuntime = await startTelegramBotRuntime({
        config: createConfig(),
        container: first.container,
        botFactory: () => createBotStub() as never,
        registerBotHandlers: () => undefined,
        runBot: () => {
            runCount += 1;
            return createRunnerHandle();
        },
        syncCommands: false,
    });
    const secondRuntime = await startTelegramBotRuntime({
        config: createConfig(),
        container: second.container,
        botFactory: () => createBotStub() as never,
        registerBotHandlers: () => undefined,
        runBot: () => {
            runCount += 1;
            return createRunnerHandle();
        },
        syncCommands: false,
    });

    assert.equal(runCount, 1);
    assert.equal(firstRuntime, secondRuntime);
    assert.equal(second.calls.dispose, 1);
    assert.equal(second.calls.warn.length, 1);
    assert.match(second.calls.warn[0]?.message ?? "", /runtime already active/u);

    await firstRuntime.dispose();
    resetTelegramBotRuntimeRegistryForTests();
});

test("startTelegramBotRuntime logs getUpdates failures through the app logger", async () => {
    resetTelegramBotRuntimeRegistryForTests();
    const { calls, container } = createContainer();
    const bot = createBotStub();

    bot.api.getUpdates = async () => {
        throw new Error("network boom");
    };

    const runtime = await startTelegramBotRuntime({
        config: createConfig(),
        container,
        botFactory: () => bot as never,
        registerBotHandlers: () => undefined,
        runBot: (runningBot) => {
            void runningBot.api.getUpdates({
                limit: 1,
                offset: 0,
                timeout: 30,
            }, new AbortController().signal as never).catch(() => undefined);

            return createRunnerHandle();
        },
        syncCommands: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(calls.warn.length, 1);
    assert.match(calls.warn[0]?.message ?? "", /telegram getUpdates failed/u);

    await runtime.dispose();
    resetTelegramBotRuntimeRegistryForTests();
});

test("startTelegramBotRuntime throws a readable error when telegram token validation fails", async () => {
    resetTelegramBotRuntimeRegistryForTests();
    const { calls, container } = createContainer();
    const bot = createBotStub();

    bot.api.getMe = async () => {
        throw new GrammyError(
            "Call to 'getMe' failed!",
            {
                ok: false,
                error_code: 401,
                description: "Unauthorized",
                parameters: {},
            },
            "getMe",
            {},
        );
    };

    await assert.rejects(
        startTelegramBotRuntime({
            config: createConfig(),
            container,
            botFactory: () => bot as never,
            registerBotHandlers: () => undefined,
            runBot: () => {
                throw new Error("runner should not start");
            },
            syncCommands: false,
        }),
        /Telegram bot token is invalid or revoked/u,
    );

    assert.equal(calls.error.length, 1);
    assert.match(calls.error[0]?.message ?? "", /startup validation failed/u);
    resetTelegramBotRuntimeRegistryForTests();
});
