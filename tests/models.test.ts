import assert from "node:assert/strict";
import test from "node:test";
import { handleModelsCommand } from "../src/bot/commands/models.js";
import { handleModelsCallback } from "../src/bot/handlers/callback.handler.js";
import type { BotDependencies } from "../src/bot/types.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeConfiguredModel,
    OpenCodeProject,
    PromptSessionResult,
    OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";
import { ListModelsUseCase } from "../src/use-cases/list-models.usecase.js";
import { SendPromptUseCase } from "../src/use-cases/send-prompt.usecase.js";
import { SwitchModelUseCase } from "../src/use-cases/switch-model.usecase.js";

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

function createConfiguredModel(
    providerID: string,
    id: string,
    name: string,
    providerName: string,
    variants: Record<string, Record<string, unknown>> = {},
): OpenCodeConfiguredModel {
    return {
        id,
        providerID,
        providerName,
        name,
        qualifiedId: `${providerID}/${id}`,
        reasoning: Object.keys(variants).length > 0,
        variants,
    };
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

function createDependencies(client: OpenCodeClientLike) {
    const repo = new InMemorySessionRepository();
    const dependencies: BotDependencies = {
        abortPromptUseCase: {
            async execute() {
                return { sessionId: null, sessionStatus: null, status: "no_session" as const };
            },
        },
        logger,
        listModelsUseCase: new ListModelsUseCase(repo, client),
        sessionRepo: repo,
        sendPromptUseCase: new SendPromptUseCase(repo, client, logger),
        switchModelUseCase: new SwitchModelUseCase(repo, client, logger),
    };

    return { dependencies, repo };
}

test("/model only shows configured models with numeric inline buttons", async () => {
    const models = Array.from({ length: 12 }, (_, index) =>
        createConfiguredModel("openai", `model-${index + 1}`, `Model ${index + 1}`, "OpenAI"),
    );
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async listModels() {
            return models;
        },
        async listAgents() {
            return [{ name: "build", mode: "primary" }] as never;
        },
        async listProjects() {
            return [];
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const replies: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];

    await handleModelsCommand(
        {
            chat: { id: 1 },
            async reply(text, other) {
                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(replies.length, 1);
    assert.match(replies[0].text, /Model List/);
    assert.match(replies[0].text, /Only models currently available in OpenCode and connected providers are shown\./);
    assert.match(replies[0].text, /Current model: Not selected \(using OpenCode default\)/);
    assert.match(replies[0].text, /Page 1\/2/);
    assert.match(replies[0].text, /1\. OpenAI \/ Model 1/);
    assert.doesNotMatch(replies[0].text, /13\. /);

    const keyboard = replies[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(
        keyboard.inline_keyboard[0].map((button) => button.text),
        ["1", "2", "3", "4", "5"],
    );
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, "model:pick:1");
    assert.equal(keyboard.inline_keyboard.at(-1)?.at(-1)?.callback_data, "model:page:1");
});

test("model page callbacks re-render the requested page", async () => {
    const models = Array.from({ length: 12 }, (_, index) =>
        createConfiguredModel("openai", `model-${index + 1}`, `Model ${index + 1}`, "OpenAI"),
    );
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async listModels() {
            return models;
        },
        async listAgents() {
            return [{ name: "build", mode: "primary" }] as never;
        },
        async listProjects() {
            return [];
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    let answered = 0;

    await handleModelsCallback(
        {
            chat: { id: 1 },
            callbackQuery: { data: "model:page:1" },
            async answerCallbackQuery() {
                answered += 1;
                return {};
            },
            async editMessageText(text, other) {
                edits.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(answered, 1);
    assert.equal(edits.length, 1);
    assert.match(edits[0].text, /Page 2\/2/);
    assert.match(edits[0].text, /11\. OpenAI \/ Model 11/);
    assert.doesNotMatch(edits[0].text, /^1\. OpenAI \/ Model 1$/m);

    const keyboard = edits[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(
        keyboard.inline_keyboard[0].map((button) => button.text),
        ["11", "12", "Previous"],
    );
    assert.equal(keyboard.inline_keyboard[0].at(-1)?.callback_data, "model:page:0");
});

test("picking a model with variants opens a second numeric choice list", async () => {
    const models = [
        createConfiguredModel("openai", "gpt-5", "GPT-5", "OpenAI"),
        createConfiguredModel("openai", "gpt-5-thinking", "GPT-5 Thinking", "OpenAI", {
            high: {},
            low: {},
            medium: {},
        }),
    ];
    const { dependencies } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async listModels() {
            return models;
        },
        async listAgents() {
            return [{ name: "build", mode: "primary" }] as never;
        },
        async listProjects() {
            return [];
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];

    await handleModelsCallback(
        {
            chat: { id: 1 },
            callbackQuery: { data: "model:pick:2" },
            async answerCallbackQuery() {
                return {};
            },
            async editMessageText(text, other) {
                edits.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(edits.length, 1);
    assert.match(edits[0].text, /Reasoning Levels/);
    assert.match(edits[0].text, /Model number: 2/);
    assert.match(edits[0].text, /1\. low/);
    assert.match(edits[0].text, /2\. medium/);
    assert.match(edits[0].text, /3\. high/);

    const keyboard = edits[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(
        keyboard.inline_keyboard[0].map((button) => button.text),
        ["1", "2", "3"],
    );
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, "model:variant:2:1");
});

test("picking a model without variants switches immediately", async () => {
    const models = [
        createConfiguredModel("openai", "gpt-5", "GPT-5", "OpenAI"),
    ];
    const { dependencies, repo } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async listModels() {
            return models;
        },
        async listAgents() {
            return [{ name: "build", mode: "primary" }] as never;
        },
        async listProjects() {
            return [];
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    const edits: string[] = [];

    await handleModelsCallback(
        {
            chat: { id: 9 },
            callbackQuery: { data: "model:pick:1" },
            async answerCallbackQuery() {
                return {};
            },
            async editMessageText(text) {
                edits.push(text);
                return {};
            },
        },
        dependencies,
    );

    const binding = await repo.getByChatId(9);

    assert.equal(edits[0], "Model switched.\nCurrent model: OpenAI / GPT-5\nCurrent reasoning level: default");
    assert.deepEqual(binding, {
        chatId: 9,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: null,
        language: null,
        updatedAt: binding?.updatedAt,
    });
});

test("variant selection updates the binding and later prompts use the selected model", async () => {
    const models = [
        createConfiguredModel("openai", "gpt-5-thinking", "GPT-5 Thinking", "OpenAI", {
            high: {},
            low: {},
            medium: {},
        }),
    ];
    const promptCalls: unknown[] = [];
    const { dependencies, repo } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async listModels() {
            return models;
        },
        async listAgents() {
            return [{ name: "build", mode: "primary" }] as never;
        },
        async listProjects() {
            return [];
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply from selected model");
        },
    });
    const edits: string[] = [];

    await handleModelsCallback(
        {
            chat: { id: 12 },
            callbackQuery: { data: "model:variant:1:3" },
            async answerCallbackQuery() {
                return {};
            },
            async editMessageText(text) {
                edits.push(text);
                return {};
            },
        },
        dependencies,
    );

    const bindingAfterSwitch = await repo.getByChatId(12);
    const promptResult = await dependencies.sendPromptUseCase.execute({
        chatId: 12,
        text: "continue",
    });
    const bindingAfterPrompt = await repo.getByChatId(12);

    assert.equal(edits[0], "Model switched.\nCurrent model: OpenAI / GPT-5 Thinking\nCurrent reasoning level: high");
    assert.deepEqual(bindingAfterSwitch, {
        chatId: 12,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5-thinking",
        modelVariant: "high",
        language: null,
        updatedAt: bindingAfterSwitch?.updatedAt,
    });
    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "continue",
            structured: true,
            agent: "build",
            model: {
                providerID: "openai",
                modelID: "gpt-5-thinking",
            },
            variant: "high",
        },
    ]);
    assert.equal(promptResult.assistantReply.fallbackText, "reply from selected model");
    assert.deepEqual(bindingAfterPrompt, {
        chatId: 12,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5-thinking",
        modelVariant: "high",
        language: null,
        updatedAt: bindingAfterPrompt?.updatedAt,
    });
});

test("ListModelsUseCase clears stale model selections during listing", async () => {
    const { dependencies, repo } = createDependencies({
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async listModels() {
            return [
                createConfiguredModel("openai", "gpt-5", "GPT-5", "OpenAI", {
                    low: {},
                }),
            ];
        },
        async listAgents() {
            return [{ name: "build", mode: "primary" }] as never;
        },
        async listProjects() {
            return [];
        },
        async promptSession() {
            return createPromptReply("unused");
        },
    });
    await repo.setCurrent({
        chatId: 44,
        sessionId: "session-44",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: "openai",
        modelId: "missing-model",
        modelVariant: "high",
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const result = await dependencies.listModelsUseCase.execute({ chatId: 44 });
    const binding = await repo.getByChatId(44);

    assert.equal(result.currentModelProviderId, null);
    assert.equal(result.currentModelId, null);
    assert.equal(result.currentModelVariant, null);
    assert.deepEqual(binding, {
        chatId: 44,
        sessionId: "session-44",
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
