import { run } from "@grammyjs/runner";
import { Bot, GrammyError, HttpError } from "grammy";
import { syncTelegramCommands } from "../bot/commands/sync-commands.js";
import { extractTelegramUpdateContext } from "../bot/error-boundary.js";
import { registerBot } from "../bot/index.js";
import type { AppConfig } from "./config.js";
import type { AppContainer } from "./container.js";
import { validateTelegramBotAccessWithBot } from "../services/telegram/telegram-bot-access.js";

export interface StartTelegramBotRuntimeInput {
    botFactory?: (token: string, options: ConstructorParameters<typeof Bot>[1]) => Bot;
    config: AppConfig;
    container: AppContainer;
    registerBotHandlers?: typeof registerBot;
    runBot?: typeof run;
    syncCommands?: boolean;
    syncCommandsHandler?: typeof syncTelegramCommands;
}

export interface TelegramBotRuntime {
    bot: Bot;
    container: AppContainer;
    stop(): void;
    dispose(): Promise<void>;
}

interface TelegramBotRuntimeRegistry {
    activeByKey: Map<string, Promise<TelegramBotRuntime>>;
}

const TELEGRAM_RUNNER_OPTIONS = {
    runner: {
        fetch: {
            timeout: 30,
        },
        maxRetryTime: 15 * 60 * 1000,
        retryInterval: "exponential" as const,
        silent: true,
    },
};

export async function startTelegramBotRuntime(
    input: StartTelegramBotRuntimeInput,
): Promise<TelegramBotRuntime> {
    const runtimeKey = buildTelegramRuntimeKey(input.config);
    const registry = getTelegramBotRuntimeRegistry();
    const existingRuntime = registry.activeByKey.get(runtimeKey);
    const runtimeLogger = input.container.logger.child({
        component: "runtime",
    });

    if (existingRuntime) {
        runtimeLogger.warn(
            {
                event: "runtime.reused",
                runtimeKey,
                telegramApiRoot: input.config.telegramApiRoot,
            },
            "telegram runtime already active in this process; reusing the existing runner",
        );
        await input.container.dispose();
        return existingRuntime;
    }

    const runtimePromise = startTelegramBotRuntimeInternal(
        input,
        runtimeKey,
        () => {
            if (registry.activeByKey.get(runtimeKey) === runtimePromise) {
                registry.activeByKey.delete(runtimeKey);
            }
        },
    ).catch((error) => {
        if (registry.activeByKey.get(runtimeKey) === runtimePromise) {
            registry.activeByKey.delete(runtimeKey);
        }

        throw error;
    });

    registry.activeByKey.set(runtimeKey, runtimePromise);

    return runtimePromise;
}

