import assert from "node:assert/strict";
import test from "node:test";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeAgent,
    OpenCodeClientLike,
    PromptSessionFilePartInput,
    OpenCodeProject,
    OpenCodePromptTimeoutErrorData,
    PromptSessionResult,
    OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";
import { OpenCodePromptTimeoutError } from "../src/services/opencode/opencode.client.js";
import { SendPromptUseCase } from "../src/use-cases/send-prompt.usecase.js";

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
        projectID,
        directory,
        title: "Session",
        time: {
            created: 1,
            updated: 1,
        },
    } as OpenCodeSession;
}

function createAgent(name: string): OpenCodeAgent {
    return {
        name,
        mode: "primary",
        prompt: "",
        tools: [],
        model: undefined,
    } as unknown as OpenCodeAgent;
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
    };
}

function createClient(client: Partial<OpenCodeClientLike>): OpenCodeClientLike {
    return client as OpenCodeClientLike;
}

function withImageTurnGuidance(text?: string): string {
    const sections = [
        "System note for this turn: The user attached one or more images in this message and you can inspect those images directly. Ignore any earlier statements in this conversation claiming that you could not view images or attachments, because those may have come from a previous model or an earlier limitation. If an image is blurry or unreadable, say that it is blurry or unreadable instead of saying that you cannot view images.",
    ];

    const trimmedText = text?.trim();

    if (trimmedText) {
        sections.push(trimmedText);
    }

    return sections.join("\n\n");
}

function createImageFile(): PromptSessionFilePartInput {
    return {
        filename: "telegram.jpg",
        mime: "image/jpeg",
        url: "data:image/jpeg;base64,/9j/",
    };
}

test("SendPromptUseCase forwards the agent ID it already resolved", async () => {
    const repo = new InMemorySessionRepository();
    let agentReads = 0;
    let submitted: { agent?: string | null; agentId?: string | null } | undefined;
    const client = createClient({
        async getCurrentProject() { return createProject("p", "/repo"); },
        async createSessionForDirectory() { return createSession("s", "p", "/repo"); },
        async listAgents() { agentReads += 1; return [{ ...createAgent("build"), id: "agent_build" }]; },
        async promptSession(input) { submitted = input; return createPromptReply("answer"); },
    });
    await new SendPromptUseCase(repo, client, logger).execute({ chatId: 1, text: "hello" });
    assert.equal(agentReads, 1);
    assert.equal(submitted?.agent, "build");
    assert.equal(submitted?.agentId, "agent_build");
});

test("SendPromptUseCase creates a session in the current project when the chat is unbound", async () => {
    const repo = new InMemorySessionRepository();
    const calls: Array<{
        type: string;
        agent?: string;
        directory?: string;
        format?: {
            type: "text";
        };
        prompt?: string;
        sessionId?: string;
    }> = [];
    const currentProject = createProject("project-1", "E:/repo-1");
    const client = createClient({
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            calls.push({ type: "create", directory });
            return createSession("session-1", currentProject.id, directory);
        },
        async getCurrentProject() {
            return currentProject;
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [
                {
                    id: "gpt-5",
                    providerID: "openai",
                    providerName: "OpenAI",
                    name: "GPT-5",
                    qualifiedId: "openai/gpt-5",
                    reasoning: true,
                    variants: {
                        high: {},
                    },
                },
            ];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [currentProject];
        },
        async getSession() {
            return null;
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            calls.push({
                type: "prompt",
                sessionId: input.sessionId,
                prompt: input.prompt ?? undefined,
                agent: input.agent ?? undefined,
            });
            return createPromptReply("assistant reply");
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 1001,
        text: "hello",
    });

    const binding = await repo.getByChatId(1001);

    assert.deepEqual(result, {
        assistantReply: createPromptReply("assistant reply"),
        sessionId: "session-1",
        projectId: "project-1",
    });
    assert.deepEqual(binding, {
        chatId: 1001,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: binding?.updatedAt,
    });
    assert.deepEqual(calls, [
        { type: "create", directory: "E:/repo-1" },
        {
            type: "prompt",
            sessionId: "session-1",
            prompt: "hello",
            agent: "build",
        },
    ]);
});

test("SendPromptUseCase preserves a selected model when it needs to create a session later", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 42,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: "high",
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const currentProject = createProject("project-1", "E:/repo-1");
    const promptCalls: unknown[] = [];
    const client = createClient({
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", currentProject.id, directory);
        },
        async getCurrentProject() {
            return currentProject;
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [
                {
                    id: "gpt-5",
                    providerID: "openai",
                    providerName: "OpenAI",
                    name: "GPT-5",
                    qualifiedId: "openai/gpt-5",
                    reasoning: true,
                    variants: {
                        high: {},
                    },
                },
            ];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [currentProject];
        },
        async getSession() {
            return null;
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply from model");
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 42,
        text: "continue",
    });
    const binding = await repo.getByChatId(42);

    assert.deepEqual(result, {
        assistantReply: createPromptReply("reply from model"),
        sessionId: "session-1",
        projectId: "project-1",
    });
    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "continue",
            agent: "build",
            model: {
                providerID: "openai",
                modelID: "gpt-5",
            },
            variant: "high",
        },
    ]);
    assert.deepEqual(binding, {
        chatId: 42,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: "high",
        language: null,
        updatedAt: binding?.updatedAt,
    });
});

