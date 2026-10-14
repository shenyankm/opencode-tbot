import { randomUUID } from "node:crypto";

import {
    ClientError,
    OpenCode,
    type AgentInfo,
    type ConfigEntry,
    type McpServer,
    type ModelInfo,
    type OpenCodeClient as SdkClient,
    type Project,
    type ProviderInfo,
    type SessionInfo,
    type SessionMessageAssistant,
    type SessionMessageIdle,
} from "@opencode/client";

import { stripMarkdownToPlainText } from "../../infra/utils/markdown-text.js";

export interface OpenCodeClientOptions {
    baseUrl: string;
    apiKey?: string;
}

export interface OpenCodePromptTimeoutPolicy {
    pollRequestTimeoutMs: number;
    recoveryInactivityTimeoutMs: number;
    waitTimeoutMs: number;
}

export function buildOpenCodeSdkConfig(options: OpenCodeClientOptions): Parameters<typeof OpenCode.make>[0] {
    const apiKey = options.apiKey?.trim();

    return {
        baseUrl: options.baseUrl,
        ...(apiKey ? { headers: { authorization: `Bearer ${apiKey}` } } : {}),
    };
}

export interface PromptSessionInput {
    sessionId: string;
    prompt?: string | null;
    agent?: string | null;
    format?: OpenCodeTextOutputFormat;
    signal?: AbortSignal;
    model?: {
        providerID: string;
        modelID: string;
    };
    variant?: string | null;
    files?: PromptSessionFilePartInput[];
    onInputReady?: (messageId: string) => void;
}

export interface PromptSessionFilePartInput {
    filename?: string;
    mime: string;
    url: string;
}

export interface PromptSessionTokenMetrics {
    total: number | null;
    input: number | null;
    output: number | null;
    reasoning: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
}

export interface PromptSessionMetrics {
    durationMs: number | null;
    tokens: PromptSessionTokenMetrics;
}

export interface OpenCodeContextUsage {
    capacity: number | null;
    used: number | null;
    session?: {
        directory: string | null;
        modelName: string | null;
        providerID: string | null;
        variant: string | null;
        agentName: string | null;
    };
}

export interface PromptSessionResult {
    assistantError: OpenCodeAssistantError | null;
    bodyMd: string | null;
    fallbackText: string;
    info: OpenCodeAssistantMessage | null;
    metrics: PromptSessionMetrics;
    parts: Part[];
    structured: unknown;
}

export type OpenCodeProject = Omit<Project, "canonical" | "time" | "sandboxes"> & {
    worktree: string;
    time?: { created: number; updated: number; active?: number; archived?: number };
    sandboxes?: string[];
};
export interface OpenCodeSession {
    id: string;
    projectID: string;
    directory: string;
    title: string;
    time: SessionInfo["time"];
    parentID?: string;
    slug?: string;
    version?: string;
}
export type OpenCodeModel = ModelInfo;
export type OpenCodeProvider = ProviderInfo;
export type OpenCodeConfig = ConfigEntry[];
export type OpenCodeAgent = AgentInfo;
export interface OpenCodeLspStatus {
    id: string;
    name: string;
    root: string;
    status: "connected" | "error";
}
export interface OpenCodePath {
    directory: string;
    worktree: string;
    home?: string;
    state?: string;
    config?: string;
}
export type OpenCodeMcpStatus = McpServer["status"] | {
    status: "needs_client_registration";
    error: string;
} | {
    status: "needs_auth";
};
export type OpenCodeSessionStatus = {
    type: "idle" | "busy";
} | {
    type: "retry";
    attempt: number;
    message: string;
    next: number;
};
type Part = SessionMessageAssistant["content"][number];
type OpenCodePromptTurn = {
    assistants: SessionMessageAssistant[];
    idle: SessionMessageIdle | null;
};
export interface OpenCodePermissionRequest {
    always: string[];
    id: string;
    metadata: Record<string, unknown>;
    patterns: string[];
    permission: string;
    sessionID: string;
}
export interface OpenCodeHealth {
    healthy: boolean;
    version: string;
}

export interface OpenCodeConfiguredModel {
    id: string;
    providerID: string;
    providerName: string;
    name: string;
    qualifiedId: string;
    reasoning: boolean;
    variants: Record<string, Record<string, unknown>>;
}
export interface OpenCodeTextOutputFormat {
    type: "text";
}
export type OpenCodeSdkClientLike = SdkClient;

