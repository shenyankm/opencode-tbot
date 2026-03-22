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

export interface OpenCodePluginContextLike {
    client: OpenCodeSdkClientLike;
    directory?: string;
    worktree?: string;
}

export interface EnsureTelegramBotPluginRuntimeOptions {
    context: OpenCodePluginContextLike;
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
    const cwd = resolvePluginRuntimeCwd(options.context);

    if (runtimeStateHolder.state && runtimeStateHolder.state.cwd !== cwd) {
        const activeState = runtimeStateHolder.state;
        runtimeStateHolder.state = null;
        await disposeTelegramBotPluginRuntimeState(activeState);
    }

    if (!runtimeStateHolder.state) {
        const runtimePromise = startPluginRuntime(options, cwd)
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
            cwd,
            runtime: null,
            runtimePromise,
        };
    }

    return runtimeStateHolder.state.runtimePromise;
}

export const TelegramBotPlugin: Plugin = async (context) => {
    const runtime = await ensureTelegramBotPluginRuntime({
        context: context as unknown as OpenCodePluginContextLike,
    });

    return createHooks(runtime);
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
): Promise<TelegramBotRuntime> {
    const bootstrapApp = options.bootstrapApp ?? bootstrapPluginApp;
    const prepareConfiguration = options.prepareConfiguration ?? preparePluginConfiguration;
    const startRuntime = options.startRuntime ?? startTelegramBotRuntime;
    const preparedConfiguration = await prepareConfiguration({
        cwd,
        config: options.config,
    });
    const { config, container } = bootstrapApp(
        options.context.client,
        preparedConfiguration.config,
        { cwd: preparedConfiguration.cwd },
    );

    try {
        if (preparedConfiguration.ignoredProjectConfigFilePath) {
            container.logger.child({ component: "runtime" }).warn(
                {
                    cwd: preparedConfiguration.cwd,
                    event: "runtime.config.legacy_worktree_ignored",
                    ignoredProjectConfigFilePath: preparedConfiguration.ignoredProjectConfigFilePath,
                    globalConfigFilePath: preparedConfiguration.globalConfigFilePath,
                },
                "legacy worktree plugin config is ignored; migrate settings to the global opencode-tbot config",
            );
        }

        const runtime = await startRuntime({ config, container });

        container.logger.child({ component: "runtime" }).info(
            {
                cwd: preparedConfiguration.cwd,
                event: "runtime.plugin.started",
                globalConfigFilePath: preparedConfiguration.globalConfigFilePath,
                ignoredProjectConfigFilePath: preparedConfiguration.ignoredProjectConfigFilePath,
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

function resolvePluginRuntimeCwd(context: OpenCodePluginContextLike): string {
    return context.worktree ?? context.directory ?? process.cwd();
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
