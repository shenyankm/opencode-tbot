import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
    OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";
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

test("SendPromptUseCase creates a session in the current project when the chat is unbound", async () => {
    const repo = new InMemorySessionRepository();
    const calls: Array<{ type: string; directory?: string; prompt?: string; sessionId?: string }> = [];
    const currentProject = createProject("project-1", "E:/repo-1");
    const client: OpenCodeClientLike = {
        async createSessionForDirectory(directory) {
            calls.push({ type: "create", directory });
            return createSession("session-1", currentProject.id, directory);
        },
        async getCurrentProject() {
            return currentProject;
        },
        async listProjects() {
            return [currentProject];
        },
        async promptSession(input) {
            calls.push({ type: "prompt", prompt: input.prompt, sessionId: input.sessionId });
            return { text: "assistant reply" };
        },
    };

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 1001,
        text: "hello",
    });

    const binding = await repo.getByChatId(1001);

    assert.deepEqual(result, {
        sessionId: "session-1",
        projectId: "project-1",
        replyText: "assistant reply",
    });
    assert.deepEqual(binding, {
        chatId: 1001,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        updatedAt: binding?.updatedAt,
    });
    assert.deepEqual(calls, [
        { type: "create", directory: "E:/repo-1" },
        { type: "prompt", prompt: "hello", sessionId: "session-1" },
    ]);
});

test("SwitchProjectUseCase updates the binding and later prompts use the switched session", async () => {
    const repo = new InMemorySessionRepository();
    const projects = [
        createProject("project-1", "E:/repo-1"),
        createProject("project-2", "E:/repo-2"),
    ];
    const calls: Array<{ type: string; directory?: string; sessionId?: string }> = [];
    const client: OpenCodeClientLike = {
        async createSessionForDirectory(directory) {
            calls.push({ type: "create", directory });

            if (directory === "E:/repo-2") {
                return createSession("session-2", "project-2", directory);
            }

            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            throw new Error("getCurrentProject should not be called after a project switch");
        },
        async listProjects() {
            return projects;
        },
        async promptSession(input) {
            calls.push({ type: "prompt", sessionId: input.sessionId });
            return { text: `reply from ${input.sessionId}` };
        },
    };

    const switchUseCase = new SwitchProjectUseCase(repo, client, logger);
    const switchResult = await switchUseCase.execute({
        chatId: 42,
        projectId: "project-2",
    });
    const sendUseCase = new SendPromptUseCase(repo, client, logger);
    const promptResult = await sendUseCase.execute({
        chatId: 42,
        text: "continue",
    });
    const binding = await repo.getByChatId(42);

    assert.deepEqual(switchResult, {
        found: true,
        project: projects[1],
        sessionId: "session-2",
    });
    assert.equal(binding?.projectId, "project-2");
    assert.equal(binding?.sessionId, "session-2");
    assert.equal(promptResult.sessionId, "session-2");
    assert.equal(promptResult.replyText, "reply from session-2");
    assert.deepEqual(calls, [
        { type: "create", directory: "E:/repo-2" },
        { type: "prompt", sessionId: "session-2" },
    ]);
});
