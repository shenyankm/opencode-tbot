import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { utimes } from "node:fs/promises";
import { Bot } from "grammy";
import { createAuthMiddleware } from "../src/bot/middlewares/auth.js";
import { telegramAuthorization } from "../src/services/telegram/authorization.js";
import { FileSessionRepository, InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { SwitchModelUseCase } from "../src/use-cases/switch-model.usecase.js";
import { SwitchSessionUseCase } from "../src/use-cases/switch-session.usecase.js";
import { setChatLanguage } from "../src/bot/i18n.js";
import { emptyBinding, clearStoredModelSelection } from "../src/use-cases/binding-update.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { SendPromptUseCase } from "../src/use-cases/send-prompt.usecase.js";
import type { OpenCodePromptGateway } from "../src/services/opencode/opencode.ports.js";
import { TelegramFileClient, TELEGRAM_MAX_DOWNLOAD_BYTES } from "../src/services/telegram/telegram.client.js";
import { writePluginConfigFile } from "../src/app/plugin-config.js";
import { JsonStateStore } from "../src/services/storage/json-state-store.js";
import { createDefaultOpencodeTbotState, parseOpencodeTbotState } from "../src/services/storage/bot-state.js";
import { presentError } from "../src/bot/presenters/error.presenter.js";
import { diagnoseInstallation } from "../src/app/doctor.js";
import { prunePermissionHistory, pruneThinkingHistory, HISTORY_MAX_AGE_MS } from "../src/services/storage/history-retention.js";

const logger = { info() {}, warn() {}, error() {} } as unknown as AppLogger;
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}
const session = (id: string) => ({ id, projectID: "p", directory: "/repo", title: id, time: { created: 1, updated: 1 } });

test("empty and explicit allowlists reject strangers and callbacks before business handlers", async () => {
    for (const allowed of [[], [1]]) {
        const bot = new Bot("123456:fake", { botInfo: { id: 123456, is_bot: true, first_name: "test", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false } as never });
        let calls = 0;
        bot.use(createAuthMiddleware(allowed));
        bot.use(() => { calls++; });
        for (const id of [1, 2]) {
            const message = { from: { id, is_bot: false, first_name: "test" }, message_id: 1, date: 1, chat: { id, type: "private" as const, first_name: "test" }, text: "hello" };
            await bot.handleUpdate({ update_id: id, message });
            await bot.handleUpdate({ update_id: id + 10, callback_query: { id: "c", chat_instance: "ci", from: { id, is_bot: false, first_name: "test" }, data: "permission:always:r", message } });
        }
        assert.equal(calls, allowed.length * 2);
    }
});

test("outbound authorization blocks sends, drafts and edits to revoked chats", async () => {
    const bot = new Bot("123456:fake");
    let sent = 0;
    bot.api.config.use(async () => { sent++; return { ok: true, result: true } as never; });
    bot.api.config.use(telegramAuthorization([1]));
    await assert.rejects(bot.api.sendMessage(2, "private resource"), /authorized/u);
    await assert.rejects(bot.api.editMessageText(2, 1, "private resource"), /authorized/u);
    await assert.rejects(bot.api.sendRichMessageDraft(2, 1, { markdown: "private resource" }), /authorized/u);
    await bot.api.sendMessage(1, "allowed");
    assert.equal(sent, 1);
});

test("atomic model updates preserve concurrent sessions, languages and agent choices in both repositories", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "tbot-atomic-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    for (const repo of [new InMemorySessionRepository(), new FileSessionRepository(new JsonStateStore({ filePath: join(directory, "state.json"), createDefaultState: createDefaultOpencodeTbotState }))]) {
        await repo.setCurrent({ ...emptyBinding(1), sessionId: "old", language: "en" });
        const models = deferred<never[]>();
        const switching = new SwitchModelUseCase(repo, { listModels: () => models.promise }, logger).execute({ chatId: 1, providerId: "p", modelId: "m" });
        await repo.update(1, (current) => ({ ...current!, sessionId: "new", agentName: "plan" }));
        await setChatLanguage(repo, 1, "zh-CN");
        models.resolve([{ id: "m", providerID: "p", variants: {} }] as never);
        await switching;
        const result = await repo.getByChatId(1);
        assert.equal(result?.sessionId, "new");
        assert.equal(result?.language, "zh-CN");
        assert.equal(result?.agentName, "plan");
        assert.equal(result?.modelId, "m");
        const stale = result!;
        await repo.update(1, (current) => ({ ...current!, modelId: "newer" }));
        await clearStoredModelSelection(repo, stale);
        assert.equal((await repo.getByChatId(1))?.modelId, "newer");
    }
});