export type OpenCodePromptTimeoutStage =
    | "capture-known-messages"
    | "send-prompt"
    | "wait-session"
    | "poll-message"
    | "poll-messages"
    | "poll-status"
    | "final-scan";

export interface OpenCodePromptTimeoutErrorData {
    elapsedMs: number;
    message?: string;
    messageId?: string;
    sessionId: string;
    stage: OpenCodePromptTimeoutStage;
    timeoutMs: number;
}

export class OpenCodePromptTimeoutError extends Error {
    readonly data: OpenCodePromptTimeoutErrorData;

    constructor(data: OpenCodePromptTimeoutErrorData) {
        super(data.message ?? "OpenCode prompt timed out.");
        this.name = "OpenCodePromptTimeoutError";
        this.data = data;
    }
}

export class OpenCodeMessageAbortedError extends Error {
    readonly data?: {
        message?: string;
    };

    constructor(message = "Request was aborted.") {
        super(message);
        this.name = "MessageAbortedError";
        this.data = {
            message,
        };
    }
}

export function createMessageAbortedError(message = "Request was aborted."): OpenCodeMessageAbortedError {
    return new OpenCodeMessageAbortedError(message);
}

export interface OpenCodeAssistantError {
    data?: Record<string, unknown>;
    name: string;
    [key: string]: unknown;
}

export interface OpenCodeAssistantMessage {
    agent?: string;
    cost?: number;
    error?: OpenCodeAssistantError;
    finish?: string;
    id?: string;
    mode?: string;
    modelID?: string;
    parentID?: string;
    path?: {
        cwd?: string;
        root?: string;
    };
    providerID?: string;
    role?: "assistant";
    sessionID?: string;
    summary?: boolean;
    time?: {
        completed?: number;
        created?: number;
    };
    tokens?: {
        cache?: {
            read?: number;
            write?: number;
        };
        input?: number;
        output?: number;
        reasoning?: number;
        total?: number;
    };
    variant?: string;
}

const EMPTY_RESPONSE_TEXT = "OpenCode returned empty response.";
const DEFAULT_OPENCODE_PROMPT_TIMEOUT_POLICY: OpenCodePromptTimeoutPolicy = {
    pollRequestTimeoutMs: 15_000,
    recoveryInactivityTimeoutMs: 120_000,
    waitTimeoutMs: 1_800_000,
};

export interface OpenCodeClientLike {
    readonly client?: OpenCodeSdkClientLike;
    abortSession(sessionId: string): Promise<boolean>;
    deleteSession(sessionId: string): Promise<boolean>;
    forkSession(sessionId: string, messageId?: string): Promise<OpenCodeSession>;
    getHealth(): Promise<OpenCodeHealth>;
    getPath(): Promise<OpenCodePath>;
    listLspStatuses(directory?: string): Promise<OpenCodeLspStatus[] | null>;
    listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>>;
    getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>>;
    getSessionContext(sessionId: string, model?: { providerID: string; id: string }): Promise<OpenCodeContextUsage>;
    listProjects(): Promise<OpenCodeProject[]>;
    listSessions(): Promise<OpenCodeSession[]>;
    getCurrentProject(): Promise<OpenCodeProject>;
    createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession>;
    renameSession(sessionId: string, title: string): Promise<OpenCodeSession>;
    listAgents(): Promise<OpenCodeAgent[]>;
    replyToPermission(
        sessionId: string,
        requestId: string,
        reply: "once" | "always" | "reject",
    ): Promise<boolean>;
    listConfiguredPlugins(): Promise<string[]>;
    listModels(): Promise<OpenCodeConfiguredModel[]>;
    promptSession(input: PromptSessionInput): Promise<PromptSessionResult>;
}

export class OpenCodeClient implements OpenCodeClientLike {
    readonly client: OpenCodeSdkClientLike;
    private promptTimeoutPolicy: OpenCodePromptTimeoutPolicy;
    private modelCache: {
        expiresAt: number;
        promise: Promise<OpenCodeConfiguredModel[]> | null;
        value: OpenCodeConfiguredModel[] | null;
    } = {
        expiresAt: 0,
        promise: null,
        value: null,
    };

