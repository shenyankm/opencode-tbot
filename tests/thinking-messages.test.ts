import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GrammyError, HttpError } from "grammy";
import { getBotCopy } from "../src/bot/copy.js";
import { handleThinkingCallback } from "../src/bot/handlers/callbacks/thinking-callback.handler.js";
import { FileThinkingMessageRepository } from "../src/repositories/thinking-message.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import { buildThinkingMessageReply, TelegramThinkingMessages, type ThinkingMessageWriter } from "../src/services/telegram/thinking-messages.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { createThinkingMessages } from "./helpers/thinking.js";

const copy = getBotCopy("zh-CN");
const logger = { warn() {} } as unknown as AppLogger;

function capture() {
    const calls: Array<{ text: string; mode?: string; buttons: string[] }> = [];
    const write: ThinkingMessageWriter = async (payload, keyboard) => {
        calls.push({ text: payload.text, mode: payload.options?.parse_mode, buttons: keyboard.inline_keyboard.flat().map((button) => "callback_data" in button ? button.callback_data : "") });
    };
    return { calls, write };
}

test("compact thinking is one paragraph with a localized inline toggle and no hidden-body placeholder", () => {
    for (const language of ["en", "zh-CN", "ja"] as const) {
        const localized = getBotCopy(language);
        const content = { phase: "completed" as const, text: "<b>literal</b> & 😀\nSecond line", part: 2 };
        const collapsed = buildThinkingMessageReply(content, false, localized).preferred.text;
        assert.ok(collapsed.startsWith(`<p>💭 ${localized.status.thinking} · 2 · `));
        assert.ok(collapsed.includes(`data="thinking:expand">${localized.status.expandThinking}</tg-button>`));
        assert.doesNotMatch(collapsed, /literal|Second line|<br|details/);
        const expanded = buildThinkingMessageReply(content, true, localized).preferred.text;
        assert.match(expanded, /data="thinking:collapse"/u);
        assert.match(expanded, /&lt;b&gt;literal&lt;\/b&gt; &amp; 😀<br\/>Second line/u);
        assert.doesNotMatch(expanded, /<b>literal/);
    }
});

test("collapsed streams retain complete new content without redundant edits and expanded streams stay expanded", async () => {
    const { service, repository } = createThinkingMessages();
    const { calls, write } = capture();
    await service.update(1, 10, { phase: "running", text: "first" }, "request", copy, write);
    await service.update(1, 10, { phase: "running", text: "first plus second" }, "request", copy, write);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].buttons, ["prompt:stop:request"]);
    assert.equal((await repository.get(1, 10))!.text, "first plus second");
    await service.setExpanded(1, 10, true, "request", copy, write);
    assert.match(calls.at(-1)!.text, /first plus second/);
    await service.update(1, 10, { phase: "running", text: "first plus second and third" }, "request", copy, write);
    assert.match(calls.at(-1)!.text, /first plus second and third/);
    assert.equal((await repository.get(1, 10))!.expanded, true);
    await service.setExpanded(1, 10, false, "request", copy, write);
    assert.doesNotMatch(calls.at(-1)!.text, /first/);
    await service.update(1, 10, { phase: "completed", text: "final" }, "request", copy, write);
    assert.deepEqual(calls.at(-1)!.buttons, []);
    await service.setExpanded(1, 10, true, null, copy, write);
    assert.match(calls.at(-1)!.text, /final/);
});

test("queued clicks and streaming updates preserve the newest content and explicit actions are idempotent", async () => {
    const { service, repository } = createThinkingMessages();
    const { calls, write } = capture();
    await service.update(1, 10, { phase: "running", text: "before" }, "r", copy, write);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const expand = service.setExpanded(1, 10, true, "r", copy, async (...args) => { await wait; return write(...args); });
    const update = service.update(1, 10, { phase: "running", text: "latest" }, "r", copy, write);
    const expandAgain = service.setExpanded(1, 10, true, "r", copy, write);
    release();
    await Promise.all([expand, update, expandAgain]);
    assert.equal((await repository.get(1, 10))!.expanded, true);
    assert.equal((await repository.get(1, 10))!.text, "latest");
    assert.match(calls.at(-1)!.text, /latest/);
});

