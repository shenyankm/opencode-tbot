import type { Bot } from "grammy";
import type { PermissionApprovalRepository } from "../domain/permission/approval.repository.js";
import type { OpenCodeClientLike } from "../services/opencode/opencode.client.js";
import type { BotDependencies } from "./types.js";
import { registerTelegramCommands } from "./commands/registry.js";
import { registerCallbackHandler } from "./handlers/callback.handler.js";
import { registerFileHandler } from "./handlers/file.handler.js";
import { registerMessageHandler } from "./handlers/message.handler.js";
import { registerVoiceHandler } from "./handlers/voice.handler.js";
import { createAuthMiddleware } from "./middlewares/auth.js";
import { createLoggingMiddleware } from "./middlewares/logging.js";
import {
    extractTelegramUpdateContext,
    replyWithDefaultTelegramError,
} from "./error-boundary.js";
import { scopeLoggerToTelegramContext } from "./logger-context.js";

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

    const safeBot = bot.errorBoundary(async (error) => {
        const scopedLogger = scopeLoggerToTelegramContext(container.logger, error.ctx, "telegram");

        scopedLogger.error(
            {
                ...extractTelegramUpdateContext(error.ctx),
                event: "telegram.middleware.failed",
                error: error.error,
            },
            "telegram middleware failed",
        );
        await replyWithDefaultTelegramError(error.ctx, scopedLogger, error.error);
    });

    registerTelegramCommands(safeBot, container);
    registerCallbackHandler(safeBot, container);
    registerFileHandler(safeBot, container);
    registerMessageHandler(safeBot, container);
    registerVoiceHandler(safeBot, container);
}
