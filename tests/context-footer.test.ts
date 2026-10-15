import assert from "node:assert/strict";
import test from "node:test";
import { homedir } from "node:os";
import { GrammyError } from "grammy";
import { createThinkingMessages } from "./helpers/thinking.js";
import { getBotCopy } from "../src/bot/copy.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { OpenCodeClient } from "../src/services/opencode/opencode.client.js";
import type { OpenCodeContextUsage } from "../src/services/opencode/opencode.client.js";
import { TelegramContextFooter } from "../src/services/telegram/context-footer.js";
import { GetContextUsageUseCase } from "../src/use-cases/get-context-usage.usecase.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { buildTelegramSessionFooter, formatContextFooter } from "../src/services/telegram/telegram-format.js";

test("the final footer formats request duration in seconds, minutes and hours without changing command context output", () => {
    const context = { capacity: 1_000, used: 100 };
    for (const language of ["en", "zh-CN", "ja"] as const) {
        const copy = getBotCopy(language);
        const base = formatContextFooter(context, copy);
        for (const [milliseconds, expected] of [[0, "0s"], [1_250, "1.3s"], [59_000, "59s"], [60_000, "1m"], [90_000, "1.5m"], [3_600_000, "1h"], [5_400_000, "1.5h"]] as const) {
            assert.equal(formatContextFooter(context, copy, milliseconds), `${base}\n${copy.replyMetrics.durationLabel}: ${expected}`);
        }
        for (const invalid of [null, -1, NaN, Infinity]) {
            assert.equal(formatContextFooter(context, copy, invalid), `${base}\n${copy.replyMetrics.durationLabel}: ${copy.replyMetrics.notAvailable}`);
        }
        assert.doesNotMatch(base, new RegExp(copy.replyMetrics.durationLabel));
    }
});

const logger = { warn() {} } as unknown as AppLogger;
const tokens = { input: 300, output: 20, reasoning: 5, cache: { read: 100, write: 10 } };

function createContextClient(pages: unknown[][], revert?: { messageID: string }, agent: string | null = "agent_build") {
    let page = 0;
    return new OpenCodeClient(undefined, {
        agent: { async list() { return { data: [{ id: "agent_build", name: "build" }, { id: "agent_plan", name: "plan" }] }; } },
        session: { async get() { return { location: { directory: "/repo" }, agent, model: { providerID: "p", id: "small", variant: "high" }, revert, tokens: { ...tokens, input: 999999 } }; } },
        model: { async list() { return { data: [
            { id: "small", name: "Small", providerID: "p", limit: { context: 1000 } },
            { id: "large", name: "Large", providerID: "p", limit: { context: 2000 } },
        ] }; } },
        message: { async list() { return { data: pages[page++], cursor: { next: page < pages.length ? "next" : null } }; } },
    } as never);
}

test("context uses the latest assistant step including cache rather than accumulated session usage", async () => {
    const client = createContextClient([[{ type: "assistant", id: "latest", tokens }, { type: "assistant", tokens: { ...tokens, input: 9999 } }]]);
    assert.deepEqual(await client.getSessionContext("ses_test"), { capacity: 1000, used: 435, session: { directory: "/repo", modelName: "Small", providerID: "p", variant: "high", agentName: "build" } });
});

