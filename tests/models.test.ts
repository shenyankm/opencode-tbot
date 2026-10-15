import assert from "node:assert/strict";
import test from "node:test";
import { GrammyError } from "grammy";
import { getBotCopy } from "../src/bot/copy.js";
import { presentModelsMessage } from "../src/bot/presenters/message.presenter.js";
import { getModelCallbackKey, getVariantCallbackKey, buildModelsKeyboard } from "../src/bot/presenters/keyboard.presenter.js";
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

function createDependencies(client: Partial<OpenCodeClientLike>) {
    const repo = new InMemorySessionRepository();
    const typedClient = client as OpenCodeClientLike;
    const refreshed: number[] = [];
    const dependencies = {
        abortPromptUseCase: {
            async execute() {
                return { sessionId: null, sessionStatus: null, status: "no_session" as const };
            },
        } as unknown as BotDependencies["abortPromptUseCase"],
        contextFooter: { async refreshChat(chatId: number) { refreshed.push(chatId); } },
        logger,
        listModelsUseCase: new ListModelsUseCase(repo, typedClient),
        sessionRepo: repo,
        sendPromptUseCase: new SendPromptUseCase(repo, typedClient, logger),
        switchModelUseCase: new SwitchModelUseCase(repo, typedClient, logger),
    } as unknown as BotDependencies;

    return { dependencies, repo, refreshed };
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
    assert.match(replies[0].text, /^<h2>Choose a model<\/h2>/u);
    assert.doesNotMatch(replies[0].text, /Only models exposed/u);
    assert.match(replies[0].text, /Current model: <b>Not selected \(using OpenCode default\)<\/b>/u);
    assert.match(replies[0].text, /Page 1\/2/);
    assert.match(replies[0].text, /<h3>OpenAI<\/h3><ol start="1"><li>Model 1<\/li>/u);
    assert.equal(replies[0].text.match(/OpenAI/gu)?.length, 1);
    assert.doesNotMatch(replies[0].text, /13\. /);

    const keyboard = replies[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(
        keyboard.inline_keyboard[0].map((button) => button.text),
        ["1", "2", "3"],
    );
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, `model:pick:${getModelCallbackKey(models[0])}`);
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
    assert.match(edits[0].text, /<ol start="11"><li>Model 11<\/li>/);
    assert.doesNotMatch(edits[0].text, /^1\. Model 1$/m);

    const keyboard = edits[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(
        keyboard.inline_keyboard[0].map((button) => button.text),
        ["11", "12"],
    );
    assert.equal(keyboard.inline_keyboard.at(-1)?.at(-1)?.callback_data, "model:page:0");
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
            callbackQuery: { data: `model:pick:${getModelCallbackKey(models[1])}` },
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
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, `model:variant:${getModelCallbackKey(models[1])}:${getVariantCallbackKey("low")}`);
});

