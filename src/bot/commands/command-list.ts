import type { BotCommand } from "grammy/types";

export const TELEGRAM_COMMANDS: BotCommand[] = [
    {
        command: "start",
        description: "查看机器人说明",
    },
    {
        command: "projects",
        description: "查看并切换项目",
    },
];