test("SendPromptUseCase clears a stale model selection before prompting", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 55,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: "openai",
        modelId: "gpt-5.2-pro",
        modelVariant: "xhigh",
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const promptCalls: unknown[] = [];
    const client = createClient({
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [
                {
                    id: "gpt-5.2",
                    providerID: "openai",
                    providerName: "OpenAI",
                    name: "GPT-5.2",
                    qualifiedId: "openai/gpt-5.2",
                    reasoning: true,
                    variants: {
                        high: {},
                    },
                },
            ];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return null;
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply from default model");
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 55,
        text: "hello",
    });
    const binding = await repo.getByChatId(55);

    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "hello",
            agent: "build",
        },
    ]);
    assert.equal(result.assistantReply.fallbackText, "reply from default model");
    assert.deepEqual(binding, {
        chatId: 55,
        sessionId: "session-1",
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

test("SendPromptUseCase recreates the session when the saved session context is stale", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 77,
        sessionId: "session-stale",
        projectId: "project-stale",
        directory: "E:/repo-stale",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const promptCalls: unknown[] = [];
    const client = createClient({
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-new", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return createSession("session-live", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply after recreating the session");
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 77,
        text: "continue",
    });
    const binding = await repo.getByChatId(77);

    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-new",
            prompt: "continue",
            agent: "build",
        },
    ]);
    assert.equal(result.sessionId, "session-new");
    assert.deepEqual(binding, {
        chatId: 77,
        sessionId: "session-new",
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

test("SendPromptUseCase clears stale selected agents before prompting", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 88,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: "review",
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const promptCalls: unknown[] = [];
    const client = createClient({
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return createSession("session-1", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply from default agent");
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);
    await useCase.execute({
        chatId: 88,
        text: "continue",
    });
    const binding = await repo.getByChatId(88);

    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "continue",
            agent: "build",
        },
    ]);
    assert.equal(binding?.agentName, null);
});

test("SendPromptUseCase clears selected subagents before prompting", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 89,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: "general",
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    const promptCalls: unknown[] = [];
    const client = createClient({
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [
                createAgent("build"),
                {
                    ...createAgent("general"),
                    mode: "subagent" as const,
                },
            ];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return createSession("session-1", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply from default agent");
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);
    await useCase.execute({
        chatId: 89,
        text: "continue",
    });
    const binding = await repo.getByChatId(89);

    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1",
            prompt: "continue",
            agent: "build",
        },
    ]);
    assert.equal(binding?.agentName, null);
});

test("SendPromptUseCase forks a temporary child session for image prompts and keeps the main binding", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 99,
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

    const calls: Array<{ kind: "delete" | "fork" | "prompt"; value: unknown }> = [];
    const client = createClient({
        async abortSession() {
            return true;
        },
        async deleteSession(sessionId) {
            calls.push({ kind: "delete", value: sessionId });
            return true;
        },
        async forkSession(sessionId) {
            calls.push({ kind: "fork", value: sessionId });
            return createSession("session-1-image", "project-1", "E:/repo-1");
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return createSession("session-1", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            calls.push({ kind: "prompt", value: input });
            return createPromptReply("reply with image");
        },
    });
    const files = [createImageFile()];

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 99,
        text: "analyze this image",
        files,
    });
    const binding = await repo.getByChatId(99);

    assert.equal(result.sessionId, "session-1");
    assert.deepEqual(binding?.sessionId, "session-1");
    assert.deepEqual(calls, [
        { kind: "fork", value: "session-1" },
        {
            kind: "prompt",
            value: {
                sessionId: "session-1-image",
                prompt: withImageTurnGuidance("analyze this image"),
                files,
                agent: "build",
            },
        },
        { kind: "delete", value: "session-1-image" },
    ]);
});

