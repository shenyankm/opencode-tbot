import assert from "node:assert/strict";
import test from "node:test";
import {
    OpenCodeClient,
    type OpenCodeConfig,
    type OpenCodeModel,
    type OpenCodePath,
    type OpenCodeProject,
    type OpenCodeProvider,
    type OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";

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

function createModel(
    providerID: string,
    id: string,
    name: string,
    overrides: Partial<OpenCodeModel> = {},
): OpenCodeModel {
    return {
        id,
        providerID,
        api: {
            id: `${providerID}-api`,
            url: "https://example.com",
            npm: "@example/sdk",
        },
        name,
        capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
                text: true,
                audio: false,
                image: false,
                video: false,
                pdf: false,
            },
            output: {
                text: true,
                audio: false,
                image: false,
                video: false,
                pdf: false,
            },
            interleaved: false,
        },
        cost: {
            input: 0,
            output: 0,
            cache: {
                read: 0,
                write: 0,
            },
        },
        limit: {
            context: 200000,
            output: 8000,
        },
        status: "active",
        options: {},
        headers: {},
        release_date: "2026-01-01",
        variants: {},
        ...overrides,
    } as OpenCodeModel;
}

function createProvider(id: string, name: string, models: OpenCodeModel[]): OpenCodeProvider {
    return {
        id,
        name,
        source: "config",
        env: [],
        options: {},
        models: Object.fromEntries(models.map((model) => [model.id, model])),
    } as OpenCodeProvider;
}

function createPath(overrides: Partial<OpenCodePath> = {}): OpenCodePath {
    return {
        home: "E:/Users/demo",
        state: "E:/Users/demo/.opencode",
        config: "E:/repo/opencode.json",
        worktree: "E:/repo",
        directory: "E:/repo/src",
        ...overrides,
    };
}

function createConfig(overrides: Partial<OpenCodeConfig> = {}): OpenCodeConfig {
    return {
        "$schema": "https://opencode.ai/config.json",
        ...overrides,
    } as OpenCodeConfig;
}

