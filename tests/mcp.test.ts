import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeMcpStatus,
    OpenCodeProject,
} from "../src/services/opencode/opencode.client.js";
import { ListMcpUseCase } from "../src/use-cases/list-mcp.usecase.js";

function createProject(id: string, worktree: string): OpenCodeProject {
    return {
        id,
        worktree,
        time: { created: 1, updated: 1 },
        sandboxes: [],
    } as OpenCodeProject;
}

test("ListMcpUseCase returns the current project and sorts statuses", async () => {
    const repo = new InMemorySessionRepository();
    const currentProject = createProject("project-1", "E:/repo-1");
    const calls: string[] = [];
    const listMcpUseCase = new ListMcpUseCase(
        repo,
        {
            async getCurrentProject() {
                return currentProject;
            },
            async listMcpStatuses(directory?: string) {
                calls.push(directory ?? "");

                return {
                    zed: { status: "needs_auth", error: "Authentication required" },
                    alpha: { status: "connected" },
                    beta: { status: "disabled" },
                    delta: { status: "failed", error: "timeout" },
                    gamma: { status: "pending" },
                } satisfies Record<string, OpenCodeMcpStatus>;
            },
        } as never,
    );

    const result = await listMcpUseCase.execute({ chatId: 1 });

    assert.deepEqual(calls, ["E:/repo-1"]);
    assert.equal(result.currentDirectory, "E:/repo-1");
    assert.deepEqual(result.statuses.map((entry) => entry.name), ["alpha", "beta", "delta", "gamma", "zed"]);
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
            async listMcpStatuses(directory?: string) {
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
