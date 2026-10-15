import type { OpenCodeEvent } from "@opencode/client";
import { GrammyError } from "grammy";
import { getSafeChatCopy } from "../bot/i18n.js";
import type { PendingPermissionApproval, PermissionApprovalReply } from "../domain/permission/approval.entity.js";
import type { AppLogger } from "../infra/logger/index.js";
import { logPluginEvent } from "../infra/logger/index.js";
import type { OpenCodePermissionRequest } from "../services/opencode/opencode.client.js";
import {
    buildPermissionApprovalKeyboard,
    buildPermissionApprovalMessage,
    buildPermissionApprovalResolvedMessage,
} from "../services/permission/telegram-approval.js";
import type { TelegramBotRuntime } from "./runtime.js";

type OpenCodePluginEvent = {
    data?: unknown;
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

interface PluginEventHandlerDefinition {
    handle(runtime: TelegramBotRuntime, event: unknown): Promise<void>;
    normalize(properties: unknown): unknown | null;
}

const PLUGIN_EVENT_HANDLERS: Partial<Record<OpenCodeEvent["type"], PluginEventHandlerDefinition>> = {
    "permission.asked": createPluginEventHandler(
        normalizePermissionRequestEvent,
        handlePermissionAsked,
    ),
    "permission.replied": createPluginEventHandler(
        normalizePermissionReplyEvent,
        handlePermissionReplied,
    ),
    "session.execution.interrupted": createPluginEventHandler(
        normalizeSessionIdleEvent,
        handleSessionInterrupted,
    ),
    "session.execution.failed": createPluginEventHandler(
        normalizeSessionErrorEvent,
        handleSessionError,
    ),
    "session.idle": createPluginEventHandler(
        normalizeSessionIdleEvent,
        handleSessionIdle,
    ),
    "session.status": createPluginEventHandler(
        normalizeSessionStatusEvent,
        handleSessionStatus,
    ),
};

export async function handleTelegramBotPluginEvent(
    runtime: TelegramBotRuntime,
    event: OpenCodePluginEvent,
): Promise<void> {
    runtime.container.foregroundSessionTracker.publish(event);
    if (["session.compaction.ended", "session.model.selected", "session.agent.selected", "session.moved", "session.usage.updated", "session.revert.committed", "session.revert.cleared"].includes(event.type)
        && event.data && typeof event.data === "object" && "sessionID" in event.data && typeof event.data.sessionID === "string") {
        void runtime.container.contextFooter?.refreshSession(event.data.sessionID).catch((error) => {
            runtime.container.logger.warn({ error }, "failed to refresh context footer after plugin event");
        });
    }
    const handler = PLUGIN_EVENT_HANDLERS[event.type as OpenCodeEvent["type"]];

    if (!handler) {
        return;
    }

    const normalizedEvent = handler.normalize(event.data);

    if (!normalizedEvent) {
        return;
    }

    await handler.handle(runtime, normalizedEvent);
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
            const copy = await getSafeChatCopy(runtime.container.sessionRepo, chatId, logger);
            const message = await sendPermissionApprovalMessage(
                runtime,
                chatId,
                request,
                copy,
                logger,
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
                const copy = await getSafeChatCopy(runtime.container.sessionRepo, approval.chatId, logger);

                await runtime.bot.api.editMessageText(
                    approval.chatId,
                    approval.messageId,
                    buildPermissionApprovalResolvedMessage(event.requestId, event.reply, copy),
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

    await notifyBoundChats(runtime, event.sessionId, async (chatId) => {
        const copy = await getSafeChatCopy(runtime.container.sessionRepo, chatId, logger);
        const message = extractSessionErrorMessage(event.error) ?? copy.sessionEvents.unknownError;

        return copy.sessionEvents.failed(event.sessionId, message);
    });
}

async function handleSessionInterrupted(
    runtime: TelegramBotRuntime,
    event: NormalizedSessionIdleEvent,
): Promise<void> {
    const approvals = await runtime.container.permissionApprovalRepo.listBySessionId(event.sessionId);
    for (const approval of approvals.filter((item) => item.status === "pending")) {
        const copy = await getSafeChatCopy(runtime.container.sessionRepo, approval.chatId, runtime.container.logger);
        await runtime.container.permissionApprovalRepo.set(toResolvedApproval(approval, "reject"));
        try {
            await runtime.bot.api.editMessageText(approval.chatId, approval.messageId, copy.status.stopped, {
                reply_markup: { inline_keyboard: [] },
            });
        } catch (error) {
            runtime.container.logger.warn({ error }, "failed to remove interrupted permission buttons");
        }
    }
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
    getText: (chatId: number) => Promise<string>,
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
                await runtime.bot.api.sendMessage(chatId, await getText(chatId));
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

async function sendPermissionApprovalMessage(
    runtime: TelegramBotRuntime,
    chatId: number,
    request: OpenCodePermissionRequest,
    copy: Awaited<ReturnType<typeof getSafeChatCopy>>,
    logger: AppLogger,
) {
    const message = buildPermissionApprovalMessage(request, copy);
    const replyMarkup = buildPermissionApprovalKeyboard(request.id, copy);

    try {
        return await runtime.bot.api.sendMessage(
            chatId,
            message.preferred.text,
            {
                ...message.preferred.options,
                reply_markup: replyMarkup,
            },
        );
    } catch (error) {
        if (!(error instanceof GrammyError) || error.error_code !== 400) {
            throw error;
        }
        logger.warn(
            {
                error,
                chatId,
                event: "plugin-event.permission.ask.markdown_delivery_failed",
                requestId: request.id,
            },
            "failed to format rich permission request; retrying with plain rich text",
        );

        return runtime.bot.api.sendMessage(
            chatId,
            message.fallback.text,
            {
                reply_markup: replyMarkup,
            },
        );
    }
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
    const action = asNonEmptyString(properties.action);

    if (!id || !sessionID || !action) {
        return null;
    }

    return {
        save: Array.isArray(properties.save)
            ? properties.save.filter((value): value is string => typeof value === "string")
            : [],
        id,
        resources: Array.isArray(properties.resources)
            ? properties.resources.filter((value): value is string => typeof value === "string")
            : [],
        action,
        sessionID,
    };
}

function normalizePermissionReplyEvent(properties: unknown): NormalizedPermissionReplyEvent | null {
    if (!isPlainRecord(properties)) {
        return null;
    }

    const requestId = asNonEmptyString(properties.requestID);
    const reply = normalizePermissionReply(asNonEmptyString(properties.reply));
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

    if (typeof error.message === "string" && error.message.trim().length > 0) {
        return error.message.trim();
    }

    return asNonEmptyString(error.type);
}

function normalizeForegroundSessionError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    if (isPlainRecord(error)) {
        const normalized = Object.assign(
            new Error(extractSessionErrorMessage(error) ?? "Unknown session error."),
            error,
        );
        const normalizedName = asNonEmptyString(error.type);

        if (normalizedName) {
            normalized.name = normalizedName;
        }

        return normalized;
    }

    return new Error("Unknown session error.");
}

function createPluginEventHandler<TEvent>(
    normalize: (properties: unknown) => TEvent | null,
    handle: (runtime: TelegramBotRuntime, event: TEvent) => Promise<void>,
): PluginEventHandlerDefinition {
    return {
        handle(runtime, event) {
            return handle(runtime, event as TEvent);
        },
        normalize(properties) {
            return normalize(properties);
        },
    };
}

function asNonEmptyString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