test("createSessionForDirectory forwards directory and title to the SDK", async () => {
    const calls: Array<{ input: unknown; options: unknown }> = [];
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            config: {
                get: async () => ({ provider: {} }),
                providers: async () => ({ providers: [], default: {} }),
            },
            path: {
                get: async () => createPath(),
            },
            project: {
                list: async () => [],
                current: async () => createProject("project-1", "E:/repo-1"),
            },
            session: {
                create: async (input: unknown, options: unknown) => {
                    calls.push({ input, options });
                    return createSession("session-1", "project-1", "E:/repo-1");
                },
                prompt: async () => ({
                    info: {} as never,
                    parts: [],
                }),
            },
        } as never,
    );

    const session = await client.createSessionForDirectory("E:/repo-1", "My session");

    assert.equal(session.id, "session-1");
    assert.deepEqual(calls, [
        {
            input: {
                directory: "E:/repo-1",
                title: "My session",
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
});

test("getPath forwards to the SDK path endpoint", async () => {
    const calls: Array<{ input: unknown; options: unknown }> = [];
    const pathInfo = createPath();
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            config: {
                get: async () => ({ provider: {} }),
                providers: async () => ({ providers: [], default: {} }),
            },
            path: {
                async get(input: unknown, options: unknown) {
                    calls.push({ input, options });
                    return { data: pathInfo };
                },
            },
            project: {
                list: async () => [],
                current: async () => createProject("project-1", "E:/repo-1"),
            },
            session: {
                create: async () => createSession("session-1", "project-1", "E:/repo-1"),
                prompt: async () => ({
                    data: {
                        info: {} as never,
                        parts: [],
                    },
                }),
            },
        } as never,
    );

    assert.deepEqual(await client.getPath(), pathInfo);
    assert.deepEqual(calls, [
        {
            input: undefined,
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
});

test("getConfig forwards to the SDK config endpoint", async () => {
    const calls: Array<{ input: unknown; options: unknown }> = [];
    const config = createConfig({
        model: "openai/gpt-5",
    });
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            config: {
                async get(input: unknown, options: unknown) {
                    calls.push({ input, options });
                    return { data: config };
                },
                providers: async () => ({ providers: [], default: {} }),
            },
            path: {
                get: async () => createPath(),
            },
            project: {
                list: async () => [],
                current: async () => createProject("project-1", "E:/repo-1"),
            },
            session: {
                create: async () => createSession("session-1", "project-1", "E:/repo-1"),
                prompt: async () => ({
                    data: {
                        info: {} as never,
                        parts: [],
                    },
                }),
            },
        } as never,
    );

    assert.deepEqual(await client.getConfig(), config);
    assert.deepEqual(calls, [
        {
            input: undefined,
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
});

test("promptSession forwards model selection and returns a fallback message when no text parts are returned", async () => {
    const calls: Array<{ input: unknown; options: unknown }> = [];
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            config: {
                get: async () => ({ provider: {} }),
                providers: async () => ({ providers: [], default: {} }),
            },
            path: {
                get: async () => createPath(),
            },
            project: {
                list: async () => [],
                current: async () => createProject("project-1", "E:/repo-1"),
            },
            session: {
                create: async () => createSession("session-1", "project-1", "E:/repo-1"),
                prompt: async (input: unknown, options: unknown) => {
                    calls.push({ input, options });

                    return {
                        data: {
                            info: {} as never,
                            parts: [{ type: "tool" }] as never,
                        },
                    };
                },
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        model: {
            providerID: "openai",
            modelID: "gpt-5",
        },
        variant: "high",
    });

    assert.equal(result.text, "OpenCode returned empty response.");
    assert.deepEqual(calls, [
        {
            input: {
                sessionID: "session-1",
                model: {
                    providerID: "openai",
                    modelID: "gpt-5",
                },
                variant: "high",
                parts: [
                    {
                        type: "text",
                        text: "hello from telegram",
                    },
                ],
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
});

test("listModels only returns models explicitly configured in OpenCode config", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const configuredModel = createModel("openai", "gpt-5.3-codex", "GPT-5.3 Codex", {
        variants: {
            high: {},
            low: {},
            xhigh: {},
        },
    });
    const hiddenCatalogModel = createModel("openai", "gpt-4o", "GPT-4o");
    const nonTextConfiguredModel = createModel("openai", "image-only", "Image Model", {
        capabilities: {
            ...configuredModel.capabilities,
            output: {
                ...configuredModel.capabilities.output,
                text: false,
            },
        },
    });
    const provider = createProvider("openai", "OpenAI", [
        configuredModel,
        hiddenCatalogModel,
        nonTextConfiguredModel,
    ]);
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            config: {
                get: async () => ({
                    data: {
                        provider: {
                            openai: {
                                models: {
                                    "gpt-5.3-codex": {
                                        name: "GPT-5.3 Codex",
                                        variants: {
                                            low: {},
                                            high: {},
                                            xhigh: {
                                                disabled: true,
                                            },
                                        },
                                    },
                                    "image-only": {
                                        name: "Image Model",
                                    },
                                },
                            },
                        },
                    },
                }),
                providers: async () => ({
                    data: {
                        providers: [provider],
                        default: {},
                    },
                }),
            },
            path: {
                get: async () => ({ data: createPath({ worktree: project.worktree, directory: project.worktree }) }),
            },
            project: {
                list: async () => ({ data: [project] }),
                current: async () => ({ data: project }),
            },
            session: {
                create: async () => ({ data: createSession("session-1", "project-1", "E:/repo-1") }),
                prompt: async () => ({
                    data: {
                        info: {} as never,
                        parts: [],
                    },
                }),
            },
        } as never,
    );

    assert.deepEqual(await client.listProjects(), [project]);
    assert.deepEqual(await client.getCurrentProject(), project);
    assert.deepEqual(await client.listModels(), [
        {
            id: "gpt-5.3-codex",
            providerID: "openai",
            providerName: "OpenAI",
            name: "GPT-5.3 Codex",
            qualifiedId: "openai/gpt-5.3-codex",
            reasoning: true,
            variants: {
                low: {},
                high: {},
            },
        },
    ]);
});