    constructor(
        options?: OpenCodeClientOptions,
        client?: OpenCodeSdkClientLike,
        promptTimeoutPolicy: Partial<OpenCodePromptTimeoutPolicy> = {},
    ) {
        if (!options && !client) {
            throw new Error("OpenCodeClient requires either base URL options or an injected SDK client.");
        }

        this.client = client ?? OpenCode.make(buildOpenCodeSdkConfig(options as OpenCodeClientOptions));
        this.promptTimeoutPolicy = resolvePromptTimeoutPolicy(promptTimeoutPolicy);
    }

    configurePromptTimeoutPolicy(promptTimeoutPolicy: Partial<OpenCodePromptTimeoutPolicy>): void {
        this.promptTimeoutPolicy = resolvePromptTimeoutPolicy({
            ...this.promptTimeoutPolicy,
            ...promptTimeoutPolicy,
        });
    }

    async getHealth(): Promise<OpenCodeHealth> {
        const info = await this.client.server.info();

        return { healthy: true, version: info.version };
    }

    async getSessionContext(sessionId: string, selectedModel?: { providerID: string; id: string }): Promise<OpenCodeContextUsage> {
        const options = { signal: AbortSignal.timeout(5_000) };
        const session = await this.client.session.get({ sessionID: sessionId }, options);
        const model = selectedModel ?? session.model ?? (await this.client.model.default(undefined, options)).data;
        const [catalog, agents] = await Promise.all([
            this.client.model.list(undefined, options),
            this.client.agent.list(undefined, options).catch(() => ({ data: [] })),
        ]);
        const selected = catalog.data.find((item) => item.providerID === model?.providerID && item.id === model?.id);
        const capacity = selected?.limit.context;
        const result: OpenCodeContextUsage = {
            capacity: capacity && Number.isFinite(capacity) ? capacity : null,
            used: null,
            session: {
                directory: session.location?.directory ?? null,
                modelName: selected?.name ?? model?.id ?? null,
                providerID: model?.providerID ?? null,
                variant: model && "variant" in model && typeof model.variant === "string" ? model.variant : null,
                agentName: agents.data.find((agent) => agent.id === session.agent)?.name ?? session.agent ?? null,
            },
        };
        let cursor: string | undefined;
        let beforeBoundary = !session.revert;
        do {
            const page = await this.client.message.list({ sessionID: sessionId, limit: 100, ...(cursor ? { cursor } : { order: "desc" as const }) }, options);
            for (const message of page.data) {
                if (!beforeBoundary) {
                    beforeBoundary = message.id === session.revert?.messageID;
                    continue;
                }
                if (message.type === "compaction" && message.status === "completed") {
                    return result;
                }
                if (message.type === "assistant" && message.tokens) {
                    const tokens = message.tokens;
                    const used = tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write;
                    return {
                        ...result,
                        used: Number.isFinite(used) && used >= 0 ? used : null,
                        session: {
                            ...result.session!,
                            agentName: agents.data.find((agent) => agent.id === (session.agent ?? message.agent))?.name
                                ?? session.agent ?? message.agent ?? null,
                        },
                    };
                }
            }
            cursor = page.cursor.next ?? undefined;
        } while (cursor);
        return result;
    }

    async abortSession(sessionId: string): Promise<boolean> {
        const result = await this.client.session.interrupt({ sessionID: sessionId });

        return result.interrupted;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        await this.client.session.remove({ sessionID: sessionId });

        return true;
    }

    async forkSession(sessionId: string, messageId?: string): Promise<OpenCodeSession> {
        return toOpenCodeSession(await this.client.session.fork({
            sessionID: sessionId,
            ...(messageId?.trim() ? { before: messageId.trim() } : {}),
        }));
    }

    async getPath(): Promise<OpenCodePath> {
        const location = await this.client.location.get();

        return { directory: location.directory, worktree: location.project.directory };
    }

    async listLspStatuses(_directory?: string): Promise<OpenCodeLspStatus[] | null> {
        // V2 has no LSP status endpoint; null distinguishes unavailable data from no servers.
        return null;
    }

    async listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>> {
        const result = await this.client.mcp.list(directory ? { location: { directory } } : undefined);

        return Object.fromEntries(result.data.map((server) => [server.name, server.status]));
    }

    async getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>> {
        const active = await this.client.session.active();

        return Object.fromEntries(Object.keys(active).map((sessionId) => [sessionId, { type: "busy" as const }]));
    }

    async listProjects(): Promise<OpenCodeProject[]> {
        return (await this.client.project.list()).map(toOpenCodeProject);
    }

