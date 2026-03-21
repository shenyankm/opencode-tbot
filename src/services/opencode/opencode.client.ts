import {
    type Agent,
    createOpencodeClient,
    type Config,
    type LspStatus,
    type McpStatus,
    type Model,
    type OpencodeClient,
    type Part,
    type PermissionRequest,
    type Path,
    type Provider,
    type Project,
    type Session,
    type SessionStatus,
} from "@opencode-ai/sdk/v2/client";
import { z } from "zod";

export interface OpenCodeClientOptions {
    baseUrl: string;
    apiKey?: string;
}

export interface OpenCodePromptTimeoutPolicy {
    pollRequestTimeoutMs: number;
    recoveryInactivityTimeoutMs: number;
    waitTimeoutMs: number;
}

export function buildOpenCodeSdkConfig(options: OpenCodeClientOptions) {
    const apiKey = options.apiKey?.trim();

    return {
        baseUrl: options.baseUrl,
        ...(apiKey ? { auth: apiKey } : {}),
    };
}

export interface PromptSessionInput {
    sessionId: string;
    prompt?: string | null;
    agent?: string | null;
    structured?: boolean;
    model?: {
        providerID: string;
        modelID: string;
    };
    variant?: string | null;
    files?: PromptSessionFilePartInput[];
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

export interface PromptSessionResult {
    assistantError: OpenCodeAssistantError | null;
    bodyMd: string | null;
    fallbackText: string;
    info: OpenCodeAssistantMessage | null;
    metrics: PromptSessionMetrics;
    parts: Part[];
    structured: unknown;
}

export type OpenCodeProject = Project;
export type OpenCodeSession = Session;
export type OpenCodeModel = Model;
export type OpenCodeProvider = Provider;
export type OpenCodeConfig = Config;
export type OpenCodeAgent = Agent;
export type OpenCodeLspStatus = LspStatus;
export type OpenCodePath = Path;
export type OpenCodeMcpStatus = McpStatus;
export type OpenCodeSessionStatus = SessionStatus;
export type OpenCodePermissionRequest = PermissionRequest;
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

type RawSdkRequestOptions = {
    body?: unknown;
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
    responseStyle?: "data" | "fields";
    signal?: AbortSignal;
    throwOnError?: boolean;
    url: string;
};

type RawSdkHttpClient = {
    delete?(options: RawSdkRequestOptions): Promise<unknown>;
    get?(options: RawSdkRequestOptions): Promise<unknown>;
    patch?(options: RawSdkRequestOptions): Promise<unknown>;
    post?(options: RawSdkRequestOptions): Promise<unknown>;
};

export type OpenCodeSdkClientLike = Pick<OpencodeClient, "app" | "config" | "global" | "lsp" | "mcp" | "path" | "permission" | "project" | "session"> & {
    _client?: RawSdkHttpClient;
};
type MaybeWrappedResponse<T> = T | { data: T };
type OpenCodeProviderCatalog = {
    providers: OpenCodeProvider[];
    default: Record<string, string>;
};
type OpenCodeProviderAvailability = Map<string, Set<string> | null>;
type OpenCodeProviderConfig = NonNullable<OpenCodeConfig["provider"]>[string];
type OpenCodeModelConfig = NonNullable<OpenCodeProviderConfig["models"]>[string];
type OpenCodePromptResponse = {
    info: unknown;
    parts?: Part[] | null;
};
type SdkFlavor = "legacy" | "v2";

export type OpenCodePromptTimeoutStage =
    | "capture-known-messages"
    | "send-prompt"
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
    structured?: unknown;
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
const PROMPT_MESSAGE_POLL_INITIAL_DELAYS_MS = [0, 100, 250, 500, 1000];
const PROMPT_MESSAGE_POLL_INTERVAL_MS = 2000;
const PROMPT_MESSAGE_POLL_LIMIT = 20;
const PROMPT_LOG_SERVICE = "opencode-tbot";
const DEFAULT_OPENCODE_PROMPT_TIMEOUT_POLICY: OpenCodePromptTimeoutPolicy = {
    pollRequestTimeoutMs: 15_000,
    recoveryInactivityTimeoutMs: 120_000,
    waitTimeoutMs: 1_800_000,
};
const STRUCTURED_REPLY_SCHEMA = {
    type: "json_schema" as const,
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
};
const SDK_OPTIONS = {
    responseStyle: "data" as const,
    throwOnError: true as const,
};
const StructuredReplySchema = z.object({
    body_md: z.string(),
});

export interface OpenCodeClientLike {
    readonly client?: OpenCodeSdkClientLike;
    abortSession(sessionId: string): Promise<boolean>;
    deleteSession(sessionId: string): Promise<boolean>;
    forkSession(sessionId: string, messageId?: string): Promise<OpenCodeSession>;
    getHealth(): Promise<OpenCodeHealth>;
    getPath(): Promise<OpenCodePath>;
    listLspStatuses(directory?: string): Promise<OpenCodeLspStatus[]>;
    listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>>;
    getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>>;
    listProjects(): Promise<OpenCodeProject[]>;
    listSessions(): Promise<OpenCodeSession[]>;
    getCurrentProject(): Promise<OpenCodeProject>;
    createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession>;
    renameSession(sessionId: string, title: string): Promise<OpenCodeSession>;
    listAgents(): Promise<OpenCodeAgent[]>;
    listPendingPermissions(directory?: string): Promise<OpenCodePermissionRequest[]>;
    replyToPermission(
        requestId: string,
        reply: "once" | "always" | "reject",
        message?: string,
        sessionId?: string,
    ): Promise<boolean>;
    listModels(): Promise<OpenCodeConfiguredModel[]>;
    promptSession(input: PromptSessionInput): Promise<PromptSessionResult>;
}

export class OpenCodeClient implements OpenCodeClientLike {
    readonly client: OpenCodeSdkClientLike;
    private readonly fetchFn: typeof fetch;
    private readonly sdkFlavor: SdkFlavor;
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
        fetchFn: typeof fetch = fetch,
        promptTimeoutPolicy: Partial<OpenCodePromptTimeoutPolicy> = {},
    ) {
        if (!options && !client) {
            throw new Error("OpenCodeClient requires either base URL options or an injected SDK client.");
        }

        this.client = client ?? createOpencodeClient(buildOpenCodeSdkConfig(options as OpenCodeClientOptions));
        this.fetchFn = fetchFn;
        this.sdkFlavor = detectSdkFlavor(this.client);
        this.promptTimeoutPolicy = resolvePromptTimeoutPolicy(promptTimeoutPolicy);
    }

    configurePromptTimeoutPolicy(
        promptTimeoutPolicy: Partial<OpenCodePromptTimeoutPolicy>,
    ): void {
        this.promptTimeoutPolicy = resolvePromptTimeoutPolicy({
            ...this.promptTimeoutPolicy,
            ...promptTimeoutPolicy,
        });
    }

