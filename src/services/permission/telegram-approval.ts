import {
    BOT_COPY,
    type BotCopy,
} from "../../bot/copy.js";
import type { PermissionApprovalReply } from "../../domain/permission/approval.entity.js";
import type { PermissionApprovalCallbackData } from "../../bot/types.js";
import type { OpenCodePermissionRequest } from "../opencode/opencode.client.js";
import { escapeTelegramHtml, type TelegramStaticReply } from "../telegram/telegram-format.js";

export function buildPermissionApprovalMessage(
    request: OpenCodePermissionRequest,
    copy: BotCopy = BOT_COPY,
): TelegramStaticReply<"HTML"> {
    const patternLines = request.patterns.length > 0
        ? request.patterns
        : [copy.permission.noPatterns];
    const plainText = [
        copy.permission.requestTitle,
        "",
        `${copy.permission.permissionLabel}: ${request.permission}`,
        `${copy.permission.sessionLabel}: ${request.sessionID}`,
        "",
        `${copy.permission.patternsLabel}:`,
        ...patternLines.map((pattern) => `- ${pattern}`),
    ].join("\n");

    return {
        preferred: {
            text: [
                `<h2>${escapeTelegramHtml(copy.permission.requestTitle)}</h2>`,
                `<p>${escapeTelegramHtml(copy.permission.permissionLabel)}: ${escapeTelegramHtml(request.permission)}</p>`,
                `<p>${escapeTelegramHtml(copy.permission.sessionLabel)}: <code>${escapeTelegramHtml(request.sessionID)}</code></p>`,
                `<h3>${escapeTelegramHtml(copy.permission.patternsLabel)}</h3>`,
                `<ul>${patternLines.map((pattern) => `<li><code>${escapeTelegramHtml(pattern)}</code></li>`).join("")}</ul>`,
            ].join(""),
            options: {
                parse_mode: "HTML",
            },
        },
        fallback: {
            text: plainText,
        },
    };
}

export function buildPermissionApprovalResolvedMessage(
    requestId: string,
    reply: PermissionApprovalReply,
    copy: BotCopy = BOT_COPY,
): string {
    return copy.permission.resolved(requestId, copy.permission.replyLabels[reply]);
}

export function buildPermissionApprovalKeyboard(
    requestId: string,
    copy: BotCopy = BOT_COPY,
) {
    return {
        inline_keyboard: [[
            {
                text: copy.permission.allowOnce,
                callback_data: buildPermissionApprovalCallbackData("once", requestId),
            },
            {
                text: copy.permission.allowAlways,
                callback_data: buildPermissionApprovalCallbackData("always", requestId),
            },
            {
                text: copy.permission.reject,
                callback_data: buildPermissionApprovalCallbackData("reject", requestId),
            },
        ]],
    };
}

export function buildPermissionApprovalCallbackData(
    reply: PermissionApprovalReply,
    requestId: string,
): PermissionApprovalCallbackData {
    return `permission:${reply}:${requestId}`;
}

export function parsePermissionApprovalCallbackData(data: string): {
    reply: PermissionApprovalReply;
    requestId: string;
} | null {
    if (!data.startsWith("permission:")) {
        return null;
    }

    const [, reply, requestId] = data.split(":", 3);

    if (!requestId || !isPermissionApprovalReply(reply)) {
        return null;
    }

    return {
        reply,
        requestId,
    };
}

function isPermissionApprovalReply(value: string): value is PermissionApprovalReply {
    return value === "once" || value === "always" || value === "reject";
}
