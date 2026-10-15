import assert from "node:assert/strict";
import test from "node:test";
import { handleCancelCommand } from "../src/bot/commands/cancel.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemoryPendingActionRepository } from "../src/repositories/pending-action.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import { AbortPromptUseCase } from "../src/use-cases/abort-prompt.usecase.js";

const logger = {
    child() {
        return this;
    },
    error() { },
    async flush() { },
    warn() { },
} as unknown as AppLogger;

for (const outcome of ["idle", "busy", "failed", "replaced"] as const) {
    test(`cancel removes the original pending input when ${outcome}`, async () => {
        const tracker = new ForegroundSessionTracker();
        const lease = tracker.acquire(1)!;
        lease.attachSession("session");
        lease.attachInput("input");
        let next: ReturnType<typeof tracker.acquire>;
        const calls: string[] = [];
        const useCase = new AbortPromptUseCase(new InMemorySessionRepository(), {
            async getSessionStatuses() { return outcome === "idle" ? {} : { session: { type: "busy" } }; },
            async cancelSessionInput(sessionId: string, inputId: string) {
                calls.push(`${sessionId}:${inputId}`);
                if (outcome === "failed") throw new Error("Cancellation failed");
                if (outcome === "replaced") {
                    lease.dispose();
                    next = tracker.acquire(1)!;
                    next.attachSession("session");
                }
            },
            async abortSession() { calls.push("interrupt"); return true; },
        } as never, tracker);
        if (outcome === "failed") {
            await assert.rejects(useCase.execute({ chatId: 1 }), /Cancellation failed/u);
        } else {
            assert.equal((await useCase.execute({ chatId: 1 })).status, outcome === "replaced" ? "not_running" : "aborted");
        }
        assert.deepEqual(calls, outcome === "busy" || outcome === "idle" ? ["session:input", "interrupt"] : ["session:input"]);
        if (outcome === "replaced") {
            assert.equal(next!.signal.aborted, false);
            next!.dispose();
        } else {
            assert.equal(lease.signal.aborted, true);
        }
        lease.dispose();
    });
}

test("cancelling preparation leaves the previously bound session running", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({ chatId: 1, sessionId: "previous", projectId: "p", directory: "/repo", agentName: null, modelProviderId: null, modelId: null, modelVariant: null, language: null, updatedAt: "" });
    const tracker = new ForegroundSessionTracker();
    const lease = tracker.acquire(1)!;
    const useCase = new AbortPromptUseCase(repo, {
        async getSessionStatuses() { assert.fail("Preparation must not query another session"); },
        async abortSession() { assert.fail("Preparation must not interrupt another session"); },
    } as never, tracker);
    assert.equal((await useCase.execute({ chatId: 1 })).status, "aborted");
    assert.equal(lease.signal.aborted, true);
    lease.dispose();
});

test("cancel uses the native interruption result without a racy status preflight", async () => {
    const tracker = new ForegroundSessionTracker();
    const lease = tracker.acquire(1)!;
    lease.attachSession("session");
    let interruptions = 0;
    const useCase = new AbortPromptUseCase(new InMemorySessionRepository(), {
        async getSessionStatuses() { assert.fail("Interruption itself handles idle sessions"); },
        async abortSession() { interruptions += 1; return false; },
    } as never, tracker);
    assert.equal((await useCase.execute({ chatId: 1 })).status, "aborted");
    assert.equal(interruptions, 1);
    assert.equal(lease.signal.aborted, true);
    lease.dispose();
});

test("cancelling a bound session does not interrupt a request started during the binding lookup", async () => {
    const tracker = new ForegroundSessionTracker();
    let current: ReturnType<typeof tracker.acquire>;
    const useCase = new AbortPromptUseCase({
        async getByChatId() {
            current = tracker.acquire(1)!;
            current.attachSession("session");
            return { sessionId: "session" };
        },
    } as never, {
        async abortSession() { assert.fail("Cancel must preserve the newer request"); },
    } as never, tracker);
    assert.equal((await useCase.execute({ chatId: 1 })).status, "not_running");
    assert.equal(current!.signal.aborted, false);
    current!.dispose();
});

test("cancel releases the local wait when the remote interruption request fails", async () => {
    const tracker = new ForegroundSessionTracker();
    const lease = tracker.acquire(1)!;
    lease.attachSession("session");
    const failure = new Error("Host unavailable");
    const useCase = new AbortPromptUseCase(new InMemorySessionRepository(), {
        async abortSession() { throw failure; },
    } as never, tracker);
    await assert.rejects(useCase.execute({ chatId: 1 }), (error) => error === failure);
    assert.equal(lease.signal.aborted, true);
    lease.dispose();
});

test("AbortPromptUseCase reports no_session when the chat has no bound session", async () => {
    const repo = new InMemorySessionRepository();
    const useCase = new AbortPromptUseCase(
        repo,
        {
            async abortSession() {
                return true;
            },
            async getSessionStatuses() {
                return {};
            },
        } as never,
    );

    assert.deepEqual(await useCase.execute({ chatId: 1 }), {
        sessionId: null,
        sessionStatus: null,
        status: "no_session",
    });
});

test("AbortPromptUseCase reports not_running when the current session is idle", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 2,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });
    const useCase = new AbortPromptUseCase(
        repo,
        {
            async abortSession() {
                return false;
            },
            async getSessionStatuses() {
                return {
                    "session-1": { type: "idle" },
                };
            },
        } as never,
    );

    assert.deepEqual(await useCase.execute({ chatId: 2 }), {
        sessionId: "session-1",
        sessionStatus: { type: "idle" },
        status: "not_running",
    });
});