    private async callScopedSdkMethod<T>(
        scope: "app" | "config" | "global" | "lsp" | "mcp" | "path" | "permission" | "project" | "session",
        method: string,
        input: {
            legacyOptions?: Record<string, unknown>;
            signal?: AbortSignal;
            v2Parameters?: unknown;
        },
    ): Promise<T> {
        const target = this.client[scope] as unknown as Record<string, unknown> | undefined;
        const handler = target?.[method];

        if (typeof handler !== "function") {
            throw new Error(`OpenCode SDK client does not expose a compatible ${scope}.${method} method.`);
        }

        if (this.sdkFlavor === "legacy") {
            const response = await (handler as (options: Record<string, unknown>) => Promise<MaybeWrappedResponse<T>>).call(
                target,
                {
                    ...SDK_OPTIONS,
                    ...(input.signal ? { signal: input.signal } : {}),
                    ...(input.legacyOptions ?? {}),
                },
            );

            return unwrapSdkData(response);
        }

        const response = await (handler as (parameters: unknown, options: Record<string, unknown>) => Promise<MaybeWrappedResponse<T>>).call(
            target,
            input.v2Parameters,
            {
                ...SDK_OPTIONS,
                ...(input.signal ? { signal: input.signal } : {}),
            },
        );

        return unwrapSdkData(response);
    }

    async getHealth(): Promise<OpenCodeHealth> {
        const rawClient = getRawSdkClient(this.client);

        if (rawClient?.get) {
            const response = await this.requestRaw<OpenCodeHealth>(
                "get",
                { url: "/global/health" },
            );

            return response;
        }

        const healthEndpoint = this.client.global?.health;

        if (typeof healthEndpoint === "function") {
            const response = await healthEndpoint.call(
                this.client.global,
                SDK_OPTIONS,
            ) as MaybeWrappedResponse<OpenCodeHealth>;

            return unwrapSdkData(response);
        }

        if (!rawClient?.get) {
            throw new Error("OpenCode SDK client does not expose a compatible health endpoint.");
        }

        return this.requestRaw<OpenCodeHealth>(
            "get",
            { url: "/global/health" },
        );
    }

    async abortSession(sessionId: string): Promise<boolean> {
        if (hasRawSdkMethod(this.client, "post")) {
            return this.requestRaw<boolean>(
                "post",
                buildRawSessionRequest(this.sdkFlavor, sessionId, "/abort"),
            );
        }

        return this.callScopedSdkMethod<boolean>("session", "abort", {
            legacyOptions: {
                path: {
                    id: sessionId,
                },
            },
            v2Parameters: {
                sessionID: sessionId,
            },
        });
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        if (hasRawSdkMethod(this.client, "delete")) {
            return this.requestRaw<boolean>(
                "delete",
                buildRawSessionRequest(this.sdkFlavor, sessionId),
            );
        }

        return this.callScopedSdkMethod<boolean>("session", "delete", {
            legacyOptions: {
                path: {
                    id: sessionId,
                },
            },
            v2Parameters: {
                sessionID: sessionId,
            },
        });
    }

    async forkSession(sessionId: string, messageId?: string): Promise<OpenCodeSession> {
        if (hasRawSdkMethod(this.client, "post")) {
            return this.requestRaw<OpenCodeSession>(
                "post",
                buildRawSessionRequest(
                    this.sdkFlavor,
                    sessionId,
                    "/fork",
                    messageId?.trim()
                        ? {
                            body: {
                                messageID: messageId.trim(),
                            },
                        }
                        : {},
                ),
            );
        }

        return this.callScopedSdkMethod<OpenCodeSession>("session", "fork", {
            legacyOptions: {
                path: {
                    id: sessionId,
                },
                ...(messageId?.trim()
                    ? {
                        body: {
                            messageID: messageId.trim(),
                        },
                    }
                    : {}),
            },
            v2Parameters: {
                sessionID: sessionId,
                ...(messageId?.trim()
                    ? { messageID: messageId.trim() }
                    : {}),
            },
        });
    }

