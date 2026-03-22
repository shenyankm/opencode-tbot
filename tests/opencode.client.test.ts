import assert from "node:assert/strict";
import test from "node:test";
import {
    buildOpenCodeSdkConfig,
    createMessageAbortedError,
    OpenCodeClient,
    OpenCodeMessageAbortedError,
    OpenCodePromptTimeoutError,
    type OpenCodePath,
    type OpenCodeProject,
    type OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";

function createProject(id: string, worktree: string): OpenCodeProject {
    return {
        id,
        worktree,
        time: {
            created: 1,
            updated: 1,
        },
        sandboxes: [],
    } as OpenCodeProject;
}

function createSession(
    id: string,
    projectID = "project-1",
    directory = "E:/repo-1",
): OpenCodeSession {
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

function createAssistantResponse(input: {
    bodyMd?: string;
    createdAt?: number;
    id?: string;
    parentID?: string;
    sessionID?: string;
    text?: string;
    withCompletion?: boolean;
} = {}) {
    const createdAt = input.createdAt ?? Date.now();
    const text = input.bodyMd ?? input.text;
    const withCompletion = input.withCompletion ?? true;

    return {
        info: {
            id: input.id ?? `assistant-${createdAt}`,
            role: "assistant",
            sessionID: input.sessionID ?? "session-1",
            parentID: input.parentID ?? "user-1",
            modelID: "gpt-5.4",
            providerID: "openai",
            time: {
                created: createdAt,
                ...(withCompletion
                    ? { completed: createdAt + 25 }
                    : {}),
            },
            tokens: {
                input: 10,
                output: 12,
                reasoning: 0,
                cache: {
                    read: 0,
                    write: 0,
                },
            },
        },
        parts: text
            ? [{
                type: "text",
                text,
            }]
            : [],
    } as const;
}

function createSdkClient(overrides: Record<string, unknown>) {
    return {
        app: {},
        config: {
            async get() {
                return {
                    data: {
                        provider: {},
                    },
                };
            },
            async providers() {
                return {
                    data: {
                        providers: [],
                        default: {},
                    },
                };
            },
        },
        global: {},
        lsp: {},
        mcp: {},
        path: {},
        permission: {},
        project: {},
        session: {},
        ...overrides,
    } as never;
}

function createClient(
    overrides: Record<string, unknown>,
    promptTimeoutPolicy: Partial<{
        pollRequestTimeoutMs: number;
        recoveryInactivityTimeoutMs: number;
        waitTimeoutMs: number;
    }> = {},
): OpenCodeClient {
    return new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        createSdkClient(overrides),
        fetch,
        promptTimeoutPolicy,
    );
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

test("getHealth forwards SDK options to global.health without raw fallback arguments", async () => {
    const calls: unknown[][] = [];
    const client = createClient({
        global: {
            async health(...args: unknown[]) {
                calls.push(args);

                return {
                    data: {
                        healthy: true,
                        version: "1.2.27",
                    },
                };
            },
        },
    });

    assert.deepEqual(await client.getHealth(), {
        healthy: true,
        version: "1.2.27",
    });
    assert.deepEqual(calls, [[{
        responseStyle: "data",
        throwOnError: true,
    }]]);
});

test("getHealth falls back to the raw /global/health endpoint for legacy injected SDK clients", async () => {
    const calls: unknown[] = [];
    const client = createClient({
        _client: {
            async get(options: unknown) {
                calls.push(options);

                return {
                    data: {
                        healthy: true,
                        version: "1.2.27",
                    },
                };
            },
        },
    });

    assert.deepEqual(await client.getHealth(), {
        healthy: true,
        version: "1.2.27",
    });
    assert.deepEqual(calls, [{
        responseStyle: "data",
        throwOnError: true,
        url: "/global/health",
    }]);
});

test("typed SDK helpers forward session, project, path, and permission operations", async () => {
    const calls: Array<{ args: unknown[]; method: string }> = [];
    const project = createProject("project-1", "E:/repo-1");
    const session = createSession("session-1", "project-1", "E:/repo-1");
    const forked = createSession("session-2", "project-1", "E:/repo-1");
    const pathInfo = createPath({ worktree: "E:/repo-1", directory: "E:/repo-1" });
    const client = createClient({
        app: {
            async agents(...args: unknown[]) {
                calls.push({ args, method: "app.agents" });

                return {
                    data: [{ name: "planner" }],
                };
            },
        },
        lsp: {
            async status(...args: unknown[]) {
                calls.push({ args, method: "lsp.status" });

                return {
                    data: [{
                        id: "typescript",
                        name: "TypeScript",
                        root: "E:/repo-1",
                        status: "connected",
                    }],
                };
            },
        },
        mcp: {
            async status(...args: unknown[]) {
                calls.push({ args, method: "mcp.status" });

                return {
                    data: {
                        filesystem: {
                            status: "connected",
                        },
                    },
                };
            },
        },
        path: {
            async get(...args: unknown[]) {
                calls.push({ args, method: "path.get" });

                return {
                    data: pathInfo,
                };
            },
        },
        permission: {
            async list(...args: unknown[]) {
                calls.push({ args, method: "permission.list" });

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
            async reply(...args: unknown[]) {
                calls.push({ args, method: "permission.reply" });

                return {
                    data: true,
                };
            },
        },
        project: {
            async current(...args: unknown[]) {
                calls.push({ args, method: "project.current" });

                return {
                    data: project,
                };
            },
            async list(...args: unknown[]) {
                calls.push({ args, method: "project.list" });

                return {
                    data: [project],
                };
            },
        },
        session: {
            async abort(...args: unknown[]) {
                calls.push({ args, method: "session.abort" });

                return {
                    data: true,
                };
            },
            async create(...args: unknown[]) {
                calls.push({ args, method: "session.create" });

                return {
                    data: session,
                };
            },
            async delete(...args: unknown[]) {
                calls.push({ args, method: "session.delete" });

                return {
                    data: true,
                };
            },
            async fork(...args: unknown[]) {
                calls.push({ args, method: "session.fork" });

                return {
                    data: forked,
                };
            },
            async list(...args: unknown[]) {
                calls.push({ args, method: "session.list" });

                return {
                    data: [session],
                };
            },
            async status(...args: unknown[]) {
                calls.push({ args, method: "session.status" });

                return {
                    data: {
                        "session-1": { type: "busy" },
                    },
                };
            },
            async update(...args: unknown[]) {
                calls.push({ args, method: "session.update" });

                return {
                    data: {
                        ...session,
                        title: "Renamed",
                    },
                };
            },
        },
    });

    assert.deepEqual(await client.listProjects(), [project]);
    assert.deepEqual(await client.getCurrentProject(), project);
    assert.deepEqual(await client.createSessionForDirectory("E:/repo-1", "My session"), session);
    assert.equal((await client.renameSession("session-1", "Renamed")).title, "Renamed");
    assert.deepEqual(await client.listSessions(), [session]);
    assert.deepEqual(await client.getSessionStatuses(), {
        "session-1": { type: "busy" },
    });
    assert.deepEqual(await client.getPath(), pathInfo);
    assert.deepEqual(await client.listLspStatuses("E:/repo-1"), [{
        id: "typescript",
        name: "TypeScript",
        root: "E:/repo-1",
        status: "connected",
    }]);
    assert.deepEqual(await client.listMcpStatuses("E:/repo-1"), {
        filesystem: {
            status: "connected",
        },
    });
    assert.deepEqual(await client.listAgents(), [{
        name: "planner",
    }]);
    assert.equal(await client.abortSession("session-1"), true);
    assert.equal((await client.forkSession("session-1", " message-9 ")).id, "session-2");
    assert.equal(await client.deleteSession("session-2"), true);
    assert.deepEqual(await client.listPendingPermissions("E:/repo-1"), [{
        id: "request-1",
        sessionID: "session-1",
        permission: "read",
        patterns: ["src/**"],
        metadata: {},
        always: [],
    }]);
    assert.equal(await client.replyToPermission("request-1", "always", " approved ", "session-1"), true);

    assert.deepEqual(calls, [
        {
            method: "project.list",
            args: [{
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "project.current",
            args: [{
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "session.create",
            args: [{
                query: {
                    directory: "E:/repo-1",
                },
                body: {
                    title: "My session",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "session.update",
            args: [{
                path: {
                    id: "session-1",
                },
                body: {
                    title: "Renamed",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "session.list",
            args: [{
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "session.status",
            args: [{
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "path.get",
            args: [{
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "lsp.status",
            args: [{
                query: {
                    directory: "E:/repo-1",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "mcp.status",
            args: [{
                query: {
                    directory: "E:/repo-1",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "app.agents",
            args: [{
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "session.abort",
            args: [{
                path: {
                    id: "session-1",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "session.fork",
            args: [{
                path: {
                    id: "session-1",
                },
                body: {
                    messageID: "message-9",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "session.delete",
            args: [{
                path: {
                    id: "session-2",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "permission.list",
            args: [{
                query: {
                    directory: "E:/repo-1",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "permission.reply",
            args: [{
                path: {
                    id: "session-1",
                    permissionID: "request-1",
                },
                body: {
                    response: "always",
                    message: "approved",
                },
                responseStyle: "data",
                throwOnError: true,
            }],
        },
    ]);
});

test("typed SDK helpers keep supporting legacy two-argument client methods when the runtime injects them", async () => {
    const calls: Array<{ args: unknown[]; method: string }> = [];
    const session = createSession("session-legacy", "project-1", "E:/repo-1");
    const client = createClient({
        permission: {
            async reply(parameters: unknown, options: unknown) {
                calls.push({ args: [parameters, options], method: "permission.reply" });

                return {
                    data: true,
                };
            },
        },
        session: {
            async create(parameters: unknown, options: unknown) {
                calls.push({ args: [parameters, options], method: "session.create" });

                return {
                    data: session,
                };
            },
        },
    });

    assert.equal((await client.createSessionForDirectory("E:/repo-1", "Legacy")).id, "session-legacy");
    assert.equal(await client.replyToPermission("request-legacy", "once", " okay ", undefined), true);

    assert.deepEqual(calls, [
        {
            method: "session.create",
            args: [{
                directory: "E:/repo-1",
                title: "Legacy",
            }, {
                responseStyle: "data",
                throwOnError: true,
            }],
        },
        {
            method: "permission.reply",
            args: [{
                requestID: "request-legacy",
                reply: "once",
                message: "okay",
            }, {
                responseStyle: "data",
                throwOnError: true,
            }],
        },
    ]);
});

test("promptSession prefers promptAsync, forwards the typed async payload, and returns the recovered assistant reply", async () => {
    const promptAsyncCalls: unknown[][] = [];
    let promptCalls = 0;
    let messageCalls = 0;
    const response = createAssistantResponse({
        bodyMd: "## Hello",
        createdAt: Date.now() + 10,
        id: "assistant-final",
    });
    const client = createClient({
        session: {
            async messages(...args: unknown[]) {
                messageCalls += 1;

                if (messageCalls === 1) {
                    return {
                        data: [],
                    };
                }

                return {
                    data: [response],
                };
            },
            async prompt(..._args: unknown[]) {
                promptCalls += 1;
                throw new Error("session.prompt() should not be called");
            },
            async promptAsync(...args: unknown[]) {
                promptAsyncCalls.push(args);
                return {
                    data: undefined,
                };
            },
        },
    });

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
        format: {
            type: "text",
        },
        agent: "planner",
        model: {
            providerID: "openai",
            modelID: "gpt-5.4",
        },
        variant: "high",
        files: [{
            filename: "diagram.png",
            mime: "image/png",
            url: "https://example.com/diagram.png",
        }],
    });

    assert.equal(promptCalls, 0);
    assert.equal(messageCalls, 2);
    assert.equal(result.bodyMd, "## Hello");
    assert.equal(result.fallbackText, "Hello");
    assert.deepEqual(promptAsyncCalls.length, 1);
    assert.deepEqual(promptAsyncCalls[0]?.[0], {
        path: {
            id: "session-1",
        },
        body: {
            agent: "planner",
            format: {
                type: "text",
            },
            model: {
                providerID: "openai",
                modelID: "gpt-5.4",
            },
            variant: "high",
            parts: [{
                type: "text",
                text: "hello from telegram",
            }, {
                type: "file",
                filename: "diagram.png",
                mime: "image/png",
                url: "https://example.com/diagram.png",
            }],
        },
        responseStyle: "data",
        throwOnError: true,
        signal: promptAsyncCalls[0]?.[0] && typeof promptAsyncCalls[0][0] === "object"
            ? (promptAsyncCalls[0][0] as { signal?: AbortSignal }).signal
            : undefined,
    });
    assert.ok((promptAsyncCalls[0]?.[0] as { signal?: unknown }).signal instanceof AbortSignal);
});

test("promptSession polls messages and status until a new assistant reply appears", async () => {
    const now = Date.now();
    const oldResponse = createAssistantResponse({
        bodyMd: "## Old",
        createdAt: now - 5_000,
        id: "assistant-old",
    });
    const newResponse = createAssistantResponse({
        bodyMd: "## Recovered",
        createdAt: now + 20,
        id: "assistant-new",
    });
    let messageCalls = 0;
    let statusCalls = 0;
    const client = createClient({
        session: {
            async messages() {
                messageCalls += 1;

                if (messageCalls === 1) {
                    return { data: [oldResponse] };
                }

                if (messageCalls === 2) {
                    return { data: [oldResponse] };
                }

                return { data: [oldResponse, newResponse] };
            },
            async promptAsync() {
                return { data: undefined };
            },
            async status() {
                statusCalls += 1;

                return {
                    data: {
                        "session-1": { type: "busy" },
                    },
                };
            },
        },
    }, {
        pollRequestTimeoutMs: 50,
        recoveryInactivityTimeoutMs: 500,
        waitTimeoutMs: 500,
    });

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "recover response",
        format: {
            type: "text",
        },
    });

    assert.equal(result.bodyMd, "## Recovered");
    assert.equal(result.fallbackText, "Recovered");
    assert.equal(messageCalls, 3);
    assert.equal(statusCalls, 1);
});

test("promptSession maps idle status with no new assistant reply to MessageAbortedError", async () => {
    const oldResponse = createAssistantResponse({
        bodyMd: "## Old",
        createdAt: Date.now() - 5_000,
        id: "assistant-old",
    });
    let messageCalls = 0;
    let statusCalls = 0;
    const client = createClient({
        session: {
            async messages() {
                messageCalls += 1;

                return {
                    data: [oldResponse],
                };
            },
            async promptAsync() {
                return {
                    data: undefined,
                };
            },
            async status() {
                statusCalls += 1;

                return {
                    data: {
                        "session-1": { type: "idle" },
                    },
                };
            },
        },
    }, {
        pollRequestTimeoutMs: 50,
        recoveryInactivityTimeoutMs: 500,
        waitTimeoutMs: 500,
    });

    await assert.rejects(
        client.promptSession({
            sessionId: "session-1",
            prompt: "hello",
            format: {
                type: "text",
            },
        }),
        (error: unknown) => error instanceof OpenCodeMessageAbortedError
            && error.message === "Request was aborted.",
    );
    assert.equal(messageCalls, 4);
    assert.equal(statusCalls, 2);
});

test("promptSession honors an external AbortSignal while recovery polling is still waiting", async () => {
    const controller = new AbortController();
    let messageCalls = 0;
    const client = createClient({
        session: {
            async messages() {
                messageCalls += 1;

                if (messageCalls === 1) {
                    return {
                        data: [],
                    };
                }

                setTimeout(() => {
                    controller.abort(createMessageAbortedError("cancelled by telegram"));
                }, 10);

                return await new Promise<never>(() => undefined);
            },
            async promptAsync() {
                return {
                    data: undefined,
                };
            },
        },
    }, {
        pollRequestTimeoutMs: 250,
        recoveryInactivityTimeoutMs: 1_000,
        waitTimeoutMs: 1_000,
    });

    await assert.rejects(
        client.promptSession({
            sessionId: "session-1",
            prompt: "hello",
            signal: controller.signal,
        }),
        (error: unknown) => error instanceof OpenCodeMessageAbortedError
            && error.message === "cancelled by telegram",
    );
    assert.equal(messageCalls, 2);
});

test("promptSession times out when session.promptAsync never settles", async () => {
    let messageCalls = 0;
    const client = createClient({
        session: {
            async messages() {
                messageCalls += 1;

                return {
                    data: [],
                };
            },
            async promptAsync() {
                return await new Promise<never>(() => undefined);
            },
        },
    }, {
        pollRequestTimeoutMs: 20,
        recoveryInactivityTimeoutMs: 100,
        waitTimeoutMs: 30,
    });

    await assert.rejects(
        client.promptSession({
            sessionId: "session-1",
            prompt: "hello",
        }),
        (error: unknown) => error instanceof OpenCodePromptTimeoutError
            && error.data.stage === "send-prompt"
            && error.data.sessionId === "session-1",
    );
    assert.equal(messageCalls, 1);
});
