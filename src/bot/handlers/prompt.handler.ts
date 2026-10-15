import { randomInt } from "node:crypto";
import { InlineKeyboard } from "grammy";
import type { InputRichMessage } from "grammy/types";
import { isTelegramFormattingError } from "../../services/telegram/rich-messages.js";
import type { ThinkingContent } from "../../domain/thinking/thinking-message.entity.js";
import { retryTelegramRequest } from "../../services/telegram/telegram-message-queue.js";
import { TelegramPromptProgress } from "../../services/telegram/prompt-progress.js";
import { getSafeChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { buildTelegramPromptReplies, buildTelegramSessionFooter, type TelegramReplyPayload, type TelegramStaticReply } from "../../services/telegram/telegram-format.js";
import type { ForegroundPromptDependencies } from "../types.js";
import type { PromptSessionFilePartInput } from "../../services/opencode/opencode.client.js";

interface SentMessage {
    message_id: number;
}

export interface PromptExecutionContext {
    chat: { id: number; type?: string };
    api: {
        deleteMessage(chatId: number, messageId: number): Promise<unknown>;
        sendRichMessageDraft?(chatId: number, draftId: number, message: InputRichMessage): Promise<unknown>;
        editMessageText?(chatId: number, messageId: number, text: string, other?: { reply_markup?: InlineKeyboard; parse_mode?: "Markdown" | "HTML" }): Promise<unknown>;
    };
    reply(text: string, other?: { parse_mode?: "Markdown" | "HTML"; reply_markup?: InlineKeyboard }): Promise<SentMessage>;
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
    let progress: TelegramPromptProgress | null = null;
    const foregroundRequest = dependencies.foregroundSessionTracker.acquire(ctx.chat.id, (event) => progress?.accept(event));

    if (!foregroundRequest) {
        await ctx.reply(copy.status.alreadyProcessing);
        return;
    }

    const answerMessages: Array<SentMessage & TelegramReplyPayload> = [];
    const draftId = randomInt(1, 2_147_483_647);
    const nativeStream = ctx.chat.type === "private" && Boolean(ctx.api.sendRichMessageDraft);
    let latestAnswer = "";
    let finalAnswerAttempted = false;
    const writeAnswerPart = async (index: number, payload: TelegramReplyPayload) => {
        const existing = answerMessages[index];
        if (existing && ctx.api.editMessageText) {
            if (existing.text !== payload.text || existing.options?.parse_mode !== payload.options?.parse_mode) {
                await retryTelegramRequest(() => ctx.api.editMessageText!(ctx.chat.id, existing.message_id, payload.text, payload.options));
            }
            answerMessages[index] = { message_id: existing.message_id, ...payload };
        } else {
            const message = await retryTelegramRequest(() => ctx.reply(payload.text, payload.options));
            answerMessages[index] = { ...message, ...payload };
        }
    };
    const writeReplies = async (replies: ReturnType<typeof buildTelegramPromptReplies>, streaming = false) => {
        // Persist completed chunks; only the current tail remains an ephemeral draft.
        const draft = streaming && nativeStream ? replies.at(-1) : undefined;
        const persisted = draft ? replies.slice(0, -1) : replies;
        for (const [index, reply] of persisted.entries()) {
            try {
                await writeAnswerPart(index, reply.preferred);
            } catch (error) {
                if (!reply.preferred.options?.parse_mode || !isTelegramFormattingError(error)) {
                    throw error;
                }
                dependencies.logger.warn({ error }, "failed to format reply, falling back to plain text");
                await writeAnswerPart(index, reply.fallback);
            }
        }
        for (const extra of answerMessages.slice(persisted.length)) {
            await retryTelegramRequest(() => ctx.api.deleteMessage(ctx.chat.id, extra.message_id));
        }
        answerMessages.length = persisted.length;
        if (draft) {
            const payload = draft.preferred;
            try {
                await retryTelegramRequest(() => ctx.api.sendRichMessageDraft!(ctx.chat.id, draftId,
                    payload.options?.parse_mode === "Markdown" ? { markdown: payload.text }
                        : { blocks: [{ type: "paragraph", text: payload.text }] },
                ));
            } catch (error) {
                if (!payload.options?.parse_mode || !isTelegramFormattingError(error)) throw error;
                await retryTelegramRequest(() => ctx.api.sendRichMessageDraft!(ctx.chat.id, draftId,
                    { blocks: [{ type: "paragraph", text: draft.fallback.text }] },
                ));
            }
        }
    };
    let processingMessage: SentMessage | null = null;
    let compactionMessage: SentMessage | null = null;
    let sentTerminalReply = false;
    let terminalStatus: "completed" | "stopped" | "failed" = "failed";

    try {
        const keyboard = new InlineKeyboard().text(copy.status.stop, `prompt:stop:${foregroundRequest.id}`);
        processingMessage = await ctx.reply(copy.status.processing, { reply_markup: keyboard });
        const thinkingMessages: Array<SentMessage & TelegramReplyPayload<"HTML"> & { terminal: boolean; thinking?: ThinkingContent }> = [
            { ...processingMessage, text: copy.status.processing, terminal: false },
        ];
        progress = new TelegramPromptProgress(copy, async (replies, terminal) => {
            const replyMarkup = terminal ? new InlineKeyboard() : keyboard;
            for (const [index, reply] of replies.entries()) {
                let existing = thinkingMessages[index];
                if (reply.thinking) {
                    if (existing?.thinking?.text === reply.thinking.text
                        && existing.thinking.phase === reply.thinking.phase
                        && existing.thinking.part === reply.thinking.part) {
                        continue;
                    }
                    if (!existing) {
                        const message = await retryTelegramRequest(() => ctx.reply(copy.status.thinkingInProgress, { reply_markup: replyMarkup }));
                        existing = { ...message, text: copy.status.thinkingInProgress, terminal: false };
                    }
                    const messageId = existing.message_id;
                    await dependencies.thinkingMessages.update(
                        ctx.chat.id, messageId, reply.thinking, foregroundRequest.id, copy,
                        (payload, keyboard) => ctx.api.editMessageText?.(ctx.chat.id, messageId, payload.text, {
                            ...payload.options,
                            reply_markup: keyboard,
                        }) ?? Promise.resolve(),
                    );
                    thinkingMessages[index] = { message_id: messageId, ...reply.preferred, terminal, thinking: reply.thinking };
                    continue;
                }
                const write = async (payload: TelegramReplyPayload<"HTML">) => {
                    const options = { ...payload.options, reply_markup: replyMarkup };
                    if (existing) {
                        if (existing.text !== payload.text || existing.options?.parse_mode !== payload.options?.parse_mode || existing.terminal !== terminal) {
                            await retryTelegramRequest(() => ctx.api.editMessageText?.(ctx.chat.id, existing.message_id, payload.text, options) ?? Promise.resolve());
                        }
                        thinkingMessages[index] = { message_id: existing.message_id, ...payload, terminal };
                    } else {
                        const message = await retryTelegramRequest(() => ctx.reply(payload.text, options));
                        thinkingMessages[index] = { ...message, ...payload, terminal };
                    }
                };
                try {
                    await write(reply.preferred);
                } catch (error) {
                    if (!reply.preferred.options?.parse_mode || !isTelegramFormattingError(error)) {
                        throw error;
                    }
                    dependencies.logger.warn({ error }, "failed to format thinking, falling back to plain text");
                    await write(reply.fallback);
                }
            }
            for (const extra of thinkingMessages.slice(replies.length)) {
                await dependencies.thinkingMessages.remove(ctx.chat.id, extra.message_id, () => retryTelegramRequest(() => ctx.api.deleteMessage(ctx.chat.id, extra.message_id)));
            }
            thinkingMessages.length = replies.length;
        }, (error) => dependencies.logger.warn?.({ error }, "failed to update prompt progress"), async (text) => {
            latestAnswer = text;
            await writeReplies(buildTelegramPromptReplies({
                bodyMd: text,
                fallbackText: text,
            }, copy, true), true);
        }, async (text, terminal) => {
            const options = { reply_markup: terminal ? new InlineKeyboard() : keyboard };
            if (!compactionMessage) {
                compactionMessage = await retryTelegramRequest(() => ctx.reply(text, options));
            } else {
                await retryTelegramRequest(() => ctx.api.editMessageText?.(ctx.chat.id, compactionMessage!.message_id, text, options) ?? Promise.resolve());
            }
        });

        const promptInput = await resolvePrompt();
        const startedAt = performance.now();
        const result = await dependencies.sendPromptUseCase.execute({
            chatId: ctx.chat.id,
            files: promptInput.files,
            onInputReady: (messageId) => foregroundRequest.attachInput(messageId),
            onExecutionSession: (sessionId: string) => {
                foregroundRequest.attachSession(sessionId);
            },
            signal: foregroundRequest.signal,
            text: promptInput.text,
        });
        const durationMs = performance.now() - startedAt;
        terminalStatus = result.assistantReply.assistantError ? "failed" : "completed";
        await progress.finish(terminalStatus);
        const promptReply = result.assistantReply.assistantError
            ? { bodyMd: result.assistantReply.bodyMd || latestAnswer, fallbackText: result.assistantReply.fallbackText }
            : result.assistantReply;
        finalAnswerAttempted = true;
        if (!result.assistantReply.assistantError || promptReply.bodyMd) {
            await writeReplies(buildTelegramPromptReplies(promptReply, copy));
        }
        if (result.assistantReply.assistantError) {
            await ctx.reply(presentError(result.assistantReply.assistantError, copy));
        }
        sentTerminalReply = true;
        if (dependencies.contextFooter) {
            try {
                const context = await dependencies.contextFooter.read(ctx.chat.id, result.sessionId).catch((error) => {
                    dependencies.logger.warn({ error }, "failed to read context usage");
                    return null;
                });
                let footerReply = buildTelegramSessionFooter(context, copy, durationMs);
                let contextMessage: SentMessage | null = null;
                const writeFooter = async (reply: TelegramStaticReply<"HTML">) => {
                    const write = async (payload: TelegramReplyPayload<"HTML">): Promise<SentMessage> => {
                        if (contextMessage && ctx.api.editMessageText) {
                            await retryTelegramRequest(() => ctx.api.editMessageText!(ctx.chat.id, contextMessage!.message_id, payload.text, payload.options));
                            return contextMessage;
                        }
                        return retryTelegramRequest(() => ctx.reply(payload.text, payload.options));
                    };
                    try {
                        contextMessage = await write(reply.preferred);
                    } catch (error) {
                        if (!isTelegramFormattingError(error)) {
                            throw error;
                        }
                        dependencies.logger.warn({ error }, "failed to format session footer, falling back to plain text");
                        contextMessage = await write(reply.fallback);
                    }
                };
                await writeFooter(footerReply);
                dependencies.contextFooter.watch(ctx.chat.id, result.sessionId, async (context) => {
                    const next = buildTelegramSessionFooter(context, copy, durationMs);
                    if (next.preferred.text !== footerReply.preferred.text && ctx.api.editMessageText) {
                        await writeFooter(next);
                        footerReply = next;
                    }
                });
            } catch (error) {
                dependencies.logger.warn({ error }, "failed to display context message");
            }
        }
    } catch (error) {
        terminalStatus = foregroundRequest.signal.aborted ? "stopped" : "failed";
        await progress?.finish(terminalStatus);
        if (nativeStream && latestAnswer && !finalAnswerAttempted) {
            try {
                await writeReplies(buildTelegramPromptReplies({ bodyMd: latestAnswer, fallbackText: latestAnswer }, copy));
            } catch (deliveryError) {
                dependencies.logger.warn({ error: deliveryError }, "failed to preserve partial answer");
            }
        }
        dependencies.logger.error({ error }, "failed to handle prompt request");
        await ctx.reply(presentError(error, copy));
        sentTerminalReply = true;
    } finally {
        await progress?.finish(terminalStatus);
        foregroundRequest.dispose();
        if (processingMessage && sentTerminalReply && !progress?.hasContent) {
            try {
                await dependencies.thinkingMessages.remove(ctx.chat.id, processingMessage.message_id, () => ctx.api.deleteMessage(ctx.chat.id, processingMessage!.message_id));
            } catch (error) {
                dependencies.logger.warn?.({ error }, "failed to delete processing message");
            }
        }
    }
}
