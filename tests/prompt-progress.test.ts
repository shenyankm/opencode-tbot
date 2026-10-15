import assert from "node:assert/strict";
import test from "node:test";
import { GrammyError } from "grammy";
import { setImmediate } from "node:timers/promises";
import { createThinkingMessages } from "./helpers/thinking.js";
import { executePromptRequest } from "../src/bot/handlers/prompt.handler.js";
import type { SendPromptInput } from "../src/use-cases/send-prompt.usecase.js";
import { getBotCopy } from "../src/bot/copy.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import { TelegramPromptProgress, type TelegramProgressReply } from "../src/services/telegram/prompt-progress.js";
import { splitTelegramText, buildTelegramPromptReplies } from "../src/services/telegram/telegram-format.js";
import { retryTelegramRequest } from "../src/services/telegram/telegram-message-queue.js";

import { handlePromptStopCallback } from "../src/bot/handlers/callbacks/prompt-stop.handler.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import type { AppLogger } from "../src/infra/logger/index.js";

const logger = { child() { return this; }, warn() {}, error() {} } as unknown as AppLogger;

test("thinking uses localized expandable quotes and escapes provider text without changing the plain fallback", async () => {
    for (const language of ["en", "zh-CN", "ja"] as const) {
        const copy = getBotCopy(language);
        const writes: TelegramProgressReply[][] = [];
        const progress = new TelegramPromptProgress(copy, async (replies) => { writes.push(replies); }, (error) => { throw error; });
        const reasoning = "<b>literal</b> &lt; & 😀\n".repeat(20);
        progress.accept({ type: "session.reasoning.delta", data: { assistantMessageID: "a", ordinal: 0, delta: reasoning } });
        progress.accept({ type: "session.compaction.started", data: {} });
        await setImmediate();
        const streaming = writes.at(-1)![0];
        assert.equal(streaming.preferred.options?.parse_mode, "HTML");
        assert.ok(streaming.preferred.text.startsWith(`<p>💭 ${copy.status.thinkingInProgress} · `));
        assert.ok(streaming.preferred.text.includes(`>${copy.status.expandThinking}</tg-button>`));
        assert.doesNotMatch(streaming.preferred.text, /literal|<details>|<br/);
        assert.equal(streaming.thinking?.text, reasoning);
        await progress.finish("completed");
        assert.ok(writes.at(-1)![0].preferred.text.startsWith(`<p>💭 ${copy.status.thinking} · `));
        assert.doesNotMatch(writes.at(-1)![0].preferred.text, /Context:|Completed|已完成/);
    }
});

test("long thinking preserves every part in expandable messages without leaking secrets or breaking Unicode", async () => {
    const writes: TelegramProgressReply[][] = [];
    const progress = new TelegramPromptProgress(getBotCopy("en"), async (replies) => { writes.push(replies); }, (error) => { throw error; });
    const reasoning = "BEGIN\n" + "中文😀<&>\n".repeat(2_000) + "token=syntheticsecret\nEND";
    progress.accept({ type: "session.reasoning.ended", data: { assistantMessageID: "a", ordinal: 0, text: reasoning } });
    progress.accept({ type: "session.reasoning.ended", data: { assistantMessageID: "b", ordinal: 0, text: "SECOND STEP" } });
    await progress.finish("completed");
    const replies = writes.at(-1)!;
    assert.ok(replies.length > 3);
    assert.equal(replies.map((reply) => reply.thinking!.text).join(""), reasoning.replace("syntheticsecret", "[REDACTED]") + "\nSECOND STEP");
    for (const [index, reply] of replies.entries()) {
        assert.equal(reply.preferred.options?.parse_mode, "HTML");
        assert.ok(reply.preferred.text.startsWith(`<p>💭 Thinking · ${index + 1} · `));
        assert.ok(reply.preferred.text.endsWith("</p>"));
        assert.ok(reply.fallback.text.length <= 1_152);
        assert.doesNotMatch(reply.preferred.text, /syntheticsecret/);
        assert.doesNotMatch(reply.thinking!.text, /[\uD800-\uDBFF]$/u);
        assert.doesNotMatch(reply.thinking!.text, /^[\uDC00-\uDFFF]/u);
    }
});

