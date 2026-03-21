import type {
    Event as OpenCodeEvent,
    EventPermissionAsked,
    EventPermissionReplied,
    EventSessionError,
    EventSessionIdle,
    EventSessionStatus,
} from "@opencode-ai/sdk/v2/client";
import type { PendingPermissionApproval, PermissionApprovalReply } from "../domain/permission/approval.entity.js";
import {
    buildPermissionApprovalKeyboard,
    buildPermissionApprovalMessage,
    buildPermissionApprovalResolvedMessage,
} from "../services/permission/telegram-approval.js";
import type { TelegramBotRuntime } from "./runtime.js";

export async function handleTelegramBotPluginEvent(
    runtime: TelegramBotRuntime,
    event: OpenCodeEvent,
): Promise<void> {
    switch (event.type) {
        case "permission.asked":
            await handlePermissionAsked(runtime, event);
            return;
        case "permission.replied":
            await handlePermissionReplied(runtime, event);
            return;
        case "session.error":
            await handleSessionError(runtime, event);
            return;
        case "session.idle":
            await handleSessionIdle(runtime, event);
            return;
        case "session.status":
            await handleSessionStatus(runtime, event);
            return;
        default:
            return;
    }
}

async function handlePermissionAsked(
    runtime: TelegramBotRuntime,
    event: EventPermissionAsked,
): Promise<void> {
    const request = event.properties;
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
    event: EventPermissionReplied,
): Promise<void> {
    const requestId = event.properties.requestID;
    const reply = event.properties.reply as PermissionApprovalReply;
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
    event: EventSessionError,
): Promise<void> {
    const sessionId = event.properties.sessionID;
    const error = event.properties.error;

    if (!sessionId) {
        runtime.container.logger.error({ error }, "session error received without a session id");
        return;
    }

    const wasForeground = runtime.container.foregroundSessionTracker.fail(sessionId, error ?? new Error("Unknown session error."));

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
    event: EventSessionIdle,
): Promise<void> {
    const sessionId = event.properties.sessionID;
    const wasForeground = runtime.container.foregroundSessionTracker.clear(sessionId);

    if (wasForeground) {
        runtime.container.logger.info({ sessionId }, "session idle notification suppressed for foreground Telegram session");
        return;
    }

    await notifyBoundChats(runtime, sessionId, `Session finished.\n\nSession: ${sessionId}`);
}

async function handleSessionStatus(
    runtime: TelegramBotRuntime,
    event: EventSessionStatus,
): Promise<void> {
    if (event.properties.status.type !== "idle") {
        return;
    }

    await handleSessionIdle(runtime, {
        type: "session.idle",
        properties: {
            sessionID: event.properties.sessionID,
        },
    });
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
