import type { Bot } from "grammy";
import { registerAbortCommand } from "./commands/abort.js";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerHealthCommand } from "./commands/health.js";
import { registerLanguageCommand } from "./commands/language.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerPathCommand } from "./commands/path.js";
import type { BotDependencies } from "./types.js";
import { registerProjectsCommand } from "./commands/projects.js";
import { registerSessionsCommand } from "./commands/sessions.js";
import { registerStartCommand } from "./commands/start.js";
import { registerCallbackHandler } from "./handlers/callback.handler.js";
import { registerMessageHandler } from "./handlers/message.handler.js";
import { authMiddleware } from "./middlewares/auth.js";
import { loggingMiddleware } from "./middlewares/logging.js";

export function registerBot(bot: Bot, container: BotDependencies) {
    bot.use(loggingMiddleware);
    bot.use(authMiddleware);

    registerStartCommand(bot, container);
    registerAbortCommand(bot, container);
    registerHealthCommand(bot, container);
    registerPathCommand(bot, container);
    registerAgentsCommand(bot, container);
    registerLanguageCommand(bot, container);
    registerModelsCommand(bot, container);
    registerProjectsCommand(bot, container);
    registerSessionsCommand(bot, container);
    registerCallbackHandler(bot, container);
    registerMessageHandler(bot, container);
}
