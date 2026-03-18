import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { handleProjectsCommand } from "../src/bot/commands/projects.js";
import { handleProjectsCallback } from "../src/bot/handlers/callback.handler.js";
import type { BotDependencies } from "../src/bot/types.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
    PromptSessionResult,
    OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";
import { ListProjectsUseCase } from "../src/use-cases/list-projects.usecase.js";
import { SendPromptUseCase } from "../src/use-cases/send-prompt.usecase.js";
import { SwitchProjectUseCase } from "../src/use-cases/switch-project.usecase.js";

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

function createSession(id: string, projectID: string, directory: string): OpenCodeSession {
    return {
        id,
        slug: id,
        projectID,
        directory,
        title: "Session",
        version: "1",
        time: {
            created: 1,
            updated: 1,
        },
    } as OpenCodeSession;
}

function createPromptReply(text: string): PromptSessionResult {
    return {
        assistantError: null,
        bodyMd: text,
        fallbackText: text,
        info: null,
        metrics: {
            durationMs: 120,
            tokens: {
                total: 42,
                input: 10,
                output: 12,
                reasoning: 5,
                cacheRead: 15,
                cacheWrite: 0,
            },
        },
        parts: [],
        structured: {
            body_md: text,
        },
    };
}

function createDependencies(client: OpenCodeClientLike) {
    const repo = new InMemorySessionRepository();
    const dependencies: BotDependencies = {
        logger,
        listModelsUseCase: {
            async execute() {
                return {
                    models: [],
                    currentModelProviderId: null,
                    currentModelId: null,
                    currentModelVariant: null,
                };
            },
        } as never,
        listProjectsUseCase: new ListProjectsUseCase(repo, client),
        sendPromptUseCase: new SendPromptUseCase(repo, client, logger),
        switchModelUseCase: {
            async execute() {
                return { found: false };
            },
        } as never,
        switchProjectUseCase: new SwitchProjectUseCase(repo, client, logger),
    };

    return { dependencies, repo };
}

test("/projects shows the first page of projects with an inline keyboard", async () => {
    const projects = Array.from({ length: 12 }, (_, index) =>
        createProject(`project-${index + 1}`, `E:/repo-${index + 1}`),
    );
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("unused", "project-1", directory);
        },
        async getCurrentProject() {
            return projects[1];
        },
        async listModels() {
            return [];
        },
        async listProjects() {
            return projects;
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const replies: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];

    await handleProjectsCommand(
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
    assert.match(replies[0].text, /Project List/);
    assert.match(replies[0].text, /Current project: E:\/repo-2/);
    assert.match(replies[0].text, /Page 1\/2/);
    assert.match(replies[0].text, /1\. E:\/repo-1/);
    assert.doesNotMatch(replies[0].text, /11\. E:\/repo-11/);

    const keyboard = replies[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(
        keyboard.inline_keyboard[0].map((button) => button.text),
        ["1", "2", "3", "4", "5"],
    );
    assert.deepEqual(
        keyboard.inline_keyboard[1].map((button) => button.text),
        ["6", "7", "8", "9", "10"],
    );
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, "projects:select:project-1");
    assert.equal(keyboard.inline_keyboard.at(-1)?.at(-1)?.callback_data, "projects:page:1");
});

test("project page callbacks re-render the requested page", async () => {
    const projects = Array.from({ length: 12 }, (_, index) =>
        createProject(`project-${index + 1}`, `E:/repo-${index + 1}`),
    );
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("unused", "project-1", directory);
        },
        async getCurrentProject() {
            return projects[0];
        },
        async listModels() {
            return [];
        },
        async listProjects() {
            return projects;
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    let answered = 0;

    await handleProjectsCallback(
        {
            chat: { id: 1 },
            callbackQuery: { data: "projects:page:1" },
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
    assert.match(edits[0].text, /11\. E:\/repo-11/);
    assert.doesNotMatch(edits[0].text, /^1\. E:\/repo-1$/m);

    const keyboard = edits[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(
        keyboard.inline_keyboard[0].map((button) => button.text),
        ["11", "12"],
    );
    assert.equal(keyboard.inline_keyboard.at(-1)?.[0]?.callback_data, "projects:page:0");
});

test("project selection callbacks switch the binding to the selected project", async () => {
    const projects = [
        createProject("project-1", "E:/repo-1"),
        createProject("project-2", "E:/repo-2"),
    ];
    const { dependencies, repo } = createDependencies({
        async createSessionForDirectory(directory) {
            return directory === "E:/repo-2"
                ? createSession("session-2", "project-2", directory)
                : createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return projects[0];
        },
        async listModels() {
            return [];
        },
        async listProjects() {
            return projects;
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const edits: string[] = [];

    await handleProjectsCallback(
        {
            chat: { id: 7 },
            callbackQuery: { data: "projects:select:project-2" },
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

    assert.equal(edits[0], "Project switched.\nCurrent project: E:/repo-2");
    assert.deepEqual(binding, {
        chatId: 7,
        sessionId: "session-2",
        projectId: "project-2",
        directory: "E:/repo-2",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        updatedAt: binding?.updatedAt,
    });
});

test("invalid project selections ask the user to rerun /projects", async () => {
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async listModels() {
            return [];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const edits: string[] = [];

    await handleProjectsCallback(
        {
            chat: { id: 7 },
            callbackQuery: { data: "projects:select:missing-project" },
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

    assert.equal(edits[0], "The project is no longer available. Run /projects again.");
});

test("/projects surfaces SDK errors without leaking a stack trace", async () => {
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            throw new Error("boom");
        },
        async listModels() {
            return [];
        },
        async listProjects() {
            throw new Error("boom");
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const replies: string[] = [];

    await handleProjectsCommand(
        {
            chat: { id: 1 },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.equal(replies[0], "Unexpected error.\nCause: boom");
});
