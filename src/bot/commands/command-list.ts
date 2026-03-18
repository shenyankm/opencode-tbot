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
            command: "health",
            description: copy.commands.health,
        },
        {
            command: "path",
            description: copy.commands.path,
        },
        {
            command: "agents",
            description: copy.commands.agents,
        },
        {
            command: "projects",
            description: copy.commands.projects,
        },
        {
            command: "sessions",
            description: copy.commands.sessions,
        },
        {
            command: "abort",
            description: copy.commands.abort,
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
