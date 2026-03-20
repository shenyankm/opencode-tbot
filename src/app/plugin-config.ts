import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PluginConfigSource } from "./config.js";

export const PLUGIN_CONFIG_FILE_NAME = "tbot.config.json";
export const GLOBAL_PLUGIN_DIRECTORY_NAME = "opencode-tbot";
export const GLOBAL_PLUGIN_CONFIG_FILE_NAME = "config.json";
export const OPENCODE_CONFIG_FILE_NAME = "opencode.json";

export interface PreparedPluginConfiguration {
    cwd: string;
    config: PluginConfigSource;
    globalConfigFilePath: string;
    projectConfigFilePath: string;
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
    const [globalConfig, projectConfig] = await Promise.all([
        loadPluginConfigFile(globalConfigFilePath),
        loadPluginConfigFile(projectConfigFilePath),
    ]);
    const config = stripLegacyVoiceConfig(mergePluginConfigSources(globalConfig, projectConfig, options.config));
    const configFilePath = await pathExists(projectConfigFilePath)
        ? projectConfigFilePath
        : globalConfigFilePath;

    return {
        cwd: options.cwd,
        config,
        globalConfigFilePath,
        projectConfigFilePath,
        configFilePath,
    };
}

export function getOpenCodeConfigDirectory(homeDir: string = homedir()): string {
    return join(homeDir, ".config", "opencode");
}

export function getOpenCodeConfigFilePath(homeDir: string = homedir()): string {
    return join(getOpenCodeConfigDirectory(homeDir), OPENCODE_CONFIG_FILE_NAME);
}

export function getGlobalPluginConfigFilePath(homeDir: string = homedir()): string {
    return join(
        getOpenCodeConfigDirectory(homeDir),
        GLOBAL_PLUGIN_DIRECTORY_NAME,
        GLOBAL_PLUGIN_CONFIG_FILE_NAME,
    );
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

        const normalized = source;
        const previousTelegram = merged.telegram;
        const previousState = merged.state;

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
        "logLevel",
    ]);
    const ordered: PluginConfigSource = {};

    if (config.telegram) {
        ordered.telegram = config.telegram;
    }

    if (config.state) {
        ordered.state = config.state;
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
