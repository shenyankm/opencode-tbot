import assert from "node:assert/strict";
import test from "node:test";
import { ClientError, OpenCode, type SessionInfo, type SessionMessageAssistant } from "@opencode/client";
import {
    buildOpenCodeSdkConfig,
    createMessageAbortedError,
    OpenCodeClient,
    OpenCodeMessageAbortedError,
    OpenCodePromptTimeoutError,
    type OpenCodeSdkClientLike,
} from "../src/services/opencode/opencode.client.js";

function createSession(id = "ses_1", directory = "/repo"): SessionInfo {
    return {
        id,
        projectID: "project-1",
        title: "Session",
        location: { directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 1, updated: 2 },
    };
}

function createAssistant(overrides: Partial<SessionMessageAssistant> = {}): SessionMessageAssistant {
    return {
        id: "msg_assistant",
        type: "assistant",
        agent: "build",
        model: { id: "gpt-test", providerID: "openai", variant: "high" },
        time: { created: 10, completed: 35 },
        content: [{ type: "text", text: "## Hello" }],
        tokens: { input: 10, output: 12, reasoning: 3, cache: { read: 4, write: 5 } },
        ...overrides,
    };
}

function createClient(
    overrides: Record<string, unknown> = {},
    policy: Partial<{ pollRequestTimeoutMs: number; recoveryInactivityTimeoutMs: number; waitTimeoutMs: number }> = {},
): OpenCodeClient {
    let messageId = "";
    const sessionOverrides = (overrides.session ?? {}) as Record<string, unknown>;
    const prompt = sessionOverrides.prompt as ((...args: unknown[]) => Promise<unknown>) | undefined;
    const sdk = {
        server: { async info() { return { version: "2.0.29" }; } },
        agent: { async list() { return { data: [] }; } },
        permission: {},
        location: {},
        project: {},
        plugin: {},
        model: {},
        provider: {},
        ...overrides,
        session: {
            async wait() {},
            async active() { return {}; },
            ...sessionOverrides,
            async prompt(input: { id: string }, options: unknown) {
                messageId = input.id;

                return prompt ? prompt(input, options) : { id: messageId };
            },
        },
        message: overrides.message ?? {
            async list() {
                return {
                    data: [createAssistant(), { type: "user", id: messageId, text: "hello", time: { created: 1 } }],
                    cursor: {},
                };
            },
        },
    } as unknown as OpenCodeSdkClientLike;

    return new OpenCodeClient(undefined, sdk, policy);
}