test("streaming thinking reuses unchanged messages, replaces final text and removes surplus cards", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const outcome of ["completed", "stopped", "failed"] as const) {
        const tracker = new ForegroundSessionTracker();
        const thinking = createThinkingMessages();
        const messages = new Map<number, { text: string; other?: { parse_mode?: string; reply_markup?: { inline_keyboard: unknown[][] } } }>();
        const edits: number[] = [];
        const deleted: number[] = [];
        let nextId = 0;
        await executePromptRequest({
            chat: { id: 1 },
            async reply(text, other) { const id = ++nextId; messages.set(id, { text, other }); return { message_id: id }; },
            api: {
                async deleteMessage(_chatId, id) { messages.delete(id); deleted.push(id); },
                async editMessageText(_chatId, id, text, other) { messages.set(id, { text, other }); edits.push(id); },
            },
        }, {
            thinkingMessages: thinking.service, foregroundSessionTracker: tracker, sessionRepo: new InMemorySessionRepository(), logger,
            contextFooter: { async read() { return { capacity: 1000, used: 100 }; }, watch() {} } as never,
            sendPromptUseCase: { async execute(input) {
                input.onExecutionSession?.("ses_test");
                input.onInputReady?.("msg_input");
                const emit = (type: string, extra = {}) => tracker.publish({ type, data: { sessionID: "ses_test", assistantMessageID: "a", ordinal: 0, ...extra } });
                emit("session.inbox.delivered", { inboxID: "msg_input" });
                emit("session.step.started");
                emit("session.reasoning.delta", { delta: "A".repeat(2_500) });
                t.mock.timers.tick(1_000);
                await setImmediate();
                assert.equal(messages.size, 3);
                assert.ok([...messages.values()].every((message) => message.other?.reply_markup?.inline_keyboard.flat().length === 1));
                const firstWrites = edits.filter((id) => id === 1).length;
                emit("session.reasoning.delta", { delta: "B".repeat(100) });
                t.mock.timers.tick(1_000);
                await setImmediate();
                assert.equal(messages.size, 3);
                assert.equal(edits.filter((id) => id === 1).length, firstWrites);
                if (outcome !== "completed") {
                    if (outcome === "stopped") { tracker.abort(1, new Error("Stop requested")); }
                    throw new Error(outcome);
                }
                emit("session.reasoning.ended", { text: "FINAL THINKING" });
                return { sessionId: "ses_test", projectId: "p", assistantReply: {
                    bodyMd: null, fallbackText: "ANSWER", assistantError: null, info: null,
                    metrics: { durationMs: 100, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } },
                } };
            } },
        }, async () => ({ text: "test" }));
        if (outcome === "completed") {
            assert.deepEqual(deleted, [2, 3]);
            assert.equal((await thinking.repository.get(1, 1))!.text, "FINAL THINKING");
            assert.doesNotMatch(messages.get(1)!.text, /FINAL THINKING|<details>/);
            assert.equal(thinking.messages.size, 1);
            assert.equal(messages.get(4)!.text, "ANSWER");
            assert.match(messages.get(5)!.text, /<b>Context<\/b>: 90% left \| 1K<br\/><b>Duration<\/b>: \d+(?:\.\d+)?s$/u);
        } else {
            assert.deepEqual(deleted, []);
            const cards = [...messages.entries()].filter(([id]) => id <= 3).map(([, message]) => message);
            assert.ok(cards.every((message) => message.text.includes(getBotCopy("en").status[outcome])));
            assert.equal([1, 2, 3].map((id) => thinking.messages.get(`1:${id}`)!.text).join(""), "A".repeat(2_500) + "B".repeat(100));
        }
        assert.ok([...messages.entries()].filter(([id]) => id <= 3).every(([, message]) => message.other!.reply_markup!.inline_keyboard.flat().length === 0));
        assert.equal(tracker.hasActiveRequest(1), false);
    }
});