test("a failed edit is retried on a later update while the newest complete text remains saved", async () => {
    const { service, repository } = createThinkingMessages();
    const error = new HttpError("reset", new Error("ECONNRESET"));
    let attempts = 0;
    await assert.rejects(service.update(1, 10, { phase: "running", text: "first" }, "r", copy, async () => { attempts++; throw error; }), (actual) => actual === error);
    assert.equal(attempts, 1);
    assert.equal((await repository.get(1, 10))!.text, "first");
    const { calls, write } = capture();
    await service.update(1, 10, { phase: "running", text: "latest" }, "r", copy, write);
    assert.equal(calls.length, 1);
    await service.remove(1, 10, async () => { throw error; }).catch(() => {});
    assert.ok(await repository.get(1, 10));
    await service.remove(1, 10, async () => {});
    assert.equal(await repository.get(1, 10), null);
});

test("format fallback preserves toggle and stop controls", async () => {
    const { service } = createThinkingMessages();
    const { calls, write } = capture();
    await service.update(1, 10, { phase: "running", text: "retained" }, "r", copy, async (payload, keyboard) => {
        if (payload.options) throw new GrammyError("bad format", { ok: false, error_code: 400, description: "bad format" }, "editMessageText", {});
        return write(payload, keyboard);
    });
    assert.equal(calls[0].mode, undefined);
    assert.deepEqual(calls[0].buttons, ["thinking:expand", "prompt:stop:r"]);
});

test("private per-message files survive restart and orphaned streaming messages remain readable without stale Stop controls", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "tbot-thinking-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const service = new TelegramThinkingMessages(new FileThinkingMessageRepository(directory));
    const { write } = capture();
    const text = "original <tag> & 😀\ntoken=syntheticsecret";
    await service.update(-100, 42, { phase: "running", text }, "old-request", copy, write);
    const path = join(directory, "-100.42.json");
    assert.doesNotMatch(await readFile(path, "utf8"), /syntheticsecret/);
    if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o077, 0);
    const restartedRepo = new FileThinkingMessageRepository(directory);
    const restarted = new TelegramThinkingMessages(restartedRepo);
    const { calls, write: rewrite } = capture();
    assert.equal(await restarted.setExpanded(-100, 42, true, null, copy, rewrite), true);
    assert.match(calls[0].text, /original &lt;tag&gt; &amp; 😀/);
    assert.deepEqual(calls[0].buttons, []);
    assert.equal((await restartedRepo.get(-100, 42))!.phase, "stopped");
    assert.equal(await restartedRepo.get(-101, 42), null);
    await assert.rejects(restartedRepo.get(1, NaN), /Invalid thinking message identity/);
    await writeFile(path, JSON.stringify({ message: { ...(await restartedRepo.get(-100, 42)), chatId: 999 } }));
    await assert.rejects(restartedRepo.get(-100, 42), /does not belong/);
});

test("callbacks edit the original message, reject missing chat data, and leave content intact on edit failure", async () => {
    const { service } = createThinkingMessages();
    const { write } = capture();
    await service.update(1, 42, { phase: "completed", text: "BODY" }, "r", copy, write);
    const sessionRepo = new InMemorySessionRepository();
    const dependencies = { thinkingMessages: service, sessionRepo, logger, foregroundSessionTracker: new ForegroundSessionTracker() };
    const acknowledgements: unknown[] = [];
    const edits: string[] = [];
    const context = { chat: { id: 1 }, callbackQuery: { data: "thinking:expand", message: { message_id: 42 } }, async answerCallbackQuery(other?: unknown) { acknowledgements.push(other); }, async editMessageText(text: string) { edits.push(text); } };
    await handleThinkingCallback(context, dependencies);
    assert.equal(edits.length, 1);
    assert.match(edits[0], /BODY/);
    await handleThinkingCallback({ ...context, callbackQuery: { ...context.callbackQuery, data: "thinking:collapse" } }, dependencies);
    assert.equal(edits.length, 2);
    assert.doesNotMatch(edits[1], /BODY/);
    await handleThinkingCallback({ ...context, chat: { id: 2 } }, dependencies);
    assert.equal(edits.length, 2);
    assert.ok(acknowledgements.some((ack) => typeof ack === "object" && ack !== null && "show_alert" in ack));
    await handleThinkingCallback({ ...context, async editMessageText() { throw new Error("offline"); } }, dependencies);
    assert.equal(edits.length, 2);
});