test("status, inbox cancellation, and interruption time out so cancelling a stalled host can finish", async () => {
    const stalled = (options: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
    const client = createClient({ session: {
        active: stalled,
        inbox: { cancel: (_input: unknown, options: { signal: AbortSignal }) => stalled(options) },
        interrupt: (_input: unknown, options: { signal: AbortSignal }) => stalled(options),
    } }, { pollRequestTimeoutMs: 20 });
    // Keep the test alive while the native timeout signals use unreferenced timers.
    const keepAlive = setInterval(() => {}, 1_000);
    try {
        await Promise.all([
            assert.rejects(client.getSessionStatuses(), { name: "TimeoutError" }),
            assert.rejects(client.cancelSessionInput("ses_1", "msg_1"), { name: "TimeoutError" }),
            assert.rejects(client.abortSession("ses_1"), { name: "TimeoutError" }),
        ]);
    } finally {
        clearInterval(keepAlive);
    }
});

test("cancelSessionInput forwards the original V2 inbox identity and preserves its void response", async () => {
    const calls: unknown[] = [];
    const client = createClient({ session: { inbox: { async cancel(input: unknown, options: { signal: AbortSignal }) {
        assert.ok(options.signal instanceof AbortSignal);
        calls.push(input);
    } } } });
    assert.equal(await client.cancelSessionInput("ses_1", "msg_1"), undefined);
    assert.deepEqual(calls, [{ sessionID: "ses_1", inboxID: "msg_1" }]);
});

test("buildOpenCodeSdkConfig forwards trimmed V2 bearer tokens and omits blank tokens", () => {
    assert.deepEqual(buildOpenCodeSdkConfig({ baseUrl: "http://localhost:4096", apiKey: " secret " }), {
        baseUrl: "http://localhost:4096",
        headers: { authorization: "Bearer secret" },
    });
    assert.deepEqual(buildOpenCodeSdkConfig({ baseUrl: "http://localhost:4096", apiKey: " " }), {
        baseUrl: "http://localhost:4096",
    });
});

test("getHealth reads the V2 server info endpoint", async () => {
    const calls: string[] = [];
    const client = new OpenCodeClient(undefined, OpenCode.make({
        baseUrl: "http://localhost:4096",
        fetch: async (input) => {
            calls.push(String(input));

            return Response.json({ version: "2.0.29", pid: 1, urls: [], paths: { tmp: "/tmp" } });
        },
    }));

    assert.deepEqual(await client.getHealth(), { healthy: true, version: "2.0.29" });
    assert.deepEqual(calls, ["http://localhost:4096/api/info"]);
});

test("session and permission helpers preserve V2 void responses and location-based sessions", async () => {
    const calls: unknown[] = [];
    const session = createSession();
    const forked = createSession("ses_fork");
    const client = createClient({
        location: {
            async get() {
                return { directory: "/repo/src", project: { id: "project-1", directory: "/repo", canonical: "/repo" } };
            },
        },
        project: {
            async list() {
                return [{ id: "project-1", canonical: "/repo", time: { created: 1, updated: 2, active: 3 }, sandboxes: [] }];
            },
        },
        session: {
            async create(input: unknown) { calls.push(input); return session; },
            async update(input: unknown) { calls.push(input); },
            async get(input: unknown) { calls.push(input); return { ...session, title: "Renamed" }; },
            async fork(input: unknown) { calls.push(input); return forked; },
            async remove(input: unknown) { calls.push(input); },
            async interrupt(input: unknown) { calls.push(input); return { interrupted: false }; },
            async active() { return { ses_1: { type: "running" } }; },
        },
        permission: {
            async reply(input: unknown) { calls.push(input); },
        },
    });

    assert.deepEqual(await client.getPath(), { directory: "/repo/src", worktree: "/repo" });
    assert.deepEqual(await client.getCurrentProject(), { id: "project-1", worktree: "/repo" });
    assert.equal((await client.listProjects())[0]?.worktree, "/repo");
    assert.equal((await client.createSessionForDirectory("/repo", "My session")).directory, "/repo");
    assert.equal((await client.renameSession("ses_1", "Renamed")).title, "Renamed");
    assert.equal((await client.forkSession("ses_1", " msg_before ")).id, "ses_fork");
    assert.equal(await client.deleteSession("ses_fork"), true);
    assert.equal(await client.abortSession("ses_1"), false);
    assert.equal(await client.replyToPermission("ses_1", "perm_1", "always"), true);
    assert.deepEqual(await client.getSessionStatuses(), { ses_1: { type: "busy" } });
    assert.deepEqual(calls, [
        { location: { directory: "/repo" }, title: "My session" },
        { sessionID: "ses_1", title: "Renamed" },
        { sessionID: "ses_1" },
        { sessionID: "ses_1", before: "msg_before" },
        { sessionID: "ses_fork" },
        { sessionID: "ses_1" },
        { sessionID: "ses_1", requestID: "perm_1", decision: "always" },
    ]);
});

test("getSession reads one session and only treats a session-not-found response as missing", async () => {
    const calls: unknown[] = [];
    const offline = new Error("offline");
    const client = createClient({ session: { async get(input: { sessionID: string }) {
        calls.push(input);
        if (input.sessionID === "missing") {
            throw { _tag: "SessionNotFoundError", sessionID: "missing", message: "Missing session" };
        }
        if (input.sessionID === "offline") { throw offline; }
        return createSession(input.sessionID);
    } } });
    assert.equal((await client.getSession("target"))?.id, "target");
    assert.equal(await client.getSession("missing"), null);
    await assert.rejects(client.getSession("offline"), (error) => error === offline);
    assert.deepEqual(calls, [{ sessionID: "target" }, { sessionID: "missing" }, { sessionID: "offline" }]);
});

test("listSessions follows V2 cursors instead of truncating the catalog to its default page", async () => {
    const calls: unknown[] = [];
    const client = createClient({
        session: {
            async list(input: { cursor?: string }) {
                calls.push(input);

                return input.cursor
                    ? { data: [createSession("ses_2", "/other")], cursor: {} }
                    : { data: [createSession()], cursor: { next: "page-2" } };
            },
        },
    });

    assert.deepEqual((await client.listSessions()).map((session) => [session.id, session.directory]), [
        ["ses_1", "/repo"], ["ses_2", "/other"],
    ]);
    assert.deepEqual(calls, [{ limit: 100 }, { limit: 100, cursor: "page-2" }]);
});

test("listLspStatuses reports the missing V2 capability and listMcpStatuses preserves pending status", async () => {
    let request: unknown;
    const client = createClient({
        mcp: {
            async list(input: unknown) {
                request = input;

                return { data: [{ name: "filesystem", status: { status: "pending" } }] };
            },
        },
    });

    assert.equal(await client.listLspStatuses("/repo"), null);
    assert.deepEqual(await client.listMcpStatuses("/repo"), { filesystem: { status: "pending" } });
    assert.deepEqual(request, { location: { directory: "/repo" } });
});

test("listConfiguredPlugins reads enabled V2 plugin sources without inventing builtin package specs", async () => {
    const client = createClient({
        plugin: {
            async list() {
                return { data: [
                    { source: { type: "builtin" } },
                    { source: { type: "package", target: "opencode-tbot@latest" } },
                    { source: { type: "local", path: "/plugins/custom.ts" } },
                    { source: { type: "package", target: "opencode-tbot@latest" } },
                ] };
            },
        },
    });

    assert.deepEqual(await client.listConfiguredPlugins(), ["opencode-tbot@latest", "/plugins/custom.ts"]);
});

test("listModels uses the V2 enabled inventory, preserves variant settings, and shares cached refreshes", async () => {
    let modelCalls = 0;
    const baseModel = {
        id: "friendly-alias",
        modelID: "remote-model",
        providerID: "openai",
        name: "Test model",
        enabled: true,
        capabilities: { input: ["text", "image"], output: ["text", "reasoning"], tools: true },
        variants: [{ id: "high", settings: { reasoningEffort: "high" }, body: { effort: "high" } }],
    };
    const client = createClient({
        model: {
            async list() {
                modelCalls += 1;

                return { data: [baseModel, { ...baseModel, id: "disabled", enabled: false }, {
                    ...baseModel, id: "image-only", capabilities: { input: ["image"], output: ["image"] },
                }] };
            },
        },
        provider: { async list() { return { data: [{ id: "openai", name: "OpenAI" }] }; } },
    });

    const [models, concurrentModels] = await Promise.all([client.listModels(), client.listModels()]);
    assert.strictEqual(models, concurrentModels);
    assert.strictEqual(await client.listModels(), models);
    assert.equal(modelCalls, 1);
    assert.deepEqual(models, [{
        id: "friendly-alias",
        providerID: "openai",
        providerName: "OpenAI",
        name: "Test model",
        qualifiedId: "openai/friendly-alias",
        reasoning: true,
        variants: { high: { settings: { reasoningEffort: "high" }, body: { effort: "high" } } },
    }]);
});

test("listModels retries after a failed refresh", async () => {
    let calls = 0;
    const client = createClient({
        model: {
            async list() {
                if (++calls === 1) { throw new Error("offline"); }
                return { data: [] };
            },
        },
        provider: { async list() { return { data: [] }; } },
    });

    await assert.rejects(client.listModels(), /offline/);
    assert.deepEqual(await client.listModels(), []);
    assert.equal(calls, 2);
});

test("promptSession selects the V2 agent and model, sends URI attachments, and waits for the final reply", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const client = createClient({
        agent: { async list() { return { data: [{ id: "agent_planner", name: "Planner" }] }; } },
        session: {
            async switchAgent(input: unknown) { calls.push({ method: "agent", input }); },
            async switchModel(input: unknown) { calls.push({ method: "model", input }); },
            async prompt(input: unknown, options: { signal: AbortSignal }) {
                assert.ok(options.signal instanceof AbortSignal);
                calls.push({ method: "prompt", input });
            },
            async wait(input: unknown, options: { signal: AbortSignal }) {
                assert.ok(options.signal instanceof AbortSignal);
                calls.push({ method: "wait", input });
            },
        },
    });

    const result = await client.promptSession({
        sessionId: "ses_1",
        prompt: " hello ",
        agent: "Planner",
        model: { providerID: "openai", modelID: "gpt-test" },
        variant: "high",
        files: [{ filename: "diagram.png", mime: "image/png", url: "data:image/png;base64,aGVsbG8=" }],
    });

    assert.equal(result.bodyMd, "## Hello");
    assert.equal(result.fallbackText, "Hello");
    assert.equal(result.info?.model.id, "gpt-test");
    assert.deepEqual(result.metrics, {
        durationMs: 25,
        tokens: { total: 34, input: 10, output: 12, reasoning: 3, cacheRead: 4, cacheWrite: 5 },
    });
    assert.deepEqual(calls.slice(0, 2), [
        { method: "agent", input: { sessionID: "ses_1", agent: "agent_planner" } },
        { method: "model", input: { sessionID: "ses_1", model: { id: "gpt-test", providerID: "openai", variant: "high" } } },
    ]);
    const promptInput = calls[2]?.input as { id: string };
    assert.match(promptInput.id, /^msg_/);
    assert.deepEqual(calls[2], { method: "prompt", input: {
        sessionID: "ses_1", id: promptInput.id, text: "hello",
        files: [{ uri: "data:image/png;base64,aGVsbG8=", name: "diagram.png" }],
    } });
    assert.deepEqual(calls[3], { method: "wait", input: { sessionID: "ses_1" } });
});