test("appending to one of one hundred thinking chunks reads only the changed chunk and finalizes every chunk", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const tracker = new ForegroundSessionTracker();
    const thinking = createThinkingMessages();
    const get = t.mock.method(thinking.repository, "get");
    let nextId = 0;
    const emit = (type: string, extra = {}) => tracker.publish({ type, data: {
        sessionID: "s", assistantMessageID: "a", ordinal: 0, ...extra,
    } });
    await executePromptRequest({
        chat: { id: 1 },
        async reply() { return { message_id: ++nextId }; },
        api: { async deleteMessage() {}, async editMessageText() {} },
    }, {
        thinkingMessages: thinking.service, foregroundSessionTracker: tracker,
        sessionRepo: new InMemorySessionRepository(), logger,
        sendPromptUseCase: { async execute(input) {
            input.onExecutionSession?.("s");
            input.onInputReady?.("input");
            emit("session.inbox.delivered", { inboxID: "input" });
            emit("session.step.started");
            emit("session.reasoning.delta", { delta: "A".repeat(96_000) });
            t.mock.timers.tick(1_000);
            await setImmediate();
            assert.equal(thinking.messages.size, 100);
            const initialReads = get.mock.callCount();
            emit("session.reasoning.delta", { delta: "B" });
            t.mock.timers.tick(1_000);
            await setImmediate();
            assert.equal(get.mock.callCount() - initialReads, 1);
            assert.equal([...thinking.messages.values()].map((message) => message.text).join(""), "A".repeat(96_000) + "B");
            await thinking.service.setExpanded(1, 1, true, tracker.getRequestId(1), getBotCopy("en"), async () => {});
            return { sessionId: "s", projectId: "p", assistantReply: {
                bodyMd: "answer", fallbackText: "answer", assistantError: null, info: null,
                metrics: { durationMs: 100, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } },
            } };
        } },
    }, async () => ({ text: "test" }));
    assert.ok([...thinking.messages.values()].every((message) => message.phase === "completed" && message.stopCallbackData === null));
    assert.equal(thinking.messages.get("1:1")?.expanded, true);
});

test("a failed thinking edit is retried even when the next flush has identical thinking content", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const tracker = new ForegroundSessionTracker();
    const thinking = createThinkingMessages();
    let edits = 0;
    const emit = (type: string, extra = {}) => tracker.publish({ type, data: {
        sessionID: "s", assistantMessageID: "a", ordinal: 0, ...extra,
    } });
    await executePromptRequest({
        chat: { id: 1 }, async reply() { return { message_id: 1 }; },
        api: { async deleteMessage() {}, async editMessageText() {
            if (++edits === 1) { throw new Error("offline"); }
        } },
    }, {
        thinkingMessages: thinking.service, foregroundSessionTracker: tracker,
        sessionRepo: new InMemorySessionRepository(), logger,
        sendPromptUseCase: { async execute(input) {
            input.onExecutionSession?.("s");
            input.onInputReady?.("input");
            emit("session.inbox.delivered", { inboxID: "input" });
            emit("session.step.started");
            emit("session.reasoning.delta", { delta: "thinking" });
            t.mock.timers.tick(1_000);
            await setImmediate();
            assert.equal(edits, 1);
            emit("session.text.delta", { delta: "answer" });
            t.mock.timers.tick(1_000);
            await setImmediate();
            assert.equal(edits, 2);
            assert.ok(thinking.messages.get("1:1")?.lastSentView);
            return { sessionId: "s", projectId: "p", assistantReply: {
                bodyMd: "answer", fallbackText: "answer", assistantError: null, info: null,
                metrics: { durationMs: 100, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } },
            } };
        } },
    }, async () => ({ text: "test" }));
    assert.equal(thinking.messages.get("1:1")?.phase, "completed");
});

test("session compression reaches waiting requests before input delivery without leaking other sessions", () => {
    const tracker = new ForegroundSessionTracker();
    const received: string[] = [];
    const lease = tracker.acquire(1, (event) => received.push(event.type))!;
    lease.attachSession("ses_test");
    lease.attachInput("msg_input");
    const emit = (type: string, extra = {}) => tracker.publish({ type, data: { sessionID: "ses_test", ...extra } });
    emit("session.compaction.ended");
    tracker.publish({ type: "session.compaction.started", data: { sessionID: "ses_other", inputID: "msg_input" } });
    emit("session.compaction.started", { reason: "auto" });
    emit("session.compaction.delta", { delta: "private summary" });
    emit("session.compaction.ended");
    emit("session.inbox.delivered", { inboxID: "msg_input" });
    emit("session.compaction.started", { reason: "auto" });
    emit("session.compaction.failed");
    assert.deepEqual(received, ["session.compaction.started", "session.compaction.ended", "session.compaction.started", "session.compaction.failed"]);
    lease.dispose();
    emit("session.compaction.started", { reason: "auto" });
    assert.equal(received.length, 4);
});

