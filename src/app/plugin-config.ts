import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { PluginConfigSource } from "./config.js";

export const PLUGIN_CONFIG_FILE_NAME = "tbot.config.json";
const LEGACY_PLUGIN_CONFIG_FILE_NAMES = ["opencode-tbot.config.json"];

export interface PreparedPluginConfiguration {
    cwd: string;
    config: PluginConfigSource;
    configFilePath: string;
}

export interface PromptTelegramBotTokenContext {
    cwd: string;
    configFilePath: string;
}

export interface PreparePluginConfigurationOptions {
    cwd: string;
    config?: PluginConfigSource;
    isInteractive?: () => boolean;
    promptForTelegramBotToken?: (
        context: PromptTelegramBotTokenContext,
    ) => Promise<string>;
}

export async function preparePluginConfiguration(
    options: PreparePluginConfigurationOptions,
): Promise<PreparedPluginConfiguration> {
    const configFilePath = await resolvePluginConfigFilePath(options.cwd);
    const fileConfig = await loadPluginConfigFile(configFilePath);
    let config = mergePluginConfigSources(fileConfig, options.config);
    const token = normalizeConfigString(config.telegram?.botToken);

    if (!token) {
        const isInteractive = options.isInteractive ?? isInteractiveTerminal;

        if (!isInteractive()) {
            throw new Error(
                [
                    "Missing telegram.botToken for the Telegram bot plugin.",
                    `Add it to ${configFilePath} before starting OpenCode.`,
                ].join(" "),
            );
        }

        console.info("[opencode-tbot] telegram.botToken is missing.");
        console.info(`[opencode-tbot] The value will be saved to ${configFilePath}.`);

        const promptForTelegramBotToken = options.promptForTelegramBotToken ?? promptForTelegramBotTokenFromTerminal;
        const promptedToken = normalizeRequiredConfigString(
            await promptForTelegramBotToken({ cwd: options.cwd, configFilePath }),
            "telegram.botToken cannot be empty.",
        );

        config = withTelegramBotToken(config, promptedToken);
        await writePluginConfigFile(configFilePath, config);

        console.info(`[opencode-tbot] Saved telegram.botToken to ${configFilePath}.`);
    }

    return {
        cwd: options.cwd,
        config,
        configFilePath,
    };
}

export async function promptForTelegramBotTokenFromTerminal(
    context: PromptTelegramBotTokenContext,
): Promise<string> {
    const readline = createInterface({
        input: stdin,
        output: stdout,
    });

    try {
        return await readline.question(
            `Enter telegram.botToken for opencode-tbot (${context.configFilePath}): `,
        );
    } finally {
        readline.close();
    }
}

export async function writePluginConfigFile(
    configFilePath: string,
    config: PluginConfigSource,
): Promise<void> {
    await mkdir(dirname(configFilePath), { recursive: true });
    await writeFile(configFilePath, serializePluginConfig(config), "utf8");
}

export function mergePluginConfigSources(
    ...sources: Array<PluginConfigSource | undefined>
): PluginConfigSource {
    const merged: PluginConfigSource = {};

    for (const source of sources) {
        if (!source) {
            continue;
        }

        const previousTelegram = merged.telegram;
        const previousDatabase = merged.database;
        const previousOpenRouter = merged.openrouter;

        Object.assign(merged, source);

        if (source.telegram) {
            merged.telegram = {
                ...(previousTelegram ?? {}),
                ...source.telegram,
            };
        }

        if (source.database) {
            merged.database = {
                ...(previousDatabase ?? {}),
                ...source.database,
            };
        }

        if (source.openrouter) {
            merged.openrouter = {
                ...(previousOpenRouter ?? {}),
                ...source.openrouter,
            };
        }
    }

    return merged;
}

export function serializePluginConfig(config: PluginConfigSource): string {
    return `${JSON.stringify(orderPluginConfig(config), null, 2)}\n`;
}

async function loadPluginConfigFile(configFilePath: string): Promise<PluginConfigSource> {
    try {
        const content = await readFile(configFilePath, "utf8");

        return parsePluginConfigText(content, configFilePath);
    } catch (error) {
        if (isMissingFileError(error)) {
            return {};
        }

        throw error;
    }
}

function parsePluginConfigText(
    content: string,
    configFilePath: string,
): PluginConfigSource {
    try {
        const parsed = JSON.parse(content) as unknown;

        if (!isPlainObject(parsed)) {
            throw new Error("Config root must be a JSON object.");
        }

        return parsed as PluginConfigSource;
    } catch (error) {
        throw new Error(
            [
                `Failed to parse ${configFilePath} as JSON.`,
                error instanceof Error ? error.message : String(error),
            ].join(" "),
        );
    }
}

function withTelegramBotToken(
    config: PluginConfigSource,
    botToken: string,
): PluginConfigSource {
    return mergePluginConfigSources(config, {
        telegram: {
            botToken,
        },
    });
}

function orderPluginConfig(config: PluginConfigSource): PluginConfigSource {
    const prioritizedKeys = new Set([
        "telegram",
        "database",
        "openrouter",
        "logLevel",
        "opencodeApiKey",
    ]);
    const ordered: PluginConfigSource = {};

    if (config.telegram) {
        ordered.telegram = config.telegram;
    }

    if (config.database) {
        ordered.database = config.database;
    }

    if (config.openrouter) {
        ordered.openrouter = config.openrouter;
    }

    if (config.logLevel !== undefined) {
        ordered.logLevel = config.logLevel;
    }

    if (config.opencodeApiKey !== undefined) {
        ordered.opencodeApiKey = config.opencodeApiKey;
    }

    for (const [key, value] of Object.entries(config)) {
        if (!prioritizedKeys.has(key)) {
            ordered[key] = value;
        }
    }

    return ordered;
}

function isInteractiveTerminal(): boolean {
    return Boolean(stdin.isTTY && stdout.isTTY);
}

function normalizeConfigString(value: string | undefined): string | null {
    if (value === undefined) {
        return null;
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : null;
}

function normalizeRequiredConfigString(value: string, errorMessage: string): string {
    const normalized = value.trim();

    if (normalized.length === 0) {
        throw new Error(errorMessage);
    }

    return normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function resolvePluginConfigFilePath(cwd: string): Promise<string> {
    const preferredPath = join(cwd, PLUGIN_CONFIG_FILE_NAME);

    if (await pathExists(preferredPath)) {
        return preferredPath;
    }

    for (const legacyFileName of LEGACY_PLUGIN_CONFIG_FILE_NAMES) {
        const legacyPath = join(cwd, legacyFileName);

        if (await pathExists(legacyPath)) {
            return legacyPath;
        }
    }

    return preferredPath;
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch (error) {
        if (isMissingFileError(error)) {
            return false;
        }

        throw error;
    }
}