    async listSessions(): Promise<OpenCodeSession[]> {
        const sessions: OpenCodeSession[] = [];
        let cursor: string | undefined;

        do {
            const page = await this.client.session.list({ limit: 100, ...(cursor ? { cursor } : {}) });
            sessions.push(...page.data.map(toOpenCodeSession));
            cursor = page.cursor.next ?? undefined;
        } while (cursor);

        return sessions;
    }

    async getCurrentProject(): Promise<OpenCodeProject> {
        const location = await this.client.location.get();

        return { id: location.project.id, worktree: location.project.directory };
    }

    async createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession> {
        return toOpenCodeSession(await this.client.session.create({
            location: { directory },
            ...(title ? { title } : {}),
        }));
    }

    async renameSession(sessionId: string, title: string): Promise<OpenCodeSession> {
        await this.client.session.update({ sessionID: sessionId, title });

        return toOpenCodeSession(await this.client.session.get({ sessionID: sessionId }));
    }

    async listAgents(): Promise<OpenCodeAgent[]> {
        return (await this.client.agent.list()).data;
    }

    async replyToPermission(
        sessionId: string,
        requestId: string,
        reply: "once" | "always" | "reject",
    ): Promise<boolean> {
        await this.client.permission.reply({ sessionID: sessionId, requestID: requestId, decision: reply });

        return true;
    }

    async listConfiguredPlugins(): Promise<string[]> {
        const plugins = await this.client.plugin.list();

        return [...new Set(plugins.data.flatMap((plugin) => {
            if (plugin.source.type === "package") {
                return [plugin.source.target];
            }

            return plugin.source.type === "local" ? [plugin.source.path] : [];
        }))];
    }

    async listModels(): Promise<OpenCodeConfiguredModel[]> {
        if (this.modelCache.value && this.modelCache.expiresAt > Date.now()) {
            return this.modelCache.value;
        }

        if (!this.modelCache.promise) {
            this.modelCache.promise = this.loadModels().finally(() => {
                this.modelCache.promise = null;
            });
        }

        return this.modelCache.promise;
    }

    async promptSession(input: PromptSessionInput): Promise<PromptSessionResult> {
        const startedAt = Date.now();
        const deadlineAt = startedAt + this.promptTimeoutPolicy.waitTimeoutMs;
        const text = input.prompt?.trim() ?? "";
        const files = input.files ?? [];

        if (!text && files.length === 0) {
            throw new Error("Prompt requires text or file attachments.");
        }

        throwIfAborted(input.signal);
        const messageId = `msg_${randomUUID()}`;
        input.onInputReady?.(messageId);
        const request = {
            sessionID: input.sessionId,
            id: messageId,
            text,
            ...(files.length > 0 ? {
                files: files.map((file) => ({
                    uri: file.url,
                    ...(file.filename ? { name: file.filename } : {}),
                })),
            } : {}),
        };

        await this.runPromptRequestWithTimeout(
            { sessionId: input.sessionId, stage: "send-prompt", timeoutMs: deadlineAt - Date.now() },
            async (signal) => {
                if (input.agent) {
                    const agents = await this.client.agent.list(undefined, { signal });
                    const agent = agents.data.find((candidate) => candidate.name === input.agent || candidate.id === input.agent);
                    await this.client.session.switchAgent({
                        sessionID: input.sessionId,
                        agent: agent?.id ?? input.agent,
                    }, { signal });
                }

                if (input.model) {
                    await this.client.session.switchModel({
                        sessionID: input.sessionId,
                        model: {
                            id: input.model.modelID,
                            providerID: input.model.providerID,
                            ...(input.variant ? { variant: input.variant } : {}),
                        },
                    }, { signal });
                }

                await this.client.session.prompt(request, { signal });
            },
            input.signal,
        );

        let turn: OpenCodePromptTurn;

        try {
            await this.runPromptRequestWithTimeout(
                { sessionId: input.sessionId, stage: "wait-session", timeoutMs: deadlineAt - Date.now() },
                (signal) => this.client.session.wait({ sessionID: input.sessionId }, { signal }),
                input.signal,
            );
            turn = await this.loadPromptMessages(input, messageId, deadlineAt);
        } catch (error) {
            throwIfAborted(input.signal);

            if (!(error instanceof ClientError) || error.reason !== "Transport") {
                throw error;
            }

            turn = await this.recoverPromptWait(input, messageId, deadlineAt);
        }

        if (turn.idle?.outcome === "interrupted") {
            throw createMessageAbortedError();
        }

        const response = selectAssistantResponse(turn.assistants);

        if (turn.idle?.outcome === "failed") {
            if (!turn.idle.error) {
                throw new Error("OpenCode session execution failed.");
            }

            if (!response) {
                throw Object.assign(new Error(turn.idle.error.message), {
                    ...turn.idle.error,
                    name: turn.idle.error.type,
                    data: { message: turn.idle.error.message },
                });
            }
        }

        if (!response) {
            throw createMessageAbortedError();
        }

        return buildPromptSessionResult(
            turn.idle?.error ? { ...response, error: turn.idle.error } : response,
            input.sessionId,
            startedAt,
            Date.now(),
        );
    }

