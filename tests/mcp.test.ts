import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { handleMcpCommand } from "../src/bot/commands/mcp.js";
import type { BotDependencies } from "../src/bot/types.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeMcpStatus,
    OpenCodeProject,
} from "../src/services/opencode/opencode.client.js";
import { ListMcpUseCase } from "../src/use-cases/list-mcp.usecase.js";

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
        listMcpUseCase: new ListMcpUseCase(repo, client),
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

test("/mcp shows the current project and sorted MCP statuses", async () => {
    const currentProject = createProject("project-1", "E:/repo-1");
    const calls: string[] = [];
    const { dependencies, repo } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listProjects() {
            return [currentProject];
        },
        async listMcpStatuses(directory) {
            calls.push(directory ?? "");

            return {
                zed: { status: "needs_auth" },
                alpha: { status: "connected" },
                beta: { status: "disabled" },
                delta: { status: "failed", error: "timeout" },
                gamma: { status: "needs_client_registration", error: "missing metadata" },
            } satisfies Record<string, OpenCodeMcpStatus>;
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

    await handleMcpCommand(
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
        "MCP Servers",
        "Current project: E:/repo-1",
        "",
        "alpha: connected",
        "beta: disabled",
        "delta: failed: timeout",
        "gamma: needs client registration: missing metadata",
        "zed: needs auth",
    ].join("\n"));
});

test("/mcp shows the empty state for the current project when nothing is configured", async () => {
    const currentProject = createProject("project-1", "E:/repo-1");
    const { dependencies } = createDependencies({
        async getCurrentProject() {
            return currentProject;
        },
        async listMcpStatuses() {
            return {};
        },
    } as never);
    const replies: string[] = [];

    await handleMcpCommand(
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
        "MCP Servers",
        "Current project: E:/repo-1",
        "",
        "No MCP servers configured for the current project.",
    ].join("\n"));
});

test("ListMcpUseCase clears a stale saved project binding and falls back to the current project", async () => {
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
    const listMcpUseCase = new ListMcpUseCase(
        repo,
        {
            async getCurrentProject() {
                return currentProject;
            },
            async listProjects() {
                return [currentProject];
            },
            async listMcpStatuses(directory) {
                assert.equal(directory, "E:/repo-2");
                return {};
            },
        } as never,
    );

    const result = await listMcpUseCase.execute({ chatId: 8 });
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
