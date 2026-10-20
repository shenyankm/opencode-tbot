import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";
import { mock } from "node:test";
import { executePromptRequest } from "../src/bot/handlers/prompt.handler.js";
import { SendPromptUseCase } from "../src/use-cases/send-prompt.usecase.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import { FileSessionRepository } from "../src/repositories/session.repo.js";
import { FileThinkingMessageRepository } from "../src/repositories/thinking-message.repo.js";
import { TelegramThinkingMessages } from "../src/services/telegram/thinking-messages.js";
import { JsonStateStore } from "../src/services/storage/json-state-store.js";
import { createDefaultOpencodeTbotState } from "../src/services/storage/bot-state.js";
import { emptyBinding } from "../src/use-cases/binding-update.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import type { OpenCodePromptGateway } from "../src/services/opencode/opencode.ports.js";

const directory = await fs.mkdtemp(join(tmpdir(), "tbot-lifecycle-"));
const originalWrite = fs.writeFile;
let writes = 0;
let bytes = 0;
mock.method(fs, "writeFile", async (...args: Parameters<typeof fs.writeFile>) => {
    writes++;
    if (typeof args[1] === "string") bytes += Buffer.byteLength(args[1]);
    return originalWrite(...args);
});
syncBuiltinESMExports();
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null;
const samples: unknown[] = [];
const rounds = Number(process.argv[2] ?? 3);
assert.ok(Number.isInteger(rounds) && rounds > 0 && rounds <= 1000);
try {
    for (const chats of [1, 5, 20]) {
        const store = new JsonStateStore({ filePath: join(directory, `${chats}.json`), createDefaultState: createDefaultOpencodeTbotState });
        const repo = new FileSessionRepository(store);
        const tracker = new ForegroundSessionTracker();
        const events: Array<Record<string, unknown>> = [];
        const logger = { child() { return this; }, debug() {}, error() {}, warn() {}, info(event: Record<string, unknown>) { events.push(event); } } as unknown as AppLogger;
        let apiCalls = 0;
        const intervals: number[] = [];
        const cancellations: number[] = [];
        const delay = monitorEventLoopDelay({ resolution: 10 });
        delay.enable();
        for (let id = 1; id <= chats; id++) await repo.setCurrent({ ...emptyBinding(id), sessionId: `s${id}`, projectId: "p", directory: "/repo" });
        const before = { writes, bytes, heap: process.memoryUsage().heapUsed };
        const started = performance.now();
        for (let round = 0; round < rounds; round++) {
            const pending: Promise<void>[] = [];
            for (let id = 1; id <= chats; id++) {
                let lastDraft: number | undefined;
                let cancelledAt: number | undefined;
                const shouldCancel = round % 2 === 1;
                const text = `CHAT_${id}_ROUND_${round} ✅ 中文 日本語\n`;
                const gateway = {
                    getSession: async () => ({ id: `s${id}`, projectID: "p", directory: "/repo" }),
                    listProjects: async () => [{ id: "p", worktree: "/repo" }],
                    listAgents: async () => [],
                    async promptSession(input: Parameters<OpenCodePromptGateway["promptSession"]>[0]) {
                        input.onInputReady?.(`i${id}`);
                        const emit = (type: string, extra = {}) => tracker.publish({ type, data: { sessionID: `s${id}`, assistantMessageID: `a${id}`, ordinal: 0, ...extra } });
                        emit("session.inbox.delivered", { inboxID: `i${id}` });
                        emit("session.step.started");
                        let answer = "";
                        for (let part = 0; part < 12; part++) {
                            answer += text;
                            emit("session.reasoning.delta", { delta: `thinking ${part}\n` });
                            emit("session.text.ended", { text: answer });
                            if (shouldCancel && part === 6) {
                                cancelledAt = performance.now();
                                tracker.abort(id, new DOMException("Stopped", "AbortError"));
                            }
                            await setTimeout(180, undefined, { signal: input.signal });
                        }
                        return { bodyMd: answer, fallbackText: answer, assistantError: null, info: null, metrics: null };
                    },
                } as unknown as OpenCodePromptGateway;
                const network = async () => { apiCalls++; await setTimeout(1); };
                pending.push(executePromptRequest({ chat: { id, type: "private" }, api: {
                    async deleteMessage() { await network(); },
                    async editMessageText() { await network(); },
                    async sendRichMessageDraft() {
                        const now = performance.now();
                        if (lastDraft !== undefined) intervals.push(now - lastDraft);
                        lastDraft = now;
                        await network();
                    },
                }, async reply(value) { await network(); if (value.includes("CHAT_")) assert.ok(value.includes(`CHAT_${id}_ROUND_${round}`)); return { message_id: apiCalls }; } },
                { sessionRepo: repo, logger, foregroundSessionTracker: tracker,
                    thinkingMessages: new TelegramThinkingMessages(new FileThinkingMessageRepository(join(directory, `thinking-${chats}`))),
                    sendPromptUseCase: new SendPromptUseCase(repo, gateway, logger) }, async () => ({ text: "test" }))
                    .then(() => { if (cancelledAt) cancellations.push(performance.now() - cancelledAt); assert.equal(tracker.hasActiveRequest(id), false); }));
            }
            await Promise.all(pending);
            for (let id = 1; id <= chats; id++) assert.equal((await repo.getByChatId(id))?.sessionId, `s${id}`);
        }
        delay.disable();
        tracker.dispose();
        const feedback = events.filter((event) => event.event === "prompt.first_feedback");
        samples.push({ chats, rounds, requests: chats * rounds, durationMs: performance.now() - started,
            firstFeedbackQueueMs: { p50: percentile(feedback.map((event) => Number(event.queueMs)), .5), p95: percentile(feedback.map((event) => Number(event.queueMs)), .95) },
            simulatedTelegramRttMs: { p50: percentile(feedback.map((event) => Number(event.networkMs)), .5), p95: percentile(feedback.map((event) => Number(event.networkMs)), .95) },
            draftIntervalMs: { p50: percentile(intervals, .5), p95: percentile(intervals, .95) },
            localCancelReleaseMs: { p50: percentile(cancellations, .5), p95: percentile(cancellations, .95) },
            apiCalls, writes: writes - before.writes, bytesWritten: bytes - before.bytes,
            eventLoopP95Ms: delay.percentile(95) / 1e6, heapDeltaBytes: process.memoryUsage().heapUsed - before.heap,
            errors: 0, activeRequestsAfter: 0 });
    }
    console.log(JSON.stringify({ kind: "local deterministic handler + real disk benchmark", node: process.version, platform: process.platform,
        limits: "Telegram RTT is simulated at 1 ms; provider tokens arrive every 180 ms. This is a short lifecycle stress baseline, not real network or long-running soak proof. No speedup claim.", samples }, null, 2));
} finally {
    mock.restoreAll();
    syncBuiltinESMExports();
    await fs.rm(directory, { recursive: true, force: true });
}