    private async loadModels(): Promise<OpenCodeConfiguredModel[]> {
        const [models, providers] = await Promise.all([
            this.client.model.list(),
            this.client.provider.list(),
        ]);
        const providerNames = new Map(providers.data.map((provider) => [provider.id, provider.name]));
        const value = models.data
            .filter((model) => model.enabled && model.capabilities.input.includes("text") && model.capabilities.output.includes("text"))
            .map((model) => ({
                id: model.id,
                providerID: model.providerID,
                providerName: providerNames.get(model.providerID) ?? model.providerID,
                name: model.name,
                qualifiedId: `${model.providerID}/${model.id}`,
                reasoning: model.capabilities.output.includes("reasoning"),
                variants: Object.fromEntries(model.variants.map(({ id, ...variant }) => [id, variant])),
            }));

        this.modelCache.value = value;
        this.modelCache.expiresAt = Date.now() + 60_000;

        return value;
    }

    private async loadPromptMessages(
        input: PromptSessionInput,
        messageId: string,
        deadlineAt: number,
    ): Promise<OpenCodePromptTurn> {
        let cursor: string | undefined;
        let assistants: SessionMessageAssistant[] = [];
        let idle: SessionMessageIdle | null = null;
        let followingUserSeen = false;

        do {
            const page = await this.runPromptRequestWithTimeout(
                {
                    sessionId: input.sessionId,
                    messageId,
                    stage: "poll-messages",
                    timeoutMs: Math.min(this.promptTimeoutPolicy.pollRequestTimeoutMs, deadlineAt - Date.now()),
                },
                (signal) => this.client.message.list({
                    sessionID: input.sessionId,
                    limit: 100,
                    ...(cursor ? { cursor } : { order: "desc" as const }),
                }, { signal }),
                input.signal,
            );

            for (const message of page.data) {
                if (message.id === messageId) {
                    return { assistants, idle };
                }

                if (message.type === "idle") {
                    assistants = [];
                    idle = message;
                    followingUserSeen = false;
                } else if (message.type === "user") {
                    followingUserSeen = true;
                } else if (message.type === "assistant") {
                    // shortcut: V2 has no reply parent ID, replace this boundary inference when the API adds one.
                    if (followingUserSeen && isTerminalAssistantResponse(message)) {
                        assistants = [];
                        idle = null;
                        followingUserSeen = false;
                    }

                    assistants.push(message);
                }
            }

            cursor = page.cursor.next ?? undefined;
        } while (cursor);

        return { assistants: [], idle: null };
    }

    private async recoverPromptWait(
        input: PromptSessionInput,
        messageId: string,
        deadlineAt: number,
    ): Promise<OpenCodePromptTurn> {
        const startedAt = Date.now();
        let lastProgressAt = startedAt;
        let lastProgress = "";

        while (Date.now() < deadlineAt) {
            throwIfAborted(input.signal);

            try {
                const turn = await this.loadPromptMessages(input, messageId, deadlineAt);
                const progress = JSON.stringify(turn);

                if (progress !== lastProgress) {
                    lastProgress = progress;
                    lastProgressAt = Date.now();
                }

                const active = await this.runPromptRequestWithTimeout(
                    {
                        sessionId: input.sessionId,
                        stage: "poll-status",
                        timeoutMs: Math.min(this.promptTimeoutPolicy.pollRequestTimeoutMs, deadlineAt - Date.now()),
                    },
                    (signal) => this.client.session.active({ signal }),
                    input.signal,
                );

                if (!active[input.sessionId]) {
                    return turn;
                }
            } catch (error) {
                throwIfAborted(input.signal);

                if (!(error instanceof ClientError) || error.reason !== "Transport") {
                    throw error;
                }
            }

            const remainingInactivityMs = this.promptTimeoutPolicy.recoveryInactivityTimeoutMs - (Date.now() - lastProgressAt);

            if (remainingInactivityMs <= 0) {
                break;
            }

            await delay(Math.min(1_000, deadlineAt - Date.now(), remainingInactivityMs), input.signal);
        }

        throw new OpenCodePromptTimeoutError({
            sessionId: input.sessionId,
            messageId,
            stage: "wait-session",
            elapsedMs: Date.now() - startedAt,
            timeoutMs: Math.min(this.promptTimeoutPolicy.recoveryInactivityTimeoutMs, deadlineAt - startedAt),
        });
    }