test("an earlier session selection finishing late cannot overwrite the newer choice", async () => {
    const repo = new InMemorySessionRepository();
    const earlier = deferred<ReturnType<typeof session>>();
    const useCase = new SwitchSessionUseCase(repo, { getSession: (id) => id === "old" ? earlier.promise : Promise.resolve(session(id)), getCurrentProject: async () => ({ id: "p", worktree: "/repo" }) }, logger);
    const pending = useCase.execute({ chatId: 1, sessionId: "old" });
    await useCase.execute({ chatId: 1, sessionId: "new" });
    earlier.resolve(session("old"));
    await assert.rejects(pending, /superseded/u);
    assert.equal((await repo.getByChatId(1))?.sessionId, "new");
});

test("pre-cancelled and cancelled preparation never create or bind a session or submit a prompt", async () => {
    const repo = new InMemorySessionRepository();
    const project = deferred<{ id: string; worktree: string }>();
    let effects = 0;
    const gateway = { getCurrentProject: () => project.promise, createSessionForDirectory: async () => { effects++; return session("late"); }, promptSession: async () => { effects++; } } as unknown as OpenCodePromptGateway;
    const useCase = new SendPromptUseCase(repo, gateway, logger);
    await assert.rejects(useCase.execute({ chatId: 1, text: "hello", signal: AbortSignal.abort() }), { name: "AbortError" });
    const controller = new AbortController();
    const pending = useCase.execute({ chatId: 1, text: "hello", signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    project.resolve({ id: "p", worktree: "/repo" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(effects, 0);
    assert.equal(await repo.getByChatId(1), null);
});

test("a session creation returning after cancellation does not rebind the chat", async () => {
    const repo = new InMemorySessionRepository();
    const created = deferred<ReturnType<typeof session>>();
    const entered = deferred<void>();
    const gateway = { getCurrentProject: async () => ({ id: "p", worktree: "/repo" }), createSessionForDirectory: () => { entered.resolve(); return created.promise; } } as unknown as OpenCodePromptGateway;
    const controller = new AbortController();
    const pending = new SendPromptUseCase(repo, gateway, logger).execute({ chatId: 1, text: "hello", signal: controller.signal });
    await entered.promise;
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    created.resolve(session("late"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await repo.getByChatId(1), null);
});

test("timestamp persistence failure preserves the complete successful answer and warns", async () => {
    const repo = new InMemorySessionRepository();
    repo.touch = async () => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); };
    const warnings: unknown[] = [];
    const reply = { bodyMd: "complete answer", assistantError: null };
    const useCase = new SendPromptUseCase(repo, { promptSession: async () => reply } as never, { ...logger, warn: (data: unknown) => { warnings.push(data); } },
        { resolve: async () => ({ activeBinding: { ...emptyBinding(1), sessionId: "s", projectId: "p" }, shouldIsolateImageTurn: false }) } as never);
    assert.equal((await useCase.execute({ chatId: 1, text: "hello" })).assistantReply, reply);
    assert.equal(warnings.length, 1);
});

test("downloads enforce actual bytes and Content-Length, reject empty bodies and cancel blocked reads", async () => {
    let cancelled = 0;
    for (const response of [new Response(new Uint8Array(TELEGRAM_MAX_DOWNLOAD_BYTES + 1)), new Response("x", { headers: { "content-length": String(TELEGRAM_MAX_DOWNLOAD_BYTES + 1) } }), new Response("")]) {
        const client = new TelegramFileClient({ botToken: "fake" }, async () => response);
        await assert.rejects(client.downloadFile({ filePath: "photos/a.png" }), /limit|empty/u);
    }
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; } });
    const client = new TelegramFileClient({ botToken: "fake" }, async () => new Response(body));
    const controller = new AbortController();
    const pending = client.downloadFile({ filePath: "photos/a.png", signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(cancelled, 1);
});

test("configuration replacement restricts new and existing files and keeps old data on serialization failure", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "tbot-config-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, "private", "config.json");
    await writePluginConfigFile(path, { telegram: { botToken: "first" } });
    await chmod(path, 0o644);
    await writePluginConfigFile(path, { telegram: { botToken: "second" } });
    if (process.platform !== "win32") {
        assert.equal((await stat(path)).mode & 0o777, 0o600);
        assert.equal((await stat(join(directory, "private"))).mode & 0o777, 0o700);
    }
    const before = await readFile(path, "utf8");
    const invalid = { circular: {} };
    invalid.circular = invalid;
    await assert.rejects(writePluginConfigFile(path, invalid));
    assert.equal(await readFile(path, "utf8"), before);
});

test("state validation rejects future versions and malformed records instead of overwriting them", () => {
    assert.deepEqual(parseOpencodeTbotState(createDefaultOpencodeTbotState()), createDefaultOpencodeTbotState());
    assert.throws(() => parseOpencodeTbotState({ ...createDefaultOpencodeTbotState(), version: 2 }));
    assert.throws(() => parseOpencodeTbotState({ ...createDefaultOpencodeTbotState(), sessions: { "2": emptyBinding(1) } }));
});

test("user-facing errors redact tokens and credential-bearing URLs", () => {
    const secret = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi";
    const text = presentError(new Error(`failed https://alice:secret@example.test/api ${secret} api_key=hidden https://api.telegram.org/bot${secret}/getMe sk-proj-abcdefghijklmno`));
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes("alice:secret"));
    assert.ok(!text.includes("hidden"));
    assert.ok(!text.includes("sk-proj-abcdefghijklmno"));
    assert.ok(!presentError({ apiKey: "json-secret" }).includes("json-secret"));
});

