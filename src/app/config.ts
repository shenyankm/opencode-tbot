import { resolve } from "node:path";
import { z } from "zod";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-audio-mini";
export const DEFAULT_STATE_FILE_PATH = "./data/opencode-tbot.state.json";
export const DEFAULT_TELEGRAM_API_ROOT = "https://api.telegram.org";

const AllowedChatIdSchema = z.union([
    z.number().int(),
    z.string().regex(/^-?\d+$/u).transform((value) => Number(value)),
]);

const TelegramConfigSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        botToken: z.string().trim().min(1),
        allowedChatIds: z.array(AllowedChatIdSchema).default([]),
        apiRoot: z.string().trim().url().default(DEFAULT_TELEGRAM_API_ROOT),
    }),
);

const StateConfigSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        path: z.string().trim().min(1).default(DEFAULT_STATE_FILE_PATH),
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

const AppConfigSchema = z.object({
    telegram: TelegramConfigSchema,
    state: StateConfigSchema,
    openrouter: OpenRouterConfigSchema,
    logLevel: z.string().default("info"),
});

export interface PluginConfigSource {
    telegram?: {
        botToken?: string;
        allowedChatIds?: Array<number | string>;
        apiRoot?: string;
        [key: string]: unknown;
    };
    state?: {
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
    telegramApiRoot: string;
    logLevel: string;
    stateFilePath: string;
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
        telegramApiRoot: normalizeApiRoot(data.telegram.apiRoot),
        logLevel: data.logLevel,
        stateFilePath: resolveStatePath(data, options.cwd ?? process.cwd()),
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

function resolveStatePath(
    data: z.infer<typeof AppConfigSchema>,
    cwd: string,
): string {
    return resolve(cwd, data.state.path || DEFAULT_STATE_FILE_PATH);
}

function normalizeApiRoot(value: string): string {
    const normalized = value.trim();

    return normalized.endsWith("/")
        ? normalized.slice(0, -1)
        : normalized;
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