test("context reads share metadata for five seconds while session selections and token usage remain live", async (t) => {
    let now = 1_000;
    t.mock.method(Date, "now", () => now);
    let modelReads = 0;
    let agentReads = 0;
    let sessionReads = 0;
    let messageReads = 0;
    let selected = "small";
    let used = 10;
    let capacity = 1000;
    const sdk = {
        async models() {
            modelReads += 1;
            return { data: ["small", "large"].map((id) => ({
                id, providerID: "p", name: id, limit: { context: id === "small" ? capacity : 2000 },
                enabled: true, capabilities: { input: ["text"], output: ["text"] }, variants: [],
            })) };
        },
    };
    const client = new OpenCodeClient(undefined, {
        model: { list: sdk.models },
        provider: { async list() { return { data: [{ id: "p", name: "Provider" }] }; } },
        agent: { async list() { agentReads += 1; return { data: [{ id: "build", name: "Build" }] }; } },
        session: { async get() { sessionReads += 1; return { model: { providerID: "p", id: selected }, agent: "build" }; } },
        message: { async list() {
            messageReads += 1;
            return { data: [{ type: "assistant", tokens: { input: used, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }], cursor: {} };
        } },
    } as never);
    await Promise.all([client.listModels(), client.listAgents(), ...Array.from({ length: 10 }, () => client.getSessionContext("s"))]);
    assert.equal(modelReads, 1);
    assert.equal(agentReads, 1);
    assert.equal(sessionReads, 10);
    assert.equal(messageReads, 10);
    selected = "large";
    used = 20;
    const switched = await client.getSessionContext("s");
    assert.equal(switched.capacity, 2000);
    assert.equal(switched.used, 20);
    selected = "small";
    capacity = 1500;
    now += 4_999;
    assert.equal((await client.getSessionContext("s")).capacity, 1000);
    now += 1;
    assert.equal((await client.getSessionContext("s")).capacity, 1500);
    assert.equal(modelReads, 2);
    assert.equal(agentReads, 2);
});

test("failed metadata requests are retried and an agent fallback is never cached as an empty catalog", async () => {
    let modelReads = 0;
    let agentReads = 0;
    const client = new OpenCodeClient(undefined, {
        model: { async list() {
            if (++modelReads === 1) { throw new Error("models offline"); }
            return { data: [] };
        } },
        agent: { async list() {
            if (++agentReads === 1) { throw new Error("agents offline"); }
            return { data: [{ id: "build", name: "Build" }] };
        } },
        session: { async get() { return { model: { providerID: "p", id: "m" }, agent: "build" }; } },
        message: { async list() { return { data: [], cursor: {} }; } },
    } as never);
    await assert.rejects(client.getSessionContext("s"), /models offline/);
    assert.equal((await client.getSessionContext("s")).session?.agentName, "Build");
    assert.equal(modelReads, 2);
    assert.equal(agentReads, 2);
});

test("session footer uses the latest assistant agent when session metadata has no explicit agent", async () => {
    const client = createContextClient([[{ type: "assistant", tokens, agent: "agent_plan" }]], undefined, null);
    assert.equal((await client.getSessionContext("ses_test")).session?.agentName, "plan");
});

test("session footer has a compact localized layout with escaped metadata and safe unavailable values", () => {
    for (const language of ["en", "zh-CN", "ja"] as const) {
        const copy = getBotCopy(language);
        const reply = buildTelegramSessionFooter({ capacity: 262_144, used: 18_000, session: {
            directory: `${homedir()}/Developer/A&B`, modelName: "Model <Free>", providerID: "test", variant: "max", agentName: "custom<agent>",
        } }, copy, 19_100);
        assert.equal(reply.preferred.options?.parse_mode, "HTML");
        assert.equal(reply.fallback.text, [
            `${copy.replyMetrics.workspaceLabel}: ~/Developer/A&B`,
            `${copy.replyMetrics.modelLabel}: test / Model <Free>(max)`,
            `${copy.replyMetrics.agentLabel}: custom<agent>`,
            `${copy.replyMetrics.contextLabel}: ${copy.replyMetrics.remaining(93)} | 262.1K`,
            `${copy.replyMetrics.durationLabel}: 19.1s`,
        ].join("\n"));
        assert.match(reply.preferred.text, /<code>~\/Developer\/A&amp;B<\/code>/u);
        assert.match(reply.preferred.text, /Model &lt;Free&gt;\(max\)/u);
        assert.match(reply.preferred.text, /custom&lt;agent&gt;/u);
        assert.equal(reply.fallback.text.split("\n").length, 5);
        const unknown = buildTelegramSessionFooter(null, copy, null).fallback.text;
        assert.ok(unknown.includes(`${copy.replyMetrics.agentLabel}: ${copy.replyMetrics.notAvailable}`));
        assert.ok(unknown.includes(`${copy.replyMetrics.modelLabel}: ${copy.replyMetrics.notAvailable}(${copy.replyMetrics.notAvailable})`));
    }
});

test("model, reasoning, agent and workspace refreshes preserve the reply duration and do not reuse pre-compression usage", async () => {
    const repo = new InMemorySessionRepository();
    await bind(repo);
    let directory = "/actual/worktree";
    let used: number | null = 500;
    const reader = new GetContextUsageUseCase(repo, { async getSessionContext(_session, model) { return {
        capacity: model?.id === "large" ? 2000 : 1000, used,
        session: { directory, providerID: "p", modelName: model?.id === "large" ? "Large" : "Small", variant: "old", agentName: "build" },
    }; } });
    const footer = new TelegramContextFooter(reader, repo, logger);
    const writes: string[] = [];
    footer.watch(1, "ses_test", async (context) => { writes.push(buildTelegramSessionFooter(context, getBotCopy("en"), 19_100).fallback.text); });
    await footer.refreshChat(1);
    assert.match(writes[0], /Model: p \/ Small\(default\)\nAgent: build/u);
    const binding = (await repo.getByChatId(1))!;
    await repo.setCurrent({ ...binding, modelId: "large", modelVariant: "max", agentName: "plan", directory: "/stale/path" });
    await footer.refreshChat(1);
    assert.match(writes[1], /Workspace: \/actual\/worktree\nModel: p \/ Large\(max\)\nAgent: plan/u);
    directory = "/moved/worktree";
    used = null;
    await footer.refreshSession("ses_test");
    assert.match(writes[2], /Workspace: \/moved\/worktree/u);
    assert.match(writes[2], /Context: n\/a \| 2K/u);
    used = 100;
    await footer.refreshSession("ses_test");
    assert.match(writes[3], /Context: 95% left \| 2K/u);
    assert.ok(writes.every((text) => text.endsWith("Duration: 19.1s")));
    footer.clear();
});

test("switching models recomputes the remaining ratio against the selected model capacity", async () => {
    const client = createContextClient([[{ type: "assistant", id: "latest", tokens }]]);
    const result = await client.getSessionContext("ses_test", { providerID: "p", id: "large" });
    assert.deepEqual(result, { capacity: 2000, used: 435, session: { directory: "/repo", modelName: "Large", providerID: "p", variant: null, agentName: "build" } });
    assert.equal(formatContextFooter(result), "Context: 78% left | 2K");
});

test("completed compression across a page boundary invalidates all earlier usage until a new step reports tokens", async () => {
    const client = createContextClient([
        [{ type: "idle" }],
        [{ type: "compaction", status: "completed" }, { type: "assistant", tokens }],
    ]);
    assert.deepEqual(await client.getSessionContext("ses_test"), { capacity: 1000, used: null, session: { directory: "/repo", modelName: "Small", providerID: "p", variant: "high", agentName: "build" } });
    const next = createContextClient([[{ type: "assistant", tokens: { ...tokens, input: 50 } }, { type: "compaction", status: "completed" }]]);
    assert.deepEqual(await next.getSessionContext("ses_test"), { capacity: 1000, used: 185, session: { directory: "/repo", modelName: "Small", providerID: "p", variant: "high", agentName: "build" } });
});

test("reverted and failed compression records do not pick usage from outside the active context", async () => {
    const client = createContextClient([
        [{ id: "new", type: "assistant", tokens: { ...tokens, input: 9999 } }, { id: "boundary", type: "user" }],
        [{ type: "compaction", status: "failed" }, { type: "assistant", tokens }],
    ], { messageID: "boundary" });
    assert.deepEqual(await client.getSessionContext("ses_test"), { capacity: 1000, used: 435, session: { directory: "/repo", modelName: "Small", providerID: "p", variant: "high", agentName: "build" } });
});

test("the context footer shows only percentage left and capacity with safe unknown values", () => {
    assert.equal(formatContextFooter({ capacity: 475000, used: 361761 }), "Context: 24% left | 475K");
    assert.equal(formatContextFooter({ capacity: 1000, used: 1001 }), "Context: 0% left | 1K");
    assert.equal(formatContextFooter({ capacity: 475000, used: null }), "Context: n/a | 475K");
    assert.equal(formatContextFooter({ capacity: 0, used: 0 }), "Context: n/a | n/a");
    for (const language of ["en", "zh-CN", "ja"] as const) {
        const copy = getBotCopy(language);
        assert.equal(formatContextFooter({ capacity: 475000, used: 361761 }, copy), `${copy.replyMetrics.contextLabel}: ${copy.replyMetrics.remaining(24)} | 475K`);
    }
});

async function bind(repo: InMemorySessionRepository, sessionId = "ses_test", modelId = "small"): Promise<void> {
    await repo.setCurrent({ chatId: 1, sessionId, modelId, modelProviderId: "p", modelVariant: null, projectId: null, directory: null, agentName: null, language: null, updatedAt: "now" });
}

test("the last reply refreshes after a model switch and compression without editing replies for another session", async () => {
    const repo = new InMemorySessionRepository();
    await bind(repo);
    let used: number | null = 500;
    const reader = new GetContextUsageUseCase(repo, {
        async getSessionContext(_session, model) { return { capacity: model?.id === "large" ? 2000 : 1000, used }; },
    });
    const footer = new TelegramContextFooter(reader, repo, logger);
    const writes: string[] = [];
    footer.watch(1, "ses_test", async (context) => { writes.push(formatContextFooter(context)); });
    await footer.refreshChat(1);
    await bind(repo, "ses_test", "large");
    await footer.refreshChat(1);
    used = null;
    await footer.refreshSession("ses_test");
    used = 100;
    await footer.refreshSession("ses_test");
    assert.deepEqual(writes, ["Context: 50% left | 1K", "Context: 75% left | 2K", "Context: n/a | 2K", "Context: 95% left | 2K"]);
    await footer.refreshSession("ses_other");
    await bind(repo, "ses_other");
    await footer.refreshChat(1);
    assert.equal(writes.length, 4);
    footer.clear();
});

test("a slow refresh cannot overwrite a newer reply and failures do not break subsequent refreshes", async () => {
    const repo = new InMemorySessionRepository();
    await bind(repo);
    let resolveRead!: (value: { capacity: number; used: number }) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const footer = new TelegramContextFooter({ execute: async () => { started(); return new Promise((resolve) => { resolveRead = resolve; }); } }, repo, logger);
    let oldWrites = 0;
    footer.watch(1, "ses_test", async () => { oldWrites += 1; });
    const pending = footer.refreshChat(1);
    await entered;
    footer.watch(1, "ses_test", async () => {});
    resolveRead({ capacity: 1000, used: 1 });
    await pending;
    assert.equal(oldWrites, 0);
    footer.clear();
    let reads = 0;
    let writes = 0;
    const retry = new TelegramContextFooter({ async execute() { if (++reads === 1) { throw new Error("offline"); } return { capacity: 1000, used: 100 }; } }, repo, logger);
    retry.watch(1, "ses_test", async () => { writes += 1; });
    await retry.refreshChat(1);
    await retry.refreshChat(1);
    assert.equal(writes, 1);
});

test("a burst of ten footer refreshes shares one read and refreshes again for changes during that read", async () => {
    const repo = new InMemorySessionRepository();
    await bind(repo);
    let reads = 0;
    let finish!: (context: OpenCodeContextUsage) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const footer = new TelegramContextFooter({ async execute() {
        reads += 1;
        if (reads === 2) {
            started();
            return new Promise<OpenCodeContextUsage>((resolve) => { finish = resolve; });
        }
        return { capacity: 1000, used: reads };
    } }, repo, logger);
    const writes: Array<number | null> = [];
    footer.watch(1, "ses_test", async (context) => { writes.push(context.used); });
    await Promise.all(Array.from({ length: 10 }, () => footer.refreshSession("ses_test")));
    assert.equal(reads, 1);
    assert.deepEqual(writes, [1]);

    const pending = footer.refreshChat(1);
    await entered;
    const burst = Array.from({ length: 10 }, () => footer.refreshChat(1));
    finish({ capacity: 1000, used: 2 });
    await Promise.all([pending, ...burst]);
    assert.equal(reads, 3);
    assert.deepEqual(writes, [1, 3]);
});

test("clearing footer watches discards in-flight and queued refreshes", async () => {
    const repo = new InMemorySessionRepository();
    await bind(repo);
    let finish!: (context: OpenCodeContextUsage) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    let reads = 0;
    const footer = new TelegramContextFooter({ async execute() {
        reads += 1;
        started();
        return new Promise<OpenCodeContextUsage>((resolve) => { finish = resolve; });
    } }, repo, logger);
    let writes = 0;
    footer.watch(1, "ses_test", async () => { writes += 1; });
    const pending = footer.refreshChat(1);
    await entered;
    const queued = footer.refreshChat(1);
    footer.clear();
    finish({ capacity: 1000, used: 1 });
    await Promise.all([pending, queued]);
    assert.equal(reads, 1);
    assert.equal(writes, 0);
});

test("changing sessions while metadata is loading cannot write that metadata into the old status message", async () => {
    const repo = new InMemorySessionRepository();
    await bind(repo);
    let finish!: (context: OpenCodeContextUsage) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const footer = new TelegramContextFooter({ async execute(input) {
        assert.equal(input.sessionId, "ses_test");
        started();
        return new Promise<OpenCodeContextUsage>((resolve) => { finish = resolve; });
    } }, repo, logger);
    let writes = 0;
    footer.watch(1, "ses_test", async () => { writes += 1; });
    const pending = footer.refreshChat(1);
    await entered;
    await bind(repo, "ses_other");
    finish({ capacity: 1000, used: 100 });
    await pending;
    assert.equal(writes, 0);
    footer.clear();
});

test("context changes edit only the separate context message and preserve the duration of the whole request", async (t) => {
    let now = 0;
    t.mock.method(performance, "now", () => now);
    const { executePromptRequest } = await import("../src/bot/handlers/prompt.handler.js");
    const { ForegroundSessionTracker } = await import("../src/services/session-activity/foreground-session-tracker.js");
    const repo = new InMemorySessionRepository();
    await bind(repo);
    let used: number | null = 500;
    const footer = new TelegramContextFooter({ async execute() { return { capacity: 1000, used }; } }, repo, logger);
    const replies: string[] = [];
    const edits: Array<{ id: number; text: string }> = [];
    const handlerLogger = { child() { return this; }, warn() {}, error() {} } as unknown as AppLogger;
    await executePromptRequest({
        chat: { id: 1 },
        async reply(text) { replies.push(text); return { message_id: replies.length }; },
        api: {
            async deleteMessage() {},
            async editMessageText(_chatId, id, text) { edits.push({ id, text }); },
        },
    }, {
        sessionRepo: repo,
        logger: handlerLogger,
        thinkingMessages: createThinkingMessages().service,
        foregroundSessionTracker: new ForegroundSessionTracker(),
        contextFooter: footer,
        sendPromptUseCase: { async execute() { now = 40_000; return {
            sessionId: "ses_test", projectId: "p",
            assistantReply: { bodyMd: null, fallbackText: "ANSWER", assistantError: null, info: null,
                metrics: { durationMs: 100, tokens: { total: 999999, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } } },
        }; } },
    }, async () => ({ text: "test" }));
    assert.equal(replies[1], "ANSWER");
    assert.equal(replies[2], buildTelegramSessionFooter({ capacity: 1000, used: 500 }, getBotCopy("en"), 40_000).preferred.text);
    used = null;
    await footer.refreshSession("ses_test");
    used = 100;
    await footer.refreshSession("ses_test");
    assert.deepEqual(edits.filter((edit) => edit.id === 3), [
        { id: 3, text: buildTelegramSessionFooter({ capacity: 1000, used: null }, getBotCopy("en"), 40_000).preferred.text },
        { id: 3, text: buildTelegramSessionFooter({ capacity: 1000, used: 100 }, getBotCopy("en"), 40_000).preferred.text },
    ]);
    assert.equal(replies.length, 3);
    assert.ok(edits.every((edit) => edit.id !== 2));
    footer.clear();
});

test("a failed context message does not turn a successful answer into an error reply", async () => {
    const { executePromptRequest } = await import("../src/bot/handlers/prompt.handler.js");
    const { ForegroundSessionTracker } = await import("../src/services/session-activity/foreground-session-tracker.js");
    const tracker = new ForegroundSessionTracker();
    const replies: string[] = [];
    const warnings: string[] = [];
    await executePromptRequest({
        chat: { id: 1 },
        async reply(text) {
            if (text.includes("<b>Context</b>")) { throw new Error("connection reset"); }
            replies.push(text);
            return { message_id: replies.length };
        },
        api: { async deleteMessage() {}, async editMessageText() {} },
    }, {
        sessionRepo: new InMemorySessionRepository(),
        thinkingMessages: createThinkingMessages().service,
        foregroundSessionTracker: tracker,
        logger: { child() { return this; }, error() {}, warn(_data: unknown, message: string) { warnings.push(message); } } as unknown as AppLogger,
        contextFooter: {
            async read() { return { capacity: 1000, used: 100 }; },
            watch() { throw new Error("Failed sends must not be watched"); },
        } as never,
        sendPromptUseCase: { async execute() { return {
            sessionId: "ses_test", projectId: "p", assistantReply: {
                bodyMd: null, fallbackText: "ANSWER", assistantError: null, info: null,
                metrics: { durationMs: 100, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } },
            },
        }; } },
    }, async () => ({ text: "test" }));
    assert.deepEqual(replies, ["Processing...", "ANSWER"]);
    assert.ok(warnings.includes("failed to display context message"));
    assert.equal(tracker.hasActiveRequest(1), false);
});

