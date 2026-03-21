import assert from "node:assert/strict";
import test from "node:test";
import {
    buildOpenCodeSdkConfig,
    OpenCodeClient,
    OpenCodePromptTimeoutError,
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

function setPromptRequestTimeouts(
    client: OpenCodeClient,
    overrides: Partial<{
        pollRequestMs: number;
        sendMs: number;
        totalPollMs: number;
    }>,
) {
    Object.assign(
        (client as unknown as {
            promptRequestTimeouts: {
                pollRequestMs: number;
                sendMs: number;
                totalPollMs: number;
            };
        }).promptRequestTimeouts,
        overrides,
    );
}

function omitSignal(options: unknown): Record<string, unknown> {
    const normalized = options as Record<string, unknown>;
    const { signal: _signal, ...rest } = normalized;

    return rest;
}

function assertOptionsIncludeSignal(options: unknown) {
    assert.ok((options as { signal?: unknown }).signal instanceof AbortSignal);
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
    assert.deepEqual(calls.map((call) => ({
        ...call,
        options: omitSignal(call.options),
    })), [
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
    assert.deepEqual(calls.map((call) => ({
        ...call,
        options: omitSignal(call.options),
    })), [
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

test("forkSession and deleteSession forward to the SDK session endpoints", async () => {
    const calls: Array<{ input: unknown; kind: "delete" | "fork"; options: unknown }> = [];
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
                async delete(input: unknown, options: unknown) {
                    calls.push({ kind: "delete", input, options });
                    return { data: true };
                },
                async fork(input: unknown, options: unknown) {
                    calls.push({ kind: "fork", input, options });
                    return { data: createSession("session-child", "project-1", "E:/repo-1") };
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

    assert.deepEqual(await client.forkSession("session-1", "message-9"), createSession("session-child", "project-1", "E:/repo-1"));
    assert.equal(await client.deleteSession("session-child"), true);
    assert.deepEqual(calls.map((call) => ({
        ...call,
        options: omitSignal(call.options),
    })), [
        {
            kind: "fork",
            input: {
                sessionID: "session-1",
                messageID: "message-9",
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
        {
            kind: "delete",
            input: {
                sessionID: "session-child",
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
});

test("session mutation helpers use the raw client when available", async () => {
    const calls: Array<{ kind: "delete" | "patch" | "post"; options: unknown }> = [];
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            _client: {
                delete: async (options: unknown) => {
                    calls.push({ kind: "delete", options });
                    return {
                        data: true,
                    };
                },
                post: async (options: unknown) => {
                    calls.push({ kind: "post", options });

                    const request = options as {
                        body?: unknown;
                        path?: Record<string, unknown>;
                        query?: Record<string, unknown>;
                        url: string;
                    };

                    if (request.url === "/session") {
                        return {
                            data: createSession("session-1", "project-1", "E:/repo-1"),
                        };
                    }

                    if (request.url === "/session/{sessionID}/abort") {
                        return {
                            data: true,
                        };
                    }

                    if (request.url === "/session/{sessionID}/fork") {
                        return {
                            data: createSession("session-child", "project-1", "E:/repo-1"),
                        };
                    }

                    throw new Error(`Unexpected raw POST ${request.url}`);
                },
                patch: async (options: unknown) => {
                    calls.push({ kind: "patch", options });
                    return {
                        data: createSession("session-1", "project-1", "E:/repo-1"),
                    };
                },
            },
        } as never,
    );

    assert.equal((await client.createSessionForDirectory("E:/repo-1", "Raw session")).id, "session-1");
    assert.equal((await client.renameSession("session-1", "Renamed session")).id, "session-1");
    assert.equal(await client.abortSession("session-1"), true);
    assert.equal((await client.forkSession("session-1", "message-1")).id, "session-child");
    assert.equal(await client.deleteSession("session-child"), true);
    assert.deepEqual(calls, [
        {
            kind: "post",
            options: {
                responseStyle: "data",
                throwOnError: true,
                url: "/session",
                query: {
                    directory: "E:/repo-1",
                },
                body: {
                    title: "Raw session",
                },
            },
        },
        {
            kind: "patch",
            options: {
                responseStyle: "data",
                throwOnError: true,
                url: "/session/{sessionID}",
                path: {
                    sessionID: "session-1",
                },
                body: {
                    title: "Renamed session",
                },
            },
        },
        {
            kind: "post",
            options: {
                responseStyle: "data",
                throwOnError: true,
                url: "/session/{sessionID}/abort",
                path: {
                    sessionID: "session-1",
                },
            },
        },
        {
            kind: "post",
            options: {
                responseStyle: "data",
                throwOnError: true,
                url: "/session/{sessionID}/fork",
                path: {
                    sessionID: "session-1",
                },
                body: {
                    messageID: "message-1",
                },
            },
        },
        {
            kind: "delete",
            options: {
                responseStyle: "data",
                throwOnError: true,
                url: "/session/{sessionID}",
                path: {
                    sessionID: "session-child",
                },
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
    assert.deepEqual(calls.map((call) => ({
        ...call,
        options: omitSignal(call.options),
    })), [
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
    assertOptionsIncludeSignal(calls[0]?.options);
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

    assert.deepEqual(calls.map((call) => ({
        ...call,
        options: omitSignal(call.options),
    })), [
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
    assertOptionsIncludeSignal(calls[0]?.options);
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

test("promptSession waits for a raw-client reply without message id and reads structured_output", async () => {
    const calls: Array<{ kind: "get" | "post"; options: unknown }> = [];
    let messageListCallCount = 0;
    let statusCallCount = 0;
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            _client: {
                get: async (options: unknown) => {
                    calls.push({ kind: "get", options });
                    const request = options as {
                        path?: Record<string, unknown>;
                        query?: Record<string, unknown>;
                        url: string;
                    };

                    if (request.url === "/session/{sessionID}/message") {
                        messageListCallCount += 1;

                        if (messageListCallCount < 3) {
                            return {
                                data: [],
                            };
                        }

                        return {
                            data: [{
                                info: {
                                    id: "assistant-final",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    parentID: "user-1",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    time: {
                                        created: 150,
                                        completed: 420,
                                    },
                                    tokens: {
                                        input: 2,
                                        output: 6,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                    structured_output: {
                                        body_md: "## Raw Hello",
                                    },
                                },
                                parts: [],
                            }],
                        };
                    }

                    if (request.url === "/session/status") {
                        statusCallCount += 1;

                        return {
                            data: {
                                "session-1": statusCallCount === 1
                                    ? { type: "busy" }
                                    : { type: "idle" },
                            },
                        };
                    }

                    throw new Error(`Unexpected raw GET ${request.url}`);
                },
                post: async (options: unknown) => {
                    calls.push({ kind: "post", options });

                    return {
                        data: {
                            info: {
                                role: "assistant",
                                sessionID: "session-1",
                                time: {
                                    created: 100,
                                },
                                tokens: {
                                    input: 0,
                                    output: 0,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                            },
                            parts: [],
                        },
                    };
                },
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Raw Hello");
    assert.equal(result.fallbackText, "## Raw Hello");
    assert.deepEqual(result.parts, []);
    assert.deepEqual(result.structured, {
        body_md: "## Raw Hello",
    });
    assert.equal(statusCallCount, 1);
    assert.deepEqual({
        ...calls[0],
        options: omitSignal(calls[0]?.options),
    }, {
        kind: "get",
        options: {
            responseStyle: "data",
            throwOnError: true,
            url: "/session/{sessionID}/message",
            path: {
                sessionID: "session-1",
            },
            query: {
                limit: 20,
            },
        },
    });
    assert.deepEqual({
        ...calls[1],
        options: omitSignal(calls[1]?.options),
    }, {
        kind: "post",
        options: {
            responseStyle: "data",
            throwOnError: true,
            url: "/session/{sessionID}/message",
            path: {
                sessionID: "session-1",
            },
            body: {
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
                        text: "hello from telegram",
                    },
                ],
            },
        },
    });
    assertOptionsIncludeSignal(calls[1]?.options);
});

test("promptSession prefers async prompt submission when the SDK exposes promptAsync", async () => {
    const calls: Array<{
        input?: unknown;
        kind: "messages" | "prompt" | "promptAsync" | "status";
        options: unknown;
    }> = [];
    let messageListCallCount = 0;
    let statusCallCount = 0;
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            session: {
                messages: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "messages", input, options });
                    messageListCallCount += 1;

                    if (messageListCallCount < 3) {
                        return {
                            data: [],
                        };
                    }

                    return {
                        data: [{
                            info: {
                                id: "assistant-final",
                                role: "assistant",
                                sessionID: "session-1",
                                time: {
                                    created: 120,
                                    completed: 420,
                                },
                                tokens: {
                                    input: 2,
                                    output: 6,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                                structured: {
                                    body_md: "## Async Reply",
                                },
                            } as never,
                            parts: [{ type: "text", text: "Async Reply" }] as never,
                        }],
                    };
                },
                prompt: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "prompt", input, options });

                    return await new Promise<never>(() => undefined);
                },
                promptAsync: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "promptAsync", input, options });
                    return undefined as never;
                },
                status: async (_input: unknown, options: unknown) => {
                    calls.push({ kind: "status", options });
                    statusCallCount += 1;

                    return {
                        data: {
                            "session-1": statusCallCount === 1
                                ? { type: "busy" }
                                : { type: "idle" },
                        },
                    };
                },
            },
            app: {
                log: async () => true,
            },
        } as never,
    );
    setPromptRequestTimeouts(client, {
        pollRequestMs: 5,
        sendMs: 20,
        totalPollMs: 50,
    });

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Async Reply");
    assert.equal(result.fallbackText, "Async Reply");
    assert.deepEqual(result.parts, [{ type: "text", text: "Async Reply" }]);
    assert.equal(statusCallCount, 1);
    assert.deepEqual(
        calls.map((call) => call.kind),
        ["messages", "promptAsync", "messages", "status", "messages"],
    );
    assert.deepEqual(calls[1]?.input, {
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
                text: "hello from telegram",
            },
        ],
    });
    assertOptionsIncludeSignal(calls[1]?.options);
});

test("promptSession keeps polling recent messages after the session turns idle and does not resend the prompt", async () => {
    const calls: Array<{ kind: "get" | "post"; options: unknown }> = [];
    let messageListCallCount = 0;
    let statusCallCount = 0;
    let postCallCount = 0;
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            _client: {
                get: async (options: unknown) => {
                    calls.push({ kind: "get", options });
                    const request = options as {
                        url: string;
                    };

                    if (request.url === "/session/{sessionID}/message") {
                        messageListCallCount += 1;

                        if (messageListCallCount < 3) {
                            return {
                                data: [],
                            };
                        }

                        return {
                            data: [{
                                info: {
                                    id: "assistant-final",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    time: {
                                        created: 150,
                                        completed: 420,
                                    },
                                    tokens: {
                                        input: 2,
                                        output: 6,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                    structured_output: {
                                        body_md: "## Final After Idle",
                                    },
                                },
                                parts: [],
                            }],
                        };
                    }

                    if (request.url === "/session/status") {
                        statusCallCount += 1;

                        return {
                            data: {
                                "session-1": { type: "idle" },
                            },
                        };
                    }

                    throw new Error(`Unexpected raw GET ${request.url}`);
                },
                post: async (options: unknown) => {
                    calls.push({ kind: "post", options });
                    postCallCount += 1;

                    return {
                        data: {
                            info: {
                                role: "assistant",
                                sessionID: "session-1",
                                time: {
                                    created: 100,
                                },
                                tokens: {
                                    input: 0,
                                    output: 0,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                            },
                            parts: [],
                        },
                    };
                },
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Final After Idle");
    assert.equal(result.fallbackText, "## Final After Idle");
    assert.equal(postCallCount, 1);
    assert.equal(statusCallCount, 1);
    assert.equal(messageListCallCount, 3);
    assert.deepEqual(
        calls.map((call) => call.kind),
        ["get", "post", "get", "get", "get"],
    );
});

test("promptSession polls the created message when the initial reply is still empty", async () => {
    const calls: Array<{ input: unknown; kind: "prompt" | "message"; options: unknown }> = [];
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
                    calls.push({ kind: "prompt", input, options });

                    return {
                        data: {
                            info: {
                                id: "assistant-1",
                                role: "assistant",
                                sessionID: "session-1",
                                parentID: "user-1",
                                modelID: "gpt-5",
                                providerID: "openai",
                                mode: "chat",
                                agent: "build",
                                path: {
                                    cwd: "E:/repo-1",
                                    root: "E:/repo-1",
                                },
                                cost: 0,
                                time: {
                                    created: 100,
                                },
                                tokens: {
                                    input: 0,
                                    output: 0,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                            } as never,
                            parts: [],
                        },
                    };
                },
                message: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "message", input, options });

                    return {
                        data: {
                            info: {
                                id: "assistant-1",
                                role: "assistant",
                                sessionID: "session-1",
                                parentID: "user-1",
                                modelID: "gpt-5",
                                providerID: "openai",
                                mode: "chat",
                                agent: "build",
                                path: {
                                    cwd: "E:/repo-1",
                                    root: "E:/repo-1",
                                },
                                cost: 0.01,
                                time: {
                                    created: 100,
                                    completed: 500,
                                },
                                tokens: {
                                    total: 8,
                                    input: 3,
                                    output: 5,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                                structured: {
                                    body_md: "## Hello",
                                },
                            } as never,
                            parts: [{ type: "text", text: "Hello" }] as never,
                        },
                    };
                },
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Hello");
    assert.equal(result.fallbackText, "Hello");
    assert.deepEqual(result.parts, [{ type: "text", text: "Hello" }]);
    assert.deepEqual(calls.map((call) => ({
        ...call,
        options: omitSignal(call.options),
    })), [
        {
            kind: "prompt",
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
                        text: "hello from telegram",
                    },
                ],
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
        {
            kind: "message",
            input: {
                sessionID: "session-1",
                messageID: "assistant-1",
            },
            options: {
                responseStyle: "data",
                throwOnError: true,
            },
        },
    ]);
    assertOptionsIncludeSignal(calls[0]?.options);
    assertOptionsIncludeSignal(calls[1]?.options);
});

test("promptSession keeps polling when the placeholder message is already marked completed but still empty", async () => {
    const calls: Array<{ input: unknown; kind: "prompt" | "message"; options: unknown }> = [];
    let messageCallCount = 0;
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
                    calls.push({ kind: "prompt", input, options });

                    return {
                        data: {
                            info: {
                                id: "assistant-1",
                                role: "assistant",
                                sessionID: "session-1",
                                parentID: "user-1",
                                modelID: "gpt-5",
                                providerID: "openai",
                                mode: "chat",
                                agent: "build",
                                path: {
                                    cwd: "E:/repo-1",
                                    root: "E:/repo-1",
                                },
                                cost: 0,
                                time: {
                                    created: 100,
                                    completed: 110,
                                },
                                tokens: {
                                    input: 0,
                                    output: 0,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                            } as never,
                            parts: [],
                        },
                    };
                },
                message: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "message", input, options });
                    messageCallCount += 1;

                    if (messageCallCount === 1) {
                        return {
                            data: {
                                info: {
                                    id: "assistant-1",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    parentID: "user-1",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    mode: "chat",
                                    agent: "build",
                                    path: {
                                        cwd: "E:/repo-1",
                                        root: "E:/repo-1",
                                    },
                                    cost: 0,
                                    time: {
                                        created: 100,
                                        completed: 110,
                                    },
                                    tokens: {
                                        input: 0,
                                        output: 0,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                } as never,
                                parts: [],
                            },
                        };
                    }

                    return {
                        data: {
                            info: {
                                id: "assistant-1",
                                role: "assistant",
                                sessionID: "session-1",
                                parentID: "user-1",
                                modelID: "gpt-5",
                                providerID: "openai",
                                mode: "chat",
                                agent: "build",
                                path: {
                                    cwd: "E:/repo-1",
                                    root: "E:/repo-1",
                                },
                                cost: 0.01,
                                time: {
                                    created: 100,
                                    completed: 220,
                                },
                                tokens: {
                                    total: 8,
                                    input: 3,
                                    output: 5,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                                structured: {
                                    body_md: "## Hello Later",
                                },
                            } as never,
                            parts: [{ type: "text", text: "Hello Later" }] as never,
                        },
                    };
                },
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Hello Later");
    assert.equal(result.fallbackText, "Hello Later");
    assert.deepEqual(result.parts, [{ type: "text", text: "Hello Later" }]);
    assert.deepEqual(
        calls.map((call) => call.kind),
        ["prompt", "message", "message"],
    );
});

test("promptSession falls back to recent session messages when the final reply uses a different message id", async () => {
    const calls: Array<{ input: unknown; kind: "messages" | "prompt" | "message"; options: unknown }> = [];
    let messageListCallCount = 0;
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
                messages: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "messages", input, options });
                    messageListCallCount += 1;

                    if (messageListCallCount === 1) {
                        return {
                            data: [{
                                info: {
                                    id: "assistant-old",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    parentID: "user-old",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    mode: "chat",
                                    agent: "build",
                                    path: {
                                        cwd: "E:/repo-1",
                                        root: "E:/repo-1",
                                    },
                                    cost: 0.01,
                                    time: {
                                        created: 50,
                                        completed: 60,
                                    },
                                    tokens: {
                                        total: 4,
                                        input: 2,
                                        output: 2,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                } as never,
                                parts: [{ type: "text", text: "old answer" }] as never,
                            }],
                        };
                    }

                    return {
                        data: [
                            {
                                info: {
                                    id: "assistant-other",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    parentID: "user-other",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    mode: "chat",
                                    agent: "build",
                                    path: {
                                        cwd: "E:/repo-1",
                                        root: "E:/repo-1",
                                    },
                                    cost: 0.01,
                                    time: {
                                        created: 200,
                                        completed: 250,
                                    },
                                    tokens: {
                                        total: 4,
                                        input: 1,
                                        output: 3,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                    structured: {
                                        body_md: "## Wrong Answer",
                                    },
                                } as never,
                                parts: [{ type: "text", text: "Wrong Answer" }] as never,
                            },
                            {
                                info: {
                                    id: "assistant-new",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    parentID: "user-new",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    mode: "chat",
                                    agent: "build",
                                    path: {
                                        cwd: "E:/repo-1",
                                        root: "E:/repo-1",
                                    },
                                    cost: 0.02,
                                    time: {
                                        created: 100,
                                        completed: 300,
                                    },
                                    tokens: {
                                        total: 6,
                                        input: 2,
                                        output: 4,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                    structured: {
                                        body_md: "## New Answer",
                                    },
                                } as never,
                                parts: [{ type: "text", text: "New Answer" }] as never,
                            },
                        ],
                    };
                },
                prompt: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "prompt", input, options });

                    return {
                        data: {
                            info: {
                                id: "assistant-placeholder",
                                role: "assistant",
                                sessionID: "session-1",
                                parentID: "user-new",
                                modelID: "gpt-5",
                                providerID: "openai",
                                mode: "chat",
                                agent: "build",
                                path: {
                                    cwd: "E:/repo-1",
                                    root: "E:/repo-1",
                                },
                                cost: 0,
                                time: {
                                    created: 90,
                                    completed: 91,
                                },
                                tokens: {
                                    input: 0,
                                    output: 0,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                            } as never,
                            parts: [],
                        },
                    };
                },
                message: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "message", input, options });

                    return {
                        data: {
                            info: {
                                id: "assistant-placeholder",
                                role: "assistant",
                                sessionID: "session-1",
                                parentID: "user-new",
                                modelID: "gpt-5",
                                providerID: "openai",
                                mode: "chat",
                                agent: "build",
                                path: {
                                    cwd: "E:/repo-1",
                                    root: "E:/repo-1",
                                },
                                cost: 0,
                                time: {
                                    created: 90,
                                    completed: 91,
                                },
                                tokens: {
                                    input: 0,
                                    output: 0,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                            } as never,
                            parts: [],
                        },
                    };
                },
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## New Answer");
    assert.equal(result.fallbackText, "New Answer");
    assert.deepEqual(result.parts, [{ type: "text", text: "New Answer" }]);
    assert.deepEqual(
        calls.map((call) => call.kind),
        ["messages", "prompt", "message", "messages"],
    );
});

test("promptSession prefers newly created usable replies when only the created timestamp correlates", async () => {
    const calls: Array<{ input: unknown; kind: "messages" | "prompt" | "message"; options: unknown }> = [];
    let messageListCallCount = 0;
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
                messages: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "messages", input, options });
                    messageListCallCount += 1;

                    if (messageListCallCount === 1) {
                        return {
                            data: [{
                                info: {
                                    id: "assistant-known",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    time: {
                                        created: 40,
                                        completed: 60,
                                    },
                                    tokens: {
                                        total: 3,
                                        input: 1,
                                        output: 2,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                } as never,
                                parts: [{ type: "text", text: "known answer" }] as never,
                            }],
                        };
                    }

                    return {
                        data: [
                            {
                                info: {
                                    id: "assistant-stale",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    time: {
                                        created: 80,
                                        completed: 85,
                                    },
                                    tokens: {
                                        total: 2,
                                        input: 1,
                                        output: 1,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                    structured: {
                                        body_md: "## Stale Answer",
                                    },
                                } as never,
                                parts: [{ type: "text", text: "Stale Answer" }] as never,
                            },
                            {
                                info: {
                                    id: "assistant-fresh",
                                    role: "assistant",
                                    sessionID: "session-1",
                                    modelID: "gpt-5",
                                    providerID: "openai",
                                    time: {
                                        created: 120,
                                        completed: 180,
                                    },
                                    tokens: {
                                        total: 4,
                                        input: 1,
                                        output: 3,
                                        reasoning: 0,
                                        cache: {
                                            read: 0,
                                            write: 0,
                                        },
                                    },
                                    structured: {
                                        body_md: "## Fresh Answer",
                                    },
                                } as never,
                                parts: [{ type: "text", text: "Fresh Answer" }] as never,
                            },
                        ],
                    };
                },
                prompt: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "prompt", input, options });

                    return {
                        data: {
                            info: {
                                id: "assistant-placeholder",
                                role: "assistant",
                                sessionID: "session-1",
                                modelID: "gpt-5",
                                providerID: "openai",
                                time: {
                                    created: 100,
                                    completed: 101,
                                },
                                tokens: {
                                    input: 0,
                                    output: 0,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                            } as never,
                            parts: [],
                        },
                    };
                },
                message: async (input: unknown, options: unknown) => {
                    calls.push({ kind: "message", input, options });

                    return {
                        data: {
                            info: {
                                id: "assistant-placeholder",
                                role: "assistant",
                                sessionID: "session-1",
                                modelID: "gpt-5",
                                providerID: "openai",
                                time: {
                                    created: 100,
                                    completed: 101,
                                },
                                tokens: {
                                    input: 0,
                                    output: 0,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                            } as never,
                            parts: [],
                        },
                    };
                },
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Fresh Answer");
    assert.equal(result.fallbackText, "Fresh Answer");
    assert.deepEqual(
        calls.map((call) => call.kind),
        ["messages", "prompt", "message", "messages"],
    );
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

test("promptSession continues when capturing known messages times out before sending the prompt", async () => {
    const calls: Array<{ kind: "get" | "post"; options: unknown }> = [];
    let messageListCallCount = 0;
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            _client: {
                get: async (options: unknown) => {
                    calls.push({ kind: "get", options });
                    const request = options as { url: string };

                    if (request.url === "/session/{sessionID}/message") {
                        messageListCallCount += 1;

                        if (messageListCallCount === 1) {
                            return await new Promise<never>(() => undefined);
                        }

                        return {
                            data: [],
                        };
                    }

                    if (request.url === "/session/status") {
                        return {
                            data: {
                                "session-1": { type: "idle" },
                            },
                        };
                    }

                    throw new Error(`Unexpected raw GET ${request.url}`);
                },
                post: async (options: unknown) => {
                    calls.push({ kind: "post", options });

                    return {
                        data: {
                            info: {
                                role: "assistant",
                                sessionID: "session-1",
                                time: {
                                    created: 100,
                                    completed: 180,
                                },
                                tokens: {
                                    input: 2,
                                    output: 3,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                                structured_output: {
                                    body_md: "## Immediate Reply",
                                },
                            },
                            parts: [],
                        },
                    };
                },
            },
            app: {
                agents: async () => [],
                log: async () => true,
            },
        } as never,
    );
    setPromptRequestTimeouts(client, {
        pollRequestMs: 5,
        sendMs: 20,
        totalPollMs: 20,
    });

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Immediate Reply");
    assert.equal(result.fallbackText, "## Immediate Reply");
    assert.equal(calls.filter((call) => call.kind === "post").length, 1);
});

test("promptSession times out when the initial prompt request never resolves", async () => {
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            _client: {
                get: async (options: unknown) => {
                    const request = options as { url: string };

                    if (request.url === "/session/{sessionID}/message") {
                        return {
                            data: [],
                        };
                    }

                    throw new Error(`Unexpected raw GET ${request.url}`);
                },
                post: async () => await new Promise<never>(() => undefined),
            },
            app: {
                agents: async () => [],
                log: async () => true,
            },
        } as never,
    );
    setPromptRequestTimeouts(client, {
        pollRequestMs: 5,
        sendMs: 5,
        totalPollMs: 20,
    });

    await assert.rejects(
        client.promptSession({
            sessionId: "session-1",
            prompt: "hello from telegram",
            structured: true,
        }),
        (error: unknown) => error instanceof OpenCodePromptTimeoutError
            && error.data.stage === "send-prompt"
            && error.data.timeoutMs === 5,
    );
});

test("promptSession keeps polling when a single message fetch hangs", async () => {
    let messageCallCount = 0;
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
                            id: "assistant-1",
                            role: "assistant",
                            sessionID: "session-1",
                            time: {
                                created: 100,
                            },
                            tokens: {
                                input: 0,
                                output: 0,
                                reasoning: 0,
                                cache: {
                                    read: 0,
                                    write: 0,
                                },
                            },
                        } as never,
                        parts: [],
                    },
                }),
                message: async () => {
                    messageCallCount += 1;

                    if (messageCallCount === 1) {
                        return await new Promise<never>(() => undefined);
                    }

                    return {
                        data: {
                            info: {
                                id: "assistant-1",
                                role: "assistant",
                                sessionID: "session-1",
                                time: {
                                    created: 100,
                                    completed: 220,
                                },
                                tokens: {
                                    input: 3,
                                    output: 4,
                                    reasoning: 0,
                                    cache: {
                                        read: 0,
                                        write: 0,
                                    },
                                },
                                structured: {
                                    body_md: "## Recovered Reply",
                                },
                            } as never,
                            parts: [{ type: "text", text: "Recovered Reply" }] as never,
                        },
                    };
                },
                messages: async () => ({
                    data: [],
                }),
                status: async () => ({
                    data: {},
                }),
            },
            app: {
                log: async () => true,
            },
        } as never,
    );
    setPromptRequestTimeouts(client, {
        pollRequestMs: 5,
        sendMs: 20,
        totalPollMs: 40,
    });

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        structured: true,
    });

    assert.equal(result.bodyMd, "## Recovered Reply");
    assert.equal(result.fallbackText, "Recovered Reply");
    assert.equal(messageCallCount, 2);
});

