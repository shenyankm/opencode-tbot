import {
    type Agent,
    type AssistantMessage,
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
export type OpenCodeAssistantMessage = AssistantMessage;
export type OpenCodeAssistantError = NonNullable<OpenCodeAssistantMessage["error"]>;
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

type RawSdkHttpClient = {
    get(options: {
        responseStyle?: "data" | "fields";
        throwOnError?: boolean;
        url: string;
    }): Promise<unknown>;
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
    info: OpenCodeAssistantMessage;
    parts: Part[];
};

const EMPTY_RESPONSE_TEXT = "OpenCode returned empty response.";
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
    replyToPermission(requestId: string, reply: "once" | "always" | "reject", message?: string): Promise<boolean>;
    listModels(): Promise<OpenCodeConfiguredModel[]>;
    promptSession(input: PromptSessionInput): Promise<PromptSessionResult>;
}

export class OpenCodeClient implements OpenCodeClientLike {
    readonly client: OpenCodeSdkClientLike;
    private readonly fetchFn: typeof fetch;
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
    ) {
        if (!options && !client) {
            throw new Error("OpenCodeClient requires either base URL options or an injected SDK client.");
        }

        this.client = client ?? createOpencodeClient(buildOpenCodeSdkConfig(options as OpenCodeClientOptions));
        this.fetchFn = fetchFn;
    }

    async getHealth(): Promise<OpenCodeHealth> {
        const healthEndpoint = this.client.global?.health;

        if (typeof healthEndpoint === "function") {
            const response = await healthEndpoint.call(
                this.client.global,
                SDK_OPTIONS,
            ) as MaybeWrappedResponse<OpenCodeHealth>;

            return unwrapSdkData(response);
        }

        const rawClient = getRawSdkClient(this.client);

        if (!rawClient) {
            throw new Error("OpenCode SDK client does not expose a compatible health endpoint.");
        }

        const response = await rawClient.get({
            url: "/global/health",
            ...SDK_OPTIONS,
        }) as MaybeWrappedResponse<OpenCodeHealth>;

        return unwrapSdkData(response);
    }

    async abortSession(sessionId: string): Promise<boolean> {
        const response = await this.client.session.abort(
            { sessionID: sessionId },
            SDK_OPTIONS,
        ) as MaybeWrappedResponse<boolean>;

        return unwrapSdkData(response);
    }

    async getPath(): Promise<OpenCodePath> {
        const response = await this.client.path.get(undefined, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodePath>;

        return unwrapSdkData(response);
    }

    async listLspStatuses(directory?: string): Promise<OpenCodeLspStatus[]> {
        const response = await this.client.lsp.status(
            directory
                ? { directory }
                : undefined,
            SDK_OPTIONS,
        ) as MaybeWrappedResponse<OpenCodeLspStatus[]>;

        return unwrapSdkData(response);
    }

    async listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>> {
        const response = await this.client.mcp.status(
            directory
                ? { directory }
                : undefined,
            SDK_OPTIONS,
        ) as MaybeWrappedResponse<Record<string, OpenCodeMcpStatus>>;

        return unwrapSdkData(response);
    }

    async getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>> {
        const response = await this.client.session.status(
            undefined,
            SDK_OPTIONS,
        ) as MaybeWrappedResponse<Record<string, OpenCodeSessionStatus>>;

        return unwrapSdkData(response);
    }

    async listProjects(): Promise<OpenCodeProject[]> {
        const response = await this.client.project.list(undefined, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodeProject[]>;

        return unwrapSdkData(response);
    }

    async listSessions(): Promise<OpenCodeSession[]> {
        const response = await this.client.session.list(undefined, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodeSession[]>;

        return unwrapSdkData(response);
    }

    async getCurrentProject(): Promise<OpenCodeProject> {
        const response = await this.client.project.current(undefined, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodeProject>;

        return unwrapSdkData(response);
    }

    async createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession> {
        const response = await this.client.session.create(
            title ? { directory, title } : { directory },
            SDK_OPTIONS,
        ) as MaybeWrappedResponse<OpenCodeSession>;

        return unwrapSdkData(response);
    }

    async renameSession(sessionId: string, title: string): Promise<OpenCodeSession> {
        const response = await this.client.session.update(
            { sessionID: sessionId, title },
            SDK_OPTIONS,
        ) as MaybeWrappedResponse<OpenCodeSession>;

        return unwrapSdkData(response);
    }

    async listAgents(): Promise<OpenCodeAgent[]> {
        const response = await this.client.app.agents(undefined, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodeAgent[]>;

        return unwrapSdkData(response);
    }

    async listPendingPermissions(directory?: string): Promise<OpenCodePermissionRequest[]> {
        const response = await this.client.permission.list(
            directory
                ? { directory }
                : undefined,
            SDK_OPTIONS,
        ) as MaybeWrappedResponse<OpenCodePermissionRequest[]>;

        return unwrapSdkData(response);
    }

    async replyToPermission(
        requestId: string,
        reply: "once" | "always" | "reject",
        message?: string,
    ): Promise<boolean> {
        const response = await this.client.permission.reply(
            {
                requestID: requestId,
                reply,
                ...(message?.trim()
                    ? { message: message.trim() }
                    : {}),
            },
            SDK_OPTIONS,
        ) as MaybeWrappedResponse<boolean>;

        return unwrapSdkData(response);
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

        const response = await this.client.session.prompt({
            sessionID: input.sessionId,
            ...(input.agent ? { agent: input.agent } : {}),
            ...(input.structured ? { format: STRUCTURED_REPLY_SCHEMA } : {}),
            ...(input.model ? { model: input.model } : {}),
            ...(input.variant ? { variant: input.variant } : {}),
            parts,
        }, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodePromptResponse>;
        const data = unwrapSdkData(response);
        const finishedAt = Date.now();
        const bodyMd = input.structured ? extractStructuredMarkdown(data.info?.structured) : null;
        const fallbackText = extractTextFromParts(data.parts) || bodyMd || EMPTY_RESPONSE_TEXT;

        return {
            assistantError: data.info?.error ?? null,
            bodyMd,
            fallbackText,
            info: data.info ?? null,
            metrics: extractPromptMetrics(data.info, startedAt, finishedAt),
            parts: data.parts,
            structured: data.info?.structured ?? null,
        };
    }

    private async loadModels(): Promise<OpenCodeConfiguredModel[]> {
        const [configResponse, providersResponse] = await Promise.all([
            this.client.config.get(undefined, SDK_OPTIONS) as Promise<MaybeWrappedResponse<OpenCodeConfig>>,
            this.client.config.providers(undefined, SDK_OPTIONS) as Promise<MaybeWrappedResponse<OpenCodeProviderCatalog>>,
        ]);
        const config = unwrapSdkData(configResponse);
        const providerCatalog = unwrapSdkData(providersResponse);
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
}

export function createOpenCodeClientFromSdkClient(
    client: OpenCodeSdkClientLike,
    fetchFn: typeof fetch = fetch,
): OpenCodeClientLike {
    return new OpenCodeClient(undefined, client, fetchFn);
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

function extractTextFromParts(parts: Part[]): string {
    return parts
        .filter((part): part is Extract<Part, { type: "text"; text: string }> => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
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

function getRawSdkClient(client: OpenCodeSdkClientLike): RawSdkHttpClient | null {
    const withRawClient = client as OpenCodeSdkClientLike & {
        client?: RawSdkHttpClient;
    };

    return withRawClient.client ?? client._client ?? null;
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