    private async runPromptRequestWithTimeout<T>(
        input: {
            messageId?: string | null;
            sessionId: string;
            stage: OpenCodePromptTimeoutStage;
            timeoutMs: number;
        },
        operation: (signal: AbortSignal) => Promise<T>,
        signal?: AbortSignal,
    ): Promise<T> {
        throwIfAborted(signal);

        if (input.timeoutMs <= 0) {
            throw createOpenCodePromptTimeoutError({
                ...input,
                elapsedMs: 0,
                messageId: input.messageId ?? undefined,
                timeoutMs: 0,
            });
        }

        const startedAt = Date.now();
        const controller = new AbortController();
        const requestSignal = signal
            ? AbortSignal.any([signal, controller.signal])
            : controller.signal;
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        let removeAbortListener = () => undefined;

        const abortPromise = signal
            ? new Promise<never>((_, reject) => {
                const onAbort = () => {
                    reject(normalizeAbortReason(signal.reason));
                };

                if (signal.aborted) {
                    onAbort();
                    return;
                }

                signal.addEventListener("abort", onAbort, { once: true });
                removeAbortListener = () => {
                    signal.removeEventListener("abort", onAbort);
                };
            })
            : null;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                reject(createOpenCodePromptTimeoutError({
                    sessionId: input.sessionId,
                    stage: input.stage,
                    timeoutMs: input.timeoutMs,
                    messageId: input.messageId ?? undefined,
                    elapsedMs: Date.now() - startedAt,
                }));
                controller.abort();
            }, input.timeoutMs);
        });

        try {
            return await Promise.race([
                operation(requestSignal),
                timeoutPromise,
                ...(abortPromise ? [abortPromise] : []),
            ]);
        } finally {
            if (timeoutHandle !== null) {
                clearTimeout(timeoutHandle);
            }

            removeAbortListener();
        }
    }
}

export function createOpenCodeClientFromSdkClient(
    client: OpenCodeSdkClientLike,
    promptTimeoutPolicy: Partial<OpenCodePromptTimeoutPolicy> = {},
): OpenCodeClientLike {
    return new OpenCodeClient(undefined, client, promptTimeoutPolicy);
}

function toOpenCodeSession(session: SessionInfo): OpenCodeSession {
    return { ...session, directory: session.location.directory, title: session.title ?? "" };
}

function toOpenCodeProject(project: Project): OpenCodeProject {
    return { ...project, worktree: project.canonical };
}

function isTerminalAssistantResponse(message: SessionMessageAssistant): boolean {
    return !message.error
        && message.time.completed !== undefined
        && message.finish !== "error"
        && message.finish !== "tool-calls"
        && message.finish !== "length"
        && !message.content.some((part) => part.type === "tool" && part.executed !== true);
}

function selectAssistantResponse(messages: SessionMessageAssistant[]): SessionMessageAssistant | null {
    return messages.find((message) => message.error || isTerminalAssistantResponse(message))
        ?? messages.find((message) => extractTextFromParts(message.content))
        ?? messages[0]
        ?? null;
}

function extractTextFromParts(parts: Part[]): string {
    return parts
        .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
}

