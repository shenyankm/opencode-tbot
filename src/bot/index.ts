import type { Bot } from "grammy";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerCancelCommand } from "./commands/cancel.js";
import { registerLanguageCommand } from "./commands/language.js";
import { registerModelsCommand } from "./commands/models.js";
import { registerNewCommand } from "./commands/new.js";
import { registerStatusCommand } from "./commands/status.js";
import type { BotDependencies } from "./types.js";
import { registerSessionsCommand } from "./commands/sessions.js";
import { registerStartCommand } from "./commands/start.js";
import { registerCallbackHandler } from "./handlers/callback.handler.js";
import { registerFileHandler } from "./handlers/file.handler.js";
import { registerMessageHandler } from "./handlers/message.handler.js";
import { registerVoiceHandler } from "./handlers/voice.handler.js";
import { authMiddleware } from "./middlewares/auth.js";
import { loggingMiddleware } from "./middlewares/logging.js";

export function registerBot(bot: Bot, container: BotDependencies) {
    bot.use(loggingMiddleware);
    bot.use(authMiddleware);

    registerStartCommand(bot, container);
    registerCancelCommand(bot, container);
    registerStatusCommand(bot, container);
    registerNewCommand(bot, container);
    registerAgentsCommand(bot, container);
    registerLanguageCommand(bot, container);
    registerModelsCommand(bot, container);
    registerSessionsCommand(bot, container);
    registerCallbackHandler(bot, container);
    registerFileHandler(bot, container);
    registerMessageHandler(bot, container);
    registerVoiceHandler(bot, container);
}
