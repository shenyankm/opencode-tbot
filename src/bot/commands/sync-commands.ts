import type { Bot } from "grammy";
import type { BotCommandScope } from "grammy/types";
import type { AppLogger } from "../../infra/logger/index.js";
import { type BotLanguage } from "../copy.js";
import { getTelegramCommands, TELEGRAM_COMMANDS } from "./command-list.js";

export const TELEGRAM_COMMAND_SYNC_SCOPES: ReadonlyArray<BotCommandScope> = [
    { type: "default" },
    { type: "all_private_chats" },
];

export async function syncTelegramCommands(bot: Bot, logger: AppLogger): Promise<void> {
    await Promise.all(
        TELEGRAM_COMMAND_SYNC_SCOPES.map((scope) =>
            bot.api.setMyCommands(TELEGRAM_COMMANDS, { scope }),
        ),
    );

    logger.info(
        {
            component: "runtime",
            commands: TELEGRAM_COMMANDS.map((command) => command.command),
            event: "runtime.commands.synced",
            scopes: TELEGRAM_COMMAND_SYNC_SCOPES.map((scope) => scope.type),
        },
        "telegram commands synced",
    );
}

export async function syncTelegramCommandsForChat(
    api: Pick<Bot["api"], "setMyCommands">,
    chatId: number,
    language: BotLanguage,
): Promise<void> {
    await api.setMyCommands(
        getTelegramCommands(language),
        {
            scope: {
                type: "chat",
                chat_id: chatId,
            },
        },
    );
}