    async getPath(): Promise<OpenCodePath> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodePath>(
                "get",
                { url: "/path" },
            );
        }

        return this.callScopedSdkMethod<OpenCodePath>("path", "get", {});
    }

    async listLspStatuses(directory?: string): Promise<OpenCodeLspStatus[]> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodeLspStatus[]>(
                "get",
                {
                    url: "/lsp",
                    ...(directory ? { query: { directory } } : {}),
                },
            );
        }

        return this.callScopedSdkMethod<OpenCodeLspStatus[]>("lsp", "status", {
            legacyOptions: directory
                ? {
                    query: {
                        directory,
                    },
                }
                : undefined,
            v2Parameters: directory
                ? { directory }
                : undefined,
        });
    }

    async listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<Record<string, OpenCodeMcpStatus>>(
                "get",
                {
                    url: "/mcp",
                    ...(directory ? { query: { directory } } : {}),
                },
            );
        }

        return this.callScopedSdkMethod<Record<string, OpenCodeMcpStatus>>("mcp", "status", {
            legacyOptions: directory
                ? {
                    query: {
                        directory,
                    },
                }
                : undefined,
            v2Parameters: directory
                ? { directory }
                : undefined,
        });
    }

    async getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>> {
        return this.loadSessionStatuses();
    }

    async listProjects(): Promise<OpenCodeProject[]> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodeProject[]>(
                "get",
                { url: "/project" },
            );
        }

        return this.callScopedSdkMethod<OpenCodeProject[]>("project", "list", {});
    }

    async listSessions(): Promise<OpenCodeSession[]> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodeSession[]>(
                "get",
                { url: "/session" },
            );
        }

        return this.callScopedSdkMethod<OpenCodeSession[]>("session", "list", {});
    }

    async getCurrentProject(): Promise<OpenCodeProject> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodeProject>(
                "get",
                { url: "/project/current" },
            );
        }

        return this.callScopedSdkMethod<OpenCodeProject>("project", "current", {});
    }

    async createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession> {
        if (hasRawSdkMethod(this.client, "post")) {
            return this.requestRaw<OpenCodeSession>(
                "post",
                {
                    url: "/session",
                    query: { directory },
                    ...(title
                        ? {
                            body: {
                                title,
                            },
                        }
                        : {}),
                },
            );
        }

        return this.callScopedSdkMethod<OpenCodeSession>("session", "create", {
            legacyOptions: {
                query: {
                    directory,
                },
                ...(title
                    ? {
                        body: {
                            title,
                        },
                    }
                    : {}),
            },
            v2Parameters: title ? { directory, title } : { directory },
        });
    }

    async renameSession(sessionId: string, title: string): Promise<OpenCodeSession> {
        if (hasRawSdkMethod(this.client, "patch")) {
            return this.requestRaw<OpenCodeSession>(
                "patch",
                buildRawSessionRequest(this.sdkFlavor, sessionId, "", {
                    body: {
                        title,
                    },
                }),
            );
        }

        return this.callScopedSdkMethod<OpenCodeSession>("session", "update", {
            legacyOptions: {
                path: {
                    id: sessionId,
                },
                body: {
                    title,
                },
            },
            v2Parameters: {
                sessionID: sessionId,
                title,
            },
        });
    }

    async listAgents(): Promise<OpenCodeAgent[]> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodeAgent[]>(
                "get",
                { url: "/agent" },
            );
        }

        return this.callScopedSdkMethod<OpenCodeAgent[]>("app", "agents", {});
    }

    async listPendingPermissions(directory?: string): Promise<OpenCodePermissionRequest[]> {
        if (this.sdkFlavor === "v2" && hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodePermissionRequest[]>(
                "get",
                {
                    url: "/permission",
                    ...(directory ? { query: { directory } } : {}),
                },
            );
        }

        return this.callScopedSdkMethod<OpenCodePermissionRequest[]>("permission", "list", {
            legacyOptions: directory
                ? {
                    query: {
                        directory,
                    },
                }
                : undefined,
            v2Parameters: directory
                ? { directory }
                : undefined,
        });
    }

    async replyToPermission(
        requestId: string,
        reply: "once" | "always" | "reject",
        message?: string,
        sessionId?: string,
    ): Promise<boolean> {
        if (this.sdkFlavor === "legacy" && sessionId) {
            if (hasRawSdkMethod(this.client, "post")) {
                return this.requestRaw<boolean>(
                    "post",
                    buildRawLegacyPermissionReplyRequest(sessionId, requestId, reply),
                );
            }

            const legacyClient = this.client as OpenCodeSdkClientLike & {
                postSessionIdPermissionsPermissionId?: (options: Record<string, unknown>) => Promise<MaybeWrappedResponse<boolean>>;
            };

            if (typeof legacyClient.postSessionIdPermissionsPermissionId === "function") {
                const response = await legacyClient.postSessionIdPermissionsPermissionId({
                    ...SDK_OPTIONS,
                    body: {
                        response: reply,
                    },
                    path: {
                        id: sessionId,
                        permissionID: requestId,
                    },
                });

                return unwrapSdkData(response);
            }
        }

        if (hasRawSdkMethod(this.client, "post")) {
            return this.requestRaw<boolean>(
                "post",
                {
                    url: "/permission/{requestID}/reply",
                    path: {
                        requestID: requestId,
                    },
                    body: {
                        reply,
                        ...(message?.trim()
                            ? { message: message.trim() }
                            : {}),
                    },
                },
            );
        }

        return this.callScopedSdkMethod<boolean>("permission", "reply", {
            legacyOptions: sessionId
                ? {
                    body: {
                        response: reply,
                    },
                    path: {
                        id: sessionId,
                        permissionID: requestId,
                    },
                }
                : undefined,
            v2Parameters: {
                requestID: requestId,
                reply,
                ...(message?.trim()
                    ? { message: message.trim() }
                    : {}),
            },
        });
    }

    async listModels(): Promise<OpenCodeConfiguredModel[]> {
        const now = Date.now();

        if (this.modelCache.value && this.modelCache.expiresAt > now) {
            return this.modelCache.value;
        }

        if (this.modelCache.promise) {
            return this.modelCache.promise;
        }

        const refreshPromise = this.loadModels().finally(() => {
            if (this.modelCache.promise === refreshPromise) {
                this.modelCache.promise = null;
            }
        });

        this.modelCache.promise = refreshPromise;

        return refreshPromise;
    }

    async promptSession(input: PromptSessionInput): Promise<PromptSessionResult> {
        const startedAt = Date.now();
        const promptText = input.prompt?.trim() ?? "";
        const parts = [
            ...(promptText
                ? [{
                    type: "text" as const,
                    text: promptText,
                }]
                : []),
            ...((input.files ?? []).map((file) => ({
                type: "file" as const,
                filename: file.filename,
                mime: file.mime,
                url: file.url,
            }))),
        ];

        if (parts.length === 0) {
            throw new Error("Prompt requires text or file attachments.");
        }

        const knownMessageIds = await this.captureKnownMessageIds(input.sessionId);
        const initialData = await this.sendPromptRequest(input, parts);
        const resolvedData = await this.resolvePromptResponse(
            input,
            initialData,
            knownMessageIds,
            startedAt,
        );
        const finishedAt = Date.now();

        return buildPromptSessionResult(resolvedData, {
            emptyResponseText: EMPTY_RESPONSE_TEXT,
            finishedAt,
            startedAt,
            structured: input.structured ?? false,
        });
    }

    private async resolvePromptResponse(
        input: PromptSessionInput,
        data: OpenCodePromptResponse | null,
        knownMessageIds: Set<string>,
        startedAt: number,
    ): Promise<OpenCodePromptResponse> {
        const structured = input.structured ?? false;

        if (data && shouldReturnPromptResponseImmediately(data, structured)) {
            return data;
        }

        const messageId = data ? extractMessageId(data.info) : null;
        const candidateOptions: PromptResponseCandidateOptions = {
            initialMessageId: messageId,
            initialParentId: data ? toAssistantMessage(data.info)?.parentID ?? null : null,
            knownMessageIds,
            requestStartedAt: resolvePromptCandidateStartTime(startedAt, data),
            structured,
        };
        let bestCandidate = selectPromptResponseCandidate(
            data ? [data] : [],
            candidateOptions,
        );
        let lastProgressAt = Date.now();
        const deadlineAt = startedAt + this.promptTimeoutPolicy.waitTimeoutMs;
        let idleStatusSeen = false;
        let attempt = 0;

        while (true) {
            const remainingWaitMs = deadlineAt - Date.now();
            const remainingInactivityMs = this.promptTimeoutPolicy.recoveryInactivityTimeoutMs - (Date.now() - lastProgressAt);

            if (remainingWaitMs <= 0 || remainingInactivityMs <= 0) {
                break;
            }

            const delayMs = getPromptMessagePollDelayMs(attempt);
            attempt += 1;

            if (delayMs > 0) {
                const remainingMs = Math.min(remainingWaitMs, remainingInactivityMs);

                if (remainingMs <= 0) {
                    break;
                }

                await delay(Math.min(delayMs, remainingMs));
            }

            if (messageId) {
                const next = await this.fetchPromptMessage(input.sessionId, messageId);

                if (next) {
                    const nextCandidate = selectPromptResponseCandidate(
                        [bestCandidate, next],
                        candidateOptions,
                    );

                    if (nextCandidate) {
                        if (didPromptResponseAdvance(bestCandidate, nextCandidate, structured)) {
                            lastProgressAt = Date.now();
                            idleStatusSeen = false;
                        }

                        bestCandidate = nextCandidate;
                    }

                    if (bestCandidate && shouldReturnPromptResponseImmediately(bestCandidate, structured)) {
                        return bestCandidate;
                    }
                }
            }

            const latest = await this.findLatestPromptResponse(
                input.sessionId,
                candidateOptions,
                "poll-messages",
            );

            if (latest) {
                const nextCandidate = selectPromptResponseCandidate(
                    [bestCandidate, latest],
                    candidateOptions,
                );

                if (nextCandidate) {
                    if (didPromptResponseAdvance(bestCandidate, nextCandidate, structured)) {
                        lastProgressAt = Date.now();
                        idleStatusSeen = false;
                    }

                    bestCandidate = nextCandidate;
                }

                if (bestCandidate && shouldReturnPromptResponseImmediately(bestCandidate, structured)) {
                    return bestCandidate;
                }
            }

            const status = await this.fetchPromptSessionStatus(input.sessionId);

            if (status?.type === "busy" || status?.type === "retry") {
                lastProgressAt = Date.now();
                idleStatusSeen = false;
            } else if (status?.type === "idle") {
                if (idleStatusSeen) {
                    break;
                }

                idleStatusSeen = true;
            }

            if (
                bestCandidate
                && isCompletedEmptyPromptResponse(bestCandidate, structured)
                && status?.type !== "busy"
                && status?.type !== "retry"
            ) {
                break;
            }

            if (Date.now() >= deadlineAt) {
                break;
            }
        }

        const latest = await this.findLatestPromptResponse(
            input.sessionId,
            candidateOptions,
            "final-scan",
        );

        const resolved = selectPromptResponseCandidate(
            [bestCandidate, latest],
            candidateOptions,
        );

        if (!resolved || shouldPollPromptMessage(resolved, structured)) {
            const timeoutReason = Date.now() >= deadlineAt
                ? "max-wait"
                : "recovery-inactivity";
            const timeoutMs = timeoutReason === "max-wait"
                ? this.promptTimeoutPolicy.waitTimeoutMs
                : this.promptTimeoutPolicy.recoveryInactivityTimeoutMs;
            const error = createOpenCodePromptTimeoutError({
                sessionId: input.sessionId,
                stage: "final-scan",
                timeoutMs,
                messageId: messageId ?? undefined,
            });
            this.logPromptRequest("warn", {
                lastProgressAt,
                messageId: messageId ?? undefined,
                sdkFlavor: this.sdkFlavor,
                sessionId: input.sessionId,
                stage: "final-scan",
                timeoutMs,
                timeoutReason,
            }, "OpenCode prompt recovery timed out");
            throw error;
        }

        return resolved;
    }

    private async fetchPromptMessage(
        sessionId: string,
        messageId: string,
    ): Promise<OpenCodePromptResponse | null> {
        try {
            return await this.runPromptRequestWithTimeout(
                {
                    sessionId,
                    stage: "poll-message",
                    timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
                    messageId,
                },
                async (signal) => {
                    if (hasRawSdkMethod(this.client, "get")) {
                        return normalizePromptResponse(await this.requestRaw<OpenCodePromptResponse>(
                            "get",
                            buildRawSessionMessageRequest(this.sdkFlavor, sessionId, messageId, { signal }),
                        ));
                    }

                    if (typeof this.client.session.message !== "function") {
                        return null;
                    }

                    return normalizePromptResponse(await this.callScopedSdkMethod<OpenCodePromptResponse>("session", "message", {
                        legacyOptions: {
                            path: {
                                id: sessionId,
                                messageID: messageId,
                            },
                        },
                        signal,
                        v2Parameters: {
                            sessionID: sessionId,
                            messageID: messageId,
                        },
                    }));
                },
            );
        } catch (error) {
            this.logPromptRequestFailure(error, {
                sessionId,
                stage: "poll-message",
                timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
                messageId,
            });
            return null;
        }
    }

    private async captureKnownMessageIds(sessionId: string): Promise<Set<string>> {
        const messages = await this.fetchRecentPromptMessages(sessionId, "capture-known-messages");

        if (!messages) {
            return new Set();
        }

        return new Set(
            messages
                .map((message) => extractMessageId(message.info))
                .filter((id): id is string => typeof id === "string" && id.length > 0),
        );
    }

    private async fetchRecentPromptMessages(
        sessionId: string,
        stage: Extract<OpenCodePromptTimeoutStage, "capture-known-messages" | "poll-messages" | "final-scan">,
    ): Promise<OpenCodePromptResponse[] | null> {
        try {
            return await this.runPromptRequestWithTimeout(
                {
                    sessionId,
                    stage,
                    timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
                },
                async (signal) => {
                    if (hasRawSdkMethod(this.client, "get")) {
                        const response = await this.requestRaw<OpenCodePromptResponse[]>(
                            "get",
                            buildRawSessionRequest(this.sdkFlavor, sessionId, "/message", {
                                query: {
                                    limit: PROMPT_MESSAGE_POLL_LIMIT,
                                },
                                signal,
                            }),
                        );

                        return normalizePromptResponses(response);
                    }

                    if (typeof this.client.session.messages !== "function") {
                        return null;
                    }

                    return normalizePromptResponses(await this.callScopedSdkMethod<OpenCodePromptResponse[]>("session", "messages", {
                        legacyOptions: {
                            path: {
                                id: sessionId,
                            },
                            query: {
                                limit: PROMPT_MESSAGE_POLL_LIMIT,
                            },
                        },
                        signal,
                        v2Parameters: {
                            sessionID: sessionId,
                            limit: PROMPT_MESSAGE_POLL_LIMIT,
                        },
                    }));
                },
            );
        } catch (error) {
            this.logPromptRequestFailure(error, {
                sessionId,
                stage,
                timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
            });
            return null;
        }
    }

    private async fetchPromptSessionStatus(sessionId: string): Promise<OpenCodeSessionStatus | null> {
        try {
            const statuses = await this.runPromptRequestWithTimeout(
                {
                    sessionId,
                    stage: "poll-status",
                    timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
                },
                async (signal) => this.loadSessionStatuses(signal),
            );

            return statuses[sessionId] ?? null;
        } catch (error) {
            this.logPromptRequestFailure(error, {
                sessionId,
                stage: "poll-status",
                timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
            });
            return null;
        }
    }

    private async findLatestPromptResponse(
        sessionId: string,
        options: PromptResponseCandidateOptions,
        stage: Extract<OpenCodePromptTimeoutStage, "poll-messages" | "final-scan">,
    ): Promise<OpenCodePromptResponse | null> {
        const messages = await this.fetchRecentPromptMessages(sessionId, stage);

        if (!messages || messages.length === 0) {
            return null;
        }

        return selectPromptResponseCandidate(messages, options);
    }

    private async loadModels(): Promise<OpenCodeConfiguredModel[]> {
        const [config, providerCatalog] = await Promise.all([
            this.loadConfig(),
            this.loadProviderCatalog(),
        ]);
        const providerAvailability = await resolveProviderAvailability(config, this.fetchFn);
        const models = buildSelectableModels(
            config,
            providerCatalog.providers,
            providerAvailability,
        );

        this.modelCache = {
            expiresAt: Date.now() + 60_000,
            promise: null,
            value: models,
        };

        return models;
    }

    private async loadConfig(): Promise<OpenCodeConfig> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodeConfig>(
                "get",
                { url: "/config" },
            );
        }

        return this.callScopedSdkMethod<OpenCodeConfig>("config", "get", {});
    }

    private async loadProviderCatalog(): Promise<OpenCodeProviderCatalog> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<OpenCodeProviderCatalog>(
                "get",
                { url: "/config/providers" },
            );
        }

        return this.callScopedSdkMethod<OpenCodeProviderCatalog>("config", "providers", {});
    }

    private async sendPromptRequest(
        input: PromptSessionInput,
        parts: Array<
            | { type: "text"; text: string }
            | { type: "file"; filename?: string; mime: string; url: string }
        >,
    ): Promise<OpenCodePromptResponse | null> {
        const requestBody = {
            ...(input.agent ? { agent: input.agent } : {}),
            ...(input.structured ? { format: STRUCTURED_REPLY_SCHEMA } : {}),
            ...(input.model ? { model: input.model } : {}),
            ...(input.variant ? { variant: input.variant } : {}),
            parts,
        };
        const requestParameters = {
            sessionID: input.sessionId,
            ...requestBody,
        };

        try {
            if (hasRawSdkMethod(this.client, "post")) {
                return await this.runPromptRequestWithTimeout(
                    {
                        sessionId: input.sessionId,
                        stage: "send-prompt",
                        timeoutMs: this.promptTimeoutPolicy.waitTimeoutMs,
                    },
                    async (signal) => normalizePromptResponse(await this.requestRaw<OpenCodePromptResponse>(
                        "post",
                        buildRawSessionRequest(this.sdkFlavor, input.sessionId, "/message", {
                            body: requestBody,
                            signal,
                        }),
                    )),
                );
            }

            if (typeof this.client.session?.prompt === "function") {
                return await this.runPromptRequestWithTimeout(
                    {
                        sessionId: input.sessionId,
                        stage: "send-prompt",
                        timeoutMs: this.promptTimeoutPolicy.waitTimeoutMs,
                    },
                    async (signal) => normalizePromptResponse(await this.callScopedSdkMethod<OpenCodePromptResponse>("session", "prompt", {
                        legacyOptions: {
                            body: requestBody,
                            path: {
                                id: input.sessionId,
                            },
                        },
                        signal,
                        v2Parameters: requestParameters,
                    })),
                );
            }

            if (typeof this.client.session?.promptAsync === "function") {
                await this.runPromptRequestWithTimeout(
                    {
                        sessionId: input.sessionId,
                        stage: "send-prompt",
                        timeoutMs: this.promptTimeoutPolicy.waitTimeoutMs,
                    },
                    async (signal) => {
                        await this.callScopedSdkMethod<void>("session", "promptAsync", {
                            legacyOptions: {
                                body: requestBody,
                                path: {
                                    id: input.sessionId,
                                },
                            },
                            signal,
                            v2Parameters: requestParameters,
                        });
                    },
                );

                return null;
            }
        } catch (error) {
            this.logPromptRequestFailure(error, {
                sessionId: input.sessionId,
                stage: "send-prompt",
                timeoutMs: this.promptTimeoutPolicy.waitTimeoutMs,
            });
            throw error;
        }

        throw new Error("OpenCode SDK client does not expose a compatible prompt endpoint.");
    }

    private async requestRaw<T>(
        method: keyof Pick<RawSdkHttpClient, "delete" | "get" | "patch" | "post">,
        options: {
            body?: unknown;
            path?: Record<string, unknown>;
            query?: Record<string, unknown>;
            signal?: AbortSignal;
            url: string;
        },
    ): Promise<T> {
        const rawClient = getRawSdkClient(this.client);
        const handler = rawClient?.[method];

        if (typeof handler !== "function") {
            throw new Error(`OpenCode SDK client does not expose a compatible raw ${method.toUpperCase()} method.`);
        }

        const response = await handler({
            ...SDK_OPTIONS,
            ...options,
        }) as MaybeWrappedResponse<T>;

        return unwrapSdkData(response);
    }

    private async loadSessionStatuses(
        signal?: AbortSignal,
    ): Promise<Record<string, OpenCodeSessionStatus>> {
        if (hasRawSdkMethod(this.client, "get")) {
            return this.requestRaw<Record<string, OpenCodeSessionStatus>>(
                "get",
                {
                    url: "/session/status",
                    ...(signal ? { signal } : {}),
                },
            );
        }

        return this.callScopedSdkMethod<Record<string, OpenCodeSessionStatus>>("session", "status", {
            signal,
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
    ): Promise<T> {
        const startedAt = Date.now();
        const controller = new AbortController();
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

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
                operation(controller.signal),
                timeoutPromise,
            ]);
        } finally {
            if (timeoutHandle !== null) {
                clearTimeout(timeoutHandle);
            }
        }
    }

    private logPromptRequestFailure(
        error: unknown,
        input: {
            messageId?: string | null;
            sessionId: string;
            stage: OpenCodePromptTimeoutStage;
            timeoutMs: number;
        },
    ) {
        if (error instanceof OpenCodePromptTimeoutError) {
            this.logPromptRequest("warn", {
                endpointKind: resolvePromptEndpointKind(error.data.stage),
                elapsedMs: error.data.elapsedMs,
                messageId: error.data.messageId,
                sdkFlavor: this.sdkFlavor,
                sessionId: error.data.sessionId,
                stage: error.data.stage,
                timeoutMs: error.data.timeoutMs,
            }, "OpenCode prompt request timed out");
            return;
        }

        this.logPromptRequest("warn", {
            endpointKind: resolvePromptEndpointKind(input.stage),
            error,
            messageId: input.messageId ?? undefined,
            sdkFlavor: this.sdkFlavor,
            sessionId: input.sessionId,
            stage: input.stage,
            timeoutMs: input.timeoutMs,
        }, "OpenCode prompt request failed");
    }

    private logPromptRequest(
        level: "warn" | "error" | "info",
        extra: Record<string, unknown>,
        message: string,
    ) {
        const log = this.client.app?.log;

        if (typeof log !== "function") {
            return;
        }

        void log.call(this.client.app, {
            service: PROMPT_LOG_SERVICE,
            level,
            message,
            extra,
        }).catch(() => undefined);
    }
}

