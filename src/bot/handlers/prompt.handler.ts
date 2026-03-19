import { getChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { buildTelegramPromptReply } from "../../services/telegram/telegram-format.js";
import type { BotDependencies } from "../types.js";
import type { PromptSessionFilePartInput } from "../../services/opencode/opencode.client.js";

interface SentMessage {
    message_id: number;
}

export interface PromptExecutionContext {
    chat: { id: number };
    api: {
        deleteMessage(chatId: number, messageId: number): Promise<unknown>;
    };
    reply(text: string, other?: { parse_mode?: "MarkdownV2" }): Promise<SentMessage>;
}

export interface PromptExecutionInput {
    files?: PromptSessionFilePartInput[];
    text?: string | null;
}

const activePromptChats = new Set<number>();

export async function executePromptRequest(
    ctx: PromptExecutionContext,
    dependencies: BotDependencies,
    resolvePrompt: () => Promise<PromptExecutionInput>,
) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    if (activePromptChats.has(ctx.chat.id)) {
        await ctx.reply(copy.status.alreadyProcessing);
        return;
    }

    let processingMessage: SentMessage | null = null;
    let sentTerminalReply = false;

    try {
        activePromptChats.add(ctx.chat.id);
        processingMessage = await ctx.reply(copy.status.processing);

        const promptInput = await resolvePrompt();
        const result = await dependencies.sendPromptUseCase.execute({
            chatId: ctx.chat.id,
            text: promptInput.text,
            files: promptInput.files,
        });
        const promptReply = normalizePromptReplyForDisplay(result.assistantReply, copy, dependencies);
        const telegramReply = buildTelegramPromptReply(promptReply, copy);

        try {
            await ctx.reply(telegramReply.preferred.text, telegramReply.preferred.options);
        } catch (replyError) {
            dependencies.logger.warn?.(
                { error: replyError },
                "failed to send preferred telegram reply, falling back to plain text",
            );
            await ctx.reply(telegramReply.fallback.text, telegramReply.fallback.options);
        }
        sentTerminalReply = true;
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle prompt request");
        await ctx.reply(presentError(error, copy));
        sentTerminalReply = true;
    } finally {
        activePromptChats.delete(ctx.chat.id);
        if (processingMessage && sentTerminalReply) {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, processingMessage.message_id);
            } catch (error) {
                dependencies.logger.warn?.({ error }, "failed to delete processing message");
            }
        }
    }
}

function normalizePromptReplyForDisplay(
    promptReply: Awaited<ReturnType<BotDependencies["sendPromptUseCase"]["execute"]>>["assistantReply"],
    copy: Awaited<ReturnType<typeof getChatCopy>>,
    dependencies: BotDependencies,
) {
    if (!promptReply.assistantError) {
        return promptReply;
    }

    if (isRecoverableStructuredOutputError(promptReply)) {
        dependencies.logger.warn?.(
            {
                error: promptReply.assistantError,
            },
            "structured output validation failed, falling back to assistant text reply",
        );

        return {
            ...promptReply,
            assistantError: null,
        };
    }

    return {
        ...promptReply,
        bodyMd: null,
        fallbackText: presentError(promptReply.assistantError, copy),
    };
}

function isRecoverableStructuredOutputError(
    promptReply: Awaited<ReturnType<BotDependencies["sendPromptUseCase"]["execute"]>>["assistantReply"],
): boolean {
    if (promptReply.assistantError?.name !== "StructuredOutputError") {
        return false;
    }

    if (promptReply.bodyMd?.trim()) {
        return true;
    }

    return promptReply.parts.some((part) =>
        part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0
    );
}