test("promptSession uses an already resolved agent ID without listing agents and still switches the shared session", async () => {
    const switched: unknown[] = [];
    const client = createClient({
        agent: { async list() { throw new Error("The resolved agent must not be queried again."); } },
        session: { async switchAgent(input: unknown) { switched.push(input); } },
    });
    await client.promptSession({ sessionId: "ses_1", prompt: "hello", agent: "Planner", agentId: "agent_planner" });
    assert.deepEqual(switched, [{ sessionID: "ses_1", agent: "agent_planner" }]);
});

test("promptSession uses the installed V2 transport paths and serialized payload", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    let messageId = "";
    const sdk = OpenCode.make({
        baseUrl: "http://localhost:4096",
        fetch: async (input, init) => {
            const path = new URL(String(input)).pathname;
            const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
            calls.push({ path, body });

            if (path.endsWith("/prompt")) {
                messageId = body.id;
                return Response.json({ data: { id: messageId, sessionID: "ses_1", type: "user" } });
            }
            if (path.endsWith("/wait")) {
                return new Response(null, { status: 204 });
            }
            if (path.endsWith("/message")) {
                return Response.json({ data: [createAssistant(), { id: messageId, type: "user" }], cursor: {} });
            }
            throw new Error(`Unexpected path: ${path}`);
        },
    });
    const client = new OpenCodeClient(undefined, sdk);

    assert.equal((await client.promptSession({ sessionId: "ses_1", prompt: "hello" })).bodyMd, "## Hello");
    assert.deepEqual(calls, [
        { path: "/api/session/ses_1/prompt", body: { id: messageId, text: "hello" } },
        { path: "/api/experimental/session/ses_1/wait", body: undefined },
        { path: "/api/session/ses_1/message", body: undefined },
    ]);
});

