import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { stderr, stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parse } from "jsonc-parser";
import {
    DEFAULT_TELEGRAM_API_ROOT,
    type PluginConfigSource,
} from "./app/config.js";
import { OPENCODE_TBOT_VERSION } from "./app/package-info.js";
import {
    getGlobalPluginConfigFilePath,
    getOpenCodeConfigFilePath,
    mergePluginConfigSources,
    writePluginConfigFile,
} from "./app/plugin-config.js";

export interface InstallCommandOptions {
    botToken?: string;
    enableVoice?: boolean;
    homeDir?: string;
    openrouterApiKey?: string;
    pluginSpec?: string;
    registerPlugin?: boolean;
    telegramApiRoot?: string;
}

interface CliOptions extends InstallCommandOptions {
    command: "help" | "install" | "update" | "version";
}

interface OpenCodeGlobalConfig {
    plugin?: string[];
    [key: string]: unknown;
}

const DEFAULT_PLUGIN_SPEC = "opencode-tbot@latest";

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
    try {
        const exitCode = await runCli(argv);
        process.exitCode = exitCode;

        return exitCode;
    } catch (error) {
        stderr.write(`${formatCliError(error)}\n`);
        process.exitCode = 1;

        return 1;
    }
}

export async function runCli(argv: string[]): Promise<number> {
    const options = parseCliOptions(argv);

    if (options.command === "help") {
        stdout.write(`${buildHelpText()}\n`);
        return 0;
    }

    if (options.command === "version") {
        stdout.write(`${OPENCODE_TBOT_VERSION}\n`);
        return 0;
    }

    if (options.command === "update") {
        await updatePlugin(options);
        return 0;
    }

    await installPlugin(options);
    return 0;
}

export async function installPlugin(options: InstallCommandOptions = {}): Promise<void> {
    const homeDir = options.homeDir ?? homedir();
    const openCodeConfigFilePath = getOpenCodeConfigFilePath(homeDir);
    const globalPluginConfigFilePath = getGlobalPluginConfigFilePath(homeDir);
    const openCodeConfig = await readJsoncObject<OpenCodeGlobalConfig>(openCodeConfigFilePath);
    const existingPluginConfig = await readPluginConfigFile(globalPluginConfigFilePath);
    const prompt = createPromptSession();

    try {
        const botToken = normalizeRequiredString(
            options.botToken ?? await prompt.ask("Telegram bot token: "),
            "Telegram bot token is required.",
        );
        const enableVoice = options.enableVoice ?? await prompt.confirm(
            "Enable voice transcription? (y/N): ",
            false,
        );
        const openrouterApiKey = enableVoice
            ? normalizeRequiredString(
                options.openrouterApiKey ?? await prompt.ask("OpenRouter API key: "),
                "OpenRouter API key is required when voice transcription is enabled.",
            )
            : null;
        const telegramApiRoot = normalizeOptionalString(options.telegramApiRoot) ?? DEFAULT_TELEGRAM_API_ROOT;
        const pluginSpec = normalizeOptionalString(options.pluginSpec) ?? DEFAULT_PLUGIN_SPEC;
        const nextOpenCodeConfig = options.registerPlugin === false
            ? openCodeConfig
            : ensurePluginRegistered(openCodeConfig, pluginSpec);
        const nextPluginConfig = buildInstalledPluginConfig(
            existingPluginConfig,
            botToken,
            telegramApiRoot,
            openrouterApiKey,
        );

        if (options.registerPlugin === false) {
            await ensureParentDirectory(openCodeConfigFilePath);
        } else {
            await writeJsonFile(openCodeConfigFilePath, nextOpenCodeConfig);
        }
        await writePluginConfigFile(globalPluginConfigFilePath, nextPluginConfig);

        if (options.registerPlugin === false) {
            stdout.write(`Skipped plugin registration in ${openCodeConfigFilePath}\n`);
        } else {
            stdout.write(`Registered ${pluginSpec} in ${openCodeConfigFilePath}\n`);
        }
        stdout.write(`Wrote plugin defaults to ${globalPluginConfigFilePath}\n`);
    } finally {
        prompt.close();
    }
}

