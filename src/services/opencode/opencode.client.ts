import {
    createOpencodeClient,
    type OpencodeClient,
} from "@opencode-ai/sdk";
import type {
    Agent,
    Config,
    LspStatus,
    McpStatus,
    Model,
    OutputFormat,
    Part,
    Path,
    Provider,
    Project,
    Session,
    SessionStatus,
} from "@opencode-ai/sdk/v2/client";
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
    format?: OpenCodeTextOutputFormat;
    signal?: AbortSignal;
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
export type OpenCodeTextOutputFormat = Extract<OutputFormat, { type: "text" }>;

type RawSdkRequestOptions = {
    responseStyle?: "data" | "fields";
    signal?: AbortSignal;
    throwOnError?: boolean;
    url: string;
};

type RawSdkRequestClient = {
    get?(options: RawSdkRequestOptions): Promise<unknown>;
};

type OpenCodeSdkPermissionScopeLike = {
    list?(parameters?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    reply?(parameters?: unknown, options?: Record<string, unknown>): Promise<unknown>;
};

type OpenCodeSdkScopedClientLike = Pick<OpencodeClient, "app" | "config" | "global" | "lsp" | "mcp" | "path" | "project" | "session"> & {
    permission?: OpenCodeSdkPermissionScopeLike;
};

type OpenCodeSdkPermissionReplyClientLike = {
    postSessionIdPermissionsPermissionId?(options: Record<string, unknown>): Promise<unknown>;
};

export type OpenCodeSdkClientLike = OpenCodeSdkScopedClientLike & OpenCodeSdkPermissionReplyClientLike;

type OpenCodeSdkClientWithRawRequestClient = OpenCodeSdkClientLike & {
    _client?: RawSdkRequestClient;
    client?: RawSdkRequestClient;
};
type MaybeWrappedResponse<T> = T | { data: T };
type ScopedSdkScope = "app" | "config" | "global" | "lsp" | "mcp" | "path" | "permission" | "project" | "session";
type ScopedSdkInvocationInput = {
    legacyParameters?: unknown;
    parameters?: Record<string, unknown>;
    signal?: AbortSignal;
};
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
const PROMPT_MESSAGE_POLL_INITIAL_DELAYS_MS = [0, 100, 250, 500, 1000];
const PROMPT_MESSAGE_POLL_INTERVAL_MS = 2000;
const PROMPT_MESSAGE_POLL_LIMIT = 20;
const PROMPT_LOG_SERVICE = "opencode-tbot";
const DEFAULT_OPENCODE_PROMPT_TIMEOUT_POLICY: OpenCodePromptTimeoutPolicy = {
    pollRequestTimeoutMs: 15_000,
    recoveryInactivityTimeoutMs: 120_000,
    waitTimeoutMs: 1_800_000,
};
const SDK_OPTIONS = {
    responseStyle: "data" as const,
    throwOnError: true as const,
};
const TEXT_OUTPUT_FORMAT: OpenCodeTextOutputFormat = {
    type: "text",
};

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
        scope: ScopedSdkScope,
        method: string,
        input: ScopedSdkInvocationInput,
    ): Promise<T> {
        const target = this.client[scope] as unknown as Record<string, unknown> | undefined;
        const handler = target?.[method];

        if (typeof handler !== "function") {
            throw new Error(`OpenCode SDK client does not expose a compatible ${scope}.${method} method.`);
        }

        const options = {
            ...SDK_OPTIONS,
            ...(input.signal ? { signal: input.signal } : {}),
        };
        const response = handler.length >= 2
            ? await (handler as (parameters: unknown, requestOptions: Record<string, unknown>) => Promise<MaybeWrappedResponse<T>>).call(
                target,
                input.legacyParameters,
                options,
            )
            : await (handler as (requestOptions: Record<string, unknown>) => Promise<MaybeWrappedResponse<T>>).call(
                target,
                input.parameters === undefined
                    ? options
                    : {
                        ...input.parameters,
                        ...options,
                    },
            );

        return unwrapSdkData(response);
    }

    async getHealth(): Promise<OpenCodeHealth> {
        try {
            return await this.callScopedSdkMethod<OpenCodeHealth>("global", "health", {});
        } catch (error) {
            if (!isMissingScopedSdkMethodError(error, "global", "health")) {
                throw error;
            }

            return this.callRawSdkGet<OpenCodeHealth>("/global/health");
        }
    }

    async abortSession(sessionId: string): Promise<boolean> {
        return this.callScopedSdkMethod<boolean>("session", "abort", {
            legacyParameters: {
                sessionID: sessionId,
            },
            parameters: {
                path: {
                    id: sessionId,
                },
            },
        });
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        return this.callScopedSdkMethod<boolean>("session", "delete", {
            legacyParameters: {
                sessionID: sessionId,
            },
            parameters: {
                path: {
                    id: sessionId,
                },
            },
        });
    }

    async forkSession(sessionId: string, messageId?: string): Promise<OpenCodeSession> {
        return this.callScopedSdkMethod<OpenCodeSession>("session", "fork", {
            legacyParameters: {
                sessionID: sessionId,
                ...(messageId?.trim()
                    ? { messageID: messageId.trim() }
                    : {}),
            },
            parameters: {
                path: {
                    id: sessionId,
                },
                ...(
                    messageId?.trim()
                        ? {
                            body: {
                                messageID: messageId.trim(),
                            },
                        }
                        : {}
                ),
            },
        });
    }

    async getPath(): Promise<OpenCodePath> {
        return this.callScopedSdkMethod<OpenCodePath>("path", "get", {});
    }

    async listLspStatuses(directory?: string): Promise<OpenCodeLspStatus[]> {
        return this.callScopedSdkMethod<OpenCodeLspStatus[]>("lsp", "status", {
            legacyParameters: directory
                ? { directory }
                : undefined,
            parameters: directory
                ? {
                    query: {
                        directory,
                    },
                }
                : undefined,
        });
    }

    async listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>> {
        return this.callScopedSdkMethod<Record<string, OpenCodeMcpStatus>>("mcp", "status", {
            legacyParameters: directory
                ? { directory }
                : undefined,
            parameters: directory
                ? {
                    query: {
                        directory,
                    },
                }
                : undefined,
        });
    }

    async getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>> {
        return this.loadSessionStatuses();
    }

    async listProjects(): Promise<OpenCodeProject[]> {
        return this.callScopedSdkMethod<OpenCodeProject[]>("project", "list", {});
    }

    async listSessions(): Promise<OpenCodeSession[]> {
        return this.callScopedSdkMethod<OpenCodeSession[]>("session", "list", {});
    }

    async getCurrentProject(): Promise<OpenCodeProject> {
        return this.callScopedSdkMethod<OpenCodeProject>("project", "current", {});
    }

    async createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession> {
        return this.callScopedSdkMethod<OpenCodeSession>("session", "create", {
            legacyParameters: title ? { directory, title } : { directory },
            parameters: {
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
        });
    }

    async renameSession(sessionId: string, title: string): Promise<OpenCodeSession> {
        return this.callScopedSdkMethod<OpenCodeSession>("session", "update", {
            legacyParameters: {
                sessionID: sessionId,
                title,
            },
            parameters: {
                path: {
                    id: sessionId,
                },
                body: {
                    title,
                },
            },
        });
    }

    async listAgents(): Promise<OpenCodeAgent[]> {
        return this.callScopedSdkMethod<OpenCodeAgent[]>("app", "agents", {});
    }

    async listPendingPermissions(directory?: string): Promise<OpenCodePermissionRequest[]> {
        const permissions = await this.callScopedSdkMethod<unknown[]>("permission", "list", {
            legacyParameters: directory
                ? { directory }
                : undefined,
            parameters: directory
                ? {
                    query: {
                        directory,
                    },
                }
                : undefined,
        });

        return permissions.map(normalizePermissionRequest).filter((permission): permission is OpenCodePermissionRequest => !!permission);
    }

    async replyToPermission(
        requestId: string,
        reply: "once" | "always" | "reject",
        message?: string,
        sessionId?: string,
    ): Promise<boolean> {
        const normalizedMessage = message?.trim();
        const rootPermissionHandler = this.client.postSessionIdPermissionsPermissionId;

        if (sessionId && typeof rootPermissionHandler === "function") {
            return unwrapSdkData(await rootPermissionHandler.call(this.client, {
                ...SDK_OPTIONS,
                body: {
                    response: reply,
                    ...(normalizedMessage
                        ? { message: normalizedMessage }
                        : {}),
                },
                path: {
                    id: sessionId,
                    permissionID: requestId,
                },
            }) as MaybeWrappedResponse<boolean>);
        }

        return this.callScopedSdkMethod<boolean>("permission", "reply", {
            legacyParameters: {
                requestID: requestId,
                reply,
                ...(normalizedMessage
                    ? { message: normalizedMessage }
                    : {}),
            },
            parameters: sessionId
                ? {
                    body: {
                        response: reply,
                        ...(normalizedMessage
                            ? { message: normalizedMessage }
                            : {}),
                    },
                    path: {
                        id: sessionId,
                        permissionID: requestId,
                    },
                }
                : undefined,
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

        throwIfAborted(input.signal);

        const knownMessageIds = await this.captureKnownMessageIds(input.sessionId, input.signal);
        await this.sendPromptRequest(input, parts);
        const resolvedData = await this.resolvePromptResponse(
            input,
            null,
            knownMessageIds,
            startedAt,
        );
        const finishedAt = Date.now();

        return buildPromptSessionResult(resolvedData, {
            emptyResponseText: EMPTY_RESPONSE_TEXT,
            finishedAt,
            startedAt,
        });
    }

    private async resolvePromptResponse(
        input: PromptSessionInput,
        data: OpenCodePromptResponse | null,
        knownMessageIds: Set<string>,
        startedAt: number,
    ): Promise<OpenCodePromptResponse> {
        if (data && shouldReturnPromptResponseImmediately(data)) {
            return data;
        }

        const messageId = data ? extractMessageId(data.info) : null;
        const candidateOptions: PromptResponseCandidateOptions = {
            initialMessageId: messageId,
            initialParentId: data ? toAssistantMessage(data.info)?.parentID ?? null : null,
            knownMessageIds,
            requestStartedAt: resolvePromptCandidateStartTime(startedAt, data),
        };
        let bestCandidate = selectPromptResponseCandidate(
            data ? [data] : [],
            candidateOptions,
        );
        let lastProgressAt = Date.now();
        let lastStatus: OpenCodeSessionStatus | null = null;
        const deadlineAt = startedAt + this.promptTimeoutPolicy.waitTimeoutMs;
        let idleStatusSeen = false;
        let attempt = 0;

        while (true) {
            throwIfAborted(input.signal);

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

                await delay(Math.min(delayMs, remainingMs), input.signal);
            }

            if (messageId) {
                const next = await this.fetchPromptMessage(input.sessionId, messageId, input.signal);

                if (next) {
                    const nextCandidate = selectPromptResponseCandidate(
                        [bestCandidate, next],
                        candidateOptions,
                    );

                    if (nextCandidate) {
                        if (didPromptResponseAdvance(bestCandidate, nextCandidate)) {
                            lastProgressAt = Date.now();
                            idleStatusSeen = false;
                        }

                        bestCandidate = nextCandidate;
                    }

                    if (
                        bestCandidate
                        && isPromptResponseForCurrentRequest(bestCandidate, candidateOptions)
                        && shouldReturnPromptResponseImmediately(bestCandidate)
                    ) {
                        return bestCandidate;
                    }
                }
            }

            const latest = await this.findLatestPromptResponse(
                input.sessionId,
                candidateOptions,
                "poll-messages",
                input.signal,
            );

            if (latest) {
                const nextCandidate = selectPromptResponseCandidate(
                    [bestCandidate, latest],
                    candidateOptions,
                );

                if (nextCandidate) {
                    if (didPromptResponseAdvance(bestCandidate, nextCandidate)) {
                        lastProgressAt = Date.now();
                        idleStatusSeen = false;
                    }

                    bestCandidate = nextCandidate;
                }

                if (
                    bestCandidate
                    && isPromptResponseForCurrentRequest(bestCandidate, candidateOptions)
                    && shouldReturnPromptResponseImmediately(bestCandidate)
                ) {
                    return bestCandidate;
                }
            }

            const status = await this.fetchPromptSessionStatus(input.sessionId, input.signal);

            lastStatus = status;

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
                && isPromptResponseForCurrentRequest(bestCandidate, candidateOptions)
                && isCompletedEmptyPromptResponse(bestCandidate)
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
            input.signal,
        );

        const resolved = selectPromptResponseCandidate(
            [bestCandidate, latest],
            candidateOptions,
        );
        const requestScopedResolved = resolved && isPromptResponseForCurrentRequest(resolved, candidateOptions)
            ? resolved
            : null;

        if (
            lastStatus?.type === "idle"
            && (!requestScopedResolved || shouldPollPromptMessage(requestScopedResolved))
        ) {
            throw createMessageAbortedError();
        }

        if (!requestScopedResolved || shouldPollPromptMessage(requestScopedResolved)) {
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
                sessionId: input.sessionId,
                stage: "final-scan",
                timeoutMs,
                timeoutReason,
            }, "OpenCode prompt recovery timed out");
            throw error;
        }

        return requestScopedResolved;
    }

    private async fetchPromptMessage(
        sessionId: string,
        messageId: string,
        signal?: AbortSignal,
    ): Promise<OpenCodePromptResponse | null> {
        try {
            return await this.runPromptRequestWithTimeout(
                {
                    sessionId,
                    stage: "poll-message",
                    timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
                    messageId,
                },
                async (requestSignal) => {
                    return normalizePromptResponse(await this.callScopedSdkMethod<OpenCodePromptResponse>("session", "message", {
                        legacyParameters: {
                            sessionID: sessionId,
                            messageID: messageId,
                        },
                        parameters: {
                            path: {
                                id: sessionId,
                                messageID: messageId,
                            },
                        },
                        signal: requestSignal,
                    }));
                },
                signal,
            );
        } catch (error) {
            if (isPromptRequestAbort(error)) {
                throw error;
            }

            this.logPromptRequestFailure(error, {
                sessionId,
                stage: "poll-message",
                timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
                messageId,
            });
            return null;
        }
    }

    private async captureKnownMessageIds(sessionId: string, signal?: AbortSignal): Promise<Set<string>> {
        const messages = await this.fetchRecentPromptMessages(sessionId, "capture-known-messages", signal);

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
        signal?: AbortSignal,
    ): Promise<OpenCodePromptResponse[] | null> {
        try {
            return await this.runPromptRequestWithTimeout(
                {
                    sessionId,
                    stage,
                    timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
                },
                async (requestSignal) => {
                    return normalizePromptResponses(await this.callScopedSdkMethod<OpenCodePromptResponse[]>("session", "messages", {
                        legacyParameters: {
                            sessionID: sessionId,
                            limit: PROMPT_MESSAGE_POLL_LIMIT,
                        },
                        parameters: {
                            path: {
                                id: sessionId,
                            },
                            query: {
                                limit: PROMPT_MESSAGE_POLL_LIMIT,
                            },
                        },
                        signal: requestSignal,
                    }));
                },
                signal,
            );
        } catch (error) {
            if (isPromptRequestAbort(error)) {
                throw error;
            }

            this.logPromptRequestFailure(error, {
                sessionId,
                stage,
                timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
            });
            return null;
        }
    }

    private async fetchPromptSessionStatus(sessionId: string, signal?: AbortSignal): Promise<OpenCodeSessionStatus | null> {
        try {
            const statuses = await this.runPromptRequestWithTimeout(
                {
                    sessionId,
                    stage: "poll-status",
                    timeoutMs: this.promptTimeoutPolicy.pollRequestTimeoutMs,
                },
                async (requestSignal) => this.loadSessionStatuses(requestSignal),
                signal,
            );

            return statuses[sessionId] ?? null;
        } catch (error) {
            if (isPromptRequestAbort(error)) {
                throw error;
            }

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
        signal?: AbortSignal,
    ): Promise<OpenCodePromptResponse | null> {
        const messages = await this.fetchRecentPromptMessages(sessionId, stage, signal);

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
        return this.callScopedSdkMethod<OpenCodeConfig>("config", "get", {});
    }

    private async loadProviderCatalog(): Promise<OpenCodeProviderCatalog> {
        return this.callScopedSdkMethod<OpenCodeProviderCatalog>("config", "providers", {});
    }

    private async sendPromptRequest(
        input: PromptSessionInput,
        parts: Array<
            | { type: "text"; text: string }
            | { type: "file"; filename?: string; mime: string; url: string }
        >,
    ): Promise<void> {
        const format = input.format ?? TEXT_OUTPUT_FORMAT;
        const requestBody = {
            ...(input.agent ? { agent: input.agent } : {}),
            format,
            ...(input.model ? { model: input.model } : {}),
            ...(input.variant ? { variant: input.variant } : {}),
            parts,
        };
        const legacyRequestParameters = {
            sessionID: input.sessionId,
            ...requestBody,
        };
        const requestParameters = {
            body: requestBody,
            path: {
                id: input.sessionId,
            },
        };

        try {
            if (typeof this.client.session?.promptAsync === "function") {
                await this.runPromptRequestWithTimeout(
                    {
                        sessionId: input.sessionId,
                        stage: "send-prompt",
                        timeoutMs: this.promptTimeoutPolicy.waitTimeoutMs,
                    },
                    async (signal) => {
                        await this.callScopedSdkMethod<void>("session", "promptAsync", {
                            legacyParameters: legacyRequestParameters,
                            parameters: requestParameters,
                            signal,
                        });
                    },
                    input.signal,
                );

                return;
            }
        } catch (error) {
            this.logPromptRequestFailure(error, {
                sessionId: input.sessionId,
                stage: "send-prompt",
                timeoutMs: this.promptTimeoutPolicy.waitTimeoutMs,
            });
            throw error;
        }

        throw new Error("OpenCode SDK client does not expose session.promptAsync().");
    }

    private async loadSessionStatuses(
        signal?: AbortSignal,
    ): Promise<Record<string, OpenCodeSessionStatus>> {
        return this.callScopedSdkMethod<Record<string, OpenCodeSessionStatus>>("session", "status", {
            signal,
        });
    }

    private async callRawSdkGet<T>(
        url: string,
        signal?: AbortSignal,
    ): Promise<T> {
        const rawClient = getRawSdkRequestClient(this.client);

        if (typeof rawClient?.get !== "function") {
            throw new Error(`OpenCode SDK client does not expose a compatible raw GET endpoint for ${url}.`);
        }

        const response = await rawClient.get({
            ...SDK_OPTIONS,
            ...(signal ? { signal } : {}),
            url,
        }) as MaybeWrappedResponse<T>;

        return unwrapSdkData(response);
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

        const payload = {
            service: PROMPT_LOG_SERVICE,
            level,
            message,
            extra,
        };

        void (log.length >= 2
            ? (log as (body: Record<string, unknown>, options: Record<string, unknown>) => Promise<unknown>).call(
                this.client.app,
                payload,
                SDK_OPTIONS,
            )
            : (log as (options: Record<string, unknown>) => Promise<unknown>).call(this.client.app, {
                body: payload,
                ...SDK_OPTIONS,
            })
        ).catch(() => undefined);
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
    },
): PromptSessionResult {
    const assistantInfo = toAssistantMessage(data.info);
    const responseParts = Array.isArray(data.parts) ? data.parts : [];
    const bodyMd = extractTextFromParts(responseParts) || null;
    const fallbackText = bodyMd
        ? stripMarkdownToPlainText(bodyMd) || bodyMd
        : options.emptyResponseText;

    return {
        assistantError: assistantInfo?.error ?? null,
        bodyMd,
        fallbackText,
        info: assistantInfo,
        metrics: extractPromptMetrics(assistantInfo, options.startedAt, options.finishedAt),
        parts: responseParts,
        structured: null,
    };
}

