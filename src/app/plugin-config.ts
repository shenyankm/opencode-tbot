import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import type { PluginConfigSource } from "./config.js";
import {
    getDefaultPluginLogDirectory,
    getGlobalOpenCodeConfigFilePath,
    getGlobalPluginConfigFilePath,
    getOpenCodeConfigDirectory,
    GLOBAL_PLUGIN_CONFIG_FILE_NAME,
    GLOBAL_PLUGIN_DIRECTORY_NAME,
    GLOBAL_OPENCODE_CONFIG_FILE_NAME,
} from "./opencode-paths.js";

export interface PreparedPluginConfiguration {
    cwd: string;
    config: PluginConfigSource;
    configFilePath: string;
}

export interface PreparePluginConfigurationOptions {
    cwd: string;
    config?: PluginConfigSource;
    homeDir?: string;
}

type KnownPluginConfigSections = Pick<
    PluginConfigSource,
    "telegram" | "state" | "prompt" | "logging"
>;

type PluginConfigSectionKey = keyof KnownPluginConfigSections;

type PluginConfigSectionValue<TKey extends PluginConfigSectionKey> =
    NonNullable<KnownPluginConfigSections[TKey]>;

type SectionMerger<TKey extends PluginConfigSectionKey> = (
    previous: KnownPluginConfigSections[TKey] | undefined,
    next: PluginConfigSectionValue<TKey>,
) => PluginConfigSectionValue<TKey>;

const PLUGIN_CONFIG_SECTION_KEYS = [
    "telegram",
    "state",
    "prompt",
    "logging",
] as const satisfies PluginConfigSectionKey[];

const PLUGIN_CONFIG_SECTION_MERGERS: {
    [TKey in PluginConfigSectionKey]: SectionMerger<TKey>;
} = {
    telegram: mergeObjectSection,
    state: mergeObjectSection,
    prompt: mergeObjectSection,
    logging: mergeLoggingConfig,
};

export async function preparePluginConfiguration(
    options: PreparePluginConfigurationOptions,
): Promise<PreparedPluginConfiguration> {
    const homeDir = options.homeDir ?? homedir();
    const configFilePath = getGlobalPluginConfigFilePath(homeDir);
    const globalConfig = await loadPluginConfigFile(configFilePath);
    const config = mergePluginConfigSources(globalConfig, options.config);

    return {
        cwd: options.cwd,
        config,
        configFilePath,
    };
}

export {
    getDefaultPluginLogDirectory,
    getGlobalOpenCodeConfigFilePath,
    getGlobalPluginConfigFilePath,
    getOpenCodeConfigDirectory,
    GLOBAL_PLUGIN_CONFIG_FILE_NAME,
    GLOBAL_PLUGIN_DIRECTORY_NAME,
    GLOBAL_OPENCODE_CONFIG_FILE_NAME,
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

        const previousSections = {
            telegram: merged.telegram,
            state: merged.state,
            prompt: merged.prompt,
            logging: merged.logging,
        } satisfies Partial<KnownPluginConfigSections>;

        Object.assign(merged, source);

        for (const key of PLUGIN_CONFIG_SECTION_KEYS) {
            const nextSection = source[key];

            if (!nextSection) {
                continue;
            }

            merged[key] = PLUGIN_CONFIG_SECTION_MERGERS[key](
                previousSections[key],
                nextSection,
            );
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

function mergeObjectSection<TSection extends Record<string, unknown>>(
    previous: TSection | undefined,
    next: TSection,
): TSection {
    return {
        ...(previous ?? {}),
        ...next,
    };
}

function mergeLoggingConfig(
    previous: PluginConfigSource["logging"] | undefined,
    next: NonNullable<PluginConfigSource["logging"]>,
): NonNullable<PluginConfigSource["logging"]> {
    const merged = mergeObjectSection(previous ?? {}, next);
    const mergedSinks = next.sinks || previous?.sinks
        ? mergeObjectSection(previous?.sinks ?? {}, next.sinks ?? {})
        : undefined;
    const mergedRetention = next.file?.retention || previous?.file?.retention
        ? mergeObjectSection(
            previous?.file?.retention ?? {},
            next.file?.retention ?? {},
        )
        : undefined;
    const mergedFile = next.file || previous?.file
        ? {
            ...mergeObjectSection(previous?.file ?? {}, next.file ?? {}),
            ...(mergedRetention ? { retention: mergedRetention } : {}),
        }
        : undefined;

    return {
        ...merged,
        ...(mergedSinks ? { sinks: mergedSinks } : {}),
        ...(mergedFile ? { file: mergedFile } : {}),
    };
}