test("formatted footer rejection falls back to plain text and refreshes only the same status message", async (t) => {
    const { executePromptRequest } = await import("../src/bot/handlers/prompt.handler.js");
    const { ForegroundSessionTracker } = await import("../src/services/session-activity/foreground-session-tracker.js");
    let now = 0;
    t.mock.method(performance, "now", () => now);
    const replies: string[] = [];
    const edits: Array<{ id: number; text: string }> = [];
    let refresh!: (context: OpenCodeContextUsage) => Promise<void>;
    const rejectFormat = () => { throw new GrammyError("Cannot parse entities", { ok: false, error_code: 400, description: "Cannot parse entities" }, "sendMessage", {}); };
    await executePromptRequest({
        chat: { id: 1 },
        async reply(text, other) {
            if (other?.parse_mode === "HTML") { rejectFormat(); }
            replies.push(text); return { message_id: replies.length };
        },
        api: {
            async deleteMessage() {},
            async editMessageText(_chatId, id, text, other) {
                if (other?.parse_mode === "HTML") { rejectFormat(); }
                edits.push({ id, text });
            },
        },
    }, {
        sessionRepo: new InMemorySessionRepository(), thinkingMessages: createThinkingMessages().service,
            foregroundSessionTracker: new ForegroundSessionTracker(),
        logger: { child() { return this; }, warn() {}, error() {} } as unknown as AppLogger,
        contextFooter: {
            async read() { return { capacity: 1000, used: 100 }; },
            watch(_chatId: number, _sessionId: string, update: typeof refresh) { refresh = update; },
        } as never,
        sendPromptUseCase: { async execute() { now = 19_100; return {
            sessionId: "ses_test", projectId: "p", assistantReply: {
                bodyMd: null, fallbackText: "ANSWER", assistantError: null, info: null,
                metrics: { durationMs: 100, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } },
            },
        }; } },
    }, async () => ({ text: "test" }));
    assert.equal(replies.length, 3);
    assert.equal(replies[1], "ANSWER");
    assert.match(replies[2], /^Workspace: n\/a\nModel: n\/a\(n\/a\)\nAgent: n\/a\nContext: 90% left \| 1K\nDuration: 19.1s$/u);
    await refresh({ capacity: 2000, used: 100, session: { directory: "/new/workspace", modelName: "New Model", providerID: "p", variant: "max", agentName: "plan" } });
    const update = edits.at(-1)!;
    assert.equal(update.id, 3);
    assert.match(update.text, /^Workspace: \/new\/workspace\nModel: p \/ New Model\(max\)\nAgent: plan/u);
    assert.ok(update.text.endsWith("Duration: 19.1s"));
    assert.equal(replies.length, 3);
});
