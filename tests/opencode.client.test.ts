import assert from "node:assert/strict";
import test from "node:test";
import {
    buildOpenCodeSdkConfig,
    OpenCodeClient,
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

test("buildOpenCodeSdkConfig forwards trimmed auth tokens when an API key is configured", () => {
    assert.deepEqual(
        buildOpenCodeSdkConfig({
            baseUrl: "http://127.0.0.1:4096",
            apiKey: "  secret-token  ",
        }),
        {
            baseUrl: "http://127.0.0.1:4096",
            auth: "secret-token",
        },
    );
});

test("buildOpenCodeSdkConfig omits auth when the API key is blank", () => {
    assert.deepEqual(
        buildOpenCodeSdkConfig({
            baseUrl: "http://127.0.0.1:4096",
            apiKey: "   ",
        }),
        {
            baseUrl: "http://127.0.0.1:4096",
        },
    );
});

test("getHealth falls back to the raw /global/health endpoint for legacy injected SDK clients", async () => {
    const calls: Array<{ options: unknown }> = [];
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            _client: {
                async get(options: unknown) {
                    calls.push({ options });
                    return {
                        data: {
                            healthy: true,
                            version: "2.0.0",
                        },
                    };
                },
            },
            config: {
                get: async () => ({ provider: {} }),
                providers: async () => ({ providers: [], default: {} }),
            },
            global: {} as never,
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
                    info: {} as never,
                    parts: [],
                }),
            },
        } as never,
    );

    assert.deepEqual(await client.getHealth(), {
        healthy: true,
        version: "2.0.0",
    });
    assert.deepEqual(calls, [{
        options: {
            responseStyle: "data",
            throwOnError: true,
            url: "/global/health",
        },
    }]);
});

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