test("doctor diagnoses a missing installation without creating directories", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "tbot-doctor-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const checks = await diagnoseInstallation({ homeDir: directory, cwd: directory });
    assert.ok(checks.some((check) => check.status === "fail"));
    await assert.rejects(stat(join(directory, ".config")), { code: "ENOENT" });
});

test("history cleanup expires old records and thinking files while preserving other files", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "tbot-history-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const file = join(directory, "1.1.json");
    await writeFile(file, "{}");
    await writeFile(join(directory, "source.txt"), "keep");
    const old = new Date(Date.now() - HISTORY_MAX_AGE_MS - 1000);
    await utimes(file, old, old);
    assert.equal(await pruneThinkingHistory(directory), 1);
    assert.equal(await readFile(join(directory, "source.txt"), "utf8"), "keep");
    const records = { old: { requestId: "r", sessionId: "s", chatId: 1, messageId: 1, status: "pending" as const, updatedAt: old.toISOString() } };
    prunePermissionHistory(records);
    assert.deepEqual(records, {});
});

test("prune only expires retained history and preserves sessions", async (t) => {
    const { runCli } = await import("../src/cli.js");
    const { getGlobalPluginConfigFilePath } = await import("../src/app/plugin-config.js");
    const directory = await mkdtemp(join(tmpdir(), "tbot-prune-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const filePath = join(directory, "state.json");
    await writePluginConfigFile(getGlobalPluginConfigFilePath(directory), { telegram: { botToken: "test" }, state: { path: filePath } });
    const binding = emptyBinding(1);
    const state = { ...createDefaultOpencodeTbotState(), sessions: { "1": binding }, pendingPermissions: {
        "r:1": { chatId: 1, sessionId: "s", requestId: "r", messageId: 1, status: "pending" as const, updatedAt: new Date(0).toISOString() },
    } };
    await writeFile(filePath, JSON.stringify(state));
    assert.equal(await runCli(["prune", "--home-dir", directory]), 0);
    const result = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(result.sessions["1"], binding);
    assert.deepEqual(result.pendingPermissions, {});
});