test("context compression is localized, keeps existing output and never sends its summary as an answer", async () => {
    for (const language of ["en", "zh-CN", "ja"] as const) {
        const copy = getBotCopy(language);
        const writes: Array<{ text: string; terminal: boolean }> = [];
        const answers: string[] = [];
        const compactions: Array<{ text: string; terminal: boolean }> = [];
        const progress = new TelegramPromptProgress(copy, async (replies, terminal) => { writes.push({ text: replies[0].thinking?.text ?? replies[0].fallback.text, terminal }); }, (error) => { throw error; }, async (text) => { answers.push(text); }, async (text, terminal) => { compactions.push({ text, terminal }); });
        progress.accept({ type: "session.reasoning.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "existing thinking" } });
        progress.accept({ type: "session.text.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "existing answer" } });
        progress.accept({ type: "session.compaction.started", data: {} });
        await setImmediate();
        assert.equal(compactions.at(-1)!.text, copy.status.compacting);
        assert.equal(compactions.at(-1)!.terminal, false);
        assert.equal(writes.at(-1)!.terminal, false);
        progress.accept({ type: "session.compaction.delta", data: { delta: "PRIVATE SUMMARY" } });
        progress.accept({ type: "session.compaction.ended", data: { text: "PRIVATE SUMMARY", tokens: { input: 99 } } });
        await setImmediate();
        assert.equal(compactions.at(-1)!.text, copy.status.compacted);
        assert.equal(compactions.at(-1)!.terminal, true);
        assert.ok(writes.every((write) => !write.text.includes(copy.status.compacted) && !write.text.includes(copy.status.compacting)));
        assert.ok(compactions.every((write) => !write.text.includes("existing thinking")));
        assert.ok(writes.at(-1)!.text.includes("existing thinking"));
        progress.accept({ type: "session.text.delta", data: { assistantMessageID: "a", ordinal: 0, delta: " continued" } });
        await progress.finish("completed");
        assert.equal(answers.at(-1), "existing answer continued");
        assert.ok(writes.every((write) => !write.text.includes("PRIVATE SUMMARY")));
        assert.equal(writes.at(-1)!.terminal, true);
    }
});

test("compression failure and cancellation do not leave a misleading running status", async () => {
    const copy = getBotCopy("zh-CN");
    for (const terminal of ["failed", "stopped"] as const) {
        const writes: string[] = [];
        const compactions: string[] = [];
        const progress = new TelegramPromptProgress(copy, async (replies) => { writes.push(replies[0].fallback.text); }, (error) => { throw error; }, undefined, async (text) => { compactions.push(text); });
        progress.accept({ type: "session.compaction.started", data: {} });
        await setImmediate();
        if (terminal === "failed") {
            progress.accept({ type: "session.compaction.failed", data: { error: { message: "SECRET" } } });
            await setImmediate();
            assert.equal(compactions.at(-1), copy.status.compactionFailed);
        }
        await progress.finish(terminal);
        assert.ok(writes.at(-1)!.includes(copy.status[terminal]));
        assert.ok(!writes.at(-1)!.includes(copy.status.compacting));
        assert.ok(!writes.at(-1)!.includes("SECRET"));
        assert.equal(progress.hasContent, false);
        assert.ok(!compactions.at(-1)!.includes(copy.status.compacting));
    }
});

test("progress accepts only the admitted input and its assistant messages", () => {
    const tracker = new ForegroundSessionTracker();
    const received: string[] = [];
    const lease = tracker.acquire(1, (event) => received.push(event.type))!;
    lease.attachSession("ses_test");
    lease.attachInput("msg_input");
    const emit = (type: string, extra = {}) => tracker.publish({ type, data: { sessionID: "ses_test", ...extra } });
    emit("session.text.delta", { assistantMessageID: "msg_other", delta: "unrelated" });
    emit("session.inbox.delivered", { inboxID: "msg_input" });
    emit("session.step.started", { assistantMessageID: "msg_answer" });
    emit("session.text.delta", { assistantMessageID: "msg_other", delta: "unrelated" });
    emit("session.reasoning.delta", { assistantMessageID: "msg_answer", delta: "thinking" });
    emit("session.inbox.delivered", { inboxID: "msg_next" });
    emit("session.text.delta", { assistantMessageID: "msg_answer", delta: "next turn" });
    assert.deepEqual(received, ["session.step.started", "session.reasoning.delta"]);
    lease.dispose();
    assert.equal(tracker.getRequestId(1), null);
});

test("progress streams reasoning and answers without displaying tool details or a request per token", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const writes: Array<{ text: string; terminal: boolean }> = [];
    const answers: string[] = [];
    const progress = new TelegramPromptProgress(getBotCopy("zh-CN"), async (replies, terminal) => {
        writes.push({ text: replies[0].thinking?.text ?? replies[0].fallback.text, terminal });
    }, (error) => { throw error; }, async (text) => { answers.push(text); });
    const emit = (type: string, extra: Record<string, unknown> = {}) => progress.accept({
        type,
        data: { assistantMessageID: "msg_answer", ordinal: 0, ...extra },
    });
    emit("session.reasoning.started");
    for (let index = 0; index < 100; index += 1) {
        emit("session.reasoning.delta", { delta: "思考" });
    }
    assert.equal(writes.length, 0);
    t.mock.timers.tick(1_000);
    await setImmediate();
    assert.equal(writes.length, 1);
    assert.match(writes[0].text, /思考/);
    emit("session.reasoning.ended", { text: "完整思考" });
    emit("session.tool.input.started", { id: "tool_1", name: "bash" });
    emit("session.tool.called", { id: "tool_1", input: { command: "echo token=topsecret" } });
    t.mock.timers.tick(1_000);
    await setImmediate();
    assert.doesNotMatch(writes.at(-1)!.text, /bash/);
    assert.doesNotMatch(writes.at(-1)!.text, /topsecret/);
    emit("session.tool.success", { id: "tool_1", content: [{ type: "text", text: "ok" }] });
    emit("session.text.delta", { delta: "answer" });
    emit("session.text.ended", { text: "complete answer" });
    await progress.finish("completed");
    const final = writes.at(-1)!;
    assert.equal(final.terminal, true);
    assert.equal(final.text, "完整思考");
    assert.doesNotMatch(final.text, /已完成|\d+\.\d+s/);
    assert.match(final.text, /完整思考/);
    assert.doesNotMatch(final.text, /bash/);
    assert.doesNotMatch(final.text, /complete answer/);
    assert.equal(answers.at(-1), "complete answer");
    assert.doesNotMatch(final.text, /answercomplete/);
    emit("session.text.delta", { delta: "late" });
    t.mock.timers.tick(10_000);
    assert.equal(writes.at(-1), final);
});

test("stopped progress keeps partial output and hides tool failures", async () => {
    const writes: string[] = [];
    const answers: string[] = [];
    const progress = new TelegramPromptProgress(getBotCopy("en"), async (replies) => { writes.push(replies[0].fallback.text); }, (error) => { throw error; }, async (text) => { answers.push(text); });
    progress.accept({ type: "session.text.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "partial" } });
    progress.accept({ type: "session.tool.input.started", data: { assistantMessageID: "a", id: "t", name: "read" } });
    progress.accept({ type: "session.tool.failed", data: { assistantMessageID: "a", id: "t", error: { message: "File missing" } } });
    await progress.finish("stopped");
    assert.match(writes.at(-1)!, /Stopped/);
    assert.doesNotMatch(writes.at(-1)!, /partial/);
    assert.equal(answers.at(-1), "partial");
    assert.doesNotMatch(writes.at(-1)!, /read|File missing/);
});

test("long Telegram replies preserve every character and keep Unicode intact", () => {
    const body = ("你好😀".repeat(1_200) + "\n").repeat(3);
    const result: PromptSessionResult = {
        bodyMd: body, fallbackText: body, assistantError: null, info: null,
        metrics: { durationMs: 100, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } },
    };
    const replies = buildTelegramPromptReplies(result);
    assert.ok(replies.length > 1);
    assert.ok(replies.every((reply) => reply.preferred.text.length <= 1_152));
    assert.ok(replies.map((reply) => reply.preferred.text).join("").startsWith(body.trim()));
    assert.equal(splitTelegramText(body).join(""), body);
    assert.ok(splitTelegramText(body).every((chunk) => !/[\uD800-\uDBFF]$/u.test(chunk)));
});

test("Telegram requests retry only explicit rate limit rejections", async () => {
    let calls = 0;
    assert.equal(await retryTelegramRequest(async () => {
        if (++calls === 1) { throw { error_code: 429, parameters: { retry_after: 0 } }; }
        return "ok";
    }), "ok");
    assert.equal(calls, 2);
    let failures = 0;
    await assert.rejects(retryTelegramRequest(async () => { failures += 1; throw new Error("Network"); }), /Network/);
    assert.equal(failures, 1);
});

test("an old stop button cannot cancel a newer request", async () => {
    const tracker = new ForegroundSessionTracker();
    const old = tracker.acquire(1)!;
    old.dispose();
    const current = tracker.acquire(1)!;
    old.attachSession("expired");
    assert.equal(tracker.getActiveSessionId(1), null);
    let cancellations = 0;
    const replies: unknown[] = [];
    const dependencies = {
        thinkingMessages: createThinkingMessages().service, foregroundSessionTracker: tracker, sessionRepo: new InMemorySessionRepository(), logger,
        abortPromptUseCase: { async execute() { cancellations += 1; return { status: "aborted" as const, sessionId: null, sessionStatus: null }; } },
    };
    const context = {
        chat: { id: 1 }, callbackQuery: { data: `prompt:stop:${old.id}` },
        async answerCallbackQuery(other?: unknown) { replies.push(other); }, async editMessageText() {},
    };
    await handlePromptStopCallback(context, dependencies);
    assert.equal(cancellations, 0);
    assert.equal(tracker.hasActiveRequest(1), true);
    await handlePromptStopCallback({ ...context, callbackQuery: { data: `prompt:stop:${current.id}` } }, dependencies);
    assert.equal(cancellations, 1);
    current.dispose();
});

test("a stop callback rechecks request identity after acknowledging the button", async () => {
    const tracker = new ForegroundSessionTracker();
    const old = tracker.acquire(1)!;
    let next: ReturnType<typeof tracker.acquire>;
    let calls = 0;
    await handlePromptStopCallback({
        chat: { id: 1 }, callbackQuery: { data: `prompt:stop:${old.id}` },
        async answerCallbackQuery() { old.dispose(); next = tracker.acquire(1); },
        async editMessageText() {},
    }, {
        foregroundSessionTracker: tracker, sessionRepo: new InMemorySessionRepository(), logger,
        abortPromptUseCase: { async execute() { calls += 1; return { status: "aborted", sessionId: null, sessionStatus: null }; } },
    });
    assert.equal(calls, 0);
    assert.equal(tracker.hasActiveRequest(1), true);
    next!.dispose();
});

test("expandable thinking stays separate from the streamed answer and context with a safe format fallback", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const rejectHtml of [false, true]) {
        const tracker = new ForegroundSessionTracker();
        const thinking = createThinkingMessages();
        const replies: string[] = [];
        const edits: Array<{ id: number; text: string; other?: { parse_mode?: string; reply_markup?: { inline_keyboard: unknown[][] } } }> = [];
        const metrics = { durationMs: 100, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } };
        await executePromptRequest({
            chat: { id: 1 },
            api: {
                async deleteMessage() {},
                async editMessageText(_chatId, id, text, other) {
                    if (rejectHtml && other?.parse_mode === "HTML") { throw new GrammyError("Cannot parse entities", { ok: false, error_code: 400, description: "Cannot parse entities" }, "editMessageText", {}); }
                    edits.push({ id, text, other });
                },
            },
            async reply(text) { replies.push(text); return { message_id: replies.length }; },
        }, {
            thinkingMessages: thinking.service, foregroundSessionTracker: tracker, sessionRepo: new InMemorySessionRepository(), logger,
            contextFooter: { async read() { return { capacity: 1000, used: 100 }; }, watch() {} } as never,
            sendPromptUseCase: {
                async execute(input: SendPromptInput) {
                    input.onExecutionSession?.("ses_test");
                    input.onInputReady?.("msg_input");
                    const emit = (type: string, extra = {}) => tracker.publish({ type, data: { sessionID: "ses_test", ...extra } });
                    emit("session.inbox.delivered", { inboxID: "msg_input" });
                    emit("session.step.started", { assistantMessageID: "msg_answer" });
                    emit("session.reasoning.delta", { assistantMessageID: "msg_answer", ordinal: 0, delta: "THINKINGONLY" });
                    emit("session.text.delta", { assistantMessageID: "msg_answer", ordinal: 0, delta: "ANSWERONLY" });
                    t.mock.timers.tick(1_000);
                    await setImmediate();
                    return {
                        projectId: "p", sessionId: "ses_test",
                        assistantReply: { bodyMd: "ANSWERONLY", fallbackText: "ANSWERONLY", assistantError: null, info: null, metrics },
                    };
                },
            },
        }, async () => ({ text: "test" }));
        assert.equal(replies.length, 3);
        assert.match(replies[2], /<b>Context<\/b>: 90% left \| 1K<br\/><b>Duration<\/b>: \d+(?:\.\d+)?s$/u);
        assert.equal(replies[1], "ANSWERONLY");
        const thinkingEdits = edits.filter((edit) => edit.id === 1);
        assert.equal((await thinking.repository.get(1, 1))!.text, "THINKINGONLY");
        assert.ok(thinkingEdits.every((edit) => !edit.text.includes("THINKINGONLY")));
        assert.ok(thinkingEdits.every((edit) => !/ANSWERONLY|Context:/.test(edit.text)));
        assert.ok(thinkingEdits.every((edit) => edit.other?.parse_mode === (rejectHtml ? undefined : "HTML")));
        assert.ok(thinkingEdits[0].other!.reply_markup!.inline_keyboard.flat().length > 0);
        assert.equal(thinkingEdits.at(-1)!.other!.reply_markup!.inline_keyboard.flat().length, rejectHtml ? 1 : 0);
        assert.ok(thinkingEdits.at(-1)!.text.startsWith(rejectHtml ? "💭 Thinking" : "<p>💭 Thinking · "));
        const answerEdits = edits.filter((edit) => edit.id === 2);
        assert.equal(answerEdits.length, 0); // The streamed Rich Markdown is already the final answer.
        assert.equal(tracker.hasActiveRequest(1), false);
    }
});

test("disposing or aborting an old lease leaves its successor running", () => {
    const tracker = new ForegroundSessionTracker();
    const old = tracker.acquire(1)!;
    old.dispose();
    const current = tracker.acquire(1)!;
    old.dispose();
    assert.equal(tracker.getRequestId(1), current.id);
    assert.equal(tracker.abort(1, new Error("old"), old.id), false);
    assert.equal(current.signal.aborted, false);
    current.dispose();
});

test("compression has a separate message and survives cleanup when the model returns no thinking", async () => {
    const tracker = new ForegroundSessionTracker();
    const replies: Array<{ text: string; other?: unknown }> = [];
    const edits: Array<{ id: number; text: string; other?: unknown }> = [];
    const deleted: number[] = [];
    await executePromptRequest({
        chat: { id: 1 },
        async reply(text, other) { replies.push({ text, other }); return { message_id: replies.length }; },
        api: {
            async deleteMessage(_chatId, id) { deleted.push(id); },
            async editMessageText(_chatId, id, text, other) { edits.push({ id, text, other }); },
        },
    }, {
        thinkingMessages: createThinkingMessages().service, foregroundSessionTracker: tracker, sessionRepo: new InMemorySessionRepository(), logger,
        sendPromptUseCase: { async execute(input) {
            input.onExecutionSession?.("ses_test");
            input.onInputReady?.("msg_input");
            tracker.publish({ type: "session.inbox.delivered", data: { sessionID: "ses_test", inboxID: "msg_input" } });
            tracker.publish({ type: "session.step.started", data: { sessionID: "ses_test", assistantMessageID: "assistant" } });
            tracker.publish({ type: "session.reasoning.ended", data: { sessionID: "ses_test", assistantMessageID: "assistant", ordinal: 0, text: "" } });
            tracker.publish({ type: "session.compaction.started", data: { sessionID: "ses_test", reason: "auto" } });
            await setImmediate();
            tracker.publish({ type: "session.compaction.ended", data: { sessionID: "ses_test", text: "PRIVATE SUMMARY" } });
            await setImmediate();
            return { sessionId: "ses_test", projectId: "p", assistantReply: {
                bodyMd: null, fallbackText: "ANSWER", assistantError: null, info: null,
                metrics: { durationMs: 100, tokens: { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 } },
            } };
        } },
    }, async () => ({ text: "test" }));
    assert.equal(replies.length, 3);
    assert.equal(replies[1].text, "Compressing context… Please wait.");
    assert.match(replies[2].text, /^ANSWER/);
    assert.deepEqual(deleted, [1]);
    const statusEdits = edits.filter((edit) => edit.id === 2);
    assert.equal(statusEdits.length, 1);
    assert.equal(statusEdits[0].text, "Context compressed.");
    assert.equal((statusEdits[0].other as { reply_markup: { inline_keyboard: unknown[][] } }).reply_markup.inline_keyboard.flat().length, 0);
    assert.ok([...replies, ...edits].every((entry) => !entry.text.includes("PRIVATE SUMMARY")));
});
