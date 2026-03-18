import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type { OpenCodeAgent } from "../src/services/opencode/opencode.client.js";
import { ListAgentsUseCase } from "../src/use-cases/list-agents.usecase.js";

function createAgent(name: string, hidden = false): OpenCodeAgent {
    return {
        name,
        hidden,
        mode: "primary",
        prompt: "",
        tools: [],
        model: undefined,
    } as OpenCodeAgent;
}

test("ListAgentsUseCase falls back to build as the default agent", async () => {
    const repo = new InMemorySessionRepository();
    const useCase = new ListAgentsUseCase(
        repo,
        {
            async listAgents() {
                return [createAgent("chat"), createAgent("build"), createAgent("hidden", true)];
            },
        } as never,
    );

    const result = await useCase.execute({ chatId: 1 });

    assert.equal(result.currentAgentName, "build");
    assert.deepEqual(
        result.agents.map((agent) => agent.name),
        ["chat", "build"],
    );
});

test("ListAgentsUseCase keeps the explicitly selected agent when present", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 2,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: "review",
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });
    const useCase = new ListAgentsUseCase(
        repo,
        {
            async listAgents() {
                return [createAgent("build"), createAgent("review")];
            },
        } as never,
    );

    const result = await useCase.execute({ chatId: 2 });

    assert.equal(result.currentAgentName, "review");
});
