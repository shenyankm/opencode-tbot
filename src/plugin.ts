import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import { bootstrapPluginApp } from "./app/bootstrap.js";
import { handleTelegramBotPluginEvent } from "./app/plugin-events.js";
import {
    preparePluginConfiguration,
    type PreparedPluginConfiguration,
} from "./app/plugin-config.js";
import {
    startTelegramBotRuntime,
    type StartTelegramBotRuntimeInput,
    type TelegramBotRuntime,
} from "./app/runtime.js";
import type { PluginConfigSource } from "./app/config.js";
import type { OpenCodeSdkClientLike } from "./services/opencode/opencode.client.js";
import { TelegramStartupError } from "./services/telegram/telegram-bot-access.js";

export interface OpenCodePluginContextLike {
    client?: OpenCodeSdkClientLike;
    directory?: string | null;
    worktree?: string | null;
}

export interface EnsureTelegramBotPluginRuntimeOptions {
    context?: OpenCodePluginContextLike | null;
    config?: PluginConfigSource;
    bootstrapApp?: typeof bootstrapPluginApp;
    prepareConfiguration?: (input: {
        cwd: string;
        config?: PluginConfigSource;
    }) => Promise<PreparedPluginConfiguration>;
    startRuntime?: (input: StartTelegramBotRuntimeInput) => Promise<TelegramBotRuntime>;
}

interface TelegramBotPluginRuntimeState {
    cwd: string;
    runtime: TelegramBotRuntime | null;
    runtimePromise: Promise<TelegramBotRuntime>;
}

interface TelegramBotPluginRuntimeStateHolder {
    state: TelegramBotPluginRuntimeState | null;
}

export async function ensureTelegramBotPluginRuntime(
    options: EnsureTelegramBotPluginRuntimeOptions,
): Promise<TelegramBotRuntime> {
    const runtimeStateHolder = getTelegramBotPluginRuntimeStateHolder();
    const explicitCwd = resolveExplicitPluginRuntimeCwd(options.context);

    if (runtimeStateHolder.state && explicitCwd === null) {
        return runtimeStateHolder.state.runtimePromise;
    }

    if (runtimeStateHolder.state && explicitCwd !== null && runtimeStateHolder.state.cwd !== explicitCwd) {
        const activeState = runtimeStateHolder.state;
        runtimeStateHolder.state = null;
        await disposeTelegramBotPluginRuntimeState(activeState);
    }

    if (!runtimeStateHolder.state) {
        const runtimePromise = startPluginRuntime(
            options,
            resolvePluginRuntimeCwd(options.context),
            requirePluginClient(options.context),
        )
            .then((runtime) => {
                if (runtimeStateHolder.state?.runtimePromise === runtimePromise) {
                    runtimeStateHolder.state.runtime = runtime;
                }

                return runtime;
            })
            .catch((error) => {
                if (runtimeStateHolder.state?.runtimePromise === runtimePromise) {
                    runtimeStateHolder.state = null;
                }

                throw error;
            });

        runtimeStateHolder.state = {
            cwd: explicitCwd ?? resolvePluginRuntimeCwd(options.context),
            runtime: null,
            runtimePromise,
        };
    }

    return runtimeStateHolder.state.runtimePromise;
}

export const TelegramBotPlugin: Plugin = async (context) => {
    try {
        const runtime = await ensureTelegramBotPluginRuntime({
            context: context as unknown as OpenCodePluginContextLike | undefined,
        });

        return createHooks(runtime);
    } catch (error) {
        await logPluginStartupFailure(
            context as unknown as OpenCodePluginContextLike | undefined,
            error,
        );
        return {};
    }
};

export async function resetTelegramBotPluginRuntimeForTests() {
    const runtimeStateHolder = getTelegramBotPluginRuntimeStateHolder();

    if (!runtimeStateHolder.state) {
        return;
    }

    const activeState = runtimeStateHolder.state;
    runtimeStateHolder.state = null;
    await disposeTelegramBotPluginRuntimeState(activeState);
}

export default TelegramBotPlugin;

