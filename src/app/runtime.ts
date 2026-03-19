import { run } from "@grammyjs/runner";
import { Bot } from "grammy";
import { syncTelegramCommands } from "../bot/commands/sync-commands.js";
import { registerBot } from "../bot/index.js";
import type { AppConfig } from "./config.js";
import type { AppContainer } from "./container.js";

export interface StartTelegramBotRuntimeInput {
    config: AppConfig;
    container: AppContainer;
    syncCommands?: boolean;
}

export interface TelegramBotRuntime {
    bot: Bot;
    container: AppContainer;
    stop(): void;
    dispose(): void;
}

export async function startTelegramBotRuntime(
    input: StartTelegramBotRuntimeInput,
): Promise<TelegramBotRuntime> {
    const bot = new Bot(input.config.telegramBotToken);

    registerBot(bot, input.container, {
        telegramAllowedChatIds: input.config.telegramAllowedChatIds,
    });

    input.container.logger.info("bot starting...");

    if (input.syncCommands ?? true) {
        await syncTelegramCommands(bot, input.container.logger);
    }

    const runner = run(bot);
    let stopped = false;
    let disposed = false;
    const stop = () => {
        if (stopped) {
            return;
        }

        stopped = true;
        runner.stop();
    };
    const dispose = () => {
        if (disposed) {
            return;
        }

        disposed = true;
        stop();
        input.container.dispose();
    };

    return {
        bot,
        container: input.container,
        stop,
        dispose,
    };
}