export async function updatePlugin(options: Pick<InstallCommandOptions, "homeDir" | "pluginSpec"> = {}): Promise<void> {
    const homeDir = options.homeDir ?? homedir();
    const openCodeConfigFilePath = getOpenCodeConfigFilePath(homeDir);
    const openCodeConfig = await readJsoncObject<OpenCodeGlobalConfig>(openCodeConfigFilePath);
    const pluginSpec = normalizeOptionalString(options.pluginSpec) ?? DEFAULT_PLUGIN_SPEC;
    const nextOpenCodeConfig = replacePluginRegistration(openCodeConfig, pluginSpec);

    await writeJsonFile(openCodeConfigFilePath, nextOpenCodeConfig);
    stdout.write(`Updated plugin registration to ${pluginSpec} in ${openCodeConfigFilePath}\n`);
}

function parseCliOptions(argv: string[]): CliOptions {
    const args = [...argv];
    const first = args[0];
    const command = !first || first.startsWith("-")
        ? "install"
        : first;
    const values = command === "install" || command === "version"
        ? args
        : args.slice(1);
    const options: CliOptions = {
        command: command === "help" || command === "--help" || command === "-h"
            ? "help"
            : command === "version" || command === "--version" || command === "-v"
                ? "version"
                : command === "update"
                    ? "update"
                    : "install",
    };

    for (let index = 0; index < values.length; index += 1) {
        const value = values[index];

        if (index === 0 && !value.startsWith("-")) {
            continue;
        }

        switch (value) {
            case "--bot-token":
                options.botToken = values[++index];
                break;
            case "--enable-voice":
                options.enableVoice = true;
                break;
            case "--disable-voice":
                options.enableVoice = false;
                break;
            case "--openrouter-api-key":
                options.openrouterApiKey = values[++index];
                break;
            case "--plugin-spec":
                options.pluginSpec = values[++index];
                break;
            case "--telegram-api-root":
                options.telegramApiRoot = values[++index];
                break;
            case "--skip-register":
                options.registerPlugin = false;
                break;
            case "--home-dir":
                options.homeDir = values[++index];
                break;
            case "--help":
            case "-h":
                options.command = "help";
                break;
            case "--version":
            case "-v":
                options.command = "version";
                break;
            default:
                throw new Error(`Unknown argument: ${value}`);
        }
    }

    return options;
}

function buildInstalledPluginConfig(
    current: PluginConfigSource,
    botToken: string,
    telegramApiRoot: string,
    openrouterApiKey: string | null,
): PluginConfigSource {
    const merged = mergePluginConfigSources(current, {
        telegram: {
            botToken,
            apiRoot: telegramApiRoot,
        },
    });
    const nextOpenRouter = openrouterApiKey
        ? {
            ...(merged.openrouter ?? {}),
            apiKey: openrouterApiKey,
        }
        : removeOpenRouterApiKey(merged.openrouter);

    return {
        ...merged,
        ...(nextOpenRouter && Object.keys(nextOpenRouter).length > 0
            ? { openrouter: nextOpenRouter }
            : {}),
    };
}

function removeOpenRouterApiKey(
    config: PluginConfigSource["openrouter"],
): PluginConfigSource["openrouter"] | undefined {
    if (!config) {
        return undefined;
    }

    const { apiKey: _apiKey, ...rest } = config;

    return Object.keys(rest).length > 0 ? rest : undefined;
}

function ensurePluginRegistered(
    config: OpenCodeGlobalConfig,
    pluginSpec: string,
): OpenCodeGlobalConfig {
    const plugins = Array.isArray(config.plugin)
        ? config.plugin.filter((item): item is string => typeof item === "string")
        : [];

    if (!plugins.includes(pluginSpec)) {
        plugins.push(pluginSpec);
    }

    return {
        ...config,
        plugin: plugins,
    };
}