test("promptSession pages to its own user message and excludes later unrelated turns", async () => {
    let ownMessageId = "";
    const messageCalls: unknown[] = [];
    const client = createClient({
        session: { async prompt(input: { id: string }) { ownMessageId = input.id; } },
        message: {
            async list(input: { cursor?: string }) {
                messageCalls.push(input);

                return input.cursor ? {
                    data: [createAssistant({ content: [{ type: "text", text: "Own reply" }] }), { id: ownMessageId, type: "user" }],
                    cursor: {},
                } : {
                    data: [createAssistant({ content: [{ type: "text", text: "Other reply" }] }), { id: "msg_other_user", type: "user" }],
                    cursor: { next: "earlier" },
                };
            },
        },
    });

    assert.equal((await client.promptSession({ sessionId: "ses_1", prompt: "hello" })).bodyMd, "Own reply");
    assert.deepEqual(messageCalls, [
        { sessionID: "ses_1", limit: 100, order: "desc" },
        { sessionID: "ses_1", limit: 100, cursor: "earlier" },
    ]);
});

test("promptSession preserves native V2 assistant messages and structured errors without projecting V1 fields", async () => {
    let messageId = "";
    const assistant = createAssistant({ content: [], error: { type: "APIError", message: "Provider unavailable", status: 503 } });
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: { async list() { return {
            data: [assistant, { id: messageId, type: "user" }],
            cursor: {},
        }; } },
    });

    const result = await client.promptSession({ sessionId: "ses_1", prompt: "hello" });
    assert.equal(result.assistantError?.type, "APIError");
    assert.equal(result.assistantError?.message, "Provider unavailable");
    assert.equal(result.assistantError?.status, 503);
    assert.equal(result.info, assistant);
    assert.equal(result.assistantError, assistant.error);
    assert.ok(!("name" in result.assistantError!) && !("data" in result.assistantError!));
    assert.equal(result.bodyMd, null);
});

