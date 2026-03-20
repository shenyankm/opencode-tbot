import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
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

    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);
    await ctx.reply(copy.errors.voiceUnsupported);
}

export function registerVoiceHandler(bot: Bot, dependencies: BotDependencies) {
    bot.on("message:voice", async (ctx) => {
        await handleVoiceMessage(ctx, dependencies);
    });
}
