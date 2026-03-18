import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeAgent,
    OpenCodeClientLike,
    OpenCodeProject,
    PromptSessionResult,
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

test("SendPromptUseCase creates a session in the current project when the chat is unbound", async () => {
    const repo = new InMemorySessionRepository();
    const calls: Array<{
        type: string;
        agent?: string;
        directory?: string;
        prompt?: string;
        sessionId?: string;
        structured?: boolean;
    }> = [];
    const currentProject = createProject("project-1", "E:/repo-1");
    const client: OpenCodeClientLike = {
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            calls.push({ type: "create", directory });
            return createSession("session-1", currentProject.id, directory);
        },
        async getCurrentProject() {
            return currentProject;
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [
                {
                    id: "gpt-5",
                    providerID: "openai",
                    providerName: "OpenAI",
                    name: "GPT-5",
                    qualifiedId: "openai/gpt-5",
                    reasoning: true,
                    variants: {
                        high: {},
                    },
                },
            ];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [currentProject];
        },
        async listSessions() {
            return [];
        },
        async getPath() {
            throw new Error("unused");
        },
        async getConfig() {
            throw new Error("unused");
        },
        async promptSession(input) {
            calls.push({
                type: "prompt",
                sessionId: input.sessionId,
                prompt: input.prompt,
                agent: input.agent ?? undefined,
                structured: input.structured,
            });
            return createPromptReply("assistant reply");
        },
    };

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 1001,
        text: "hello",
    });

    const binding = await repo.getByChatId(1001);

    assert.deepEqual(result, {
        assistantReply: createPromptReply("assistant reply"),
        sessionId: "session-1",
        projectId: "project-1",
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
        language: null,
        updatedAt: binding?.updatedAt,
    });
    assert.deepEqual(calls, [
        { type: "create", directory: "E:/repo-1" },
        {
            type: "prompt",
            sessionId: "session-1",
            prompt: "hello",
            agent: "build",
            structured: true,
        },
    ]);
});

test("SendPromptUseCase preserves a selected model when it needs to create a session later", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 42,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: "high",
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const currentProject = createProject("project-1", "E:/repo-1");
    const promptCalls: unknown[] = [];
    const client: OpenCodeClientLike = {
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", currentProject.id, directory);
        },
        async getCurrentProject() {
            return currentProject;
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [
                {
                    id: "gpt-5",
                    providerID: "openai",
                    providerName: "OpenAI",
                    name: "GPT-5",
                    qualifiedId: "openai/gpt-5",
                    reasoning: true,
                    variants: {
                        high: {},
                    },
                },
            ];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [currentProject];
        },
        async listSessions() {
            return [];
        },
        async getPath() {
            throw new Error("unused");
        },
        async getConfig() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply from model");
        },
    };

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 42,
        text: "continue",
    });
    const binding = await repo.getByChatId(42);

    assert.deepEqual(result, {
        assistantReply: createPromptReply("reply from model"),
        sessionId: "session-1",
        projectId: "project-1",
    });
    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "continue",
            structured: true,
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
        language: null,
        updatedAt: binding?.updatedAt,
    });
});

test("SendPromptUseCase clears a stale model selection before prompting", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 55,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5.2-pro",
        modelVariant: "xhigh",
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const promptCalls: unknown[] = [];
    const client: OpenCodeClientLike = {
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [
                {
                    id: "gpt-5.2",
                    providerID: "openai",
                    providerName: "OpenAI",
                    name: "GPT-5.2",
                    qualifiedId: "openai/gpt-5.2",
                    reasoning: true,
                    variants: {
                        high: {},
                    },
                },
            ];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async listSessions() {
            return [];
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply from default model");
        },
    };

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 55,
        text: "hello",
    });
    const binding = await repo.getByChatId(55);

    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "hello",
            structured: true,
            agent: "build",
        },
    ]);
    assert.equal(result.assistantReply.fallbackText, "reply from default model");
    assert.deepEqual(binding, {
        chatId: 55,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: binding?.updatedAt,
    });
});

test("SendPromptUseCase recreates the session when the saved session context is stale", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 77,
        sessionId: "session-stale",
        projectId: "project-stale",
        directory: "E:/repo-stale",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const promptCalls: unknown[] = [];
    const client: OpenCodeClientLike = {
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-new", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async listSessions() {
            return [createSession("session-live", "project-1", "E:/repo-1")];
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply after recreating the session");
        },
    };

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 77,
        text: "continue",
    });
    const binding = await repo.getByChatId(77);

    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-new",
            prompt: "continue",
            structured: true,
            agent: "build",
        },
    ]);
    assert.equal(result.sessionId, "session-new");
    assert.deepEqual(binding, {
        chatId: 77,
        sessionId: "session-new",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: binding?.updatedAt,
    });
});

test("SendPromptUseCase clears stale selected agents before prompting", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 88,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: "review",
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const promptCalls: unknown[] = [];
    const client: OpenCodeClientLike = {
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async listSessions() {
            return [createSession("session-1", "project-1", "E:/repo-1")];
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply from default agent");
        },
    };

    const useCase = new SendPromptUseCase(repo, client, logger);
    await useCase.execute({
        chatId: 88,
        text: "continue",
    });
    const binding = await repo.getByChatId(88);

    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "continue",
            structured: true,
            agent: "build",
        },
    ]);
    assert.equal(binding?.agentName, null);
});
