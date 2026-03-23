import type { Bot } from "grammy";
import type { BotCommandScope } from "grammy/types";
import type { AppLogger } from "../../infra/logger/index.js";
import { type BotLanguage } from "../copy.js";
import { getTelegramCommands } from "./command-list.js";

export const TELEGRAM_COMMAND_SYNC_SCOPES: ReadonlyArray<BotCommandScope> = [
    { type: "default" },
    { type: "all_private_chats" },
];

export async function syncTelegramCommands(bot: Bot, logger: AppLogger): Promise<void> {
    const commands = getTelegramCommands();

    await Promise.all(
        TELEGRAM_COMMAND_SYNC_SCOPES.map((scope) =>
            bot.api.setMyCommands(commands, { scope }),
        ),
    );

    logger.info(
        {
            component: "runtime",
            commands: commands.map((command) => command.command),
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
