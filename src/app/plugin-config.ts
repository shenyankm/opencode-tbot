import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PluginConfigSource } from "./config.js";
import {
    getDefaultPluginLogDirectory,
    getGlobalPluginConfigFilePath,
    getOpenCodeConfigDirectory,
    getOpenCodeConfigFilePath,
    getOpenCodeJsoncConfigFilePath,
    GLOBAL_PLUGIN_CONFIG_FILE_NAME,
    GLOBAL_PLUGIN_DIRECTORY_NAME,
    OPENCODE_CONFIG_FILE_NAME,
    OPENCODE_CONFIG_JSONC_FILE_NAME,
    resolveWritableOpenCodeConfigFilePath,
} from "./opencode-paths.js";

export const PLUGIN_CONFIG_FILE_NAME = "tbot.config.json";

export interface PreparedPluginConfiguration {
    cwd: string;
    config: PluginConfigSource;
    globalConfigFilePath: string;
    projectConfigFilePath: string;
    ignoredProjectConfigFilePath?: string;
    configFilePath: string;
}

export interface PreparePluginConfigurationOptions {
    cwd: string;
    config?: PluginConfigSource;
    homeDir?: string;
}

export async function preparePluginConfiguration(
    options: PreparePluginConfigurationOptions,
): Promise<PreparedPluginConfiguration> {
    const homeDir = options.homeDir ?? homedir();
    const globalConfigFilePath = getGlobalPluginConfigFilePath(homeDir);
    const projectConfigFilePath = await resolveProjectPluginConfigFilePath(options.cwd);
    const [globalConfig, hasIgnoredProjectConfig] = await Promise.all([
        loadPluginConfigFile(globalConfigFilePath),
        pathExists(projectConfigFilePath),
    ]);
    const config = stripLegacyVoiceConfig(mergePluginConfigSources(globalConfig, options.config));
    const ignoredProjectConfigFilePath = hasIgnoredProjectConfig
        ? projectConfigFilePath
        : undefined;
    const configFilePath = globalConfigFilePath;

    return {
        cwd: options.cwd,
        config,
        globalConfigFilePath,
        projectConfigFilePath,
        ...(ignoredProjectConfigFilePath ? { ignoredProjectConfigFilePath } : {}),
        configFilePath,
    };
}

export {
    getDefaultPluginLogDirectory,
    getGlobalPluginConfigFilePath,
    getOpenCodeConfigDirectory,
    getOpenCodeConfigFilePath,
    getOpenCodeJsoncConfigFilePath,
    GLOBAL_PLUGIN_CONFIG_FILE_NAME,
    GLOBAL_PLUGIN_DIRECTORY_NAME,
    OPENCODE_CONFIG_FILE_NAME,
    OPENCODE_CONFIG_JSONC_FILE_NAME,
    resolveWritableOpenCodeConfigFilePath,
};

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

        const normalized = source;
        const previousTelegram = merged.telegram;
        const previousState = merged.state;
        const previousPrompt = merged.prompt;
        const previousLogging = merged.logging;

        Object.assign(merged, normalized);

        if (normalized.telegram) {
            merged.telegram = {
                ...(previousTelegram ?? {}),
                ...normalized.telegram,
            };
        }

        if (normalized.state) {
            merged.state = {
                ...(previousState ?? {}),
                ...normalized.state,
            };
        }

        if (normalized.prompt) {
            merged.prompt = {
                ...(previousPrompt ?? {}),
                ...normalized.prompt,
            };
        }

        if (normalized.logging) {
            const previousLoggingSinks = previousLogging?.sinks;
            const previousLoggingFile = previousLogging?.file;
            const previousRetention = previousLoggingFile?.retention;

            merged.logging = {
                ...(previousLogging ?? {}),
                ...normalized.logging,
                ...(normalized.logging.sinks || previousLoggingSinks
                    ? {
                        sinks: {
                            ...(previousLoggingSinks ?? {}),
                            ...(normalized.logging.sinks ?? {}),
                        },
                    }
                    : {}),
                ...(normalized.logging.file || previousLoggingFile
                    ? {
                        file: {
                            ...(previousLoggingFile ?? {}),
                            ...(normalized.logging.file ?? {}),
                            ...(normalized.logging.file?.retention || previousRetention
                                ? {
                                    retention: {
                                        ...(previousRetention ?? {}),
                                        ...(normalized.logging.file?.retention ?? {}),
                                    },
                                }
                                : {}),
                        },
                    }
                    : {}),
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

function orderPluginConfig(config: PluginConfigSource): PluginConfigSource {
    const prioritizedKeys = new Set([
        "telegram",
        "state",
        "prompt",
        "logging",
        "logLevel",
    ]);
    const ordered: PluginConfigSource = {};

    if (config.telegram) {
        ordered.telegram = config.telegram;
    }

    if (config.state) {
        ordered.state = config.state;
    }

    if (config.prompt) {
        ordered.prompt = config.prompt;
    }

    if (config.logging) {
        ordered.logging = config.logging;
    }

    if (config.logLevel !== undefined) {
        ordered.logLevel = config.logLevel;
    }

    for (const [key, value] of Object.entries(config)) {
        if (!prioritizedKeys.has(key)) {
            ordered[key] = value;
        }
    }

    return ordered;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function resolveProjectPluginConfigFilePath(cwd: string): Promise<string> {
    const preferredPath = join(cwd, PLUGIN_CONFIG_FILE_NAME);

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

function stripLegacyVoiceConfig(config: PluginConfigSource): PluginConfigSource {
    const { openrouter: _openrouter, ...rest } = config as PluginConfigSource & {
        openrouter?: unknown;
    };

    return rest;
}
