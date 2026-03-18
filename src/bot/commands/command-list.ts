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
        command: "path",
        description: BOT_COPY.commands.path,
    },
    {
        command: "config",
        description: BOT_COPY.commands.config,
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
        command: "sessions",
        description: BOT_COPY.commands.sessions,
    },
    {
        command: "abort",
        description: BOT_COPY.commands.abort,
    },
    {
        command: "model",
        description: BOT_COPY.commands.model,
    },
];