function shouldPollPromptMessage(
    data: OpenCodePromptResponse,
): boolean {
    const assistantInfo = toAssistantMessage(data.info);
    const responseParts = Array.isArray(data.parts) ? data.parts : [];
    const hasText = extractTextFromParts(responseParts).length > 0;
    const hasAssistantError = !!assistantInfo?.error;
    const isCompleted = isAssistantMessageCompleted(assistantInfo);

    return !hasText && !hasAssistantError && !isCompleted;
}

function shouldReturnPromptResponseImmediately(
    data: OpenCodePromptResponse,
): boolean {
    return !shouldPollPromptMessage(data)
        && !isCompletedEmptyPromptResponse(data);
}

function isPromptResponseUsable(
    data: OpenCodePromptResponse,
): boolean {
    return !shouldPollPromptMessage(data)
        && !isCompletedEmptyPromptResponse(data);
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

function didPromptResponseAdvance(
    previous: OpenCodePromptResponse | null,
    next: OpenCodePromptResponse,
): boolean {
    return getPromptResponseProgressSignature(previous)
        !== getPromptResponseProgressSignature(next);
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

function normalizePermissionRequest(permission: unknown): OpenCodePermissionRequest | null {
    if (!isPlainRecord(permission)) {
        return null;
    }

    const id = typeof permission.id === "string" && permission.id.trim().length > 0
        ? permission.id
        : null;
    const sessionID = typeof permission.sessionID === "string" && permission.sessionID.trim().length > 0
        ? permission.sessionID
        : null;
    const permissionName = typeof permission.permission === "string" && permission.permission.trim().length > 0
        ? permission.permission
        : typeof permission.type === "string" && permission.type.trim().length > 0
            ? permission.type
            : null;

    if (!id || !sessionID || !permissionName) {
        return null;
    }

    return {
        always: Array.isArray(permission.always)
            ? permission.always.filter((value): value is string => typeof value === "string")
            : [],
        id,
        metadata: isPlainRecord(permission.metadata)
            ? permission.metadata
            : {},
        patterns: normalizePermissionPatterns(permission),
        permission: permissionName,
        sessionID,
    };
}

function normalizePermissionPatterns(permission: Record<string, unknown>): string[] {
    if (Array.isArray(permission.patterns)) {
        return permission.patterns.filter((value): value is string => typeof value === "string");
    }

    if (typeof permission.pattern === "string" && permission.pattern.trim().length > 0) {
        return [permission.pattern];
    }

    if (Array.isArray(permission.pattern)) {
        return permission.pattern.filter((value): value is string => typeof value === "string");
    }

    return [];
}

function getRawSdkRequestClient(client: OpenCodeSdkClientLike): RawSdkRequestClient | null {
    const compatibleClient = client as OpenCodeSdkClientWithRawRequestClient;

    return compatibleClient.client ?? compatibleClient._client ?? null;
}

function isMissingScopedSdkMethodError(
    error: unknown,
    scope: string,
    method: string,
): error is Error {
    return error instanceof Error
        && error.message === `OpenCode SDK client does not expose a compatible ${scope}.${method} method.`;
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
): boolean {
    const assistantInfo = toAssistantMessage(data.info);
    const responseParts = Array.isArray(data.parts) ? data.parts : [];
    const hasText = extractTextFromParts(responseParts).length > 0;

    return isAssistantMessageCompleted(assistantInfo)
        && !assistantInfo?.error
        && !hasText;
}

type PromptResponseCandidateOptions = {
    initialMessageId: string | null;
    initialParentId: string | null;
    knownMessageIds: Set<string>;
    requestStartedAt: number | null;
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

    return Number(rightRank.isInitial) - Number(leftRank.isInitial)
        || Number(rightRank.sharesParent) - Number(leftRank.sharesParent)
        || Number(rightRank.isNewSinceRequestStart) - Number(leftRank.isNewSinceRequestStart)
        || Number(rightRank.isUsable) - Number(leftRank.isUsable)
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
        isUsable: isPromptResponseUsable(message),
        sharesParent: !!assistant?.parentID && assistant.parentID === options.initialParentId,
    };
}

function resolvePromptCandidateStartTime(
    startedAt: number,
    initialMessage: OpenCodePromptResponse | null,
): number | null {
    if (!initialMessage) {
        return startedAt;
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
): string {
    if (!response) {
        return "null";
    }

    const assistant = toAssistantMessage(response.info);
    const responseParts = Array.isArray(response.parts) ? response.parts : [];

    return JSON.stringify({
        assistantError: assistant?.error?.name ?? null,
        bodyMd: extractTextFromParts(responseParts) || null,
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

function isPromptResponseForCurrentRequest(
    response: OpenCodePromptResponse,
    options: PromptResponseCandidateOptions,
): boolean {
    const rank = getPromptResponseCandidateRank(response, options);

    return rank.isInitial || rank.sharesParent || rank.isNewSinceRequestStart;
}

function areComparablePromptTimestamps(left: number, right: number): boolean {
    const epochThresholdMs = 1_000_000_000_000;

    return left >= epochThresholdMs && right >= epochThresholdMs;
}

function isPromptRequestAbort(error: unknown): boolean {
    return error instanceof OpenCodeMessageAbortedError
        || (error instanceof Error && error.name === "AbortError")
        || isNamedAbortError(error);
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
