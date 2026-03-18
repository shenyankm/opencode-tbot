import type { BotCommand } from "grammy/types";
import { BOT_COPY } from "../copy.js";

export const TELEGRAM_COMMANDS: BotCommand[] = [
    {
        command: "start",
        description: BOT_COPY.commands.start,
    },
    {
        command: "health",
        description: BOT_COPY.commands.health,
    },
    {
        command: "agents",
        description: BOT_COPY.commands.agents,
    },
    {
        command: "projects",
        description: BOT_COPY.commands.projects,
    },
    {
        command: "model",
        description: BOT_COPY.commands.model,
    },
];
