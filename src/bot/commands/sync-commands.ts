import type { Bot } from "grammy";
import type { Logger } from "pino";
import { TELEGRAM_COMMANDS } from "./command-list.js";

export async function syncTelegramCommands(bot: Bot, logger: Logger): Promise<void> {
    await bot.api.setMyCommands(TELEGRAM_COMMANDS);

    logger.info(
        {
            commands: TELEGRAM_COMMANDS.map((command) => command.command),
        },
        "telegram commands synced",
    );
}
