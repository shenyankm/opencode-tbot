import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { getChatCopy } from "../src/bot/i18n.js";
import { handleStatusCommand } from "../src/bot/commands/status.js";
import { presentStatusMessage } from "../src/bot/presenters/message.presenter.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
} from "../src/services/opencode/opencode.client.js";
import { GetHealthUseCase } from "../src/use-cases/get-health.usecase.js";
import { GetPathUseCase } from "../src/use-cases/get-path.usecase.js";
import { GetStatusUseCase } from "../src/use-cases/get-status.usecase.js";
import { ListLspUseCase } from "../src/use-cases/list-lsp.usecase.js";
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
    const sessionRepo = new InMemorySessionRepository();
    const getHealthUseCase = new GetHealthUseCase(client);
    const getPathUseCase = new GetPathUseCase(client);
    const listLspUseCase = new ListLspUseCase(sessionRepo, client);
    const listMcpUseCase = new ListMcpUseCase(sessionRepo, client);
    const getStatusUseCase = new GetStatusUseCase(
        getHealthUseCase,
        getPathUseCase,
        listLspUseCase,
        listMcpUseCase,
    );

    return {
        dependencies: {
            getStatusUseCase,
            logger,
            sessionRepo,
        } as never,
        getStatusUseCase,
        sessionRepo,
    };
}

test("/status aggregates health, path, LSP, and MCP into one reply", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const replies: string[] = [];
    const { dependencies, getStatusUseCase, sessionRepo } = createDependencies({
        async getCurrentProject() {
            return project;
        },
        async getHealth() {
            return {
                healthy: true,
                version: "1.0.0",
            };
        },
        async getPath() {
            return {
                home: "E:/Users/demo",
                state: "E:/Users/demo/.opencode",
                config: "E:/repo/opencode.json",
                worktree: "E:/repo",
                directory: "E:/repo/src",
            };
        },
        async listProjects() {
            return [project];
        },
        async listLspStatuses(directory) {
            assert.equal(directory, "E:/repo-1");

            return [
                { id: "ts-2", name: "TypeScript", root: "E:/repo-1/packages/app", status: "connected" },
                { id: "go-1", name: "Go", root: "E:/repo-1/server", status: "error" },
                { id: "ts-1", name: "TypeScript", root: "E:/repo-1", status: "connected" },
            ] as never;
        },
        async listMcpStatuses(directory) {
            assert.equal(directory, "E:/repo-1");

            return {
                zed: { status: "needs_auth" },
                alpha: { status: "connected" },
                beta: { status: "disabled" },
                delta: { status: "failed", error: "timeout" },
                gamma: { status: "needs_client_registration", error: "missing metadata" },
            };
        },
    } as never);

    await sessionRepo.setCurrent({
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

    await handleStatusCommand(
        {
            chat: { id: 1 },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    const copy = await getChatCopy(sessionRepo, 1);
    const result = await getStatusUseCase.execute({ chatId: 1 });

    assert.equal(replies[0], presentStatusMessage(result, copy));
    assert.match(replies[0], /^System Status/m);
    assert.match(replies[0], /Server Health/);
    assert.match(replies[0], /Current Paths/);
    assert.match(replies[0], /LSP Servers/);
    assert.match(replies[0], /MCP Servers/);
});

test("/status keeps successful sections when one section fails", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const replies: string[] = [];
    const { dependencies, sessionRepo } = createDependencies({
        async getCurrentProject() {
            return project;
        },
        async getHealth() {
            throw new Error("health boom");
        },
        async getPath() {
            return {
                home: "E:/Users/demo",
                state: "E:/Users/demo/.opencode",
                config: "E:/repo/opencode.json",
                worktree: "E:/repo",
                directory: "E:/repo/src",
            };
        },
        async listLspStatuses() {
            return [];
        },
        async listMcpStatuses() {
            throw new Error("mcp boom");
        },
    } as never);

    await handleStatusCommand(
        {
            chat: { id: 2 },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.match(replies[0], /System Status/);
    assert.match(replies[0], /Server Health\nUnexpected error\.\nCause: health boom/);
    assert.match(replies[0], /Current Paths\nCurrent working directory: E:\/repo\/src/);
    assert.match(replies[0], /LSP Servers\nCurrent project: E:\/repo-1\n\nNo LSP servers detected for the current project\./);
    assert.match(replies[0], /MCP Servers\nUnexpected error\.\nCause: mcp boom/);
    assert.equal(await sessionRepo.getByChatId(2), null);
});

test("/status uses the selected chat language", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const replies: string[] = [];
    const { dependencies, getStatusUseCase, sessionRepo } = createDependencies({
        async getCurrentProject() {
            return project;
        },
        async getHealth() {
            return {
                healthy: true,
                version: "1.0.0",
            };
        },
        async getPath() {
            return {
                home: "E:/Users/demo",
                state: "E:/Users/demo/.opencode",
                config: "E:/repo/opencode.json",
                worktree: "E:/repo",
                directory: "E:/repo/src",
            };
        },
        async listLspStatuses() {
            return [];
        },
        async listMcpStatuses() {
            return {};
        },
    } as never);

    await sessionRepo.setCurrent({
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

    await handleStatusCommand(
        {
            chat: { id: 3 },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    const copy = await getChatCopy(sessionRepo, 3);
    const result = await getStatusUseCase.execute({ chatId: 3 });

    assert.equal(replies[0], presentStatusMessage(result, copy));
    assert.match(replies[0], /^系统状态/m);
});