test("promptSession reports an empty completed assistant reply without returning previous history", async () => {
    let messageId = "";
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: { async list() { return {
            data: [createAssistant({ content: [] }), { id: messageId, type: "user" }, createAssistant()], cursor: {},
        }; } },
    });

    const result = await client.promptSession({ sessionId: "ses_1", files: [{ mime: "image/png", url: "data:image/png;base64,YQ==" }] });
    assert.equal(result.bodyMd, null);
    assert.equal(result.fallbackText, "OpenCode returned empty response.");
});

test("promptSession maps a completed wait without its own assistant reply to MessageAbortedError", async () => {
    const client = createClient({ message: { async list() { return { data: [createAssistant()], cursor: {} }; } } });

    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello" }), OpenCodeMessageAbortedError);
});

test("promptSession recovers a transport failure while waiting without sending the prompt twice", async () => {
    let prompts = 0;
    let activeCalls = 0;
    const client = createClient({
        session: {
            async prompt() { prompts += 1; },
            async wait() { throw new ClientError("Transport"); },
            async active() { activeCalls += 1; return {}; },
        },
    });

    assert.equal((await client.promptSession({ sessionId: "ses_1", prompt: "hello" })).bodyMd, "## Hello");
    assert.equal(prompts, 1);
    assert.equal(activeCalls, 1);
});

test("promptSession preserves declared wait errors instead of polling failed authorization", async () => {
    const denied = Object.assign(new Error("denied"), { _tag: "UnauthorizedError" });
    const client = createClient({ session: { async wait() { throw denied; } } });

    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello" }), (error) => error === denied);
});