test("SendPromptUseCase creates and keeps a main session when the first prompt is an image", async () => {
    const repo = new InMemorySessionRepository();
    const currentProject = createProject("project-1", "E:/repo-1");
    const calls: Array<{ kind: "create" | "delete" | "fork" | "prompt"; value: unknown }> = [];
    const client = createClient({
        async abortSession() {
            return true;
        },
        async deleteSession(sessionId) {
            calls.push({ kind: "delete", value: sessionId });
            return true;
        },
        async forkSession(sessionId) {
            calls.push({ kind: "fork", value: sessionId });
            return createSession("session-1-image", "project-1", "E:/repo-1");
        },
        async createSessionForDirectory(directory) {
            calls.push({ kind: "create", value: directory });
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return currentProject;
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [currentProject];
        },
        async getSession() {
            return createSession("session-1", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            calls.push({ kind: "prompt", value: input });
            return createPromptReply("reply with image only");
        },
    });
    const files = [createImageFile()];

    const useCase = new SendPromptUseCase(repo, client, logger);
    const result = await useCase.execute({
        chatId: 109,
        files,
    });
    const binding = await repo.getByChatId(109);

    assert.equal(result.sessionId, "session-1");
    assert.deepEqual(binding, {
        chatId: 109,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: binding?.updatedAt,
    });
    assert.deepEqual(calls, [
        { kind: "create", value: "E:/repo-1" },
        { kind: "fork", value: "session-1" },
        {
            kind: "prompt",
            value: {
                sessionId: "session-1-image",
                prompt: withImageTurnGuidance(),
                files,
                agent: "build",
            },
        },
        { kind: "delete", value: "session-1-image" },
    ]);
});

test("SendPromptUseCase returns to the main session after an image turn", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 119,
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

    const promptCalls: unknown[] = [];
    const forkCalls: string[] = [];
    const deleteCalls: string[] = [];
    const client = createClient({
        async abortSession() {
            return true;
        },
        async deleteSession(sessionId) {
            deleteCalls.push(sessionId);
            return true;
        },
        async forkSession(sessionId) {
            forkCalls.push(sessionId);
            return createSession("session-1-image", "project-1", "E:/repo-1");
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return createSession("session-1", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession(input) {
            promptCalls.push(input);
            return createPromptReply("reply");
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);
    await useCase.execute({
        chatId: 119,
        text: "analyze this image",
        files: [createImageFile()],
    });
    await useCase.execute({
        chatId: 119,
        text: "who are you",
    });

    assert.deepEqual(forkCalls, ["session-1"]);
    assert.deepEqual(deleteCalls, ["session-1-image"]);
    assert.deepEqual(promptCalls, [
        {
            sessionId: "session-1-image",
            prompt: withImageTurnGuidance("analyze this image"),
            files: [createImageFile()],
            agent: "build",
        },
        {
            sessionId: "session-1",
            prompt: "who are you",
            agent: "build",
        },
    ]);
});

test("SendPromptUseCase deletes the temporary image session even when the prompt fails", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 129,
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

    const deleteCalls: string[] = [];
    const expectedError = new Error("child prompt failed");
    const client = createClient({
        async abortSession() {
            return true;
        },
        async deleteSession(sessionId) {
            deleteCalls.push(sessionId);
            return true;
        },
        async forkSession() {
            return createSession("session-1-image", "project-1", "E:/repo-1");
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return createSession("session-1", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession() {
            throw expectedError;
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);

    await assert.rejects(
        useCase.execute({
            chatId: 129,
            text: "analyze this image",
            files: [createImageFile()],
        }),
        (error: unknown) => error === expectedError,
    );
    assert.deepEqual(deleteCalls, ["session-1-image"]);
});

test("SendPromptUseCase logs a warning when temporary image session cleanup fails", async () => {
    const repo = new InMemorySessionRepository();
    await repo.setCurrent({
        chatId: 139,
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

    const warnings: Array<{ input: unknown; message?: string }> = [];
    const localLogger = {
        error() { },
        info() { },
        warn(input: unknown, message?: string) {
            warnings.push({ input, message });
        },
    } as unknown as AppLogger;
    const client = createClient({
        async abortSession() {
            return true;
        },
        async deleteSession() {
            return false;
        },
        async forkSession() {
            return createSession("session-1-image", "project-1", "E:/repo-1");
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return createSession("session-1", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession() {
            return createPromptReply("reply with image");
        },
    });

    const useCase = new SendPromptUseCase(repo, client, localLogger);
    const result = await useCase.execute({
        chatId: 139,
        text: "analyze this image",
        files: [createImageFile()],
    });

    assert.equal(result.assistantReply.fallbackText, "reply with image");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.message, "failed to delete temporary image session");
});

test("SendPromptUseCase forwards the execution session id when promptSession times out", async () => {
    const repo = new InMemorySessionRepository();
    const executionSessionIds: string[] = [];
    const timeoutError = new OpenCodePromptTimeoutError({
        elapsedMs: 5,
        sessionId: "session-1",
        stage: "send-prompt",
        timeoutMs: 5,
    } satisfies OpenCodePromptTimeoutErrorData);
    const client = createClient({
        async abortSession() {
            return true;
        },
        async createSessionForDirectory(directory) {
            return createSession("session-1", "project-1", directory);
        },
        async getCurrentProject() {
            return createProject("project-1", "E:/repo-1");
        },
        async getSessionStatuses() {
            return {};
        },
        async listModels() {
            return [];
        },
        async listAgents() {
            return [createAgent("build")];
        },
        async listProjects() {
            return [createProject("project-1", "E:/repo-1")];
        },
        async getSession() {
            return createSession("session-1", "project-1", "E:/repo-1");
        },
        async getPath() {
            throw new Error("unused");
        },
        async promptSession() {
            throw timeoutError;
        },
    });

    const useCase = new SendPromptUseCase(repo, client, logger);

    await repo.setCurrent({
        chatId: 500,
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

    await assert.rejects(
        useCase.execute({
            chatId: 500,
            onExecutionSession(sessionId: string) {
                executionSessionIds.push(sessionId);
            },
            text: "hello",
        }),
        (error: unknown) => error === timeoutError,
    );
    assert.deepEqual(executionSessionIds, ["session-1"]);
});
