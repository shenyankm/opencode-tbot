import { resolve } from "node:path";
import { z } from "zod";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-audio-mini";
const AllowedChatIdSchema = z.union([
    z.number().int(),
    z.string().regex(/^-?\d+$/u).transform((value) => Number(value)),
]);

const TelegramConfigSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        botToken: z.string().trim().min(1),
        allowedChatIds: z.array(AllowedChatIdSchema).default([]),
    }),
);

const DatabaseConfigSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        path: z.string().default("./data/opencode-tbot.sqlite"),
    }),
);

const OpenRouterConfigSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        apiKey: z.string().default(""),
        model: z.string().default(DEFAULT_OPENROUTER_MODEL),
        timeoutMs: z.coerce.number().int().positive().default(30_000),
        transcriptionPrompt: z.string().default(""),
    }),
);

const AppConfigSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        telegram: TelegramConfigSchema,
        database: DatabaseConfigSchema,
        openrouter: OpenRouterConfigSchema,
        logLevel: z.string().default("info"),
        opencodeApiKey: z.string().default(""),
    }),
);

export interface PluginConfigSource {
    telegram?: {
        botToken?: string;
        allowedChatIds?: Array<number | string>;
        [key: string]: unknown;
    };
    database?: {
        path?: string;
        [key: string]: unknown;
    };
    openrouter?: {
        apiKey?: string;
        model?: string;
        timeoutMs?: number;
        transcriptionPrompt?: string;
        [key: string]: unknown;
    };
    logLevel?: string;
    opencodeApiKey?: string;
    [key: string]: unknown;
}

export interface AppOpenRouterConfig {
    configured: boolean;
    apiKey: string | null;
    model: string;
    timeoutMs: number;
    transcriptionPrompt: string | null;
}

export interface AppConfig {
    telegramBotToken: string;
    telegramAllowedChatIds: number[];
    logLevel: string;
    botStateDbPath: string;
    opencodeApiKey: string;
    openrouter: AppOpenRouterConfig;
}

export interface LoadAppConfigOptions {
    cwd?: string;
}

export function loadAppConfig(
    configSource: PluginConfigSource | undefined = {},
    options: LoadAppConfigOptions = {},
): AppConfig {
    const parsed = parseConfig(AppConfigSchema, configSource);

    return buildAppConfig(parsed, options);
}

export const loadPluginConfig = loadAppConfig;

function buildAppConfig(
    data: z.infer<typeof AppConfigSchema>,
    options: LoadAppConfigOptions,
): AppConfig {
    const openRouterApiKey = normalizeOptionalString(data.openrouter.apiKey);
    const openRouterModel = normalizeOptionalString(data.openrouter.model) ?? DEFAULT_OPENROUTER_MODEL;
    const transcriptionPrompt = normalizeOptionalString(data.openrouter.transcriptionPrompt);

    return {
        telegramBotToken: data.telegram.botToken,
        telegramAllowedChatIds: data.telegram.allowedChatIds,
        logLevel: data.logLevel,
        botStateDbPath: resolve(options.cwd ?? process.cwd(), data.database.path),
        opencodeApiKey: data.opencodeApiKey,
        openrouter: {
            configured: !!openRouterApiKey,
            apiKey: openRouterApiKey,
            model: openRouterModel,
            timeoutMs: data.openrouter.timeoutMs,
            transcriptionPrompt,
        },
    };
}

function normalizeOptionalString(value: string): string | null {
    const normalized = value.trim();

    return normalized.length > 0 ? normalized : null;
}

function parseConfig<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    configSource: PluginConfigSource | undefined,
): z.infer<TSchema> {
    const parsed = schema.safeParse(configSource ?? {});

    if (parsed.success) {
        return parsed.data;
    }

    throw new Error(
        `Invalid plugin configuration: ${JSON.stringify(parsed.error.flatten())}`,
    );
}
