import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { getDefaultPluginLogDirectory } from "./opencode-paths.js";

export const DEFAULT_STATE_FILE_PATH = "./data/opencode-tbot.state.json";
export const DEFAULT_TELEGRAM_API_ROOT = "https://api.telegram.org";
export const DEFAULT_PROMPT_WAIT_TIMEOUT_MS = 1_800_000;
export const DEFAULT_PROMPT_POLL_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_PROMPT_RECOVERY_INACTIVITY_TIMEOUT_MS = 120_000;
export const DEFAULT_LOG_LEVEL = "info";
export const DEFAULT_LOG_RETENTION_MAX_FILES = 30;
export const DEFAULT_LOG_RETENTION_MAX_TOTAL_BYTES = 314_572_800;

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

const PromptConfigSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        waitTimeoutMs: z.number().int().positive().default(DEFAULT_PROMPT_WAIT_TIMEOUT_MS),
        pollRequestTimeoutMs: z.number().int().positive().default(DEFAULT_PROMPT_POLL_REQUEST_TIMEOUT_MS),
        recoveryInactivityTimeoutMs: z.number().int().positive().default(DEFAULT_PROMPT_RECOVERY_INACTIVITY_TIMEOUT_MS),
    }),
);

const LoggingConfigSchema = z.preprocess(
    (value) => value ?? {},
    z.object({
        level: z.string().trim().min(1).optional(),
        sinks: z.preprocess(
            (value) => value ?? {},
            z.object({
                host: z.boolean().default(true),
                file: z.boolean().default(true),
            }),
        ),
        file: z.preprocess(
            (value) => value ?? {},
            z.object({
                dir: z.string().trim().min(1).optional(),
                retention: z.preprocess(
                    (value) => value ?? {},
                    z.object({
                        maxFiles: z.number().int().positive().default(DEFAULT_LOG_RETENTION_MAX_FILES),
                        maxTotalBytes: z.number().int().positive().default(DEFAULT_LOG_RETENTION_MAX_TOTAL_BYTES),
                    }),
                ),
            }),
        ),
    }),
);

const AppConfigSchema = z.object({
    telegram: TelegramConfigSchema,
    state: StateConfigSchema,
    prompt: PromptConfigSchema,
    logging: LoggingConfigSchema.default({}),
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
    prompt?: {
        waitTimeoutMs?: number;
        pollRequestTimeoutMs?: number;
        recoveryInactivityTimeoutMs?: number;
        [key: string]: unknown;
    };
    logging?: {
        level?: string;
        sinks?: {
            host?: boolean;
            file?: boolean;
            [key: string]: unknown;
        };
        file?: {
            dir?: string;
            retention?: {
                maxFiles?: number;
                maxTotalBytes?: number;
                [key: string]: unknown;
            };
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface AppConfig {
    telegramBotToken: string;
    telegramAllowedChatIds: number[];
    telegramApiRoot: string;
    loggingLevel: string;
    loggingHostSinkEnabled: boolean;
    loggingFileSinkEnabled: boolean;
    loggingFileDir: string;
    loggingRetentionMaxFiles: number;
    loggingRetentionMaxTotalBytes: number;
    promptWaitTimeoutMs: number;
    promptPollRequestTimeoutMs: number;
    promptRecoveryInactivityTimeoutMs: number;
    stateFilePath: string;
    worktreePath: string;
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
    const cwd = options.cwd ?? process.cwd();
    const loggingLevel = normalizeLogLevelValue(data.logging.level);

    return {
        telegramBotToken: data.telegram.botToken,
        telegramAllowedChatIds: data.telegram.allowedChatIds,
        telegramApiRoot: normalizeApiRoot(data.telegram.apiRoot),
        loggingLevel,
        loggingHostSinkEnabled: data.logging.sinks.host,
        loggingFileSinkEnabled: data.logging.sinks.file,
        loggingFileDir: resolveLoggingDirectory(
            data.logging.file.dir,
            cwd,
        ),
        loggingRetentionMaxFiles: data.logging.file.retention.maxFiles,
        loggingRetentionMaxTotalBytes: data.logging.file.retention.maxTotalBytes,
        promptWaitTimeoutMs: data.prompt.waitTimeoutMs,
        promptPollRequestTimeoutMs: data.prompt.pollRequestTimeoutMs,
        promptRecoveryInactivityTimeoutMs: data.prompt.recoveryInactivityTimeoutMs,
        stateFilePath: resolveStatePath(data, cwd),
        worktreePath: cwd,
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

function normalizeLogLevelValue(value: string | undefined): string {
    const normalized = value?.trim().toLowerCase();

    switch (normalized) {
        case "debug":
        case "warn":
        case "error":
        case "info":
            return normalized;
        default:
            return DEFAULT_LOG_LEVEL;
    }
}

function resolveLoggingDirectory(value: string | undefined, cwd: string): string {
    const normalized = value?.trim();

    if (!normalized) {
        return getDefaultPluginLogDirectory(homedir());
    }

    return isAbsolute(normalized)
        ? normalized
        : resolve(cwd, normalized);
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
