import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { GrammyError } from "grammy";
import type { InputRichMessage } from "grammy/types";
import { executePromptRequest, type PromptExecutionContext } from "../src/bot/handlers/prompt.handler.js";
import type { ForegroundPromptDependencies } from "../src/bot/types.js";
import type { SendPromptInput } from "../src/use-cases/send-prompt.usecase.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import { createThinkingMessages } from "./helpers/thinking.js";

for (const outcome of ["completed", "stopped", "failed", "provider-error", "group", "rejected-draft", "draft-network-error"] as const) {
    test(`native answer streams preserve separate thinking and status when ${outcome}`, async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const tracker = new ForegroundSessionTracker();
        const thinking = createThinkingMessages();
        const replies: string[] = [];
        const drafts: Array<{ id: number; body: InputRichMessage }> = [];
        const edits: string[] = [];
        const ctx: PromptExecutionContext = {
            chat: { id: 1, type: outcome === "group" ? "group" : "private" },
            api: {
                async deleteMessage() {},
                async editMessageText(_chat, _id, text) { edits.push(text); },
                async sendRichMessageDraft(_chat, id, body) {
                    drafts.push({ id, body });
                    if (outcome === "rejected-draft") throw new GrammyError("chat not found", { ok: false, error_code: 400, description: "Bad Request: chat not found" }, "sendRichMessageDraft", {});
                    if (outcome === "draft-network-error") throw new Error("connection lost");
                },
            },
            async reply(text) { replies.push(text); return { message_id: replies.length }; },
        };
        await executePromptRequest(ctx, {
            thinkingMessages: thinking.service,
            foregroundSessionTracker: tracker,
            sessionRepo: new InMemorySessionRepository(),
            logger: { warn() {}, error() {} },
            contextFooter: { async read() { return { capacity: 1000, used: 100 }; }, watch() {} },
            sendPromptUseCase: {
                async execute(input: SendPromptInput) {
                    input.onExecutionSession?.("ses_test");
                    input.onInputReady?.("input");
                    const emit = (type: string, extra = {}) => tracker.publish({ type, data: { sessionID: "ses_test", ...extra } });
                    emit("session.inbox.delivered", { inboxID: "input" });
                    emit("session.step.started", { assistantMessageID: "answer" });
                    emit("session.reasoning.delta", { assistantMessageID: "answer", ordinal: 0, delta: "THINKING_ONLY" });
                    emit("session.text.delta", { assistantMessageID: "answer", ordinal: 0, delta: "ANSWER" });
                    t.mock.timers.tick(1000);
                    await setImmediate();
                    assert.equal(replies.includes("ANSWER"), outcome === "group");
                    emit("session.text.delta", { assistantMessageID: "answer", ordinal: 0, delta: "_COMPLETE" });
                    t.mock.timers.tick(1000);
                    await setImmediate();
                    if (outcome === "stopped") tracker.abort(1);
                    if (outcome === "stopped" || outcome === "failed") throw new Error("test interrupted");
                    return { sessionId: "ses_test", assistantReply: { bodyMd: "ANSWER_COMPLETE", fallbackText: "ANSWER_COMPLETE", assistantError: outcome === "provider-error" ? { type: "APIError", message: "Provider disconnected" } : null } };
                },
            },
        } as unknown as ForegroundPromptDependencies, async () => ({ text: "test" }));
        assert.equal((await thinking.repository.get(1, 1))!.text, "THINKING_ONLY");
        assert.ok(edits.some((text) => text.includes("Thinking")));
        assert.ok(!edits.some((text) => text.includes("THINKING_ONLY")));
        if (outcome === "group") assert.equal(drafts.length, 0);
        else {
            assert.ok(drafts.length >= 2);
            assert.equal(new Set(drafts.map((draft) => draft.id)).size, 1);
            assert.ok(drafts[0].id > 0 && drafts[0].id < 2 ** 31);
            assert.equal(drafts[0].body.markdown, "ANSWER");
            assert.equal(drafts.at(-1)!.body.markdown, "ANSWER_COMPLETE");
            assert.equal(replies.filter((text) => text === "ANSWER_COMPLETE").length, 1);
            assert.ok(!drafts.some((draft) => JSON.stringify(draft).includes("THINKING_ONLY")));
            if (outcome === "rejected-draft" || outcome === "draft-network-error") {
                assert.ok(drafts.every((draft) => draft.body.markdown));
            }
        }
        if (outcome === "completed" || outcome === "group") assert.match(replies.at(-1)!, /Context/);
        assert.equal(tracker.hasActiveRequest(1), false);
        if (outcome === "provider-error") {
            assert.ok(replies.some((text) => text.includes("Provider disconnected")));
        }
    });
}

test("draft formatting rejection falls back literally and ambiguous final sends are never retried", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const tracker = new ForegroundSessionTracker();
    const drafts: InputRichMessage[] = [];
    let finalAttempts = 0;
    await executePromptRequest({
        chat: { id: 1, type: "private" },
        api: {
            async deleteMessage() {},
            async editMessageText() {},
            async sendRichMessageDraft(_chat, _id, body) {
                drafts.push(body);
                if (body.markdown) throw new GrammyError("parse", { ok: false, error_code: 400, description: "Cannot parse entities" }, "sendRichMessageDraft", {});
            },
        },
        async reply(text) {
            if (text === "**ANSWER**") { finalAttempts += 1; throw new Error("connection lost after send"); }
            return { message_id: 1 };
        },
    }, {
        thinkingMessages: createThinkingMessages().service,
        foregroundSessionTracker: tracker,
        sessionRepo: new InMemorySessionRepository(),
        logger: { warn() {}, error() {} },
        sendPromptUseCase: {
            async execute(input: SendPromptInput) {
                input.onExecutionSession?.("ses_test"); input.onInputReady?.("input");
                tracker.publish({ type: "session.inbox.delivered", data: { sessionID: "ses_test", inboxID: "input" } });
                tracker.publish({ type: "session.step.started", data: { sessionID: "ses_test", assistantMessageID: "a" } });
                tracker.publish({ type: "session.text.delta", data: { sessionID: "ses_test", assistantMessageID: "a", ordinal: 0, delta: "**ANSWER**" } });
                t.mock.timers.tick(1000); await setImmediate();
                return { assistantReply: { bodyMd: "**ANSWER**", fallbackText: "ANSWER", assistantError: null } };
            },
        },
    } as unknown as ForegroundPromptDependencies, async () => ({ text: "test" }));
    assert.deepEqual(drafts, [{ markdown: "**ANSWER**" }, { blocks: [{ type: "paragraph", text: "ANSWER" }] }]);
    assert.equal(finalAttempts, 1);
});