async function startTelegramBotRuntimeInternal(
    input: StartTelegramBotRuntimeInput,
    runtimeKey: string,
    releaseRuntime: () => void,
): Promise<TelegramBotRuntime> {
    const botFactory = input.botFactory ?? ((token, options) => new Bot(token, options));
    const bot = botFactory(input.config.telegramBotToken, {
        client: {
            apiRoot: input.config.telegramApiRoot,
        },
    });
    const runtimeLogger = input.container.logger.child({
        component: "runtime",
    });

    await verifyTelegramBotAccess(bot, input.config.telegramApiRoot, runtimeKey, runtimeLogger);
    wrapTelegramGetUpdates(bot, input.container);
    const registerBotHandlers = input.registerBotHandlers ?? registerBot;
    registerBotHandlers(bot, input.container, {
        telegramAllowedChatIds: input.config.telegramAllowedChatIds,
    });

    bot.catch((error) => {
        const metadata = extractTelegramUpdateContext(error.ctx);
        const telegramLogger = input.container.logger.child({
            component: "telegram",
            ...metadata,
        });

        if (error.error instanceof GrammyError) {
            telegramLogger.error(
                {
                    event: "telegram.api.error",
                    errorCode: error.error.error_code,
                    description: error.error.description,
                    method: error.error.method,
                    parameters: error.error.parameters,
                    payload: error.error.payload,
                },
                "telegram bot api request failed",
            );
            return;
        }

        if (error.error instanceof HttpError) {
            telegramLogger.error(
                {
                    event: "telegram.http.error",
                    error: error.error.error,
                    message: error.error.message,
                },
                "telegram bot network request failed",
            );
            return;
        }

        telegramLogger.error(
            {
                event: "telegram.update.failed",
                error: error.error,
            },
            "telegram bot update failed",
        );
    });

    runtimeLogger.info(
        {
            event: "runtime.polling.starting",
            runtimeKey,
        },
        "telegram bot polling starting",
    );
    const runBot = input.runBot ?? run;
    const runner = runBot(bot, TELEGRAM_RUNNER_OPTIONS);
    let stopped = false;
    let disposed = false;

    if (input.syncCommands ?? true) {
        const syncCommandsHandler = input.syncCommandsHandler ?? syncTelegramCommands;

        void syncCommandsHandler(bot, input.container.logger).catch((error) => {
            runtimeLogger.warn(
                {
                    event: "runtime.commands.sync_failed",
                    error,
                    runtimeKey,
                },
                "failed to sync telegram commands; polling continues without command registration updates",
            );
        });
    }

    let stopPromise: Promise<void> | null = null;
    const requestStop = async () => {
        if (stopped) {
            return;
        }

        stopped = true;
        stopPromise = runner.stop().catch((error) => {
            runtimeLogger.warn(
                {
                    event: "runtime.stop.failed",
                    error,
                    runtimeKey,
                },
                "failed to stop telegram runner cleanly",
            );
        });

        await stopPromise;
    };
    const stop = () => {
        void requestStop();
    };
    const dispose = async () => {
        if (disposed) {
            return;
        }

        disposed = true;
        try {
            await requestStop();
            await input.container.dispose();
        } finally {
            releaseRuntime();
        }
    };

    return {
        bot,
        container: input.container,
        stop,
        dispose,
    };
}

function wrapTelegramGetUpdates(bot: Bot, container: AppContainer): void {
    const originalGetUpdates = bot.api.getUpdates.bind(bot.api);
    const runtimeLogger = container.logger.child({
        component: "runtime",
    });

    bot.api.getUpdates = async (options, signal) => {
        const requestOptions = options ?? {
            limit: 100,
            offset: 0,
            timeout: 30,
        };

        try {
            return await originalGetUpdates(requestOptions, signal);
        } catch (error) {
            runtimeLogger.warn(
                {
                    event: "runtime.telegram.get_updates_failed",
                    error,
                    limit: requestOptions.limit,
                    offset: requestOptions.offset,
                    timeout: requestOptions.timeout,
                },
                "telegram getUpdates failed",
            );
            throw error;
        }
    };
}

async function verifyTelegramBotAccess(
    bot: Bot,
    telegramApiRoot: string,
    runtimeKey: string,
    runtimeLogger: AppContainer["logger"],
): Promise<void> {
    try {
        const botProfile = await validateTelegramBotAccessWithBot(bot, telegramApiRoot);

        runtimeLogger.info(
            {
                event: "runtime.telegram.auth.validated",
                runtimeKey,
                telegramBotId: botProfile.id,
                telegramBotUsername: botProfile.username ?? null,
            },
            "telegram bot access verified",
        );
    } catch (error) {
        runtimeLogger.error(
            {
                event: "runtime.telegram.auth.failed",
                error,
                runtimeKey,
                telegramApiRoot,
            },
            "telegram bot startup validation failed",
        );
        throw error;
    }
}

function buildTelegramRuntimeKey(config: AppConfig): string {
    return `${config.telegramApiRoot}::${config.telegramBotToken}`;
}

function getTelegramBotRuntimeRegistry(): TelegramBotRuntimeRegistry {
    const globalScope = globalThis as typeof globalThis & {
        __opencodeTbotTelegramRuntimeRegistry__?: TelegramBotRuntimeRegistry;
    };

    globalScope.__opencodeTbotTelegramRuntimeRegistry__ ??= {
        activeByKey: new Map(),
    };

    return globalScope.__opencodeTbotTelegramRuntimeRegistry__;
}

export function resetTelegramBotRuntimeRegistryForTests(): void {
    const globalScope = globalThis as typeof globalThis & {
        __opencodeTbotTelegramRuntimeRegistry__?: TelegramBotRuntimeRegistry;
    };

    globalScope.__opencodeTbotTelegramRuntimeRegistry__ = {
        activeByKey: new Map(),
    };
}