export function createOpenCodeClientFromSdkClient(
    client: OpenCodeSdkClientLike,
    fetchFn: typeof fetch = fetch,
    promptTimeoutPolicy: Partial<OpenCodePromptTimeoutPolicy> = {},
): OpenCodeClientLike {
    return new OpenCodeClient(undefined, client, fetchFn, promptTimeoutPolicy);
}

function buildSelectableModels(
    config: OpenCodeConfig,
    providers: OpenCodeProvider[],
    providerAvailability: OpenCodeProviderAvailability = new Map(),
): OpenCodeConfiguredModel[] {
    const configuredProviders = config.provider ?? {};
    const providersById = new Map(providers.map((provider) => [provider.id, provider]));
    const models = new Map<string, OpenCodeConfiguredModel>();

    for (const [providerId, providerConfig] of Object.entries(configuredProviders)) {
        const configuredModels = providerConfig.models ?? {};

        for (const [configuredModelKey, modelConfig] of Object.entries(configuredModels)) {
            const model = buildConfiguredModel(
                providerId,
                providerConfig,
                configuredModelKey,
                modelConfig,
                providersById.get(providerId),
                providerAvailability.get(providerId) ?? null,
            );

            if (model) {
                models.set(model.qualifiedId, model);
            }
        }
    }

    for (const provider of providers) {
        for (const model of buildCatalogProviderModels(provider, providerAvailability.get(provider.id) ?? null)) {
            if (!models.has(model.qualifiedId)) {
                models.set(model.qualifiedId, model);
            }
        }
    }

    return [...models.values()];
}

