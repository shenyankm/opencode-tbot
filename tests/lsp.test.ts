import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { handleLspCommand } from "../src/bot/commands/lsp.js";
import type { BotDependencies } from "../src/bot/types.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
} from "../src/services/opencode/opencode.client.js";
import { ListLspUseCase } from "../src/use-cases/list-lsp.usecase.js";

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

function createDependencies(client: OpenCodeClientLike) {
    const repo = new InMemorySessionRepository();
    const dependencies: BotDependencies = {
        abortPromptUseCase: {} as never,
        createSessionUseCase: {} as never,
        getHealthUseCase: {} as never,
        getPathUseCase: {} as never,
        listAgentsUseCase: {} as never,
        listLspUseCase: new ListLspUseCase(repo, client),
        listMcpUseCase: {} as never,
        logger,
        listModelsUseCase: {} as never,
        listSessionsUseCase: {} as never,
        sessionRepo: repo,
        sendPromptUseCase: {} as never,
        switchAgentUseCase: {} as never,
        switchModelUseCase: {} as never,
        switchSessionUseCase: {} as never,
    };

    return { dependencies, repo };
}

test("/lsp shows the current project and sorted LSP statuses", async () => {
    const currentProject = createProject("project-1", "E:/repo-1");
    const calls: string[] = [];
    const { dependencies, repo } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listProjects() {
            return [currentProject];
        },
        async listLspStatuses(directory) {
            calls.push(directory ?? "");

            return [
                { id: "ts-2", name: "TypeScript", root: "E:/repo-1/packages/app", status: "connected" },
                { id: "go-1", name: "Go", root: "E:/repo-1/server", status: "error" },
                { id: "ts-1", name: "TypeScript", root: "E:/repo-1", status: "connected" },
            ] as never;
        },
    } as never);
    await repo.setCurrent({
        chatId: 1,
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
    const replies: string[] = [];

    await handleLspCommand(
        {
            chat: { id: 1 },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.deepEqual(calls, ["E:/repo-1"]);
    assert.equal(replies[0], [
        "LSP Servers",
        "Current project: E:/repo-1",
        "",
        "Go: error",
        "TypeScript: connected",
        "TypeScript: connected",
    ].join("\n"));
});

test("/lsp uses the selected chat language and shows the empty state", async () => {
    const currentProject = createProject("project-1", "E:/repo-1");
    const { dependencies, repo } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listLspStatuses() {
            return [];
        },
    } as never);
    await repo.setCurrent({
        chatId: 3,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "zh-CN",
        updatedAt: new Date(0).toISOString(),
    });
    const replies: string[] = [];

    await handleLspCommand(
        {
            chat: { id: 3 },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.equal(replies[0], [
        "LSP 服务",
        "当前项目: E:/repo-1",
        "",
        "当前项目未检测到 LSP。",
    ].join("\n"));
});

test("ListLspUseCase clears a stale saved project binding and falls back to the current project", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 8,
        sessionId: "session-stale",
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
    const listLspUseCase = new ListLspUseCase(
        repo,
        {
            async getCurrentProject() {
                return currentProject;
            },
            async listProjects() {
                return [currentProject];
            },
            async listLspStatuses(directory) {
                assert.equal(directory, "E:/repo-2");
                return [];
            },
        } as never,
    );

    const result = await listLspUseCase.execute({ chatId: 8 });
    const binding = await repo.getByChatId(8);

    assert.equal(result.currentDirectory, "E:/repo-2");
    assert.deepEqual(result.statuses, []);
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
