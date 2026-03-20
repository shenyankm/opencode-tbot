import type { BotCommand } from "grammy/types";
import { getBotCopy, type BotLanguage } from "../copy.js";

export function getTelegramCommands(language: BotLanguage = "en"): BotCommand[] {
    const copy = getBotCopy(language);

    return [
        {
            command: "start",
            description: copy.commands.start,
        },
        {
            command: "status",
            description: copy.commands.status,
        },
        {
            command: "new",
            description: copy.commands.new,
        },
        {
            command: "agents",
            description: copy.commands.agents,
        },
        {
            command: "sessions",
            description: copy.commands.sessions,
        },
        {
            command: "cancel",
            description: copy.commands.cancel,
        },
        {
            command: "model",
            description: copy.commands.model,
        },
        {
            command: "language",
            description: copy.commands.language,
        },
    ];
}

export const TELEGRAM_COMMANDS: BotCommand[] = getTelegramCommands();
