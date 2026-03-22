import assert from "node:assert/strict";
import test from "node:test";
import { handleAgentsCommand } from "../src/bot/commands/agents.js";
import { handleAgentsCallback } from "../src/bot/handlers/callback.handler.js";
import type { BotDependencies } from "../src/bot/types.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type { OpenCodeAgent, OpenCodeClientLike } from "../src/services/opencode/opencode.client.js";
import { ListAgentsUseCase } from "../src/use-cases/list-agents.usecase.js";
import { SwitchAgentUseCase } from "../src/use-cases/switch-agent.usecase.js";

const logger = {
    child() {
        return this;
    },
    error() { },
    async flush() { },
    info() { },
    warn() { },
} as unknown as AppLogger;

function createAgent(
    name: string,
    options: {
        hidden?: boolean;
        mode?: OpenCodeAgent["mode"];
    } = {},
): OpenCodeAgent {
    return {
        name,
        hidden: options.hidden ?? false,
        mode: options.mode ?? "primary",
        prompt: "",
        tools: [],
        model: undefined,
    } as OpenCodeAgent;
}

function createDependencies(client: OpenCodeClientLike) {
    const repo = new InMemorySessionRepository();
    const dependencies: BotDependencies = {
        listAgentsUseCase: new ListAgentsUseCase(repo, client),
        logger,
        sessionRepo: repo,
        switchAgentUseCase: new SwitchAgentUseCase(repo, client, logger),
    } as never;

    return { dependencies, repo };
}

test("ListAgentsUseCase filters hidden agents and subagents while keeping primary and all agents", async () => {
    const repo = new InMemorySessionRepository();
    const useCase = new ListAgentsUseCase(
        repo,
        {
            async listAgents() {
                return [
                    createAgent("chat"),
                    createAgent("build"),
                    createAgent("plan", { mode: "all" }),
                    createAgent("general", { mode: "subagent" }),
                    createAgent("hidden", { hidden: true }),
                ];
            },
        } as never,
    );

    const result = await useCase.execute({ chatId: 1 });

    assert.equal(result.currentAgentName, "build");
    assert.deepEqual(
        result.agents.map((agent) => agent.name),
        ["chat", "build", "plan"],
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

test("ListAgentsUseCase clears stale selected agents and falls back to the default", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 3,
        sessionId: "session-3",
        projectId: "project-3",
        directory: "E:/repo-3",
        agentName: "review",
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });
    const useCase = new ListAgentsUseCase(
        repo,
        {
            async listAgents() {
                return [createAgent("build"), createAgent("chat")];
            },
        } as never,
    );

    const result = await useCase.execute({ chatId: 3 });
    const binding = await repo.getByChatId(3);

    assert.equal(result.currentAgentName, "build");
    assert.equal(binding?.agentName, null);
    assert.equal(binding?.sessionId, "session-3");
});

test("ListAgentsUseCase clears selected subagents and falls back to the default", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 4,
        sessionId: "session-4",
        projectId: "project-4",
        directory: "E:/repo-4",
        agentName: "general",
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });
    const useCase = new ListAgentsUseCase(
        repo,
        {
            async listAgents() {
                return [
                    createAgent("build"),
                    createAgent("plan", { mode: "all" }),
                    createAgent("general", { mode: "subagent" }),
                ];
            },
        } as never,
    );

    const result = await useCase.execute({ chatId: 4 });
    const binding = await repo.getByChatId(4);

    assert.equal(result.currentAgentName, "build");
    assert.deepEqual(result.agents.map((agent) => agent.name), ["build", "plan"]);
    assert.equal(binding?.agentName, null);
});

test("/agents only shows selectable agents without mode suffixes", async () => {
    const { dependencies } = createDependencies({
        async listAgents() {
            return [
                createAgent("build"),
                createAgent("plan", { mode: "all" }),
                createAgent("general", { mode: "subagent" }),
                createAgent("hidden", { hidden: true }),
            ];
        },
    } as never);
    const replies: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];

    await handleAgentsCommand(
        {
            chat: { id: 5 },
            async reply(text, other) {
                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(replies.length, 1);
    assert.match(replies[0].text, /Agent List/);
    assert.match(replies[0].text, /Current agent: build/);
    assert.match(replies[0].text, /1\. build/);
    assert.match(replies[0].text, /2\. plan/);
    assert.doesNotMatch(replies[0].text, /general/);
    assert.doesNotMatch(replies[0].text, /\[(primary|all|subagent)\]/);

    const keyboard = replies[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(
        keyboard.inline_keyboard[0].map((button) => button.text),
        ["1", "2"],
    );
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, "agents:select:1");
    assert.equal(keyboard.inline_keyboard[0][1].callback_data, "agents:select:2");
});

test("agent selection callbacks use the filtered index and show plain agent names", async () => {
    const { dependencies, repo } = createDependencies({
        async listAgents() {
            return [
                createAgent("build"),
                createAgent("plan", { mode: "all" }),
                createAgent("general", { mode: "subagent" }),
            ];
        },
    } as never);
    const edits: string[] = [];
    let answered = 0;

    await handleAgentsCallback(
        {
            chat: { id: 6 },
            callbackQuery: { data: "agents:select:2" },
            async answerCallbackQuery() {
                answered += 1;
                return {};
            },
            async editMessageText(text) {
                edits.push(text);
                return {};
            },
        },
        dependencies,
    );

    const binding = await repo.getByChatId(6);

    assert.equal(answered, 1);
    assert.deepEqual(edits, [
        "Agent switched.\nCurrent agent: plan",
    ]);
    assert.equal(binding?.agentName, "plan");
});

test("handleAgentsCallback falls back to the default locale when chat state lookup fails", async () => {
    let answered = 0;
    let editedText = "";
    const { dependencies } = createDependencies({
        async listAgents() {
            return [createAgent("planner")];
        },
    } as never);

    dependencies.sessionRepo = {
        async getByChatId() {
            throw new Error("state boom");
        },
    } as never;
    dependencies.listAgentsUseCase = {
        async execute() {
            return {
                agents: [createAgent("planner")],
                currentAgentName: null,
            };
        },
    } as never;

    await handleAgentsCallback(
        {
            chat: { id: 55 },
            callbackQuery: { data: "agents:page:0" },
            async answerCallbackQuery() {
                answered += 1;
                return {};
            },
            async editMessageText(text) {
                editedText = text;
                return {};
            },
        },
        dependencies,
    );

    assert.equal(answered, 1);
    assert.match(editedText, /Agent List/);
    assert.match(editedText, /planner/);
});
