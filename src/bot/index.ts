import type { Bot } from "grammy";
import type { PermissionApprovalRepository } from "../domain/permission/approval.repository.js";
import type { OpenCodeClientLike } from "../services/opencode/opencode.client.js";
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
import { createAuthMiddleware } from "./middlewares/auth.js";
import { createLoggingMiddleware } from "./middlewares/logging.js";

export interface RegisterBotOptions {
    telegramAllowedChatIds: number[];
}

export function registerBot(
    bot: Bot,
    container: BotDependencies & {
        opencodeClient: OpenCodeClientLike;
        permissionApprovalRepo: PermissionApprovalRepository;
    },
    options: RegisterBotOptions,
) {
    bot.use(createLoggingMiddleware(container.logger));
    bot.use(createAuthMiddleware(options.telegramAllowedChatIds));

    registerStartCommand(bot, container);
    registerStatusCommand(bot, container);
    registerNewCommand(bot, container);
    registerAgentsCommand(bot, container);
    registerSessionsCommand(bot, container);
    registerCancelCommand(bot, container);
    registerModelsCommand(bot, container);
    registerLanguageCommand(bot, container);
    registerCallbackHandler(bot, container);
    registerFileHandler(bot, container);
    registerMessageHandler(bot, container);
    registerVoiceHandler(bot, container);
}
