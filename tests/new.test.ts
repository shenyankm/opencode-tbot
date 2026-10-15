import assert from "node:assert/strict";
import test from "node:test";
import { handleNewCommand } from "../src/bot/commands/new.js";
import type { BotDependencies } from "../src/bot/types.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
    OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";
import { CreateSessionUseCase } from "../src/use-cases/create-session.usecase.js";

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

function createSession(id: string, projectID: string, directory: string, title = "Session"): OpenCodeSession {
    return {
        id,
        projectID,
        directory,
        title,
        time: {
            created: 1,
            updated: 1,
        },
    } as OpenCodeSession;
}

function createDependencies(client: OpenCodeClientLike) {
    const repo = new InMemorySessionRepository();
    const dependencies = {
        abortPromptUseCase: {} as never,
        createSessionUseCase: new CreateSessionUseCase(repo, client, logger),
        getHealthUseCase: {} as never,
        getPathUseCase: {} as never,
        listAgentsUseCase: {} as never,
        listMcpUseCase: {} as never,
        logger,
        listModelsUseCase: {} as never,
        listSessionsUseCase: {} as never,
        sessionRepo: repo,
        sendPromptUseCase: {} as never,
        switchAgentUseCase: {} as never,
        switchModelUseCase: {} as never,
        switchSessionUseCase: {} as never,
    } as unknown as BotDependencies;

    return { dependencies, repo };
}

test("/new creates a session in the current project, keeps prior selections, and switches the binding", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const createCalls: Array<{ directory: string; title?: string }> = [];
    const { dependencies, repo } = createDependencies({
        async getCurrentProject() {
            return project;
        },
        async createSessionForDirectory(directory: string, title?: string) {
            createCalls.push({ directory, title });
            return createSession("session-2", "project-1", directory, title ?? "Feature work");
        },
    } as never);
    await repo.setCurrent({
        chatId: 5,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: "review",
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: "high",
        language: "zh-CN",
        updatedAt: new Date(0).toISOString(),
    });
    const replies: string[] = [];

    await handleNewCommand(
        {
            chat: { id: 5 },
            message: { text: "/new Feature work" },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    const binding = await repo.getByChatId(5);

    assert.deepEqual(createCalls, [
        {
            directory: "E:/repo-1",
            title: "Feature work",
        },
    ]);
    assert.equal(replies[0], "会话已创建。\n当前会话: Feature work [session-2]");
    assert.deepEqual(binding, {
        chatId: 5,
        sessionId: "session-2",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: "review",
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: "high",
        language: "zh-CN",
        updatedAt: binding?.updatedAt,
    });
});

test("CreateSessionUseCase creates an untitled session when /new has no extra text", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const createCalls: Array<{ directory: string; title?: string }> = [];
    const repo = new InMemorySessionRepository();
    const useCase = new CreateSessionUseCase(
        repo,
        {
            async getCurrentProject() {
                return project;
            },
            async createSessionForDirectory(directory: string, title?: string) {
                createCalls.push({ directory, title });
                return createSession("session-3", "project-1", directory);
            },
        } as never,
        logger,
    );

    const result = await useCase.execute({
        chatId: 9,
    });
    const binding = await repo.getByChatId(9);

    assert.equal(result.session.id, "session-3");
    assert.deepEqual(createCalls, [
        {
            directory: "E:/repo-1",
            title: undefined,
        },
    ]);
    assert.deepEqual(binding, {
        chatId: 9,
        sessionId: "session-3",
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
