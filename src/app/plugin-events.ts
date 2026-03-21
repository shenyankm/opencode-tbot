import type { PendingPermissionApproval, PermissionApprovalReply } from "../domain/permission/approval.entity.js";
import type { OpenCodePermissionRequest } from "../services/opencode/opencode.client.js";
import {
    buildPermissionApprovalKeyboard,
    buildPermissionApprovalMessage,
    buildPermissionApprovalResolvedMessage,
} from "../services/permission/telegram-approval.js";
import type { TelegramBotRuntime } from "./runtime.js";

type TelegramBotPluginEvent =
    | {
        type: "permission.asked";
        properties: OpenCodePermissionRequest;
    }
    | {
        type: "permission.replied";
        properties: {
            sessionID: string;
            requestID: string;
            reply: PermissionApprovalReply;
        };
    }
    | {
        type: "session.error";
        properties: {
            sessionID?: string;
            error?: {
                name?: string;
                data?: {
                    message?: string;
                };
            };
        };
    }
    | {
        type: "session.idle";
        properties: {
            sessionID: string;
        };
    };

export async function handleTelegramBotPluginEvent(
    runtime: TelegramBotRuntime,
    event: TelegramBotPluginEvent,
): Promise<void> {
    switch (event.type) {
        case "permission.asked":
            await handlePermissionAsked(runtime, event.properties);
            return;
        case "permission.replied":
            await handlePermissionReplied(runtime, event.properties.requestID, event.properties.reply);
            return;
        case "session.error":
            await handleSessionError(runtime, event.properties.sessionID, event.properties.error);
            return;
        case "session.idle":
            await handleSessionIdle(runtime, event.properties.sessionID);
            return;
        default:
            return;
    }
}

async function handlePermissionAsked(
    runtime: TelegramBotRuntime,
    request: OpenCodePermissionRequest,
): Promise<void> {
    const bindings = await runtime.container.sessionRepo.listBySessionId(request.sessionID);
    const chatIds = new Set([
        ...bindings.map((binding) => binding.chatId),
        ...runtime.container.foregroundSessionTracker.listChatIds(request.sessionID),
    ]);
    const approvals = await runtime.container.permissionApprovalRepo.listByRequestId(request.id);
    const approvedChatIds = new Set(approvals.map((approval) => approval.chatId));

    for (const chatId of chatIds) {
        if (approvedChatIds.has(chatId)) {
            continue;
        }

        try {
            const message = await runtime.bot.api.sendMessage(
                chatId,
                buildPermissionApprovalMessage(request),
                {
                    parse_mode: "MarkdownV2",
                    reply_markup: buildPermissionApprovalKeyboard(request.id),
                },
            );

            await runtime.container.permissionApprovalRepo.set({
                requestId: request.id,
                sessionId: request.sessionID,
                chatId,
                messageId: message.message_id,
                status: "pending",
                updatedAt: new Date().toISOString(),
            });
        } catch (error) {
            runtime.container.logger.error(
                {
                    error,
                    chatId,
                    requestId: request.id,
                },
                "failed to deliver permission request to Telegram",
            );
        }
    }
}

async function handlePermissionReplied(
    runtime: TelegramBotRuntime,
    requestId: string,
    reply: PermissionApprovalReply,
): Promise<void> {
    const approvals = await runtime.container.permissionApprovalRepo.listByRequestId(requestId);

    await Promise.all(
        approvals.map(async (approval) => {
            try {
                await runtime.bot.api.editMessageText(
                    approval.chatId,
                    approval.messageId,
                    buildPermissionApprovalResolvedMessage(requestId, reply),
                );
            } catch (error) {
                runtime.container.logger.warn(
                    {
                        error,
                        chatId: approval.chatId,
                        requestId,
                    },
                    "failed to update Telegram permission message",
                );
            }

            await runtime.container.permissionApprovalRepo.set(toResolvedApproval(approval, reply));
        }),
    );
}

async function handleSessionError(
    runtime: TelegramBotRuntime,
    sessionId: string | undefined,
    error: {
        name?: string;
        data?: {
            message?: string;
        };
    } | undefined,
): Promise<void> {
    if (!sessionId) {
        runtime.container.logger.error({ error }, "session error received without a session id");
        return;
    }

    const wasForeground = runtime.container.foregroundSessionTracker.clear(sessionId);

    if (wasForeground) {
        runtime.container.logger.warn({ error, sessionId }, "session error suppressed for foreground Telegram session");
        return;
    }

    const message = error?.data?.message?.trim()
        || error?.name?.trim()
        || "Unknown session error.";

    await notifyBoundChats(runtime, sessionId, `Session failed.\n\nSession: ${sessionId}\nError: ${message}`);
}

async function handleSessionIdle(
    runtime: TelegramBotRuntime,
    sessionId: string,
): Promise<void> {
    const wasForeground = runtime.container.foregroundSessionTracker.clear(sessionId);

    if (wasForeground) {
        runtime.container.logger.info({ sessionId }, "session idle notification suppressed for foreground Telegram session");
        return;
    }

    await notifyBoundChats(runtime, sessionId, `Session finished.\n\nSession: ${sessionId}`);
}

async function notifyBoundChats(
    runtime: TelegramBotRuntime,
    sessionId: string,
    text: string,
): Promise<void> {
    const bindings = await runtime.container.sessionRepo.listBySessionId(sessionId);
    const chatIds = [...new Set(bindings.map((binding) => binding.chatId))];

    await Promise.all(
        chatIds.map(async (chatId) => {
            try {
                await runtime.bot.api.sendMessage(chatId, text);
            } catch (error) {
                runtime.container.logger.warn(
                    { error, chatId, sessionId },
                    "failed to notify Telegram chat about session event",
                );
            }
        }),
    );
}

function toResolvedApproval(
    approval: PendingPermissionApproval,
    reply: PermissionApprovalReply,
): PendingPermissionApproval {
    return {
        ...approval,
        status: reply,
        updatedAt: new Date().toISOString(),
    };
}
