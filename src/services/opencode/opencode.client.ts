import {
    type Agent,
    type AssistantMessage,
    createOpencodeClient,
    type Config,
    type Model,
    type OpencodeClient,
    type Part,
    type Path,
    type Provider,
    type Project,
    type Session,
} from "@opencode-ai/sdk/v2/client";
import { z } from "zod";

export interface OpenCodeClientOptions {
    baseUrl: string;
    apiKey?: string;
}

export interface PromptSessionInput {
    sessionId: string;
    prompt: string;
    agent?: string | null;
    structured?: boolean;
    model?: {
        providerID: string;
        modelID: string;
    };
    variant?: string | null;
}

export interface PromptSessionMetrics {
    durationMs: number | null;
    totalTokens: number | null;
}

export interface PromptSessionResult {
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
export type OpenCodePath = Path;
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

type OpenCodeSdkClient = Pick<OpencodeClient, "app" | "config" | "global" | "path" | "project" | "session">;
type MaybeWrappedResponse<T> = T | { data: T };
type OpenCodeProviderCatalog = {
    providers: OpenCodeProvider[];
    default: Record<string, string>;
};
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
    getHealth(): Promise<OpenCodeHealth>;
    getPath(): Promise<OpenCodePath>;
    getConfig(): Promise<OpenCodeConfig>;
    listProjects(): Promise<OpenCodeProject[]>;
    listSessions(): Promise<OpenCodeSession[]>;
    getCurrentProject(): Promise<OpenCodeProject>;
    createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession>;
    listAgents(): Promise<OpenCodeAgent[]>;
    listModels(): Promise<OpenCodeConfiguredModel[]>;
    promptSession(input: PromptSessionInput): Promise<PromptSessionResult>;
}

export class OpenCodeClient implements OpenCodeClientLike {
    private readonly client: OpenCodeSdkClient;

    constructor(options: OpenCodeClientOptions, client?: OpenCodeSdkClient) {
        this.client = client ?? createOpencodeClient({
            baseUrl: options.baseUrl,
        });
    }

    async getHealth(): Promise<OpenCodeHealth> {
        const response = await this.client.global.health(SDK_OPTIONS) as MaybeWrappedResponse<OpenCodeHealth>;

        return unwrapSdkData(response);
    }

    async getPath(): Promise<OpenCodePath> {
        const response = await this.client.path.get(undefined, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodePath>;

        return unwrapSdkData(response);
    }

    async getConfig(): Promise<OpenCodeConfig> {
        const response = await this.client.config.get(undefined, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodeConfig>;

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

    async listAgents(): Promise<OpenCodeAgent[]> {
        const response = await this.client.app.agents(undefined, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodeAgent[]>;

        return unwrapSdkData(response);
    }

    async listModels(): Promise<OpenCodeConfiguredModel[]> {
        const [configResponse, providersResponse] = await Promise.all([
            this.client.config.get(undefined, SDK_OPTIONS) as Promise<MaybeWrappedResponse<OpenCodeConfig>>,
            this.client.config.providers(undefined, SDK_OPTIONS) as Promise<MaybeWrappedResponse<OpenCodeProviderCatalog>>,
        ]);
        const config = unwrapSdkData(configResponse);
        const providerCatalog = unwrapSdkData(providersResponse);

        return buildConfiguredModels(config, providerCatalog.providers);
    }

    async promptSession(input: PromptSessionInput): Promise<PromptSessionResult> {
        const startedAt = Date.now();
        const response = await this.client.session.prompt({
            sessionID: input.sessionId,
            ...(input.agent ? { agent: input.agent } : {}),
            ...(input.structured ? { format: STRUCTURED_REPLY_SCHEMA } : {}),
            ...(input.model ? { model: input.model } : {}),
            ...(input.variant ? { variant: input.variant } : {}),
            parts: [
                {
                    type: "text",
                    text: input.prompt,
                },
            ],
        }, SDK_OPTIONS) as MaybeWrappedResponse<OpenCodePromptResponse>;
        const data = unwrapSdkData(response);
        const finishedAt = Date.now();
        const bodyMd = input.structured ? extractStructuredMarkdown(data.info?.structured) : null;
        const fallbackText = extractTextFromParts(data.parts) || bodyMd || EMPTY_RESPONSE_TEXT;

        return {
            bodyMd,
            fallbackText,
            info: data.info ?? null,
            metrics: extractPromptMetrics(data.info, startedAt, finishedAt),
            parts: data.parts,
            structured: data.info?.structured ?? null,
        };
    }
}

function buildConfiguredModels(
    config: OpenCodeConfig,
    providers: OpenCodeProvider[],
): OpenCodeConfiguredModel[] {
    const configuredProviders = config.provider ?? {};
    const providersById = new Map(providers.map((provider) => [provider.id, provider]));

    return Object.entries(configuredProviders).flatMap(([providerId, providerConfig]) => {
        const configuredModels = providerConfig.models ?? {};

        return Object.entries(configuredModels)
            .map(([configuredModelKey, modelConfig]) =>
                buildConfiguredModel(
                    providerId,
                    providerConfig,
                    configuredModelKey,
                    modelConfig,
                    providersById.get(providerId),
                ),
            )
            .filter((model): model is OpenCodeConfiguredModel => model !== null);
    });
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
        providerName: providerConfig.name ?? providerCatalog?.name ?? providerId,
        name: modelConfig.name ?? catalogModel?.name ?? modelId,
        qualifiedId: `${providerId}/${modelId}`,
        reasoning: modelConfig.reasoning ?? catalogModel?.capabilities.reasoning ?? false,
        variants: normalizeVariants(modelConfig.variants ?? catalogModel?.variants),
    };
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
        totalTokens: extractTotalTokens(info),
    };
}

function extractTotalTokens(info: OpenCodeAssistantMessage | null | undefined): number | null {
    if (!info?.tokens) {
        return null;
    }

    if (typeof info.tokens.total === "number" && Number.isFinite(info.tokens.total)) {
        return info.tokens.total;
    }

    const total =
        (info.tokens.input ?? 0) +
        (info.tokens.output ?? 0) +
        (info.tokens.reasoning ?? 0) +
        (info.tokens.cache?.read ?? 0) +
        (info.tokens.cache?.write ?? 0);

    return Number.isFinite(total) ? total : null;
}

function unwrapSdkData<T>(response: MaybeWrappedResponse<T>): T {
    if (response && typeof response === "object" && "data" in response) {
        return response.data;
    }

    return response;
}
