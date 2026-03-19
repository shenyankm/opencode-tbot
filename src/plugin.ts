import { bootstrapPluginApp } from "./app/bootstrap.js";
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

let runtimeState: TelegramBotPluginRuntimeState | null = null;

export async function ensureTelegramBotPluginRuntime(
    options: EnsureTelegramBotPluginRuntimeOptions,
): Promise<TelegramBotRuntime> {
    const cwd = resolvePluginRuntimeCwd(options.context);

    if (runtimeState && runtimeState.cwd !== cwd) {
        const activeState = runtimeState;
        runtimeState = null;
        await disposeTelegramBotPluginRuntimeState(activeState);
    }

    if (!runtimeState) {
        const runtimePromise = startPluginRuntime(options, cwd)
            .then((runtime) => {
                if (runtimeState?.runtimePromise === runtimePromise) {
                    runtimeState.runtime = runtime;
                }

                return runtime;
            })
            .catch((error) => {
                if (runtimeState?.runtimePromise === runtimePromise) {
                    runtimeState = null;
                }

                throw error;
            });

        runtimeState = {
            cwd,
            runtime: null,
            runtimePromise,
        };
    }

    return runtimeState.runtimePromise;
}

export async function TelegramBotPlugin(context: OpenCodePluginContextLike): Promise<Record<string, never>> {
    await ensureTelegramBotPluginRuntime({ context });

    return {};
}

export async function resetTelegramBotPluginRuntimeForTests() {
    if (!runtimeState) {
        return;
    }

    const activeState = runtimeState;
    runtimeState = null;
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
        const runtime = await startRuntime({ config, container });

        container.logger.info(
            {
                cwd: preparedConfiguration.cwd,
                configFilePath: preparedConfiguration.configFilePath,
                mode: "plugin",
            },
            "telegram bot plugin runtime started",
        );

        return runtime;
    } catch (error) {
        container.dispose();
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

    runtime?.dispose();
}
