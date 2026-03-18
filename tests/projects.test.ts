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
        time: { created: 1 },
    };
}

function createSession(id: string, projectID: string, directory: string): OpenCodeSession {
    return {
        id,
        projectID,
        directory,
        title: "Session",
        version: "1",
        time: {
            created: 1,
            updated: 1,
        },
    };
}

function createDependencies(client: OpenCodeClientLike) {
    const repo = new InMemorySessionRepository();
    const dependencies: BotDependencies = {
        logger,
        listProjectsUseCase: new ListProjectsUseCase(repo, client),
        sendPromptUseCase: new SendPromptUseCase(repo, client, logger),
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
        async listProjects() {
            return projects;
        },
        async promptSession() {
            return { text: "unused" };
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
    assert.match(replies[0].text, /项目列表/);
    assert.match(replies[0].text, /当前项目：E:\/repo-2/);
    assert.match(replies[0].text, /第 1\/2 页/);
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
        async listProjects() {
            return projects;
        },
        async promptSession() {
            return { text: "unused" };
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
    assert.match(edits[0].text, /第 2\/2 页/);
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
        async listProjects() {
            return projects;
        },
        async promptSession() {
            return { text: "unused" };
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

    assert.equal(edits[0], "已切换项目。\n当前项目：E:/repo-2");
    assert.equal(binding?.projectId, "project-2");
    assert.equal(binding?.sessionId, "session-2");
});

test("invalid project selections ask the user to rerun /projects", async () => {
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async promptSession() {
            return { text: "unused" };
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

    assert.equal(edits[0], "项目已失效，请重新执行 /projects。");
});

test("/projects surfaces SDK errors without leaking a stack trace", async () => {
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            throw new Error("boom");
        },
        async listProjects() {
            throw new Error("boom");
        },
        async promptSession() {
            return { text: "unused" };
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

    assert.equal(replies[0], "Error: boom");
});