function buildPromptSessionResult(
    message: SessionMessageAssistant,
    sessionId: string,
    startedAt: number,
    finishedAt: number,
): PromptSessionResult {
    const error = message.error ? {
        name: message.error.type,
        data: { message: message.error.message },
        ...message.error,
    } : undefined;
    const info: OpenCodeAssistantMessage = {
        id: message.id,
        role: "assistant",
        sessionID: sessionId,
        agent: message.agent,
        modelID: message.model.id,
        providerID: message.model.providerID,
        ...(message.model.variant ? { variant: message.model.variant } : {}),
        time: message.time,
        tokens: message.tokens,
        cost: message.cost,
        finish: message.finish,
        ...(error ? { error } : {}),
    };
    const bodyMd = extractTextFromParts(message.content) || null;

    return {
        assistantError: error ?? null,
        bodyMd,
        fallbackText: bodyMd ? stripMarkdownToPlainText(bodyMd) || bodyMd : EMPTY_RESPONSE_TEXT,
        info,
        metrics: extractPromptMetrics(info, startedAt, finishedAt),
        parts: message.content,
        structured: null,
    };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const handle = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(handle);
            signal?.removeEventListener("abort", onAbort);
            reject(normalizeAbortReason(signal?.reason));
        };

        if (signal?.aborted) {
            onAbort();
            return;
        }

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

function createOpenCodePromptTimeoutError(
    input: Omit<OpenCodePromptTimeoutErrorData, "elapsedMs" | "message"> & {
        elapsedMs?: number;
        message?: string;
    },
): OpenCodePromptTimeoutError {
    return new OpenCodePromptTimeoutError({
        ...input,
        elapsedMs: input.elapsedMs ?? input.timeoutMs,
        message: input.message ?? "The OpenCode host did not finish this request in time.",
    });
}

function extractPromptMetrics(
    info: OpenCodeAssistantMessage | null | undefined,
    startedAt: number,
    finishedAt: number,
): PromptSessionMetrics {
    const createdAt = typeof info?.time?.created === "number" && Number.isFinite(info.time.created)
        ? info.time.created
        : null;
    const completedAt = typeof info?.time?.completed === "number" && Number.isFinite(info.time.completed)
        ? info.time.completed
        : null;
    const completedDuration = createdAt !== null && completedAt !== null
        ? completedAt - createdAt
        : null;
    const durationMs = completedDuration !== null && completedDuration >= 0
        ? completedDuration
        : Math.max(0, finishedAt - startedAt);

    return {
        durationMs,
        tokens: extractTokenMetrics(info),
    };
}

function extractTokenMetrics(info: OpenCodeAssistantMessage | null | undefined): PromptSessionTokenMetrics {
    if (!info?.tokens) {
        return {
            total: null,
            input: null,
            output: null,
            reasoning: null,
            cacheRead: null,
            cacheWrite: null,
        };
    }

    const input = coerceFiniteNumber(info.tokens.input);
    const output = coerceFiniteNumber(info.tokens.output);
    const reasoning = coerceFiniteNumber(info.tokens.reasoning);
    const cacheRead = coerceFiniteNumber(info.tokens.cache?.read);
    const cacheWrite = coerceFiniteNumber(info.tokens.cache?.write);
    const total = coerceFiniteNumber(info.tokens.total);
    const fallbackTotal = sumTokenMetrics(input, output, cacheRead, cacheWrite);

    return {
        total: total ?? fallbackTotal,
        input,
        output,
        reasoning,
        cacheRead,
        cacheWrite,
    };
}

function coerceFiniteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumTokenMetrics(...values: Array<number | null>): number | null {
    if (values.every((value) => value === null)) {
        return null;
    }

    const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

    return Number.isFinite(total) ? total : null;
}

function resolvePromptTimeoutPolicy(
    input: Partial<OpenCodePromptTimeoutPolicy>,
): OpenCodePromptTimeoutPolicy {
    return {
        pollRequestTimeoutMs: input.pollRequestTimeoutMs ?? DEFAULT_OPENCODE_PROMPT_TIMEOUT_POLICY.pollRequestTimeoutMs,
        recoveryInactivityTimeoutMs: input.recoveryInactivityTimeoutMs ?? DEFAULT_OPENCODE_PROMPT_TIMEOUT_POLICY.recoveryInactivityTimeoutMs,
        waitTimeoutMs: input.waitTimeoutMs ?? DEFAULT_OPENCODE_PROMPT_TIMEOUT_POLICY.waitTimeoutMs,
    };
}

function isNamedAbortError(error: unknown): error is { name: "MessageAbortedError" } {
    return !!error
        && typeof error === "object"
        && "name" in error
        && (error as { name?: unknown }).name === "MessageAbortedError";
}

function normalizeAbortReason(reason: unknown): unknown {
    if (reason instanceof Error || isNamedAbortError(reason)) {
        return reason;
    }

    return createMessageAbortedError();
}

function throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
        return;
    }

    throw normalizeAbortReason(signal.reason);
}
