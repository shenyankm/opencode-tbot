import { Plugin } from "@opencode/plugin";
import { bootstrapPluginApp, createPluginSdkClient } from "./app/bootstrap.js";
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
import { createOpenCodeAppLogger } from "./infra/logger/index.js";

export type OpenCodePluginContextLike = Plugin.Context;

export interface EnsureTelegramBotPluginRuntimeOptions {
    context?: OpenCodePluginContextLike | null;
    config?: PluginConfigSource;
    client?: OpenCodeSdkClientLike;
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
    cleanup?: Plugin.Cleanup;
    disposePromise?: Promise<void>;
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

export const TelegramBotPlugin = Plugin.define({
    id: "opencode-tbot",
    async setup(context) {
        let state: TelegramBotPluginRuntimeState | null = null;

        try {
            const runtime = await ensureTelegramBotPluginRuntime({
                context,
                config: context.options as PluginConfigSource,
            });
            state = getTelegramBotPluginRuntimeStateHolder().state;

            if (!state || state.runtime !== runtime) {
                return;
            }

            await state.cleanup?.();
            const registration = await context.permission.hook("evaluate", async (event) => {
                if (event.effect === "deny") {
                    return;
                }

                const bindings = await runtime.container.sessionRepo.listBySessionId(event.sessionID);
                const foregroundChatIds = runtime.container.foregroundSessionTracker.listChatIds(event.sessionID);

                if (bindings.length > 0 || foregroundChatIds.length > 0) {
                    event.effect = "ask";
                }
            });
            if (getTelegramBotPluginRuntimeStateHolder().state !== state) {
                await registration.dispose();
                return;
            }

            const controller = new AbortController();
            const eventTask = consumePluginEvents(context, runtime, controller.signal);
            const cleanup = async () => {
                controller.abort();

                try {
                    await registration.dispose();
                } finally {
                    await eventTask;
                }
            };

            state.cleanup = cleanup;

            const ownedState = state;

            return async () => {
                if (ownedState.cleanup !== cleanup) {
                    return;
                }

                const holder = getTelegramBotPluginRuntimeStateHolder();

                if (holder.state === ownedState) {
                    holder.state = null;
                }

                await disposeTelegramBotPluginRuntimeState(ownedState);
            };
        } catch (error) {
            if (state) {
                const holder = getTelegramBotPluginRuntimeStateHolder();

                if (holder.state === state) {
                    holder.state = null;
                }

                await disposeTelegramBotPluginRuntimeState(state).catch(logPluginStartupFailure);
            }

            await logPluginStartupFailure(error);
        }
    },
});

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
): Promise<TelegramBotRuntime> {
    const bootstrapApp = options.bootstrapApp ?? bootstrapPluginApp;
    const prepareConfiguration = options.prepareConfiguration ?? preparePluginConfiguration;
    const startRuntime = options.startRuntime ?? startTelegramBotRuntime;
    const preparedConfiguration = await prepareConfiguration({
        cwd,
        config: options.config,
    });
    const { config, container } = bootstrapApp(
        await requirePluginClient(options),
        preparedConfiguration.config,
        {
            cwd: preparedConfiguration.cwd,
            configFilePath: preparedConfiguration.configFilePath,
        },
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
    return normalizePluginRuntimePath(context?.location?.directory);
}

async function requirePluginClient(options: EnsureTelegramBotPluginRuntimeOptions): Promise<OpenCodeSdkClientLike> {
    if (options.client) {
        return options.client;
    }

    if (options.context) {
        return createPluginSdkClient(options.context);
    }

    throw new Error("OpenCode plugin context is required.");
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
    state.disposePromise ??= (async () => {
        const runtime = state.runtime ?? await state.runtimePromise.catch(() => null);

        try {
            await state.cleanup?.();
        } finally {
            await runtime?.dispose();
        }
    })();

    await state.disposePromise;
}

async function consumePluginEvents(
    context: Plugin.Context,
    runtime: TelegramBotRuntime,
    signal: AbortSignal,
): Promise<void> {
    try {
        for await (const event of context.event.subscribe({ signal })) {
            try {
                await handleTelegramBotPluginEvent(runtime, event);
            } catch (error) {
                runtime.container.logger.error(
                    { error, event: "plugin-event.delivery_failed", type: event.type },
                    "failed to handle OpenCode plugin event",
                );
            }
        }
    } catch (error) {
        if (!signal.aborted) {
            runtime.container.logger.error(
                { error, event: "plugin-event.subscription_failed" },
                "OpenCode plugin event subscription failed",
            );
        }
    }
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

async function logPluginStartupFailure(error: unknown): Promise<void> {
    const logger = createOpenCodeAppLogger({ sinks: { file: false } });

    logger.error({
        component: "runtime",
        event: "runtime.plugin.disabled",
        mode: "plugin",
        reason: classifyPluginStartupFailureReason(error),
        error: serializePluginStartupError(error),
    }, "telegram bot plugin disabled during startup");
    await logger.flush();
}

function classifyPluginStartupFailureReason(error: unknown): string {
    if (error instanceof TelegramStartupError) {
        return error.code;
    }

    if (
        error instanceof Error
        && (
            error.message.includes("Invalid plugin configuration:")
            || error.message.includes("OpenCode plugin context is required.")
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
