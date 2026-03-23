import { getSafeChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { buildTelegramPromptReply } from "../../services/telegram/telegram-format.js";
import type { ForegroundPromptDependencies } from "../types.js";
import type { PromptSessionFilePartInput } from "../../services/opencode/opencode.client.js";
import type { SendPromptResult } from "../../use-cases/send-prompt.usecase.js";

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

export async function executePromptRequest(
    ctx: PromptExecutionContext,
    dependencies: ForegroundPromptDependencies,
    resolvePrompt: () => Promise<PromptExecutionInput>,
) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);
    const foregroundRequest = dependencies.foregroundSessionTracker.acquire(ctx.chat.id);

    if (!foregroundRequest) {
        await ctx.reply(copy.status.alreadyProcessing);
        return;
    }

    let processingMessage: SentMessage | null = null;
    let sentTerminalReply = false;

    try {
        processingMessage = await ctx.reply(copy.status.processing);

        const promptInput = await resolvePrompt();
        const result = await dependencies.sendPromptUseCase.execute({
            chatId: ctx.chat.id,
            files: promptInput.files,
            onExecutionSession: (sessionId: string) => {
                foregroundRequest.attachSession(sessionId);
            },
            signal: foregroundRequest.signal,
            text: promptInput.text,
        });
        const promptReply = normalizePromptReplyForDisplay(result.assistantReply, copy);
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
        foregroundRequest.dispose();
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
    promptReply: SendPromptResult["assistantReply"],
    copy: Awaited<ReturnType<typeof getSafeChatCopy>>,
) {
    if (!promptReply.assistantError) {
        return promptReply;
    }

    return {
        ...promptReply,
        bodyMd: null,
        fallbackText: presentError(promptReply.assistantError, copy),
    };
}