function buildConfiguredModel(
    providerId: string,
    providerConfig: OpenCodeProviderConfig,
    configuredModelKey: string,
    modelConfig: OpenCodeModelConfig,
    providerCatalog: OpenCodeProvider | undefined,
    availableModelIds: Set<string> | null,
): OpenCodeConfiguredModel | null {
    const modelId = modelConfig.id ?? configuredModelKey;
    const catalogModel = providerCatalog?.models[modelId];

    if (!isTextModel(modelConfig, catalogModel)) {
        return null;
    }

    if (!isModelAvailable(modelId, availableModelIds)) {
        return null;
    }

    return {
        id: modelId,
        providerID: providerId,
        providerName: resolveProviderDisplayName(providerId, providerConfig, providerCatalog),
        name: modelConfig.name ?? catalogModel?.name ?? modelId,
        qualifiedId: `${providerId}/${modelId}`,
        reasoning: modelConfig.reasoning ?? catalogModel?.capabilities.reasoning ?? false,
        variants: normalizeVariants(modelConfig.variants ?? catalogModel?.variants),
    };
}

function buildCatalogProviderModels(
    provider: OpenCodeProvider,
    availableModelIds: Set<string> | null,
): OpenCodeConfiguredModel[] {
    return Object.values(provider.models)
        .filter((model) => isCatalogTextModel(model) && isModelAvailable(model.id, availableModelIds))
        .map((model) => ({
            id: model.id,
            providerID: provider.id,
            providerName: provider.name,
            name: model.name,
            qualifiedId: `${provider.id}/${model.id}`,
            reasoning: model.capabilities.reasoning,
            variants: normalizeVariants(model.variants),
        }));
}

