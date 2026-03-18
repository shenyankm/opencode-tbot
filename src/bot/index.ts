import type { Bot } from "grammy";
import { registerStartCommand } from "./commands/start.js";
import { registerMessageHandler } from "./handlers/message.handler.js";
import { authMiddleware } from "./middlewares/auth.js";
import { loggingMiddleware } from "./middlewares/logging.js";

export function registerBot(bot: Bot, _container: unknown) {
    bot.use(loggingMiddleware);
    bot.use(authMiddleware);

    registerStartCommand(bot);
    registerMessageHandler(bot);
}