test("AbortPromptUseCase aborts busy sessions", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 3,
        sessionId: "session-9",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });
    const abortedSessionIds: string[] = [];
    const useCase = new AbortPromptUseCase(
        repo,
        {
            async abortSession(sessionId: string) {
                abortedSessionIds.push(sessionId);
                return true;
            },
            async getSessionStatuses() {
                return {
                    "session-9": { type: "busy" },
                };
            },
        } as never,
    );

    assert.deepEqual(await useCase.execute({ chatId: 3 }), {
        sessionId: "session-9",
        sessionStatus: { type: "busy" },
        status: "aborted",
    });
    assert.deepEqual(abortedSessionIds, ["session-9"]);
});

test("AbortPromptUseCase aborts the active foreground child session before the bound main session", async () => {
    const repo = new InMemorySessionRepository();
    const foregroundSessionTracker = new ForegroundSessionTracker();
    await repo.setCurrent({
        chatId: 4,
        sessionId: "session-main",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });
    const stopTracking = foregroundSessionTracker.begin(4, "session-child");
    const abortedSessionIds: string[] = [];
    const useCase = new AbortPromptUseCase(
        repo,
        {
            async abortSession(sessionId: string) {
                abortedSessionIds.push(sessionId);
                return true;
            },
            async getSessionStatuses() {
                return {
                    "session-child": { type: "busy" },
                    "session-main": { type: "busy" },
                };
            },
        } as never,
        foregroundSessionTracker,
    );

    assert.deepEqual(await useCase.execute({ chatId: 4 }), {
        sessionId: "session-child",
        sessionStatus: { type: "busy" },
        status: "aborted",
    });
    assert.deepEqual(abortedSessionIds, ["session-child"]);
    stopTracking();
});

test("handleCancelCommand maps abort statuses and presents normalized errors", async () => {
    const replies: string[] = [];
    const errors: unknown[] = [];
    const repo = new InMemorySessionRepository();
    const dependencies = {
        abortPromptUseCase: {
            async execute({ chatId }: { chatId: number }) {
                if (chatId === 10) {
                    return { sessionId: null, sessionStatus: null, status: "no_session" as const };
                }

                if (chatId === 11) {
                    return { sessionId: "session-1", sessionStatus: { type: "idle" }, status: "not_running" as const };
                }

                if (chatId === 12) {
                    return {
                        sessionId: "session-1",
                        sessionStatus: { type: "retry", attempt: 1, message: "retrying", next: 123 },
                        status: "aborted" as const,
                    };
                }

                throw new Error("boom");
            },
        },
        logger: {
            child() {
                return this;
            },
            error(error: unknown) {
                errors.push(error);
            },
            async flush() { },
        },
        pendingActionRepo: new InMemoryPendingActionRepository(),
        sessionRepo: repo,
    } as never;

    for (const chatId of [10, 11, 12, 13]) {
        await handleCancelCommand(
            {
                api: {
                    async editMessageText() {
                        return true;
                    },
                },
                chat: { id: chatId },
                async reply(text) {
                    replies.push(text);
                    return {};
                },
            },
            dependencies,
        );
    }

    assert.deepEqual(replies, [
        "No active session is bound to this chat yet.",
        "No request is currently running for the current session.",
        "Abort signal sent to the current session.",
        "Unexpected error.\nCause: boom",
    ]);
    assert.equal(errors.length, 1);
});

test("handleCancelCommand cancels pending session rename before aborting", async () => {
    const replies: string[] = [];
    const edits: Array<{ chatId: number; messageId: number; text: string; other?: unknown }> = [];
    const pendingActionRepo = new InMemoryPendingActionRepository();
    const repo = new InMemorySessionRepository();
    let abortCalls = 0;

    await pendingActionRepo.set({
        chatId: 20,
        kind: "session_rename",
        sessionId: "session-1",
        menuMessageId: 777,
        returnPage: 0,
        updatedAt: new Date(0).toISOString(),
    });

    const dependencies = {
        abortPromptUseCase: {
            async execute() {
                abortCalls += 1;
                return { sessionId: null, sessionStatus: null, status: "no_session" as const };
            },
        },
        listSessionsUseCase: {
            async execute() {
                return {
                    currentDirectory: "E:/repo-1",
                    currentProjectId: "project-1",
                    currentSessionId: null,
                    sessions: [
                        {
                            id: "session-1",
                            projectID: "project-1",
                            directory: "E:/repo-1",
                            title: "Session 1",
                            time: {
                                created: 1,
                                updated: 1,
                            },
                        },
                    ],
                };
            },
        },
        logger,
        pendingActionRepo,
        sessionRepo: repo,
    } as never;

    await handleCancelCommand(
        {
            api: {
                async editMessageText(chatId, messageId, text, other) {
                    edits.push({ chatId, messageId, text, other });
                    return true;
                },
            },
            chat: { id: 20 },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.equal(abortCalls, 0);
    assert.equal(await pendingActionRepo.getByChatId(20), null);
    assert.deepEqual(replies, ["Session rename cancelled."]);
    assert.equal(edits.length, 1);
    assert.equal(edits[0]?.chatId, 20);
    assert.equal(edits[0]?.messageId, 777);
    assert.equal(
        edits[0]?.text,
        [
            "Session List",
            "Current project: E:/repo-1",
            "Current session: Not selected",
            "Page 1/1",
            "",
            "1. Session 1 [session-1]",
        ].join("\n"),
    );
    assert.deepEqual(
        (edits[0]?.other as {
            reply_markup?: {
                inline_keyboard?: Array<Array<{ callback_data: string; text: string }>>;
            };
        })?.reply_markup?.inline_keyboard,
        [[{ text: "1", callback_data: "sessions:pick:0:session-1" }]],
    );
});
