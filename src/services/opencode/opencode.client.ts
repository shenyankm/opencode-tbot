import {
    createOpencodeClient,
    Agent,
    Config,
    LspStatus,
    McpStatus,
    Model,
    OpencodeClient,
    Part,
    Path,
    Provider,
    Project,
    Session,
    SessionStatus,
} from "@opencode-ai/sdk";
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
export type OpenCodeSession = Session & {
    slug?: string;
    version?: string;
};
export type OpenCodeModel = Model;
export type OpenCodeProvider = Provider;
export type OpenCodeConfig = Config;
export type OpenCodeAgent = Agent & { hidden?: boolean };
export type OpenCodeLspStatus = LspStatus;
export type OpenCodePath = Path & { home?: string };
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
export interface OpenCodeTextOutputFormat {
    type: "text";
}
export type OpenCodeSdkClientLike = OpencodeClient;
type OpenCodeSdkResult<T> = T | {
    data: T;
};
type OpenCodeSdkRawGetOperation = (
    options: { url: string } & typeof SDK_OPTIONS & { signal?: AbortSignal },
) => Promise<OpenCodeSdkResult<OpenCodeHealth>>;
type OpenCodeSdkRawCompatibleClient = {
    _client?: {
        get?: OpenCodeSdkRawGetOperation;
    };
    client?: {
        get?: OpenCodeSdkRawGetOperation;
    };
};
type OpenCodeProviderCatalog = {
    providers: OpenCodeProvider[];
    default: Record<string, string>;
};
type OpenCodeConnectedProviders = Set<string>;
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

        this.client = client ?? createOpencodeClient(buildOpenCodeSdkConfig(options as OpenCodeClientOptions));
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

    private buildSdkOptions(signal?: AbortSignal): typeof SDK_OPTIONS & { signal?: AbortSignal } {
        return {
            ...SDK_OPTIONS,
            ...(signal ? { signal } : {}),
        };
    }

    private buildSdkRequest<TRequest extends Record<string, unknown>>(
        request: TRequest,
        signal?: AbortSignal,
    ): TRequest & typeof SDK_OPTIONS & { signal?: AbortSignal } {
        return {
            ...request,
            ...this.buildSdkOptions(signal),
        };
    }

    private async callSdkMethod<TResponse, TRequest extends Record<string, unknown>>(
        operation: (
            request: TRequest & typeof SDK_OPTIONS & { signal?: AbortSignal },
        ) => Promise<OpenCodeSdkResult<TResponse>>,
        request: TRequest,
        signal?: AbortSignal,
    ): Promise<TResponse> {
        return unwrapSdkData(await operation(this.buildSdkRequest(request, signal)));
    }

    private async callSdkOptionsOnlyMethod<TResponse>(
        operation: (
            options: typeof SDK_OPTIONS & { signal?: AbortSignal },
        ) => Promise<OpenCodeSdkResult<TResponse>>,
        signal?: AbortSignal,
    ): Promise<TResponse> {
        return unwrapSdkData(await operation(this.buildSdkOptions(signal)));
    }

    async getHealth(): Promise<OpenCodeHealth> {
        const rawGet = resolveSdkRawGetOperation(this.client);

        if (rawGet) {
            return unwrapSdkData(await rawGet({
                url: "/global/health",
                ...this.buildSdkOptions(),
            }));
        }

        throw new Error("Root @opencode-ai/sdk does not expose /global/health through a typed helper.");
    }

    async abortSession(sessionId: string): Promise<boolean> {
        return this.callSdkMethod(
            this.client.session.abort.bind(this.client.session),
            {
                path: {
                    id: sessionId,
                },
            },
        );
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        return this.callSdkMethod(
            this.client.session.delete.bind(this.client.session),
            {
                path: {
                    id: sessionId,
                },
            },
        );
    }

    async forkSession(sessionId: string, messageId?: string): Promise<OpenCodeSession> {
        return this.callSdkMethod(
            this.client.session.fork.bind(this.client.session),
            {
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
        );
    }

    async getPath(): Promise<OpenCodePath> {
        return this.callSdkOptionsOnlyMethod(
            this.client.path.get.bind(this.client.path),
        );
    }

    async listLspStatuses(directory?: string): Promise<OpenCodeLspStatus[]> {
        return directory
            ? this.callSdkMethod(
                this.client.lsp.status.bind(this.client.lsp),
                {
                    query: {
                        directory,
                    },
                },
            )
            : this.callSdkOptionsOnlyMethod(this.client.lsp.status.bind(this.client.lsp));
    }

    async listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>> {
        return directory
            ? this.callSdkMethod(
                this.client.mcp.status.bind(this.client.mcp),
                {
                    query: {
                        directory,
                    },
                },
            )
            : this.callSdkOptionsOnlyMethod(this.client.mcp.status.bind(this.client.mcp));
    }

    async getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>> {
        return this.loadSessionStatuses();
    }

    async listProjects(): Promise<OpenCodeProject[]> {
        return this.callSdkOptionsOnlyMethod(
            this.client.project.list.bind(this.client.project),
        );
    }

    async listSessions(): Promise<OpenCodeSession[]> {
        return this.callSdkOptionsOnlyMethod(
            this.client.session.list.bind(this.client.session),
        );
    }

    async getCurrentProject(): Promise<OpenCodeProject> {
        return this.callSdkOptionsOnlyMethod(
            this.client.project.current.bind(this.client.project),
        );
    }

    async createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession> {
        return this.callSdkMethod(
            this.client.session.create.bind(this.client.session),
            {
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
        );
    }

    async renameSession(sessionId: string, title: string): Promise<OpenCodeSession> {
        return this.callSdkMethod(
            this.client.session.update.bind(this.client.session),
            {
                path: {
                    id: sessionId,
                },
                body: {
                    title,
                },
            },
        );
    }

    async listAgents(): Promise<OpenCodeAgent[]> {
        return this.callSdkOptionsOnlyMethod(
            this.client.app.agents.bind(this.client.app),
        );
    }

    async replyToPermission(
        sessionId: string,
        requestId: string,
        reply: "once" | "always" | "reject",
    ): Promise<boolean> {
        return this.callSdkMethod(
            this.client.postSessionIdPermissionsPermissionId.bind(this.client),
            {
                path: {
                    id: sessionId,
                    permissionID: requestId,
                },
                body: {
                    response: reply,
                },
            },
        );
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

    async listConfiguredPlugins(): Promise<string[]> {
        const config = await this.loadConfig();

        return normalizeConfiguredPluginSpecs(config.plugin);
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
                    return normalizePromptResponse(await this.callSdkMethod(
                        this.client.session.message.bind(this.client.session),
                        {
                            path: {
                                id: sessionId,
                                messageID: messageId,
                            },
                        },
                        requestSignal,
                    ));
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
                    return normalizePromptResponses(await this.callSdkMethod(
                        this.client.session.messages.bind(this.client.session),
                        {
                            path: {
                                id: sessionId,
                            },
                            query: {
                                limit: PROMPT_MESSAGE_POLL_LIMIT,
                            },
                        },
                        requestSignal,
                    ));
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
        const [config, providerCatalog, connectedProviders] = await Promise.all([
            this.loadConfig(),
            this.loadProviderCatalog(),
            this.loadConnectedProviders(),
        ]);
        const models = buildSelectableModels(
            config,
            providerCatalog.providers,
            connectedProviders,
        );

        this.modelCache = {
            expiresAt: Date.now() + 60_000,
            promise: null,
            value: models,
        };

        return models;
    }

    private async loadConfig(): Promise<OpenCodeConfig> {
        return this.callSdkOptionsOnlyMethod(
            this.client.config.get.bind(this.client.config),
        );
    }

    private async loadProviderCatalog(): Promise<OpenCodeProviderCatalog> {
        return this.callSdkOptionsOnlyMethod(
            this.client.config.providers.bind(this.client.config),
        );
    }

    private async loadConnectedProviders(): Promise<OpenCodeConnectedProviders> {
        const providers = await this.callSdkOptionsOnlyMethod(
            this.client.provider.list.bind(this.client.provider),
        );

        return new Set(providers.connected);
    }

    private async sendPromptRequest(
        input: PromptSessionInput,
        parts: Array<
            | { type: "text"; text: string }
            | { type: "file"; filename?: string; mime: string; url: string }
        >,
    ): Promise<void> {
        const requestBody = {
            ...(input.agent ? { agent: input.agent } : {}),
            ...(input.model ? { model: input.model } : {}),
            ...(input.variant ? { variant: input.variant } : {}),
            parts,
        };

        try {
            await this.runPromptRequestWithTimeout(
                {
                    sessionId: input.sessionId,
                    stage: "send-prompt",
                    timeoutMs: this.promptTimeoutPolicy.waitTimeoutMs,
                },
                async (signal) => {
                    await this.callSdkMethod(
                        this.client.session.promptAsync.bind(this.client.session),
                        {
                            path: {
                                id: input.sessionId,
                            },
                            body: requestBody,
                        },
                        signal,
                    );
                },
                input.signal,
            );

            return;
        } catch (error) {
            this.logPromptRequestFailure(error, {
                sessionId: input.sessionId,
                stage: "send-prompt",
                timeoutMs: this.promptTimeoutPolicy.waitTimeoutMs,
            });
            throw error;
        }

    }

    private async loadSessionStatuses(
        signal?: AbortSignal,
    ): Promise<Record<string, OpenCodeSessionStatus>> {
        return this.callSdkOptionsOnlyMethod(
            this.client.session.status.bind(this.client.session),
            signal,
        );
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

        void log.call(this.client.app, {
            body: payload,
            ...SDK_OPTIONS,
        }).catch(() => undefined);
    }
}

export function createOpenCodeClientFromSdkClient(
    client: OpenCodeSdkClientLike,
    promptTimeoutPolicy: Partial<OpenCodePromptTimeoutPolicy> = {},
): OpenCodeClientLike {
    return new OpenCodeClient(undefined, client, promptTimeoutPolicy);
}

function buildSelectableModels(
    config: OpenCodeConfig,
    providers: OpenCodeProvider[],
    connectedProviders: OpenCodeConnectedProviders = new Set(),
): OpenCodeConfiguredModel[] {
    const configuredProviders = config.provider ?? {};
    const providersById = new Map(providers.map((provider) => [provider.id, provider]));
    const models = new Map<string, OpenCodeConfiguredModel>();

    for (const [providerId, providerConfig] of Object.entries(configuredProviders)) {
        if (!connectedProviders.has(providerId)) {
            continue;
        }

        const configuredModels = providerConfig.models ?? {};

        for (const [configuredModelKey, modelConfig] of Object.entries(configuredModels)) {
            const model = buildConfiguredModel(
                providerId,
                providerConfig,
                configuredModelKey,
                modelConfig,
                providersById.get(providerId),
            );

            if (model) {
                models.set(model.qualifiedId, model);
            }
        }
    }

    for (const provider of providers) {
        if (!connectedProviders.has(provider.id)) {
            continue;
        }

        for (const model of buildCatalogProviderModels(provider)) {
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
): OpenCodeConfiguredModel | null {
    const modelId = modelConfig.id ?? configuredModelKey;
    const catalogModel = providerCatalog?.models[modelId];

    if (!isTextModel(modelConfig, catalogModel)) {
        return null;
    }

    return {
        id: modelId,
        providerID: providerId,
        providerName: resolveProviderDisplayName(providerId, providerConfig, providerCatalog),
        name: modelConfig.name ?? catalogModel?.name ?? modelId,
        qualifiedId: `${providerId}/${modelId}`,
        reasoning: modelConfig.reasoning ?? catalogModel?.capabilities.reasoning ?? false,
        variants: normalizeVariants(readModelVariants(modelConfig) ?? readModelVariants(catalogModel)),
    };
}

function buildCatalogProviderModels(
    provider: OpenCodeProvider,
): OpenCodeConfiguredModel[] {
    return Object.values(provider.models)
        .filter((model) => isCatalogTextModel(model))
        .map((model) => ({
            id: model.id,
            providerID: provider.id,
            providerName: provider.name,
            name: model.name,
            qualifiedId: `${provider.id}/${model.id}`,
            reasoning: model.capabilities.reasoning,
            variants: normalizeVariants(readModelVariants(model)),
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
    variants: Record<string, unknown> | null | undefined,
): Record<string, Record<string, unknown>> {
    if (!variants || !isPlainRecord(variants)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(variants)
            .filter(([, config]) => !isPlainRecord(config) || config.disabled !== true)
            .map(([variant, config]) => {
                if (!isPlainRecord(config)) {
                    return [variant, {}];
                }

                const normalized = Object.fromEntries(
                    Object.entries(config).filter(([key]) => key !== "disabled"),
                );

                return [variant, normalized];
            }),
    );
}

function readModelVariants(value: unknown): Record<string, unknown> | null {
    if (!isPlainRecord(value) || !isPlainRecord(value.variants)) {
        return null;
    }

    return value.variants;
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

function resolveSdkRawGetOperation(client: OpenCodeSdkClientLike): OpenCodeSdkRawGetOperation | null {
    const compatibleClient = client as OpenCodeSdkClientLike & OpenCodeSdkRawCompatibleClient;
    const transport = compatibleClient.client ?? compatibleClient._client;
    const operation = transport?.get;

    return typeof operation === "function"
        ? operation.bind(transport)
        : null;
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

function unwrapSdkData<T>(response: OpenCodeSdkResult<T>): T {
    if (response && typeof response === "object" && "data" in response) {
        return response.data;
    }

    return response;
}

function normalizeConfiguredPluginSpecs(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const normalizedPlugins: string[] = [];
    const seenPlugins = new Set<string>();

    for (const item of value) {
        if (typeof item !== "string") {
            continue;
        }

        const normalizedItem = item.trim();

        if (normalizedItem.length === 0 || seenPlugins.has(normalizedItem)) {
            continue;
        }

        seenPlugins.add(normalizedItem);
        normalizedPlugins.push(normalizedItem);
    }

    return normalizedPlugins;
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
