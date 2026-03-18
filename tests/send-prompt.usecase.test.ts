import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeAgent,
    OpenCodeClientLike,
    OpenCodeProject,
    OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";
import { SendPromptUseCase } from "../src/use-cases/send-prompt.usecase.js";

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

function createAgent(name: string): OpenCodeAgent {
    return {
        name,
        mode: "primary",
        prompt: "",
        tools: [],
        model: undefined,
    } as OpenCodeAgent;
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
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
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
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        updatedAt: binding?.updatedAt,
    });
    assert.deepEqual(calls, [
        { type: "create", directory: "E:/repo-1" },
        { type: "prompt", prompt: "hello", sessionId: "session-1" },
    ]);
});

test("SendPromptUseCase preserves a selected model when it needs to create a session later", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 42,
        sessionId: null,
        projectId: null,
        directory: null,
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: "high",
        updatedAt: new Date(0).toISOString(),
    });

    const currentProject = createProject("project-1", "E:/repo-1");
    const promptCalls: unknown[] = [];
    const client: OpenCodeClientLike = {
        async createSessionForDirectory(directory) {
            return createSession("session-1", currentProject.id, directory);
        },
        async getCurrentProject() {
            return currentProject;
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [currentProject];
        },
        async promptSession(input) {
            promptCalls.push(input);
            return { text: "reply from model" };
        },
    };

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 42,
        text: "continue",
    });
    const binding = await repo.getByChatId(42);

    assert.deepEqual(result, {
        sessionId: "session-1",
        projectId: "project-1",
        replyText: "reply from model",
    });
    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "continue",
            agent: "build",
            model: {
                providerID: "openai",
                modelID: "gpt-5",
            },
            variant: "high",
        },
    ]);
    assert.deepEqual(binding, {
        chatId: 42,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: "high",
        updatedAt: binding?.updatedAt,
    });
});