test("renameSession forwards the session id and new title to the SDK update endpoint", async () => {
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
                async update(input: unknown, options: unknown) {
                    calls.push({ input, options });
                    return {
                        data: createSession("session-1", "project-1", "E:/repo-1"),
                    };
                },
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

    const session = await client.renameSession("session-1", "Renamed session");

    assert.equal(session.id, "session-1");
    assert.deepEqual(calls, [
        {
            input: {
                sessionID: "session-1",
                title: "Renamed session",
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

test("listLspStatuses forwards the current directory to the SDK LSP endpoint", async () => {
    const calls: Array<{ input: unknown; options: unknown }> = [];
    const statuses = [
        {
            id: "ts",
            name: "TypeScript",
            root: "E:/repo-1",
            status: "connected",
        },
    ];
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            config: {
                get: async () => ({ provider: {} }),
                providers: async () => ({ providers: [], default: {} }),
            },
            lsp: {
                async status(input: unknown, options: unknown) {
                    calls.push({ input, options });
                    return { data: statuses };
                },
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

    assert.deepEqual(await client.listLspStatuses("E:/repo-1"), statuses as never);
    assert.deepEqual(calls, [
        {
            input: {
                directory: "E:/repo-1",
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
});

test("listSessions forwards to the SDK session list endpoint", async () => {
    const calls: Array<{ input: unknown; options: unknown }> = [];
    const sessions = [
        createSession("session-1", "project-1", "E:/repo-1"),
        createSession("session-2", "project-2", "E:/repo-2"),
    ];
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
                async list(input: unknown, options: unknown) {
                    calls.push({ input, options });
                    return { data: sessions };
                },
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

    assert.deepEqual(await client.listSessions(), sessions);
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

test("getSessionStatuses forwards to the SDK session status endpoint", async () => {
    const calls: Array<{ input: unknown; options: unknown }> = [];
    const statuses = {
        "session-1": { type: "busy" },
        "session-2": { type: "idle" },
    };
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
                async status(input: unknown, options: unknown) {
                    calls.push({ input, options });
                    return { data: statuses };
                },
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

    assert.deepEqual(await client.getSessionStatuses(), statuses);
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

test("listMcpStatuses forwards the current directory to the SDK MCP endpoint", async () => {
    const calls: Array<{ input: unknown; options: unknown }> = [];
    const statuses = {
        filesystem: { status: "connected" },
    };
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            config: {
                get: async () => ({ provider: {} }),
                providers: async () => ({ providers: [], default: {} }),
            },
            mcp: {
                async status(input: unknown, options: unknown) {
                    calls.push({ input, options });
                    return { data: statuses };
                },
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

    assert.deepEqual(await client.listMcpStatuses("E:/repo-1"), statuses as never);
    assert.deepEqual(calls, [
        {
            input: {
                directory: "E:/repo-1",
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
});

test("abortSession forwards the session id to the SDK abort endpoint", async () => {
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
                async abort(input: unknown, options: unknown) {
                    calls.push({ input, options });
                    return { data: true };
                },
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

    assert.equal(await client.abortSession("session-1"), true);
    assert.deepEqual(calls, [
        {
            input: {
                sessionID: "session-1",
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
});

test("promptSession forwards model selection and JSON schema format and returns normalized structured output", async () => {
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
                            info: {
                                time: {
                                    created: 100,
                                    completed: 820,
                                },
                                tokens: {
                                    total: 321,
                                    input: 100,
                                    output: 200,
                                    reasoning: 20,
                                    cache: {
                                        read: 0,
                                        write: 1,
                                    },
                                },
                                structured: {
                                    body_md: "## Hello\n- world",
                                },
                            } as never,
                            parts: [{ type: "text", text: "fallback text" }] as never,
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
        agent: "build",
        structured: true,
    });

    assert.deepEqual(result, {
        assistantError: null,
        bodyMd: "## Hello\n- world",
        fallbackText: "fallback text",
        info: {
            time: {
                created: 100,
                completed: 820,
            },
            tokens: {
                total: 321,
                input: 100,
                output: 200,
                reasoning: 20,
                cache: {
                    read: 0,
                    write: 1,
                },
            },
            structured: {
                body_md: "## Hello\n- world",
            },
        },
        metrics: {
            durationMs: 720,
            tokens: {
                total: 321,
                input: 100,
                output: 200,
                reasoning: 20,
                cacheRead: 0,
                cacheWrite: 1,
            },
        },
        parts: [{ type: "text", text: "fallback text" }],
        structured: {
            body_md: "## Hello\n- world",
        },
    });
    assert.deepEqual(calls, [
        {
            input: {
                sessionID: "session-1",
                agent: "build",
                format: {
                    type: "json_schema",
                    retryCount: 2,
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        required: ["body_md"],
                        properties: {
                            body_md: {
                                type: "string",
                                description: "Markdown body only. Do not include duration, token usage, or any footer. Do not wrap the whole answer in ```md or ```markdown fences. Use Markdown formatting directly unless the user explicitly asks for raw Markdown source.",
                            },
                        },
                    },
                },
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

test("promptSession includes file parts when image attachments are provided", async () => {
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
                            parts: [{ type: "text", text: "fallback text" }] as never,
                        },
                    };
                },
            },
        } as never,
    );

    await client.promptSession({
        sessionId: "session-1",
        prompt: "analyze this image",
        files: [{
            filename: "telegram.jpg",
            mime: "image/jpeg",
            url: "data:image/jpeg;base64,/9j/",
        }],
        structured: true,
    });

    assert.deepEqual(calls, [
        {
            input: {
                sessionID: "session-1",
                format: {
                    type: "json_schema",
                    retryCount: 2,
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        required: ["body_md"],
                        properties: {
                            body_md: {
                                type: "string",
                                description: "Markdown body only. Do not include duration, token usage, or any footer. Do not wrap the whole answer in ```md or ```markdown fences. Use Markdown formatting directly unless the user explicitly asks for raw Markdown source.",
                            },
                        },
                    },
                },
                parts: [
                    {
                        type: "text",
                        text: "analyze this image",
                    },
                    {
                        type: "file",
                        filename: "telegram.jpg",
                        mime: "image/jpeg",
                        url: "data:image/jpeg;base64,/9j/",
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

test("promptSession falls back to text parts and summed tokens when structured output is invalid", async () => {
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
                prompt: async () => ({
                    data: {
                        info: {
                            time: {
                                created: 100,
                            },
                            tokens: {
                                input: 10,
                                output: 8,
                                reasoning: 1,
                                cache: {
                                    read: 0,
                                    write: 2,
                                },
                            },
                            structured: {
                                unexpected: true,
                            },
                        } as never,
                        parts: [{ type: "text", text: "plain fallback" }] as never,
                    },
                }),
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, null);
    assert.equal(result.assistantError, null);
    assert.equal(result.fallbackText, "plain fallback");
    assert.equal(result.metrics.tokens.total, 20);
    assert.equal(result.metrics.tokens.reasoning, 1);
    assert.ok(result.metrics.durationMs !== null);
    assert.ok(result.metrics.durationMs >= 0);
    assert.deepEqual(result.structured, {
        unexpected: true,
    });
});

test("promptSession tolerates SDK responses that omit the parts array", async () => {
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
                prompt: async () => ({
                    data: {
                        info: {
                            structured: {
                                body_md: "## Hello",
                            },
                        } as never,
                    } as never,
                }),
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Hello");
    assert.equal(result.fallbackText, "## Hello");
    assert.deepEqual(result.parts, []);
});

test("promptSession preserves assistant errors from successful prompt responses", async () => {
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
                prompt: async () => ({
                    data: {
                        info: {
                            error: {
                                name: "StructuredOutputError",
                                data: {
                                    message: "Schema validation failed",
                                    retries: 2,
                                },
                            },
                            time: {
                                created: 100,
                                completed: 400,
                            },
                            tokens: {
                                total: 11,
                                input: 3,
                                output: 5,
                                reasoning: 1,
                                cache: {
                                    read: 2,
                                    write: 0,
                                },
                            },
                        } as never,
                        parts: [] as never,
                    },
                }),
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.deepEqual(result.assistantError, {
        name: "StructuredOutputError",
        data: {
            message: "Schema validation failed",
            retries: 2,
        },
    });
    assert.equal(result.fallbackText, "OpenCode returned empty response.");
    assert.equal(result.metrics.tokens.total, 11);
});
test("listModels returns configured models, connected-provider models, and available custom-provider models", async () => {
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
    const customProviderModel = createModel("custom-provider", "custom-text", "Custom Text Model", {
        variants: {
            low: {},
        },
    });
    const nonTextCustomModel = createModel("custom-provider", "custom-image", "Custom Image Model", {
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
    const customProvider = {
        ...createProvider("custom-provider", "Custom Provider", [
            customProviderModel,
            nonTextCustomModel,
        ]),
        source: "custom",
    } as OpenCodeProvider;
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
                                options: {
                                    baseURL: "https://aixj.vip/v1",
                                },
                            },
                        },
                    },
                }),
                providers: async () => ({
                    data: {
                        providers: [provider, customProvider],
                        default: {},
                    },
                }),
            },
            provider: {
                list: async () => ({
                    data: {
                        all: [provider, customProvider],
                        connected: ["openai", "custom-provider"],
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
            providerName: "OpenAI (aixj.vip)",
            name: "GPT-5.3 Codex",
            qualifiedId: "openai/gpt-5.3-codex",
            reasoning: true,
            variants: {
                low: {},
                high: {},
            },
        },
        {
            id: "gpt-4o",
            providerID: "openai",
            providerName: "OpenAI",
            name: "GPT-4o",
            qualifiedId: "openai/gpt-4o",
            reasoning: true,
            variants: {},
        },
        {
            id: "custom-text",
            providerID: "custom-provider",
            providerName: "Custom Provider",
            name: "Custom Text Model",
            qualifiedId: "custom-provider/custom-text",
            reasoning: true,
            variants: {
                low: {},
            },
        },
    ]);
});

test("listModels filters configured providers against the upstream /models endpoint when baseURL is configured", async () => {
    const configuredModel = createModel("openai", "gpt-5.3-codex", "GPT-5.3 Codex");
    const unavailableConfiguredModel = createModel("openai", "gpt-5-codex", "GPT-5 Codex");
    const availableCatalogModel = createModel("openai", "gpt-5.2", "GPT-5.2");
    const unavailableCatalogModel = createModel("openai", "gpt-5.2-pro", "GPT-5.2 Pro");
    const provider = createProvider("openai", "OpenAI", [
        configuredModel,
        unavailableConfiguredModel,
        availableCatalogModel,
        unavailableCatalogModel,
    ]);
    const fetchCalls: Array<{ input: unknown; init: unknown }> = [];
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
                                    },
                                    "gpt-5-codex": {
                                        name: "GPT-5 Codex",
                                    },
                                },
                                options: {
                                    apiKey: "test-key",
                                    baseURL: "https://gateway.example/v1",
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
                get: async () => ({ data: createPath() }),
            },
            project: {
                list: async () => ({ data: [] }),
                current: async () => ({ data: createProject("project-1", "E:/repo-1") }),
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
        async (input, init) => {
            fetchCalls.push({ input, init });

            return new Response(JSON.stringify({
                data: [
                    { id: "gpt-5.3-codex" },
                    { id: "gpt-5.2" },
                ],
            }), {
                status: 200,
                headers: {
                    "content-type": "application/json",
                },
            });
        },
    );

    assert.deepEqual(await client.listModels(), [
        {
            id: "gpt-5.3-codex",
            providerID: "openai",
            providerName: "OpenAI (gateway.example)",
            name: "GPT-5.3 Codex",
            qualifiedId: "openai/gpt-5.3-codex",
            reasoning: true,
            variants: {},
        },
        {
            id: "gpt-5.2",
            providerID: "openai",
            providerName: "OpenAI",
            name: "GPT-5.2",
            qualifiedId: "openai/gpt-5.2",
            reasoning: true,
            variants: {},
        },
    ]);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].input, "https://gateway.example/v1/models");
});

test("listModels caches results for 60 seconds and refreshes after expiry", async () => {
    const provider = createProvider("openai", "OpenAI", [
        createModel("openai", "gpt-5", "GPT-5"),
    ]);
    let configCalls = 0;
    let providerCalls = 0;
    let fetchCalls = 0;
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            config: {
                get: async () => {
                    configCalls += 1;
                    return {
                        data: {
                            provider: {
                                openai: {
                                    models: {
                                        "gpt-5": {
                                            name: "GPT-5",
                                        },
                                    },
                                    options: {
                                        apiKey: "test-key",
                                        baseURL: "https://gateway.example/v1",
                                    },
                                },
                            },
                        },
                    };
                },
                providers: async () => {
                    providerCalls += 1;
                    return {
                        data: {
                            providers: [provider],
                            default: {},
                        },
                    };
                },
            },
            path: {
                get: async () => ({ data: createPath() }),
            },
            permission: {
                list: async () => ({ data: [] }),
                reply: async () => ({ data: true }),
            },
            project: {
                list: async () => ({ data: [] }),
                current: async () => ({ data: createProject("project-1", "E:/repo-1") }),
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
        async () => {
            fetchCalls += 1;

            return new Response(JSON.stringify({
                data: [{ id: "gpt-5" }],
            }), {
                status: 200,
                headers: {
                    "content-type": "application/json",
                },
            });
        },
    );

    await client.listModels();
    await client.listModels();
    (client as unknown as { modelCache: { expiresAt: number } }).modelCache.expiresAt = Date.now() - 1;
    await client.listModels();

    assert.equal(configCalls, 2);
    assert.equal(providerCalls, 2);
    assert.equal(fetchCalls, 2);
});

test("permission helpers forward list and reply calls to the SDK", async () => {
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
            permission: {
                list: async (input: unknown, options: unknown) => {
                    assert.deepEqual(input, { directory: "E:/repo" });
                    assert.deepEqual(options, {
                        responseStyle: "data",
                        throwOnError: true,
                    });

                    return {
                        data: [{
                            id: "request-1",
                            sessionID: "session-1",
                            permission: "read",
                            patterns: ["src/**"],
                            metadata: {},
                            always: [],
                        }],
                    };
                },
                reply: async (input: unknown, options: unknown) => {
                    assert.deepEqual(input, {
                        requestID: "request-1",
                        reply: "once",
                        message: "approved",
                    });
                    assert.deepEqual(options, {
                        responseStyle: "data",
                        throwOnError: true,
                    });

                    return {
                        data: true,
                    };
                },
            },
            project: {
                list: async () => [],
                current: async () => createProject("project-1", "E:/repo-1"),
            },
            session: {
                create: async () => createSession("session-1", "project-1", "E:/repo-1"),
                prompt: async () => ({
                    info: {} as never,
                    parts: [],
                }),
            },
        } as never,
    );

    assert.deepEqual(await client.listPendingPermissions("E:/repo"), [{
        id: "request-1",
        sessionID: "session-1",
        permission: "read",
        patterns: ["src/**"],
        metadata: {},
        always: [],
    }]);
    assert.equal(await client.replyToPermission("request-1", "once", "approved"), true);
});
