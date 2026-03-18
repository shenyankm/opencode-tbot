import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { handleAbortCommand } from "../src/bot/commands/abort.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { AbortPromptUseCase } from "../src/use-cases/abort-prompt.usecase.js";

const logger = {
    error() { },
} as unknown as Logger;

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
        updatedAt: new Date(0).toISOString(),
    });
    const useCase = new AbortPromptUseCase(
        repo,
        {
            async abortSession() {
                return true;
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
        updatedAt: new Date(0).toISOString(),
    });
    const abortedSessionIds: string[] = [];
    const useCase = new AbortPromptUseCase(
        repo,
        {
            async abortSession(sessionId) {
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

test("handleAbortCommand maps use case statuses and presents normalized errors", async () => {
    const replies: string[] = [];
    const errors: unknown[] = [];
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
                    return { sessionId: "session-1", sessionStatus: { type: "retry", attempt: 1, message: "retrying", next: 123 }, status: "aborted" as const };
                }

                throw new Error("boom");
            },
        },
        logger: {
            error(error: unknown) {
                errors.push(error);
            },
        },
    } as never;

    for (const chatId of [10, 11, 12, 13]) {
        await handleAbortCommand(
            {
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
