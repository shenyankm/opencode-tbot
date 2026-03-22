import type { Bot } from "grammy";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import type { BotDependencies } from "../types.js";
import { executePromptRequest, type PromptExecutionContext } from "./prompt.handler.js";
import { handlePendingSessionRenameText } from "../session-rename.js";

interface MessageContext extends PromptExecutionContext {
    api: PromptExecutionContext["api"] & {
        editMessageText(
            chatId: number,
            messageId: number,
            text: string,
            other?: { reply_markup?: unknown },
        ): Promise<unknown>;
    };
    message: { text?: string };
}

export async function handleTextMessage(ctx: MessageContext, dependencies: BotDependencies) {
    const text = ctx.message.text?.trim();

    if (await handlePendingSessionRenameText(ctx, dependencies)) return;
    if (!text) return;
    if (text.startsWith("/")) return;
    await executePromptRequest(ctx, dependencies, async () => ({ text }));
}

export function registerMessageHandler(bot: Pick<Bot, "on">, dependencies: BotDependencies) {
    bot.on("message:text", async (ctx) => {
        await handleTextMessage(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
