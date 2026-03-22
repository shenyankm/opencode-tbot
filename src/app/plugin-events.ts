import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import type { PendingPermissionApproval, PermissionApprovalReply } from "../domain/permission/approval.entity.js";
import { logPluginEvent } from "../infra/logger/index.js";
import type { OpenCodePermissionRequest } from "../services/opencode/opencode.client.js";
import {
    buildPermissionApprovalKeyboard,
    buildPermissionApprovalMessage,
    buildPermissionApprovalResolvedMessage,
} from "../services/permission/telegram-approval.js";
import type { TelegramBotRuntime } from "./runtime.js";

type OpenCodePluginEvent = OpenCodeEvent | {
    properties?: unknown;
    type: string;
};

interface NormalizedPermissionReplyEvent {
    reply: PermissionApprovalReply;
    requestId: string;
    sessionId: string;
}

interface NormalizedSessionErrorEvent {
    error: unknown;
    sessionId: string;
}

interface NormalizedSessionIdleEvent {
    sessionId: string;
}

interface NormalizedSessionStatusEvent extends NormalizedSessionIdleEvent {
    statusType: string;
}

export async function handleTelegramBotPluginEvent(
    runtime: TelegramBotRuntime,
    event: OpenCodePluginEvent,
): Promise<void> {
    switch (event.type) {
        case "permission.asked":
        case "permission.updated": {
            const request = normalizePermissionRequestEvent(event.properties);

            if (request) {
                await handlePermissionAsked(runtime, request);
            }
            return;
        }
        case "permission.replied": {
            const replyEvent = normalizePermissionReplyEvent(event.properties);

            if (replyEvent) {
                await handlePermissionReplied(runtime, replyEvent);
            }
            return;
        }
        case "session.error": {
            const sessionError = normalizeSessionErrorEvent(event.properties);

            if (sessionError) {
                await handleSessionError(runtime, sessionError);
            }
            return;
        }
        case "session.idle": {
            const sessionIdle = normalizeSessionIdleEvent(event.properties);

            if (sessionIdle) {
                await handleSessionIdle(runtime, sessionIdle);
            }
            return;
        }
        case "session.status": {
            const sessionStatus = normalizeSessionStatusEvent(event.properties);

            if (sessionStatus) {
                await handleSessionStatus(runtime, sessionStatus);
            }
            return;
        }
        default:
            return;
    }
}

async function handlePermissionAsked(
    runtime: TelegramBotRuntime,
    request: OpenCodePermissionRequest,
): Promise<void> {
    const logger = runtime.container.logger.child({
        component: "plugin-event",
        requestId: request.id,
        sessionId: request.sessionID,
    });
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
            logger.error(
                {
                    error,
                    chatId,
                    event: "plugin-event.permission.ask.delivery_failed",
                    requestId: request.id,
                },
                "failed to deliver permission request to Telegram",
            );
        }
    }
}

async function handlePermissionReplied(
    runtime: TelegramBotRuntime,
    event: NormalizedPermissionReplyEvent,
): Promise<void> {
    const logger = runtime.container.logger.child({
        component: "plugin-event",
        event: "plugin-event.permission.replied",
        requestId: event.requestId,
        sessionId: event.sessionId,
    });
    const approvals = await runtime.container.permissionApprovalRepo.listByRequestId(event.requestId);

    await Promise.all(
        approvals.map(async (approval) => {
            try {
                await runtime.bot.api.editMessageText(
                    approval.chatId,
                    approval.messageId,
                    buildPermissionApprovalResolvedMessage(event.requestId, event.reply),
                );
            } catch (error) {
                logger.warn(
                    {
                        error,
                        chatId: approval.chatId,
                        event: "plugin-event.permission.reply_message_failed",
                    },
                    "failed to update Telegram permission message",
                );
            }

            await runtime.container.permissionApprovalRepo.set(toResolvedApproval(approval, event.reply));
        }),
    );
}

async function handleSessionError(
    runtime: TelegramBotRuntime,
    event: NormalizedSessionErrorEvent,
): Promise<void> {
    const logger = runtime.container.logger.child({
        component: "plugin-event",
        sessionId: event.sessionId,
    });
    const wasForeground = runtime.container.foregroundSessionTracker.fail(
        event.sessionId,
        normalizeForegroundSessionError(event.error),
    );

    if (wasForeground) {
        logger.warn(
            {
                error: event.error,
                event: "plugin-event.session.error.foreground_suppressed",
            },
            "session error suppressed for foreground Telegram session",
        );
        return;
    }

    const message = extractSessionErrorMessage(event.error) ?? "Unknown session error.";

    await notifyBoundChats(runtime, event.sessionId, `Session failed.\n\nSession: ${event.sessionId}\nError: ${message}`);
}

async function handleSessionIdle(
    runtime: TelegramBotRuntime,
    event: NormalizedSessionIdleEvent,
): Promise<void> {
    const logger = runtime.container.logger.child({
        component: "plugin-event",
        sessionId: event.sessionId,
    });
    const wasForeground = runtime.container.foregroundSessionTracker.clear(event.sessionId);

    if (wasForeground) {
        logPluginEvent(
            logger,
            {
                event: "plugin-event.session.idle.foreground_suppressed",
            },
            "session idle notification suppressed for foreground Telegram session",
        );
    }
}