test("promptSession honors an external abort even when the V2 wait ignores its signal", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const client = createClient({
        session: {
            async wait(_input: unknown, options: { signal: AbortSignal }) {
                requestSignal = options.signal;
                controller.abort(createMessageAbortedError("cancelled by telegram"));
                return new Promise<never>(() => undefined);
            },
        },
    });

    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello", signal: controller.signal }),
        (error) => error instanceof OpenCodeMessageAbortedError && error.message === "cancelled by telegram");
    assert.equal(requestSignal?.aborted, true);
});

test("promptSession times out and aborts stalled V2 prompt and wait requests", async () => {
    for (const stage of ["send-prompt", "wait-session"] as const) {
        let requestSignal: AbortSignal | undefined;
        const stalled = async (_input: unknown, options: { signal: AbortSignal }) => {
            requestSignal = options.signal;
            return new Promise<never>(() => undefined);
        };
        const client = createClient({ session: stage === "send-prompt" ? { prompt: stalled } : { wait: stalled } }, {
            waitTimeoutMs: 20,
        });

        await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello" }),
            (error) => error instanceof OpenCodePromptTimeoutError && error.data.stage === stage && error.data.sessionId === "ses_1");
        assert.equal(requestSignal?.aborted, true);
    }
});

test("promptSession rejects empty input and pre-aborted requests before sending", async () => {
    let prompts = 0;
    const client = createClient({ session: { async prompt() { prompts += 1; } } });
    const controller = new AbortController();
    controller.abort(createMessageAbortedError("already cancelled"));

    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: " " }), /text or file attachments/);
    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello", signal: controller.signal }), /already cancelled/);
    assert.equal(prompts, 0);
});


test("promptSession recovers a transport failure during its final message scan", async () => {
    let messageId = "";
    let messageCalls = 0;
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: {
            async list() {
                if (++messageCalls === 1) {
                    throw new ClientError("Transport");
                }

                return { data: [createAssistant(), { id: messageId, type: "user" }], cursor: {} };
            },
        },
    });

    assert.equal((await client.promptSession({ sessionId: "ses_1", prompt: "hello" })).bodyMd, "## Hello");
    assert.equal(messageCalls, 2);
});

test("promptSession stops recovery when the V2 session stays active without progressing", async () => {
    const client = createClient({ session: {
        async wait() { throw new ClientError("Transport"); },
        async active() { return { ses_1: { type: "running" } }; },
    } }, { recoveryInactivityTimeoutMs: 20, waitTimeoutMs: 200 });

    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello" }),
        (error) => error instanceof OpenCodePromptTimeoutError
            && error.data.stage === "wait-session"
            && error.data.timeoutMs === 20
            && error.data.elapsedMs >= 0);
});

test("promptSession does not send after the configured total deadline has expired", async () => {
    let prompts = 0;
    const client = createClient({ session: { async prompt() { prompts += 1; } } }, { waitTimeoutMs: 0 });

    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello" }), OpenCodePromptTimeoutError);
    assert.equal(prompts, 0);
});


test("promptSession preserves a shared final response when another user steers the same turn", async () => {
    let messageId = "";
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: { async list() { return {
            data: [
                { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 40 } },
                createAssistant({ content: [{ type: "text", text: "Combined answer" }] }),
                { id: "msg_steer", type: "user" },
                { id: messageId, type: "user" },
            ],
            cursor: {},
        }; } },
    });

    assert.equal((await client.promptSession({ sessionId: "ses_1", prompt: "hello" })).bodyMd, "Combined answer");
});

for (const finish of ["tool-calls", "stop", "length"] as const) {
    test(`promptSession preserves a shared steered response after a continuing ${finish} step`, async () => {
        let messageId = "";
        const earlierStep = createAssistant({
            id: "msg_tool_step",
            finish,
            content: finish === "length" ? [{ type: "text", text: "Truncated draft" }] : [{
                type: "tool",
                id: "tool_1",
                name: "read",
                state: { status: "completed", input: {}, content: [{ type: "text", text: "file content" }] },
                time: { created: 2, completed: 3 },
            }],
        });
        const client = createClient({
            session: { async prompt(input: { id: string }) { messageId = input.id; } },
            message: { async list() { return {
                data: [
                    { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 40 } },
                    createAssistant({ content: [{ type: "text", text: "Combined final answer" }] }),
                    { id: "msg_steer", type: "user" },
                    earlierStep,
                    { id: messageId, type: "user" },
                ],
                cursor: {},
            }; } },
        });

        assert.equal((await client.promptSession({ sessionId: "ses_1", prompt: "hello" })).bodyMd, "Combined final answer");
    });
}

