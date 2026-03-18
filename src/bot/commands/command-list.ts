import type { BotCommand } from "grammy/types";

export const TELEGRAM_COMMANDS: BotCommand[] = [
    {
        command: "start",
        description: "查看机器人说明",
    },
    {
        command: "health",
        description: "检查服务器健康状态",
    },
    {
        command: "agents",
        description: "查看并切换代理",
    },
    {
        command: "projects",
        description: "查看并切换项目",
    },
    {
        command: "model",
        description: "查看并切换模型",
    },
];
