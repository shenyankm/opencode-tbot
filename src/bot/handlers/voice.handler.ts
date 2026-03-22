import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import type { BotDependencies } from "../types.js";
import { replyIfSessionRenamePending } from "../session-rename.js";

interface VoiceContext {
    chat: { id: number };
    message: { voice?: unknown };
    reply(text: string): Promise<unknown>;
}

export async function handleVoiceMessage(ctx: VoiceContext, dependencies: BotDependencies) {
    if (!ctx.message.voice) {
        return;
    }

    if (await replyIfSessionRenamePending(ctx, dependencies)) {
        return;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);
    await ctx.reply(copy.errors.voiceUnsupported);
}

export function registerVoiceHandler(bot: Pick<Bot, "on">, dependencies: BotDependencies) {
    bot.on("message:voice", async (ctx) => {
        await handleVoiceMessage(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
