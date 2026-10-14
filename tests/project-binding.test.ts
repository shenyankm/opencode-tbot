import assert from "node:assert/strict";
import test from "node:test";
import type { ChatSessionBinding } from "../src/domain/session/session.entity.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
    OpenCodeSession,
    PromptSessionResult,
} from "../src/services/opencode/opencode.client.js";
import { ListLspUseCase } from "../src/use-cases/list-lsp.usecase.js";
import { ListMcpUseCase } from "../src/use-cases/list-mcp.usecase.js";
import { ListSessionsUseCase } from "../src/use-cases/list-sessions.usecase.js";
import { SendPromptUseCase } from "../src/use-cases/send-prompt.usecase.js";

function createBinding(): ChatSessionBinding {
    return {
        chatId: 1,
        sessionId: "session-sandbox",
        projectId: "project-1",
        directory: "/repo-worktree",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    };
}

const project: OpenCodeProject = {
    id: "project-1",
    worktree: "/repo",
    sandboxes: ["/repo-worktree"],
};
const session: OpenCodeSession = {
    id: "session-sandbox",
    projectID: project.id,
    directory: "/repo-worktree",
    title: "Sandbox session",
    time: { created: 1, updated: 1 },
};
const logger = { info() {}, warn() {} } as AppLogger;

for (const operation of ["sessions", "lsp", "mcp", "prompt"] as const) {
    for (const registeredSandbox of [true, false]) {
        test(`${operation} preserves a saved session in ${registeredSandbox ? "a registered" : "an external"} V2 worktree`, async () => {
            const repo = new InMemorySessionRepository();
            const binding = createBinding();
            await repo.setCurrent(binding);
            const calls: string[] = [];
            const client = {
                async listProjects() { return [{ ...project, sandboxes: registeredSandbox ? project.sandboxes : [] }]; },
                async listSessions() { return [session]; },
                async listAgents() { return []; },
                async getCurrentProject() { throw new Error("The saved sandbox should stay selected."); },
                async createSessionForDirectory() { throw new Error("The saved session should be reused."); },
                async listLspStatuses(directory: string) { calls.push(directory); return []; },
                async listMcpStatuses(directory: string) { calls.push(directory); return {}; },
                async promptSession(input: { sessionId: string }) {
                    calls.push(input.sessionId);
                    return { assistantError: null } as PromptSessionResult;
                },
            } as unknown as OpenCodeClientLike;

            if (operation === "sessions") {
                const result = await new ListSessionsUseCase(repo, client).execute({ chatId: 1 });
                assert.equal(result.currentDirectory, binding.directory);
                assert.equal(result.currentSessionId, binding.sessionId);
                assert.deepEqual(result.sessions, [session]);
            } else if (operation === "lsp") {
                const result = await new ListLspUseCase(repo, client).execute({ chatId: 1 });
                assert.equal(result.currentDirectory, binding.directory);
                assert.deepEqual(calls, [binding.directory]);
            } else if (operation === "mcp") {
                const result = await new ListMcpUseCase(repo, client).execute({ chatId: 1 });
                assert.equal(result.currentDirectory, binding.directory);
                assert.deepEqual(calls, [binding.directory]);
            } else {
                const result = await new SendPromptUseCase(repo, client, logger).execute({ chatId: 1, text: "hello" });
                assert.equal(result.sessionId, binding.sessionId);
                assert.deepEqual(calls, [binding.sessionId]);
            }

            assert.deepEqual(await repo.getByChatId(1), {
                ...binding,
                updatedAt: (await repo.getByChatId(1))?.updatedAt,
            });
        });
    }
}

test("ListSessionsUseCase rejects a sandbox belonging to a different saved project", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({ ...createBinding(), projectId: "project-other" });
    const client = {
        async listProjects() { return [project]; },
        async listSessions() { return [session]; },
        async getCurrentProject() { return project; },
    } as unknown as OpenCodeClientLike;

    const result = await new ListSessionsUseCase(repo, client).execute({ chatId: 1 });

    assert.equal(result.currentDirectory, "/repo");
    assert.equal(result.currentSessionId, null);
    assert.equal((await repo.getByChatId(1))?.projectId, null);
});

test("ListSessionsUseCase rejects a saved directory that disagrees with its session", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({ ...createBinding(), directory: "/wrong-worktree" });
    const client = {
        async listProjects() { return [{ ...project, sandboxes: [] }]; },
        async listSessions() { return [session]; },
        async getCurrentProject() { return project; },
    } as unknown as OpenCodeClientLike;

    const result = await new ListSessionsUseCase(repo, client).execute({ chatId: 1 });

    assert.equal(result.currentDirectory, "/repo");
    assert.equal(result.currentSessionId, null);
    assert.equal((await repo.getByChatId(1))?.directory, null);
});

for (const operation of ["sessions", "lsp", "mcp", "prompt"] as const) {
    test(`${operation} keeps a saved external worktree binding when session lookup fails`, async () => {
        const repo = new InMemorySessionRepository();
        const binding = createBinding();
        await repo.setCurrent(binding);
        const offline = new Error("Session lookup is unavailable.");
        const client = {
            async listProjects() { return [{ ...project, sandboxes: [] }]; },
            async listSessions() { throw offline; },
        } as unknown as OpenCodeClientLike;
        const useCase = operation === "sessions" ? new ListSessionsUseCase(repo, client)
            : operation === "lsp" ? new ListLspUseCase(repo, client)
                : operation === "mcp" ? new ListMcpUseCase(repo, client)
                    : new SendPromptUseCase(repo, client, logger);

        await assert.rejects(useCase.execute({ chatId: 1, text: "hello" }), (error) => error === offline);
        assert.deepEqual(await repo.getByChatId(1), binding);
    });
}