function isTextModel(modelConfig: OpenCodeModelConfig, catalogModel: OpenCodeModel | undefined): boolean {
    if (modelConfig.modalities) {
        return modelConfig.modalities.input.includes("text") && modelConfig.modalities.output.includes("text");
    }

    if (catalogModel) {
        return catalogModel.capabilities.input.text && catalogModel.capabilities.output.text;
    }

    return true;
}

function isCatalogTextModel(catalogModel: OpenCodeModel): boolean {
    return catalogModel.capabilities.input.text && catalogModel.capabilities.output.text;
}

function isModelAvailable(modelId: string, availableModelIds: Set<string> | null): boolean {
    return availableModelIds === null || availableModelIds.has(modelId);
}

function resolveProviderDisplayName(
    providerId: string,
    providerConfig: OpenCodeProviderConfig,
    providerCatalog: OpenCodeProvider | undefined,
): string {
    if (providerConfig.name) {
        return providerConfig.name;
    }

    const configuredBaseUrl = extractConfiguredBaseUrl(providerConfig);

    if (configuredBaseUrl) {
        const host = safeParseUrlHost(configuredBaseUrl);
        const label = providerCatalog?.name ?? providerId;

        return host ? `${label} (${host})` : label;
    }

    return providerCatalog?.name ?? providerId;
}

function extractConfiguredBaseUrl(providerConfig: OpenCodeProviderConfig): string | null {
    const options = providerConfig.options;

    if (!options || typeof options !== "object") {
        return null;
    }

    const baseUrl = "baseURL" in options ? options.baseURL : null;

    return typeof baseUrl === "string" && baseUrl.trim().length > 0
        ? baseUrl.trim()
        : null;
}

function safeParseUrlHost(value: string): string | null {
    try {
        return new URL(value).host || null;
    } catch {
        return null;
    }
}

function normalizeVariants(
    variants: OpenCodeModelConfig["variants"] | OpenCodeModel["variants"] | undefined,
): Record<string, Record<string, unknown>> {
    if (!variants) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(variants)
            .filter(([, config]) => !config?.disabled)
            .map(([variant, config]) => {
                const normalized = Object.fromEntries(
                    Object.entries(config).filter(([key]) => key !== "disabled"),
                );

                return [variant, normalized];
            }),
    );
}