async function startPluginRuntime(
    options: EnsureTelegramBotPluginRuntimeOptions,
    cwd: string,
    client: OpenCodeSdkClientLike,
): Promise<TelegramBotRuntime> {
    const bootstrapApp = options.bootstrapApp ?? bootstrapPluginApp;
    const prepareConfiguration = options.prepareConfiguration ?? preparePluginConfiguration;
    const startRuntime = options.startRuntime ?? startTelegramBotRuntime;
    const preparedConfiguration = await prepareConfiguration({
        cwd,
        config: options.config,
    });
    const { config, container } = bootstrapApp(
        client,
        preparedConfiguration.config,
        { cwd: preparedConfiguration.cwd },
    );

    try {
        const runtime = await startRuntime({ config, container });

        container.logger.child({ component: "runtime" }).info(
            {
                cwd: preparedConfiguration.cwd,
                event: "runtime.plugin.started",
                configFilePath: preparedConfiguration.configFilePath,
                mode: "plugin",
            },
            "telegram bot plugin runtime started",
        );

        return runtime;
    } catch (error) {
        await container.dispose();
        throw error;
    }
}

function resolvePluginRuntimeCwd(context?: OpenCodePluginContextLike | null): string {
    return resolveExplicitPluginRuntimeCwd(context) ?? process.cwd();
}

function resolveExplicitPluginRuntimeCwd(context?: OpenCodePluginContextLike | null): string | null {
    return normalizePluginRuntimePath(context?.worktree)
        ?? normalizePluginRuntimePath(context?.directory);
}

function requirePluginClient(context?: OpenCodePluginContextLike | null): OpenCodeSdkClientLike {
    if (context?.client) {
        return context.client;
    }

    throw new Error("OpenCode plugin context.client is required.");
}

function normalizePluginRuntimePath(value: string | null | undefined): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();

    return normalized.length > 0
        ? normalized
        : null;
}

async function disposeTelegramBotPluginRuntimeState(
    state: TelegramBotPluginRuntimeState,
): Promise<void> {
    const runtime = state.runtime ?? await state.runtimePromise.catch(() => null);

    await runtime?.dispose();
}

function createHooks(runtime: TelegramBotRuntime): Hooks {
    return {
        async event({ event }) {
            await handleTelegramBotPluginEvent(runtime, event);
        },
        async "permission.ask"(input, output) {
            const bindings = await runtime.container.sessionRepo.listBySessionId(input.sessionID);
            const foregroundChatIds = runtime.container.foregroundSessionTracker.listChatIds(input.sessionID);

            if (bindings.length > 0 || foregroundChatIds.length > 0) {
                output.status = "ask";
            }
        },
    };
}

function getTelegramBotPluginRuntimeStateHolder(): TelegramBotPluginRuntimeStateHolder {
    const globalScope = globalThis as typeof globalThis & {
        __opencodeTbotPluginRuntimeState__?: TelegramBotPluginRuntimeStateHolder;
    };

    globalScope.__opencodeTbotPluginRuntimeState__ ??= {
        state: null,
    };

    return globalScope.__opencodeTbotPluginRuntimeState__;
}

async function logPluginStartupFailure(
    context: OpenCodePluginContextLike | undefined,
    error: unknown,
): Promise<void> {
    const logger = context?.client?.app?.log;

    if (typeof logger !== "function") {
        return;
    }

    try {
        await logger({
            body: {
                service: "opencode-tbot",
                level: "error",
                message: "telegram bot plugin disabled during startup",
                extra: {
                    component: "runtime",
                    event: "runtime.plugin.disabled",
                    mode: "plugin",
                    reason: classifyPluginStartupFailureReason(error),
                    error: serializePluginStartupError(error),
                },
            },
            responseStyle: "data",
            throwOnError: true,
        });
    } catch {
        // Best effort only. Startup should stay non-fatal even if host logging fails.
    }
}

function classifyPluginStartupFailureReason(error: unknown): string {
    if (error instanceof TelegramStartupError) {
        return error.code;
    }

    if (
        error instanceof Error
        && (
            error.message.includes("Invalid plugin configuration:")
            || error.message.includes("OpenCode plugin context.client is required.")
            || error.message.includes("Telegram bot token is required.")
        )
    ) {
        return "config_invalid";
    }

    return "startup_failed";
}

function serializePluginStartupError(error: unknown): Record<string, unknown> {
    if (error instanceof TelegramStartupError) {
        return {
            name: error.name,
            message: error.message,
            code: error.code,
            data: error.data,
        };
    }

    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
        };
    }

    return {
        message: String(error),
    };
}
