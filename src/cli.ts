import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { stderr, stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { parse } from "jsonc-parser";
import {
    DEFAULT_TELEGRAM_API_ROOT,
    type PluginConfigSource,
} from "./app/config.js";
import { OPENCODE_TBOT_VERSION } from "./app/package-info.js";
import {
    mergePluginConfigSources,
    writePluginConfigFile,
} from "./app/plugin-config.js";
import {
    getDefaultPluginLogDirectory,
    getGlobalPluginConfigFilePath,
    resolveWritableOpenCodeConfigFilePath,
} from "./app/opencode-paths.js";

export interface InstallCommandOptions {
    botToken?: string;
    homeDir?: string;
    pluginSpec?: string;
    registerPlugin?: boolean;
    telegramApiRoot?: string;
}

interface CliOptions extends InstallCommandOptions {
    command: "help" | "install" | "update" | "version";
}

export interface PromptSessionLike {
    ask(question: string): Promise<string>;
    askSecret(question: string): Promise<string>;
    confirm(question: string, defaultValue: boolean): Promise<boolean>;
    close(): void;
}

export interface CreatePromptSessionOptions {
    input?: NodeJS.ReadStream;
    output?: NodeJS.WriteStream;
}

interface OpenCodeGlobalConfig {
    plugin?: string[];
    [key: string]: unknown;
}

const DEFAULT_PLUGIN_SPEC = "opencode-tbot@latest";
const PROMPT_CANCELLED_ERROR = "Prompt cancelled.";

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
    const openCodeConfigFilePath = await resolveWritableOpenCodeConfigFilePath(homeDir);
    const globalPluginConfigFilePath = getGlobalPluginConfigFilePath(homeDir);
    const openCodeConfig = await readJsoncObject<OpenCodeGlobalConfig>(openCodeConfigFilePath);
    const existingPluginConfig = await readPluginConfigFile(globalPluginConfigFilePath);
    const prompt = createPromptSession();

    try {
        const botToken = normalizeRequiredString(
            options.botToken ?? await prompt.askSecret("Telegram bot token: "),
            "Telegram bot token is required.",
        );
        const telegramApiRoot = normalizeOptionalString(options.telegramApiRoot) ?? DEFAULT_TELEGRAM_API_ROOT;
        const pluginSpec = normalizeOptionalString(options.pluginSpec) ?? DEFAULT_PLUGIN_SPEC;
        const nextOpenCodeConfig = options.registerPlugin === false
            ? openCodeConfig
            : ensurePluginRegistered(openCodeConfig, pluginSpec);
        const nextPluginConfig = buildInstalledPluginConfig(
            existingPluginConfig,
            botToken,
            telegramApiRoot,
        );

        if (options.registerPlugin === false) {
            await ensureParentDirectory(openCodeConfigFilePath);
        } else {
            await writeJsonFile(openCodeConfigFilePath, nextOpenCodeConfig);
        }
        await writePluginConfigFile(globalPluginConfigFilePath, nextPluginConfig);

        stdout.write("Success.\n");
        stdout.write(`OpenCode config: ${openCodeConfigFilePath}\n`);
        stdout.write(`Plugin config: ${globalPluginConfigFilePath}\n`);
        stdout.write(`Plugin logs: ${getDefaultPluginLogDirectory(homeDir)}\n`);
        await warnAboutLegacyLocalInstallations(homeDir);
    } finally {
        prompt.close();
    }
}