test("picking a model without variants switches immediately", async () => {
    const models = [
        createConfiguredModel("openai", "gpt-5", "GPT-5", "OpenAI"),
    ];
    const { dependencies, repo, refreshed } = createDependencies({
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
            callbackQuery: { data: `model:pick:${getModelCallbackKey(models[0])}` },
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

    assert.deepEqual(refreshed, [9]);
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
    const { dependencies, repo, refreshed } = createDependencies({
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
            callbackQuery: { data: `model:variant:${getModelCallbackKey(models[0])}:${getVariantCallbackKey("high")}` },
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

    assert.deepEqual(refreshed, [12]);
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
            format: {
                type: "text",
            },
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

test("model buttons preserve identity after the catalog order changes and reject legacy numbers", async () => {
    const original = createConfiguredModel("provider", "model-" + "x".repeat(100), "Original", "Provider");
    const other = createConfiguredModel("provider", "other", "Other", "Provider");
    const button = buildModelsKeyboard([original, other], 0).keyboard.inline_keyboard[0][0];
    assert.ok("callback_data" in button);
    assert.ok(Buffer.byteLength(button.callback_data) <= 64);
    const { dependencies, repo } = createDependencies({ async listModels() { return [other, original]; } });
    const context = {
        chat: { id: 1 }, callbackQuery: { data: button.callback_data! },
        async answerCallbackQuery() {}, async editMessageText() {},
    };
    await handleModelsCallback(context, dependencies);
    assert.equal((await repo.getByChatId(1))?.modelId, original.id);
    await handleModelsCallback({ ...context, callbackQuery: { data: "model:pick:1" } }, dependencies);
    assert.equal((await repo.getByChatId(1))?.modelId, original.id);
    const { dependencies: missing, repo: missingRepo } = createDependencies({ async listModels() { return [other]; } });
    await handleModelsCallback(context, missing);
    assert.equal(await missingRepo.getByChatId(1), null);
});

test("model catalogs group providers without mutating cached order or reordering models within a provider", async () => {
    const models = [
        createConfiguredModel("b", "1", "First B", "Provider B"),
        createConfiguredModel("a", "2", "First A", "Provider A"),
        createConfiguredModel("b", "3", "Second B", "Provider B"),
        createConfiguredModel("a", "4", "Second A", "Provider A"),
    ];
    const { dependencies } = createDependencies({ async listModels() { return models; } });
    const result = await dependencies.listModelsUseCase.execute({ chatId: 1 });
    assert.deepEqual(result.models.map((model) => model.id), ["2", "4", "1", "3"]);
    assert.deepEqual(models.map((model) => model.id), ["1", "2", "3", "4"]);
});

test("model menus localize hierarchy, escape names, and mark only the selected provider and model", () => {
    const models = [
        createConfiguredModel("a", "same-id", "Model <One>", "Provider & A"),
        createConfiguredModel("a", "two", "Model Two", "Provider & A"),
        createConfiguredModel("b", "same-id", "Model <One>", "Provider B"),
    ];
    for (const language of ["en", "zh-CN", "ja"] as const) {
        const copy = getBotCopy(language);
        const reply = presentModelsMessage({ models, page: 0, currentModelId: "same-id", currentModelProviderId: "a", currentModelVariant: "max" }, copy);
        assert.equal(reply.preferred.options?.parse_mode, "HTML");
        assert.ok(reply.preferred.text.startsWith(`<h2>${copy.models.title}</h2><p>`));
        assert.ok(reply.preferred.text.includes(copy.models.current("<b>Model &lt;One&gt;(max)</b>")));
        assert.ok(reply.preferred.text.includes(`<h3>Provider &amp; A</h3><ol start="1"><li><b>Model &lt;One&gt; ✓</b></li><li>Model Two</li>`));
        assert.ok(reply.preferred.text.includes(`<h3>Provider B</h3><ol start="3"><li>Model &lt;One&gt;</li>`));
        assert.equal(reply.preferred.text.match(/Provider &amp; A/gu)?.length, 1);
        assert.equal(reply.preferred.text.match(/✓/gu)?.length, 1);
        assert.ok(reply.fallback.text.includes("1. Model <One> ✓"));
        assert.ok(!reply.fallback.text.includes("<b>"));
        assert.ok(!reply.fallback.text.includes(copy.common.page(1, 1)));
        assert.ok(reply.fallback.text.endsWith(copy.models.choose));
        const defaultReply = presentModelsMessage({ models, page: 0, currentModelId: "same-id", currentModelProviderId: "a", currentModelVariant: null }, copy);
        assert.ok(defaultReply.fallback.text.includes(`Model <One>(${copy.models.defaultReasoningLevel})`));
    }
});

test("model keyboards use three columns and mark the current button without changing its callback", () => {
    const models = Array.from({ length: 9 }, (_, index) => createConfiguredModel("p", `${index}`, `Model ${index}`, "Provider"));
    const keyboard = buildModelsKeyboard(models, 0, getBotCopy("en"), models[3]).keyboard.inline_keyboard;
    assert.deepEqual(keyboard.map((row) => row.map((button) => button.text)), [
        ["1", "2", "3"], ["✓ 4", "5", "6"], ["7", "8", "9"],
    ]);
    assert.deepEqual(keyboard[1][0], { text: "✓ 4", callback_data: `model:pick:${getModelCallbackKey(models[3])}` });
});

test("initial and paginated model menus fall back to plain text while retaining their keyboard", async () => {
    const models = Array.from({ length: 12 }, (_, index) => createConfiguredModel("p", `${index}`, `Model <${index}>`, "Provider & P"));
    for (const action of ["command", "page"] as const) {
        const { dependencies } = createDependencies({ async listModels() { return models; } });
        const attempts: Array<{ text: string; other?: { parse_mode?: string; reply_markup?: unknown } }> = [];
        const write = async (text: string, other?: { parse_mode?: string; reply_markup?: unknown }) => {
            attempts.push({ text, other });
            if (attempts.length === 1) {
                throw new GrammyError("format rejected", { ok: false, error_code: 400, description: "can't parse entities" }, action === "command" ? "sendMessage" : "editMessageText", {});
            }
        };
        if (action === "command") {
            await handleModelsCommand({ chat: { id: 1 }, reply: write }, dependencies);
        } else {
            await handleModelsCallback({ chat: { id: 1 }, callbackQuery: { data: "model:page:1" }, async answerCallbackQuery() {}, editMessageText: write }, dependencies);
        }
        assert.equal(attempts.length, 2);
        assert.equal(attempts[0].other?.parse_mode, "HTML");
        assert.equal(attempts[1].other?.parse_mode, undefined);
        assert.deepEqual(attempts[0].other?.reply_markup, attempts[1].other?.reply_markup);
        assert.ok(attempts[1].text.includes("Provider & P"));
        assert.ok(attempts[1].text.includes(action === "command" ? "1. Model <0>" : "11. Model <10>"));
        assert.ok(!attempts[1].text.includes("<b>"));
    }
});