test("promptSession keeps its completed reply when a later independent turn fails in the same busy period", async () => {
    let messageId = "";
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: { async list() { return {
            data: [
                { id: "msg_idle", type: "idle", outcome: "failed", error: { type: "later-failure", message: "Other turn failed" } },
                { id: "msg_other_user", type: "user" },
                createAssistant({ finish: "stop", content: [{ type: "text", text: "Own final answer" }] }),
                { id: messageId, type: "user" },
            ],
            cursor: {},
        }; } },
    });

    assert.equal((await client.promptSession({ sessionId: "ses_1", prompt: "hello" })).bodyMd, "Own final answer");
});

test("promptSession preserves execution failures that happen before an assistant message exists", async () => {
    let messageId = "";
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: { async list() { return {
            data: [
                { id: "msg_idle", type: "idle", outcome: "failed", error: { type: "ModelNotSelected", message: "No model selected", status: 400 } },
                { id: messageId, type: "user" },
            ],
            cursor: {},
        }; } },
    });

    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello" }),
        (error) => error instanceof Error && error.name === "ModelNotSelected" && error.message === "No model selected");
});

test("promptSession treats an interrupted V2 execution as cancellation even when it contains partial text", async () => {
    let messageId = "";
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: { async list() { return {
            data: [
                { id: "msg_idle", type: "idle", outcome: "interrupted" },
                createAssistant({ time: { created: 10 }, content: [{ type: "text", text: "Unfinished response" }] }),
                { id: messageId, type: "user" },
            ],
            cursor: {},
        }; } },
    });

    await assert.rejects(client.promptSession({ sessionId: "ses_1", prompt: "hello" }), OpenCodeMessageAbortedError);
});


test("promptSession returns an empty successful final step after an earlier retried assistant failure", async () => {
    let messageId = "";
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: { async list() { return {
            data: [
                { id: "msg_idle", type: "idle", outcome: "succeeded" },
                createAssistant({ id: "msg_empty_final", finish: "stop", content: [] }),
                createAssistant({ id: "msg_retried", error: { type: "TransportError", message: "Recovered failure" } }),
                { id: messageId, type: "user" },
            ],
            cursor: {},
        }; } },
    });

    const result = await client.promptSession({ sessionId: "ses_1", prompt: "hello" });
    assert.equal(result.info?.id, "msg_empty_final");
    assert.equal(result.assistantError, null);
    assert.equal(result.bodyMd, null);
});


test("promptSession preserves a shared steered reply after an earlier failed step is retried", async () => {
    let messageId = "";
    const client = createClient({
        session: { async prompt(input: { id: string }) { messageId = input.id; } },
        message: { async list() { return {
            data: [
                { id: "msg_idle", type: "idle", outcome: "succeeded" },
                createAssistant({ id: "msg_shared_final", finish: "stop", content: [{ type: "text", text: "Recovered combined answer" }] }),
                { id: "msg_steer", type: "user" },
                { id: "msg_retry_continue", type: "synthetic", text: "Continue the interrupted response" },
                createAssistant({ id: "msg_retried", finish: "error", error: { type: "TransportError", message: "Recovered failure" } }),
                { id: messageId, type: "user" },
            ],
            cursor: {},
        }; } },
    });

    const result = await client.promptSession({ sessionId: "ses_1", prompt: "hello" });
    assert.equal(result.info?.id, "msg_shared_final");
    assert.equal(result.assistantError, null);
    assert.equal(result.bodyMd, "Recovered combined answer");
});
