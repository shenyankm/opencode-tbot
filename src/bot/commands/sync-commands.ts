import type { Bot } from "grammy";
import type { BotCommandScope } from "grammy/types";
import type { Logger } from "pino";
import { TELEGRAM_COMMANDS } from "./command-list.js";

export const TELEGRAM_COMMAND_SYNC_SCOPES: ReadonlyArray<BotCommandScope> = [
    { type: "default" },
    { type: "all_private_chats" },
];

export async function syncTelegramCommands(bot: Bot, logger: Logger): Promise<void> {
    await Promise.all(
        TELEGRAM_COMMAND_SYNC_SCOPES.map((scope) =>
            bot.api.setMyCommands(TELEGRAM_COMMANDS, { scope }),
        ),
    );

    logger.info(
        {
            commands: TELEGRAM_COMMANDS.map((command) => command.command),
            scopes: TELEGRAM_COMMAND_SYNC_SCOPES.map((scope) => scope.type),
        },
        "telegram commands synced",
    );
}
