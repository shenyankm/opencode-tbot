import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { handleSessionsCommand } from "../src/bot/commands/sessions.js";
import { handleSessionsCallback } from "../src/bot/handlers/callback.handler.js";
import type { BotDependencies } from "../src/bot/types.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
    OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";
import { ListSessionsUseCase } from "../src/use-cases/list-sessions.usecase.js";
import { SwitchSessionUseCase } from "../src/use-cases/switch-session.usecase.js";

const logger = {
    error() { },
    info() { },
} as unknown as Logger;

function createProject(id: string, worktree: string): OpenCodeProject {
    return {
        id,
        worktree,
        time: { created: 1, updated: 1 },
        sandboxes: [],
    } as OpenCodeProject;
}

function createSession(id: string, projectID: string, directory: string, title = id): OpenCodeSession {
    return {
        id,
        slug: id,
        projectID,
        directory,
        title,
        version: "1",
        time: {
            created: 1,
            updated: 1,
        },
    } as OpenCodeSession;
}

function createDependencies(client: OpenCodeClientLike) {
    const repo = new InMemorySessionRepository();
    const dependencies: BotDependencies = {
        logger,
        sessionRepo: repo,
        getConfigUseCase: {} as never,
        getHealthUseCase: {} as never,
        getPathUseCase: {} as never,
        listAgentsUseCase: {} as never,
        listModelsUseCase: {} as never,
        listProjectsUseCase: {} as never,
        listSessionsUseCase: new ListSessionsUseCase(repo, client),
        sendPromptUseCase: {} as never,
        switchAgentUseCase: {} as never,
        switchModelUseCase: {} as never,
        switchProjectUseCase: {} as never,
        switchSessionUseCase: new SwitchSessionUseCase(repo, client, logger),
    };

    return { dependencies, repo };
}

test("/sessions shows the first page of sessions for the current project", async () => {
    const currentProject = createProject("project-2", "E:/repo-2");
    const sessions = Array.from({ length: 12 }, (_, index) =>
        createSession(`session-${index + 1}`, currentProject.id, currentProject.worktree, `Session ${index + 1}`),
    );
    const { dependencies } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listSessions() {
            return [
                createSession("other-session", "project-1", "E:/repo-1", "Other"),
                ...sessions,
            ];
        },
    } as never);
    const replies: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];

    await handleSessionsCommand(
        {
            chat: { id: 1 },
            async reply(text, other) {
                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(replies.length, 1);
    assert.match(replies[0].text, /Session List/);
    assert.match(replies[0].text, /Current project: E:\/repo-2/);
    assert.match(replies[0].text, /Current session: Not selected/);
    assert.match(replies[0].text, /Page 1\/2/);
    assert.match(replies[0].text, /1\. Session 1 \[session-1\]/);
    assert.doesNotMatch(replies[0].text, /Other/);
    assert.doesNotMatch(replies[0].text, /11\. Session 11/);

    const keyboard = replies[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, "sessions:select:session-1");
    assert.equal(keyboard.inline_keyboard.at(-1)?.at(-1)?.callback_data, "sessions:page:1");
});

test("session page callbacks re-render the requested page", async () => {
    const currentProject = createProject("project-2", "E:/repo-2");
    const sessions = Array.from({ length: 12 }, (_, index) =>
        createSession(`session-${index + 1}`, currentProject.id, currentProject.worktree, `Session ${index + 1}`),
    );
    const { dependencies } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listSessions() {
            return sessions;
        },
    } as never);
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    let answered = 0;

    await handleSessionsCallback(
        {
            chat: { id: 1 },
            callbackQuery: { data: "sessions:page:1" },
            async answerCallbackQuery() {
                answered += 1;
                return {};
            },
            async editMessageText(text, other) {
                edits.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(answered, 1);
    assert.equal(edits.length, 1);
    assert.match(edits[0].text, /Page 2\/2/);
    assert.match(edits[0].text, /11\. Session 11 \[session-11\]/);
    assert.doesNotMatch(edits[0].text, /^1\. Session 1 \[session-1\]$/m);
});

test("session selection callbacks switch the binding within the current project", async () => {
    const currentProject = createProject("project-2", "E:/repo-2");
    const sessions = [
        createSession("session-1", currentProject.id, currentProject.worktree, "Session 1"),
        createSession("session-2", currentProject.id, currentProject.worktree, "Session 2"),
        createSession("other-session", "project-1", "E:/repo-1", "Other"),
    ];
    const { dependencies, repo } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listSessions() {
            return sessions;
        },
    } as never);
    const edits: string[] = [];

    await handleSessionsCallback(
        {
            chat: { id: 7 },
            callbackQuery: { data: "sessions:select:session-2" },
            async answerCallbackQuery() {
                return {};
            },
            async editMessageText(text) {
                edits.push(text);
                return {};
            },
        },
        dependencies,
    );

    const binding = await repo.getByChatId(7);

    assert.equal(edits[0], "Session switched.\nCurrent session: Session 2 [session-2]");
    assert.deepEqual(binding, {
        chatId: 7,
        sessionId: "session-2",
        projectId: "project-2",
        directory: "E:/repo-2",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: binding?.updatedAt,
    });
});

test("invalid session selections ask the user to rerun /sessions", async () => {
    const currentProject = createProject("project-2", "E:/repo-2");
    const { dependencies } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listSessions() {
            return [createSession("session-1", currentProject.id, currentProject.worktree, "Session 1")];
        },
    } as never);
    const edits: string[] = [];

    await handleSessionsCallback(
        {
            chat: { id: 7 },
            callbackQuery: { data: "sessions:select:missing-session" },
            async answerCallbackQuery() {
                return {};
            },
            async editMessageText(text) {
                edits.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.equal(edits[0], "The session is no longer available. Run /sessions again.");
});