function extractTextFromParts(parts: Part[] | null | undefined): string {
    if (!Array.isArray(parts)) {
        return "";
    }

    return parts
        .filter((part): part is Extract<Part, { type: "text"; text: string }> => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
}

function buildPromptSessionResult(
    data: OpenCodePromptResponse,
    options: {
        emptyResponseText: string;
        finishedAt: number;
        startedAt: number;
        structured: boolean;
    },
): PromptSessionResult {
    const assistantInfo = toAssistantMessage(data.info);
    const structuredPayload = extractStructuredPayload(assistantInfo);
    const bodyMd = options.structured ? extractStructuredMarkdown(structuredPayload) : null;
    const responseParts = Array.isArray(data.parts) ? data.parts : [];
    const fallbackText = extractTextFromParts(responseParts) || bodyMd || options.emptyResponseText;

    return {
        assistantError: assistantInfo?.error ?? null,
        bodyMd,
        fallbackText,
        info: assistantInfo,
        metrics: extractPromptMetrics(assistantInfo, options.startedAt, options.finishedAt),
        parts: responseParts,
        structured: structuredPayload ?? null,
    };
}

function shouldPollPromptMessage(
    data: OpenCodePromptResponse,
    structured: boolean,
): boolean {
    const assistantInfo = toAssistantMessage(data.info);
    const bodyMd = structured ? extractStructuredMarkdown(extractStructuredPayload(assistantInfo)) : null;
    const responseParts = Array.isArray(data.parts) ? data.parts : [];
    const hasText = extractTextFromParts(responseParts).length > 0;
    const hasAssistantError = !!assistantInfo?.error;
    const isCompleted = isAssistantMessageCompleted(assistantInfo);

    return !hasText && !bodyMd && !hasAssistantError && !isCompleted;
}

function shouldReturnPromptResponseImmediately(
    data: OpenCodePromptResponse,
    structured: boolean,
): boolean {
    return !shouldPollPromptMessage(data, structured)
        && !isCompletedEmptyPromptResponse(data, structured);
}

function isPromptResponseUsable(
    data: OpenCodePromptResponse,
    structured: boolean,
): boolean {
    return !shouldPollPromptMessage(data, structured)
        && !isCompletedEmptyPromptResponse(data, structured);
}

function normalizePromptResponse(response: OpenCodePromptResponse | null | undefined): OpenCodePromptResponse {
    return {
        info: isPlainRecord(response?.info) ? response.info : null,
        parts: normalizePromptParts(response?.parts),
    };
}

function normalizePromptResponses(
    responses: OpenCodePromptResponse[] | null | undefined,
): OpenCodePromptResponse[] | null {
    if (!Array.isArray(responses)) {
        return null;
    }

    return responses.map((response) => normalizePromptResponse(response));
}

function normalizePromptParts(parts: Part[] | null | undefined): Part[] {
    return Array.isArray(parts) ? parts : [];
}

function toAssistantMessage(message: unknown): OpenCodeAssistantMessage | null {
    if (!message || typeof message !== "object") {
        return null;
    }

    if ("role" in message && message.role !== "assistant") {
        return null;
    }

    const normalized: OpenCodeAssistantMessage = {};

    if ("agent" in message && typeof message.agent === "string" && message.agent.trim().length > 0) {
        normalized.agent = message.agent;
    }

    if ("cost" in message && typeof message.cost === "number" && Number.isFinite(message.cost)) {
        normalized.cost = message.cost;
    }

    const error = normalizeAssistantError("error" in message ? message.error : undefined);

    if (error) {
        normalized.error = error;
    }

    if ("finish" in message && typeof message.finish === "string" && message.finish.trim().length > 0) {
        normalized.finish = message.finish;
    }

    if ("id" in message && typeof message.id === "string" && message.id.trim().length > 0) {
        normalized.id = message.id;
    }

    if ("mode" in message && typeof message.mode === "string" && message.mode.trim().length > 0) {
        normalized.mode = message.mode;
    }

    if ("modelID" in message && typeof message.modelID === "string" && message.modelID.trim().length > 0) {
        normalized.modelID = message.modelID;
    }

    if ("parentID" in message && typeof message.parentID === "string" && message.parentID.trim().length > 0) {
        normalized.parentID = message.parentID;
    }

    if ("path" in message && isPlainRecord(message.path)) {
        normalized.path = {
            ...(typeof message.path.cwd === "string" && message.path.cwd.trim().length > 0
                ? { cwd: message.path.cwd }
                : {}),
            ...(typeof message.path.root === "string" && message.path.root.trim().length > 0
                ? { root: message.path.root }
                : {}),
        };
    }

    if ("providerID" in message && typeof message.providerID === "string" && message.providerID.trim().length > 0) {
        normalized.providerID = message.providerID;
    }

    if ("role" in message && message.role === "assistant") {
        normalized.role = "assistant";
    }

    if ("sessionID" in message && typeof message.sessionID === "string" && message.sessionID.trim().length > 0) {
        normalized.sessionID = message.sessionID;
    }

    const structuredPayload = extractStructuredPayload(message);

    if (structuredPayload !== null) {
        normalized.structured = structuredPayload;
    }

    if ("summary" in message && typeof message.summary === "boolean") {
        normalized.summary = message.summary;
    }

    if ("time" in message && isPlainRecord(message.time)) {
        normalized.time = {
            ...(typeof message.time.created === "number" && Number.isFinite(message.time.created)
                ? { created: message.time.created }
                : {}),
            ...(typeof message.time.completed === "number" && Number.isFinite(message.time.completed)
                ? { completed: message.time.completed }
                : {}),
        };
    }

    if ("tokens" in message && isPlainRecord(message.tokens)) {
        normalized.tokens = {
            ...(typeof message.tokens.input === "number" && Number.isFinite(message.tokens.input)
                ? { input: message.tokens.input }
                : {}),
            ...(typeof message.tokens.output === "number" && Number.isFinite(message.tokens.output)
                ? { output: message.tokens.output }
                : {}),
            ...(typeof message.tokens.reasoning === "number" && Number.isFinite(message.tokens.reasoning)
                ? { reasoning: message.tokens.reasoning }
                : {}),
            ...(typeof message.tokens.total === "number" && Number.isFinite(message.tokens.total)
                ? { total: message.tokens.total }
                : {}),
            ...(isPlainRecord(message.tokens.cache)
                ? {
                    cache: {
                        ...(typeof message.tokens.cache.read === "number" && Number.isFinite(message.tokens.cache.read)
                            ? { read: message.tokens.cache.read }
                            : {}),
                        ...(typeof message.tokens.cache.write === "number" && Number.isFinite(message.tokens.cache.write)
                            ? { write: message.tokens.cache.write }
                            : {}),
                    },
                }
                : {}),
        };
    }

    if ("variant" in message && typeof message.variant === "string" && message.variant.trim().length > 0) {
        normalized.variant = message.variant;
    }

    return normalized;
}

function extractMessageId(message: unknown): string | null {
    if (!isPlainRecord(message)) {
        return null;
    }

    return typeof message.id === "string" && message.id.trim().length > 0
        ? message.id
        : null;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function didPromptResponseAdvance(
    previous: OpenCodePromptResponse | null,
    next: OpenCodePromptResponse,
    structured: boolean,
): boolean {
    return getPromptResponseProgressSignature(previous, structured)
        !== getPromptResponseProgressSignature(next, structured);
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

function resolvePromptEndpointKind(stage: OpenCodePromptTimeoutStage): "message" | "messages" | "prompt" | "status" {
    switch (stage) {
        case "capture-known-messages":
        case "poll-messages":
        case "final-scan":
            return "messages";
        case "poll-message":
            return "message";
        case "poll-status":
            return "status";
        case "send-prompt":
        default:
            return "prompt";
    }
}

function getPromptMessagePollDelayMs(attempt: number): number {
    return PROMPT_MESSAGE_POLL_INITIAL_DELAYS_MS[attempt] ?? PROMPT_MESSAGE_POLL_INTERVAL_MS;
}

function extractStructuredMarkdown(structured: unknown): string | null {
    const parsed = StructuredReplySchema.safeParse(structured);

    if (!parsed.success) {
        return null;
    }

    const bodyMd = parsed.data.body_md.replace(/\r\n?/g, "\n").trim();

    return bodyMd.length > 0 ? bodyMd : null;
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

function unwrapSdkData<T>(response: MaybeWrappedResponse<T>): T {
    if (response && typeof response === "object" && "data" in response) {
        return response.data;
    }

    return response;
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

function detectSdkFlavor(client: OpenCodeSdkClientLike): SdkFlavor {
    if (typeof (client as {
        global?: {
            health?: unknown;
        };
        permission?: unknown;
    }).global?.health === "function" || "permission" in client) {
        return "v2";
    }

    return clientExposesTwoArgumentSdkMethod(client)
        ? "v2"
        : "legacy";
}

function buildRawSessionRequest(
    sdkFlavor: SdkFlavor,
    sessionId: string,
    suffix = "",
    extra: Omit<RawSdkRequestOptions, "path" | "responseStyle" | "throwOnError" | "url"> = {},
): RawSdkRequestOptions {
    return {
        url: sdkFlavor === "legacy"
            ? `/session/{id}${suffix}`
            : `/session/{sessionID}${suffix}`,
        path: sdkFlavor === "legacy"
            ? { id: sessionId }
            : { sessionID: sessionId },
        ...extra,
    };
}

function buildRawSessionMessageRequest(
    sdkFlavor: SdkFlavor,
    sessionId: string,
    messageId: string,
    extra: Omit<RawSdkRequestOptions, "path" | "responseStyle" | "throwOnError" | "url"> = {},
): RawSdkRequestOptions {
    return {
        url: sdkFlavor === "legacy"
            ? "/session/{id}/message/{messageID}"
            : "/session/{sessionID}/message/{messageID}",
        path: sdkFlavor === "legacy"
            ? {
                id: sessionId,
                messageID: messageId,
            }
            : {
                sessionID: sessionId,
                messageID: messageId,
            },
        ...extra,
    };
}

function buildRawLegacyPermissionReplyRequest(
    sessionId: string,
    requestId: string,
    reply: "once" | "always" | "reject",
): RawSdkRequestOptions {
    return {
        body: {
            response: reply,
        },
        path: {
            id: sessionId,
            permissionID: requestId,
        },
        url: "/session/{id}/permissions/{permissionID}",
    };
}

function getRawSdkClient(client: OpenCodeSdkClientLike): RawSdkHttpClient | null {
    const withRawClient = client as OpenCodeSdkClientLike & {
        client?: RawSdkHttpClient;
    };

    return withRawClient.client ?? client._client ?? null;
}

function hasRawSdkMethod(
    client: OpenCodeSdkClientLike,
    method: keyof Pick<RawSdkHttpClient, "delete" | "get" | "patch" | "post">,
): boolean {
    const rawClient = getRawSdkClient(client);

    return typeof rawClient?.[method] === "function";
}

function normalizeAssistantError(value: unknown): OpenCodeAssistantError | undefined {
    if (!isPlainRecord(value) || typeof value.name !== "string" || value.name.trim().length === 0) {
        return undefined;
    }

    return {
        ...value,
        name: value.name,
        ...(isPlainRecord(value.data)
            ? { data: value.data }
            : {}),
    } as OpenCodeAssistantError;
}

function isAssistantMessageCompleted(
    message: OpenCodeAssistantMessage | null | undefined,
): boolean {
    return !!message?.error
        || typeof message?.time?.completed === "number"
        || (typeof message?.finish === "string" && message.finish.trim().length > 0);
}

function isCompletedEmptyPromptResponse(
    data: OpenCodePromptResponse,
    structured: boolean,
): boolean {
    const assistantInfo = toAssistantMessage(data.info);
    const bodyMd = structured ? extractStructuredMarkdown(extractStructuredPayload(assistantInfo)) : null;
    const responseParts = Array.isArray(data.parts) ? data.parts : [];
    const hasText = extractTextFromParts(responseParts).length > 0;

    return isAssistantMessageCompleted(assistantInfo)
        && !assistantInfo?.error
        && !hasText
        && !bodyMd;
}

function clientExposesTwoArgumentSdkMethod(client: OpenCodeSdkClientLike): boolean {
    const scopes = ["app", "config", "global", "lsp", "mcp", "path", "permission", "project", "session"] as const;

    return scopes.some((scope) => {
        const target = client[scope];

        if (!target || typeof target !== "object") {
            return false;
        }

        return Object.values(target).some((value) => typeof value === "function" && value.length >= 2);
    });
}

function extractStructuredPayload(message: unknown): unknown | null {
    if (!isPlainRecord(message)) {
        return null;
    }

    if ("structured" in message && message.structured !== undefined) {
        return message.structured;
    }

    if ("structured_output" in message && message.structured_output !== undefined) {
        return message.structured_output;
    }

    return null;
}

type PromptResponseCandidateOptions = {
    initialMessageId: string | null;
    initialParentId: string | null;
    knownMessageIds: Set<string>;
    requestStartedAt: number | null;
    structured: boolean;
};

function selectPromptResponseCandidate(
    candidates: Array<OpenCodePromptResponse | null | undefined>,
    options: PromptResponseCandidateOptions,
): OpenCodePromptResponse | null {
    const availableCandidates = candidates
        .filter((candidate): candidate is OpenCodePromptResponse => !!candidate)
        .filter((candidate) => toAssistantMessage(candidate.info) !== null);

    if (availableCandidates.length === 0) {
        return null;
    }

    return [...availableCandidates].sort((left, right) =>
        comparePromptResponseCandidates(left, right, options)
    )[0] ?? null;
}

function comparePromptResponseCandidates(
    left: OpenCodePromptResponse,
    right: OpenCodePromptResponse,
    options: PromptResponseCandidateOptions,
): number {
    const leftRank = getPromptResponseCandidateRank(left, options);
    const rightRank = getPromptResponseCandidateRank(right, options);

    return Number(rightRank.isUsable) - Number(leftRank.isUsable)
        || Number(rightRank.isInitial) - Number(leftRank.isInitial)
        || Number(rightRank.sharesParent) - Number(leftRank.sharesParent)
        || Number(rightRank.isNewSinceRequestStart) - Number(leftRank.isNewSinceRequestStart)
        || rightRank.createdAt - leftRank.createdAt;
}

function getPromptResponseCandidateRank(
    message: OpenCodePromptResponse,
    options: PromptResponseCandidateOptions,
): {
    createdAt: number;
    isInitial: boolean;
    isNewSinceRequestStart: boolean;
    isUsable: boolean;
    sharesParent: boolean;
} {
    const assistant = toAssistantMessage(message.info);
    const id = assistant?.id ?? null;
    const createdAt = typeof assistant?.time?.created === "number" && Number.isFinite(assistant.time.created)
        ? assistant.time.created
        : 0;

    return {
        createdAt,
        isInitial: !!id && id === options.initialMessageId,
        isNewSinceRequestStart: isPromptResponseNewSinceRequestStart(
            id,
            createdAt,
            options.knownMessageIds,
            options.requestStartedAt,
        ),
        isUsable: isPromptResponseUsable(message, options.structured),
        sharesParent: !!assistant?.parentID && assistant.parentID === options.initialParentId,
    };
}

function resolvePromptCandidateStartTime(
    startedAt: number,
    initialMessage: OpenCodePromptResponse | null,
): number | null {
    if (!initialMessage) {
        return null;
    }

    const initialCreatedAt = coerceFiniteNumber(toAssistantMessage(initialMessage.info)?.time?.created);

    if (initialCreatedAt === null) {
        return startedAt;
    }

    return areComparablePromptTimestamps(startedAt, initialCreatedAt)
        ? startedAt
        : initialCreatedAt;
}

function getPromptResponseProgressSignature(
    response: OpenCodePromptResponse | null,
    structured: boolean,
): string {
    if (!response) {
        return "null";
    }

    const assistant = toAssistantMessage(response.info);
    const responseParts = Array.isArray(response.parts) ? response.parts : [];

    return JSON.stringify({
        assistantError: assistant?.error?.name ?? null,
        bodyMd: structured ? extractStructuredMarkdown(extractStructuredPayload(assistant)) : null,
        completedAt: assistant?.time?.completed ?? null,
        finish: assistant?.finish ?? null,
        id: assistant?.id ?? null,
        partCount: responseParts.length,
        text: extractTextFromParts(responseParts),
    });
}

function isPromptResponseNewSinceRequestStart(
    messageId: string | null,
    createdAt: number,
    knownMessageIds: Set<string>,
    requestStartedAt: number | null,
): boolean {
    if (!messageId || knownMessageIds.has(messageId)) {
        return false;
    }

    if (requestStartedAt === null) {
        return true;
    }

    return createdAt >= requestStartedAt;
}

function areComparablePromptTimestamps(left: number, right: number): boolean {
    const epochThresholdMs = 1_000_000_000_000;

    return left >= epochThresholdMs && right >= epochThresholdMs;
}

function isPlainRecord(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function resolveProviderAvailability(
    config: OpenCodeConfig,
    fetchFn: typeof fetch,
): Promise<OpenCodeProviderAvailability> {
    const configuredProviders = Object.entries(config.provider ?? {});
    const availabilityEntries = await Promise.all(
        configuredProviders.map(async ([providerId, providerConfig]) => [
            providerId,
            await fetchProviderAvailableModelIds(providerConfig, fetchFn),
        ] as const),
    );

    return new Map(availabilityEntries);
}

async function fetchProviderAvailableModelIds(
    providerConfig: OpenCodeProviderConfig,
    fetchFn: typeof fetch,
): Promise<Set<string> | null> {
    const baseUrl = extractConfiguredBaseUrl(providerConfig);
    const apiKey = extractConfiguredApiKey(providerConfig);

    if (!baseUrl || !apiKey) {
        return null;
    }

    try {
        const response = await fetchFn(
            buildModelsEndpointUrl(baseUrl),
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "application/json",
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!response.ok) {
            return null;
        }

        const payload = await response.json();
        const modelIds = extractModelIdsFromPayload(payload);

        return modelIds ? new Set(modelIds) : null;
    } catch {
        return null;
    }
}

function extractConfiguredApiKey(providerConfig: OpenCodeProviderConfig): string | null {
    const options = providerConfig.options;

    if (!options || typeof options !== "object") {
        return null;
    }

    const apiKey = "apiKey" in options ? options.apiKey : null;

    return typeof apiKey === "string" && apiKey.trim().length > 0
        ? apiKey.trim()
        : null;
}

function buildModelsEndpointUrl(baseUrl: string): string {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

    return new URL("models", normalizedBaseUrl).toString();
}

function extractModelIdsFromPayload(payload: unknown): string[] | null {
    if (Array.isArray(payload)) {
        return payload
            .map(extractModelId)
            .filter((id): id is string => !!id);
    }

    if (payload && typeof payload === "object" && "data" in payload && Array.isArray(payload.data)) {
        return payload.data
            .map(extractModelId)
            .filter((id): id is string => !!id);
    }

    return null;
}

function extractModelId(value: unknown): string | null {
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }

    if (value && typeof value === "object" && "id" in value) {
        const id = (value as { id?: unknown }).id;

        return typeof id === "string" && id.trim().length > 0
            ? id.trim()
            : null;
    }

    return null;
}
