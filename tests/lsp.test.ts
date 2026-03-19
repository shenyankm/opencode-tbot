import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeProject,
} from "../src/services/opencode/opencode.client.js";
import { ListLspUseCase } from "../src/use-cases/list-lsp.usecase.js";

function createProject(id: string, worktree: string): OpenCodeProject {
    return {
        id,
        worktree,
        time: { created: 1, updated: 1 },
        sandboxes: [],
    } as OpenCodeProject;
}

test("ListLspUseCase returns the current project and sorts statuses", async () => {
    const repo = new InMemorySessionRepository();
    const currentProject = createProject("project-1", "E:/repo-1");
    const calls: string[] = [];
    const listLspUseCase = new ListLspUseCase(
        repo,
        {
            async getCurrentProject() {
                return currentProject;
            },
            async listLspStatuses(directory) {
                calls.push(directory ?? "");

                return [
                    { id: "ts-2", name: "TypeScript", root: "E:/repo-1/packages/app", status: "connected" },
                    { id: "go-1", name: "Go", root: "E:/repo-1/server", status: "error" },
                    { id: "ts-1", name: "TypeScript", root: "E:/repo-1", status: "connected" },
                ] as never;
            },
        } as never,
    );

    const result = await listLspUseCase.execute({ chatId: 1 });

    assert.deepEqual(calls, ["E:/repo-1"]);
    assert.equal(result.currentDirectory, "E:/repo-1");
    assert.deepEqual(result.statuses.map((status) => status.id), ["go-1", "ts-1", "ts-2"]);
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
