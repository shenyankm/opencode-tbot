import assert from "node:assert/strict";
import test from "node:test";
import { GrammyError, HttpError } from "grammy";
import { setImmediate } from "node:timers/promises";
import { createServer } from "node:http";
import { run } from "@grammyjs/runner";
import {
    resetTelegramBotRuntimeRegistryForTests,
    startTelegramBotRuntime,
} from "../src/app/runtime.js";
import type { AppConfig } from "../src/app/config.js";
import { DEFAULT_TOKEN_SHOW_BREAKDOWN } from "../src/domain/token/token-settings.entity.js";
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
        tokenShowBreakdown: DEFAULT_TOKEN_SHOW_BREAKDOWN,
        pluginConfigFilePath: "E:/Users/demo/.config/opencode/opencode-tbot/config.json",
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

test("plugin polling waits for event registration and cannot restart after disposal", async () => {
    resetTelegramBotRuntimeRegistryForTests();
    const { container } = createContainer();
    let runs = 0;
    const runtime = await startTelegramBotRuntime({
        config: createConfig(), container, deferPolling: true, syncCommands: false,
        botFactory: () => createBotStub() as never,
        registerBotHandlers: () => undefined,
        runBot: () => { runs += 1; return createRunnerHandle(); },
    });
    assert.equal(runs, 0);
    runtime.startPolling?.();
    runtime.startPolling?.();
    assert.equal(runs, 1);
    await runtime.dispose();
    runtime.startPolling?.();
    assert.equal(runs, 1);
    resetTelegramBotRuntimeRegistryForTests();
});

test("a startup network outage keeps the runtime available for polling to validate after reconnecting", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    resetTelegramBotRuntimeRegistryForTests();
    const { calls, container } = createContainer();
    const bot = createBotStub();
    let validations = 0;
    let runs = 0;
    bot.api.getMe = async () => { validations += 1; throw new HttpError("getMe failed", Object.assign(new Error("reset"), { code: "ECONNRESET" })); };
    const starting = startTelegramBotRuntime({
        config: createConfig(), container, botFactory: () => bot as never,
        registerBotHandlers: () => undefined, syncCommands: false,
        runBot: () => { runs += 1; return createRunnerHandle(); },
    });
    await setImmediate();
    for (const ms of [1000, 2000, 4000]) { t.mock.timers.tick(ms); await setImmediate(); }
    const runtime = await starting;
    assert.equal(validations, 4);
    assert.equal(runs, 1);
    assert.ok(calls.warn.some((call) => (call.input as { event?: string }).event === "runtime.telegram.auth.deferred"));
    assert.equal(calls.error.length, 0);
    await runtime.dispose();
    resetTelegramBotRuntimeRegistryForTests();
});

test("polling resumes on the same runner after retry exhaustion and never restarts after disposal", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    resetTelegramBotRuntimeRegistryForTests();
    const { container } = createContainer();
    let rejectTask!: (error: unknown) => void;
    let resolveTask!: () => void;
    let starts = 0;
    let runs = 0;
    let task = new Promise<void>((resolve, reject) => { resolveTask = resolve; rejectTask = reject; });
    const handle = {
        ...createRunnerHandle(),
        task: () => task,
        async stop() { resolveTask(); },
        start() { starts += 1; task = new Promise<void>((resolve, reject) => { resolveTask = resolve; rejectTask = reject; }); },
    };
    const runtime = await startTelegramBotRuntime({
        config: createConfig(), container, botFactory: () => createBotStub() as never,
        registerBotHandlers: () => undefined, syncCommands: false,
        runBot: () => { runs += 1; return handle; },
    });
    rejectTask(new HttpError("getUpdates failed", new Error("offline")));
    await setImmediate();
    t.mock.timers.tick(5000);
    await setImmediate();
    assert.equal(starts, 1);
    assert.equal(runs, 1);
    rejectTask(new HttpError("getUpdates failed", new Error("offline again")));
    await setImmediate();
    await runtime.dispose();
    t.mock.timers.tick(10000);
    await setImmediate();
    assert.equal(starts, 1);
    resetTelegramBotRuntimeRegistryForTests();
});

test("polling stops on invalid tokens or competing pollers instead of restarting forever", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const code of [401, 409]) {
        resetTelegramBotRuntimeRegistryForTests();
        const { calls, container } = createContainer();
        let rejectTask!: (error: unknown) => void;
        const task = new Promise<void>((_resolve, reject) => { rejectTask = reject; });
        let starts = 0;
        const runtime = await startTelegramBotRuntime({
            config: createConfig(), container, botFactory: () => createBotStub() as never,
            registerBotHandlers: () => undefined, syncCommands: false,
            runBot: () => ({ ...createRunnerHandle(), task: () => task, start() { starts += 1; } }),
        });
        rejectTask(new GrammyError("failed", { ok: false, error_code: code, description: "Unauthorized or conflict" }, "getUpdates", {}));
        await setImmediate();
        t.mock.timers.tick(10000);
        assert.equal(starts, 0);
        assert.equal(calls.error.length, 1);
        await runtime.dispose();
    }
    resetTelegramBotRuntimeRegistryForTests();
});

test("the real runner recovers after a dropped HTTP connection without replaying consumed updates", { timeout: 15000 }, async (t) => {
    resetTelegramBotRuntimeRegistryForTests();
    const { container } = createContainer();
    const consumed: number[] = [];
    const offsets: number[] = [];
    let sent = 0;
    let dropConnection = true;
    const server = createServer(async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) { chunks.push(Buffer.from(chunk)); }
        const payload = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        const method = request.url?.split("/").at(-1);
        let result: unknown = { id: 42, username: "test_bot", first_name: "Test", is_bot: true };
        if (method === "getUpdates") {
            offsets.push(payload.offset ?? 0);
            if (sent === 1 && dropConnection) {
                dropConnection = false;
                request.socket.destroy();
                return;
            }
            result = sent < 2 ? [{
                update_id: 100 + sent,
                message: { message_id: 100 + sent++, date: 1, chat: { id: 1, type: "private" }, text: "test" },
            }] : [];
            if (sent >= 2) { await new Promise((resolve) => setTimeout(resolve, 20)); }
        }
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ ok: true, result }));
    });
    let runtime: Awaited<ReturnType<typeof startTelegramBotRuntime>> | undefined;
    t.after(async () => {
        await runtime?.dispose();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        resetTelegramBotRuntimeRegistryForTests();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    runtime = await startTelegramBotRuntime({
        config: { ...createConfig(), telegramApiRoot: `http://127.0.0.1:${address.port}` },
        container, syncCommands: false,
        registerBotHandlers: (bot) => { bot.on("message", (ctx) => { consumed.push(ctx.update.update_id); }); },
        runBot: (bot) => run(bot, { runner: { maxRetryTime: 0, silent: true, fetch: { timeout: 0 } } }),
    });
    const deadline = Date.now() + 12000;
    while (consumed.length < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.deepEqual(consumed, [100, 101]);
    assert.deepEqual(offsets.slice(0, 3), [0, 101, 101]);
});