async function handleSessionStatus(
    runtime: TelegramBotRuntime,
    event: NormalizedSessionStatusEvent,
): Promise<void> {
    if (event.statusType !== "idle") {
        return;
    }

    await handleSessionIdle(runtime, event);
}

async function notifyBoundChats(
    runtime: TelegramBotRuntime,
    sessionId: string,
    text: string,
): Promise<void> {
    const logger = runtime.container.logger.child({
        component: "plugin-event",
        sessionId,
    });
    const bindings = await runtime.container.sessionRepo.listBySessionId(sessionId);
    const chatIds = [...new Set(bindings.map((binding) => binding.chatId))];

    await Promise.all(
        chatIds.map(async (chatId) => {
            try {
                await runtime.bot.api.sendMessage(chatId, text);
            } catch (error) {
                logger.warn(
                    {
                        error,
                        chatId,
                        event: "plugin-event.session.notify_failed",
                    },
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

function normalizePermissionRequestEvent(properties: unknown): OpenCodePermissionRequest | null {
    if (!isPlainRecord(properties)) {
        return null;
    }

    const id = asNonEmptyString(properties.id);
    const sessionID = asNonEmptyString(properties.sessionID);
    const permission = asNonEmptyString(properties.permission) ?? asNonEmptyString(properties.type);

    if (!id || !sessionID || !permission) {
        return null;
    }

    return {
        always: Array.isArray(properties.always)
            ? properties.always.filter((value): value is string => typeof value === "string")
            : [],
        id,
        metadata: isPlainRecord(properties.metadata)
            ? properties.metadata
            : {},
        patterns: normalizePermissionPatterns(properties),
        permission,
        sessionID,
    };
}

function normalizePermissionReplyEvent(properties: unknown): NormalizedPermissionReplyEvent | null {
    if (!isPlainRecord(properties)) {
        return null;
    }

    const requestId = asNonEmptyString(properties.requestID) ?? asNonEmptyString(properties.permissionID);
    const reply = normalizePermissionReply(
        asNonEmptyString(properties.reply) ?? asNonEmptyString(properties.response),
    );
    const sessionId = asNonEmptyString(properties.sessionID);

    if (!requestId || !reply || !sessionId) {
        return null;
    }

    return {
        reply,
        requestId,
        sessionId,
    };
}

function normalizeSessionErrorEvent(properties: unknown): NormalizedSessionErrorEvent | null {
    if (!isPlainRecord(properties)) {
        return null;
    }

    const sessionId = asNonEmptyString(properties.sessionID);

    if (!sessionId) {
        return null;
    }

    return {
        error: properties.error,
        sessionId,
    };
}

function normalizeSessionIdleEvent(properties: unknown): NormalizedSessionIdleEvent | null {
    if (!isPlainRecord(properties)) {
        return null;
    }

    const sessionId = asNonEmptyString(properties.sessionID);

    return sessionId
        ? { sessionId }
        : null;
}

function normalizeSessionStatusEvent(properties: unknown): NormalizedSessionStatusEvent | null {
    if (!isPlainRecord(properties) || !isPlainRecord(properties.status)) {
        return null;
    }

    const sessionId = asNonEmptyString(properties.sessionID);
    const statusType = asNonEmptyString(properties.status.type);

    if (!sessionId || !statusType) {
        return null;
    }

    return {
        sessionId,
        statusType,
    };
}

function normalizePermissionPatterns(properties: Record<string, unknown>): string[] {
    if (Array.isArray(properties.patterns)) {
        return properties.patterns.filter((value): value is string => typeof value === "string");
    }

    if (typeof properties.pattern === "string" && properties.pattern.trim().length > 0) {
        return [properties.pattern];
    }

    if (Array.isArray(properties.pattern)) {
        return properties.pattern.filter((value): value is string => typeof value === "string");
    }

    return [];
}

function normalizePermissionReply(value: string | null): PermissionApprovalReply | null {
    if (value === "once" || value === "always" || value === "reject") {
        return value;
    }

    return null;
}

function extractSessionErrorMessage(error: unknown): string | null {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }

    if (!isPlainRecord(error)) {
        return null;
    }

    if (isPlainRecord(error.data) && typeof error.data.message === "string" && error.data.message.trim().length > 0) {
        return error.data.message.trim();
    }

    return asNonEmptyString(error.name);
}

function normalizeForegroundSessionError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    if (isPlainRecord(error) && typeof error.name === "string" && error.name.trim().length > 0) {
        const normalized = new Error(extractSessionErrorMessage(error) ?? "Unknown session error.") as Error & {
            data?: Record<string, unknown>;
        };

        normalized.name = error.name.trim();

        if (isPlainRecord(error.data)) {
            normalized.data = error.data;
        }

        return normalized;
    }

    return new Error("Unknown session error.");
}

function asNonEmptyString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : null;
}

function isPlainRecord(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