function replacePluginRegistration(
    config: OpenCodeGlobalConfig,
    pluginSpec: string,
): OpenCodeGlobalConfig {
    const currentPlugins = Array.isArray(config.plugin)
        ? config.plugin.filter((item): item is string => typeof item === "string")
        : [];
    const nextPlugins: string[] = [];
    let inserted = false;

    for (const currentPlugin of currentPlugins) {
        if (isOpencodeTbotPluginSpec(currentPlugin)) {
            if (!inserted) {
                nextPlugins.push(pluginSpec);
                inserted = true;
            }

            continue;
        }

        nextPlugins.push(currentPlugin);
    }

    if (!inserted) {
        nextPlugins.push(pluginSpec);
    }

    return {
        ...config,
        plugin: nextPlugins,
    };
}

async function readPluginConfigFile(configFilePath: string): Promise<PluginConfigSource> {
    try {
        const content = await readFile(configFilePath, "utf8");
        const parsed = JSON.parse(content) as unknown;

        return isPlainObject(parsed)
            ? parsed as PluginConfigSource
            : {};
    } catch (error) {
        if (isMissingFileError(error)) {
            return {};
        }

        throw error;
    }
}

async function readJsoncObject<TObject extends Record<string, unknown>>(
    filePath: string,
): Promise<TObject> {
    try {
        const content = await readFile(filePath, "utf8");
        const parsed = parse(content) as unknown;

        return isPlainObject(parsed)
            ? parsed as TObject
            : {} as TObject;
    } catch (error) {
        if (isMissingFileError(error)) {
            return {} as TObject;
        }

        throw error;
    }
}

async function writeJsonFile(filePath: string, value: Record<string, unknown>): Promise<void> {
    await ensureParentDirectory(filePath);
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureParentDirectory(filePath: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
}

function createPromptSession() {
    if (!stdin.isTTY || !stdout.isTTY) {
        return {
            ask: async () => "",
            async confirm(_question: string, defaultValue: boolean) {
                return defaultValue;
            },
            close() { },
        };
    }

    const readline = createInterface({
        input: stdin,
        output: stdout,
    });

    return {
        ask(question: string) {
            return readline.question(question);
        },
        async confirm(question: string, defaultValue: boolean) {
            const answer = normalizeOptionalString(await readline.question(question));

            if (!answer) {
                return defaultValue;
            }

            if (["y", "yes"].includes(answer.toLowerCase())) {
                return true;
            }

            if (["n", "no"].includes(answer.toLowerCase())) {
                return false;
            }

            throw new Error(`Unsupported answer: ${answer}`);
        },
        close() {
            readline.close();
        },
    };
}

function normalizeOptionalString(value: string | undefined | null): string | null {
    const normalized = value?.trim();

    return normalized
        ? normalized
        : null;
}

function normalizeRequiredString(value: string | undefined | null, errorMessage: string): string {
    const normalized = normalizeOptionalString(value);

    if (!normalized) {
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

function isOpencodeTbotPluginSpec(value: string): boolean {
    const normalized = value.trim();

    return normalized === "opencode-tbot" || normalized.startsWith("opencode-tbot@");
}

function buildHelpText(): string {
    return [
        "Usage: opencode-tbot [install|update] [options]",
        "       opencode-tbot --version",
        "",
        "Commands:",
        "  install",
        "  update",
        "",
        "Options:",
        "  --bot-token <token>",
        "  --enable-voice",
        "  --disable-voice",
        "  --openrouter-api-key <key>",
        "  --telegram-api-root <url>",
        "  --plugin-spec <spec>",
        "  --skip-register",
        "  --home-dir <path>",
        "  --version",
        "  --help",
    ].join("\n");
}

function formatCliError(error: unknown): string {
    return error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : String(error);
}
