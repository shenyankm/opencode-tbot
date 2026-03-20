import { resolve } from "node:path";
import { z } from "zod";

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

const AppConfigSchema = z.object({
    telegram: TelegramConfigSchema,
    state: StateConfigSchema,
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
    logLevel?: string;
    [key: string]: unknown;
}

export interface AppConfig {
    telegramBotToken: string;
    telegramAllowedChatIds: number[];
    telegramApiRoot: string;
    logLevel: string;
    stateFilePath: string;
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
    return {
        telegramBotToken: data.telegram.botToken,
        telegramAllowedChatIds: data.telegram.allowedChatIds,
        telegramApiRoot: normalizeApiRoot(data.telegram.apiRoot),
        logLevel: data.logLevel,
        stateFilePath: resolveStatePath(data, options.cwd ?? process.cwd()),
    };
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