export async function updatePlugin(options: Pick<InstallCommandOptions, "homeDir" | "pluginSpec"> = {}): Promise<void> {
    const homeDir = options.homeDir ?? homedir();
    const openCodeConfigFilePath = await resolveWritableOpenCodeConfigFilePath(homeDir);
    const openCodeConfig = await readJsoncObject<OpenCodeGlobalConfig>(openCodeConfigFilePath);
    const pluginSpec = normalizeOptionalString(options.pluginSpec) ?? DEFAULT_PLUGIN_SPEC;
    const nextOpenCodeConfig = replacePluginRegistration(openCodeConfig, pluginSpec);

    await writeJsonFile(openCodeConfigFilePath, nextOpenCodeConfig);
    stdout.write("Success.\n");
    stdout.write(`OpenCode config: ${openCodeConfigFilePath}\n`);
    stdout.write(`Plugin config: ${getGlobalPluginConfigFilePath(homeDir)}\n`);
    stdout.write(`Plugin logs: ${getDefaultPluginLogDirectory(homeDir)}\n`);
    await warnAboutLegacyLocalInstallations(homeDir);
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
): PluginConfigSource {
    const merged = mergePluginConfigSources(current, {
        telegram: {
            botToken,
            apiRoot: telegramApiRoot,
        },
    });
    const { openrouter: _openrouter, ...nextConfig } = merged as PluginConfigSource & {
        openrouter?: unknown;
    };

    return nextConfig;
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

export function createPromptSession(options: CreatePromptSessionOptions = {}): PromptSessionLike {
    const input = options.input ?? stdin;
    const output = options.output ?? stdout;

    if (!input.isTTY || !output.isTTY) {
        return {
            ask: async () => "",
            askSecret: async () => "",
            async confirm(_question: string, defaultValue: boolean) {
                return defaultValue;
            },
            close() { },
        };
    }

    return {
        ask(question: string) {
            return askQuestion(input, output, question);
        },
        askSecret(question: string) {
            return askSecretQuestion(input, output, question);
        },
        async confirm(question: string, defaultValue: boolean) {
            const answer = normalizeOptionalString(await askQuestion(input, output, question));

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
        close() { },
    };
}

async function askQuestion(
    input: NodeJS.ReadStream,
    output: NodeJS.WriteStream,
    question: string,
): Promise<string> {
    const readline = createInterface({ input, output });

    try {
        return await readline.question(question);
    } finally {
        readline.close();
    }
}

async function askSecretQuestion(
    input: NodeJS.ReadStream,
    output: NodeJS.WriteStream,
    question: string,
): Promise<string> {
    if (typeof input.setRawMode !== "function") {
        return askQuestion(input, output, question);
    }

    output.write(question);

    try {
        return await readMaskedInput(input, output);
    } finally {
        output.write("\n");
    }
}

async function readMaskedInput(
    input: NodeJS.ReadStream,
    output: NodeJS.WriteStream,
): Promise<string> {
    return new Promise((resolvePromise, rejectPromise) => {
        const buffer: string[] = [];
        let settled = false;

        const cleanup = () => {
            input.off("data", handleData);
            input.off("error", handleError);
            input.pause();
            input.setRawMode?.(false);
        };

        const rejectWith = (error: unknown) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            rejectPromise(error);
        };

        const resolveWith = (value: string) => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            resolvePromise(value);
        };

        const handleError = (error: unknown) => {
            rejectWith(error);
        };

        const handleData = (chunk: string | Buffer) => {
            const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;

            for (const character of text) {
                if (character === "\r" || character === "\n") {
                    resolveWith(buffer.join(""));
                    return;
                }

                if (character === "\u0003") {
                    rejectWith(new Error(PROMPT_CANCELLED_ERROR));
                    return;
                }

                if (character === "\u0008" || character === "\u007f") {
                    if (buffer.length > 0) {
                        buffer.pop();
                        output.write("\b \b");
                    }
                    continue;
                }

                if (character < " " || character === "\u007f") {
                    continue;
                }

                buffer.push(character);
                output.write("*");
            }
        };

        input.setRawMode?.(true);
        input.resume();
        input.on("error", handleError);
        input.on("data", handleData);
    });
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

async function warnAboutLegacyLocalInstallations(homeDir: string): Promise<void> {
    const legacyInstallations = await findLegacyLocalInstallations(homeDir);

    if (legacyInstallations.length === 0) {
        return;
    }

    stdout.write("\nDetected local opencode-tbot npm installation(s) that can make OpenCode show the plugin as file:///.../node_modules/...\n");

    for (const installation of legacyInstallations) {
        stdout.write(`- ${installation.packagePath}\n`);
        stdout.write(`  cleanup: cd "${installation.rootDir}" && npm uninstall opencode-tbot\n`);
    }

    stdout.write("Recommended npm flow: npm exec --package opencode-tbot@latest opencode-tbot -- install\n");
}

async function findLegacyLocalInstallations(homeDir: string) {
    const roots = [...new Set([
        resolve(process.cwd()),
        resolve(homeDir),
    ])];
    const installations: Array<{ packagePath: string; rootDir: string }> = [];

    for (const rootDir of roots) {
        const packagePath = join(rootDir, "node_modules", "opencode-tbot", "package.json");

        if (await pathExists(packagePath)) {
            installations.push({
                packagePath: join(rootDir, "node_modules", "opencode-tbot"),
                rootDir,
            });
        }
    }

    return installations;
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

function buildHelpText(): string {
    return [
        "Usage: opencode-tbot [install|update] [options]",
        "       opencode-tbot --version",
        "",
        "Recommended npm usage:",
        "  npm exec --package opencode-tbot@latest opencode-tbot -- install",
        "  npm exec --package opencode-tbot@latest opencode-tbot -- update",
        "  npm exec --package opencode-tbot@latest opencode-tbot -- --version",
        "",
        "Commands:",
        "  install",
        "  update",
        "",
        "Options:",
        "  --bot-token <token>",
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
