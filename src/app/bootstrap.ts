import { Bot } from "grammy";
import { config } from "./config.js";
import { container } from "./container.js";
import { registerBot } from "../bot/index.js";

export function bootstrap() {
    const bot = new Bot(config.telegramBotToken);
    registerBot(bot, container);
    return { bot, container };
}