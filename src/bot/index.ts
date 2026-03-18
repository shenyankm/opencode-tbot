import type { Bot } from "grammy";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerHealthCommand } from "./commands/health.js";
import { registerModelsCommand } from "./commands/models.js";
import type { BotDependencies } from "./types.js";
import { registerProjectsCommand } from "./commands/projects.js";
import { registerStartCommand } from "./commands/start.js";
import { registerCallbackHandler } from "./handlers/callback.handler.js";
import { registerMessageHandler } from "./handlers/message.handler.js";
import { authMiddleware } from "./middlewares/auth.js";
import { loggingMiddleware } from "./middlewares/logging.js";

export function registerBot(bot: Bot, container: BotDependencies) {
    bot.use(loggingMiddleware);
    bot.use(authMiddleware);

    registerStartCommand(bot);
    registerHealthCommand(bot, container);
    registerAgentsCommand(bot, container);
    registerModelsCommand(bot, container);
    registerProjectsCommand(bot, container);
    registerCallbackHandler(bot, container);
    registerMessageHandler(bot, container);
}