test("promptSession throws a timeout error when the recovery budget expires without a usable reply", async () => {
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            _client: {
                get: async (options: unknown) => {
                    const request = options as { url: string };

                    if (request.url === "/session/{sessionID}/message/{messageID}") {
                        return await new Promise<never>(() => undefined);
                    }

                    if (request.url === "/session/{sessionID}/message") {
                        return await new Promise<never>(() => undefined);
                    }

                    if (request.url === "/session/status") {
                        return await new Promise<never>(() => undefined);
                    }

                    throw new Error(`Unexpected raw GET ${request.url}`);
                },
                post: async () => ({
                    data: {
                        info: {
                            id: "assistant-placeholder",
                            role: "assistant",
                            sessionID: "session-1",
                            time: {
                                created: 100,
                            },
                            tokens: {
                                input: 0,
                                output: 0,
                                reasoning: 0,
                                cache: {
                                    read: 0,
                                    write: 0,
                                },
                            },
                        },
                        parts: [],
                    },
                }),
            },
            app: {
                agents: async () => [],
                log: async () => true,
            },
        } as never,
    );
    setPromptRequestTimeouts(client, {
        pollRequestMs: 5,
        sendMs: 20,
        totalPollMs: 5,
    });

    await assert.rejects(
        client.promptSession({
            sessionId: "session-1",
            prompt: "hello from telegram",
            structured: true,
        }),
        (error: unknown) => error instanceof OpenCodePromptTimeoutError
            && error.data.stage === "final-scan",
    );
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
