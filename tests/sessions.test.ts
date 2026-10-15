import assert from "node:assert/strict";
import test from "node:test";
import { handleSessionsCommand } from "../src/bot/commands/sessions.js";
import { handleSessionsCallback } from "../src/bot/handlers/callback.handler.js";
import type { BotDependencies } from "../src/bot/types.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemoryPendingActionRepository } from "../src/repositories/pending-action.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
    OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";
import { ListSessionsUseCase } from "../src/use-cases/list-sessions.usecase.js";
import { RenameSessionUseCase } from "../src/use-cases/rename-session.usecase.js";
import { SwitchSessionUseCase } from "../src/use-cases/switch-session.usecase.js";

const logger = {
    child() {
        return this;
    },
    error() { },
    async flush() { },
    info() { },
    warn() { },
} as unknown as AppLogger;

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
    const pendingActionRepo = new InMemoryPendingActionRepository();
    const dependencies = {
        abortPromptUseCase: {
            async execute() {
                return { sessionId: null, sessionStatus: null, status: "no_session" as const };
            },
        },
        listSessionsUseCase: new ListSessionsUseCase(repo, client),
        logger,
        pendingActionRepo,
        renameSessionUseCase: new RenameSessionUseCase(repo, client, logger),
        sessionRepo: repo,
        switchSessionUseCase: new SwitchSessionUseCase(repo, client, logger),
    } as unknown as BotDependencies;

    return { dependencies, pendingActionRepo, repo };
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
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, "sessions:pick:0:session-1");
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

test("session pick callbacks open the second-level action menu", async () => {
    const currentProject = createProject("project-2", "E:/repo-2");
    const sessions = [
        createSession("session-1", currentProject.id, currentProject.worktree, "Session 1"),
        createSession("session-2", currentProject.id, currentProject.worktree, "Session 2"),
    ];
    const { dependencies } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listSessions() {
            return sessions;
        },
    } as never);
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];

    await handleSessionsCallback(
        {
            chat: { id: 2 },
            callbackQuery: { data: "sessions:pick:0:session-2" },
            async answerCallbackQuery() {
                return {};
            },
            async editMessageText(text, other) {
                edits.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(edits.length, 1);
    assert.equal(
        edits[0].text,
        [
            "Session Actions",
            "Current project: E:/repo-2",
            "Selected session: Session 2 [session-2]",
            "",
            "Choose an action for this session.",
        ].join("\n"),
    );
    const keyboard = edits[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(keyboard.inline_keyboard, [
        [
            { text: "Switch", callback_data: "sessions:switch:0:session-2" },
            { text: "Rename", callback_data: "sessions:rename:0:session-2" },
        ],
        [
            { text: "Back to list", callback_data: "sessions:back:0" },
        ],
    ]);
});

test("session switch callbacks switch the binding within the current project", async () => {
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
        async getSession(id: string) { return sessions.find((session) => session.id === id) ?? null; },
    } as never);
    const edits: string[] = [];

    await handleSessionsCallback(
        {
            chat: { id: 7 },
            callbackQuery: { data: "sessions:switch:0:session-2" },
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

test("session rename callbacks enter pending rename mode", async () => {
    const currentProject = createProject("project-2", "E:/repo-2");
    const sessions = [
        createSession("session-1", currentProject.id, currentProject.worktree, "Session 1"),
        createSession("session-2", currentProject.id, currentProject.worktree, "Session 2"),
    ];
    const { dependencies, pendingActionRepo } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listSessions() {
            return sessions;
        },
        async renameSession(sessionId: string, title: string) {
            return createSession(sessionId, currentProject.id, currentProject.worktree, title);
        },
    } as never);
    const edits: string[] = [];

    await handleSessionsCallback(
        {
            chat: { id: 8 },
            callbackQuery: {
                data: "sessions:rename:0:session-2",
                message: {
                    message_id: 987,
                },
            },
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

    assert.equal(
        edits[0],
        [
            "Rename session: Session 2 [session-2]",
            "Send the new session name as your next text message.",
            "Send /cancel to cancel.",
        ].join("\n"),
    );
    assert.deepEqual(await pendingActionRepo.getByChatId(8), {
        chatId: 8,
        kind: "session_rename",
        sessionId: "session-2",
        menuMessageId: 987,
        returnPage: 0,
        updatedAt: (await pendingActionRepo.getByChatId(8))?.updatedAt,
    });
});

test("invalid session actions ask the user to rerun /sessions", async () => {
    const currentProject = createProject("project-2", "E:/repo-2");
    const { dependencies } = createDependencies({
        async getSession() { return null; },
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
            callbackQuery: { data: "sessions:switch:0:missing-session" },
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

test("switching and renaming validate one session without listing the catalog", async () => {
    for (const operation of ["switch", "rename"] as const) {
        for (const state of ["valid", "missing", "other-project"] as const) {
            const repo = new InMemorySessionRepository();
            const project = createProject("project-1", "/repo");
            let reads = 0;
            let renames = 0;
            const client = {
                async getCurrentProject() { return project; },
                async getSession(id: string) {
                    reads += 1;
                    assert.equal(id, "target");
                    return state === "missing" ? null : createSession(id, state === "other-project" ? "other" : project.id, project.worktree);
                },
                async listSessions() { throw new Error("A single-session action must not scan the catalog."); },
                async renameSession(id: string, title: string) {
                    renames += 1;
                    return createSession(id, project.id, project.worktree, title);
                },
            };
            const result = operation === "switch"
                ? await new SwitchSessionUseCase(repo, client, logger).execute({ chatId: 1, sessionId: "target" })
                : await new RenameSessionUseCase(repo, client, logger).execute({ chatId: 1, sessionId: "target", title: "Renamed" });
            assert.equal(result.found, state === "valid");
            assert.equal(reads, 1);
            assert.equal(renames, operation === "rename" && state === "valid" ? 1 : 0);
            assert.equal(Boolean(await repo.getByChatId(1)), operation === "switch" && state === "valid");
        }
    }
});

test("ListSessionsUseCase clears stale saved session context and falls back to the current project", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 8,
        sessionId: "missing-session",
        projectId: "project-stale",
        directory: "E:/repo-stale",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });
    const currentProject = createProject("project-2", "E:/repo-2");
    const useCase = new ListSessionsUseCase(
        repo,
        {
            async getCurrentProject() {
                return currentProject;
            },
            async listProjects() {
                return [currentProject];
            },
            async listSessions() {
                return [
                    createSession("session-1", currentProject.id, currentProject.worktree, "Session 1"),
                ];
            },
        } as never,
    );

    const result = await useCase.execute({ chatId: 8 });
    const binding = await repo.getByChatId(8);

    assert.equal(result.currentProjectId, "project-2");
    assert.equal(result.currentDirectory, "E:/repo-2");
    assert.equal(result.currentSessionId, null);
    assert.deepEqual(binding, {
        chatId: 8,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: binding?.updatedAt,
    });
});
