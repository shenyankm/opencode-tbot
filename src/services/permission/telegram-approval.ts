import type { PermissionApprovalReply } from "../../domain/permission/approval.entity.js";
import type { PermissionApprovalCallbackData } from "../../bot/types.js";
import type { OpenCodePermissionRequest } from "../opencode/opencode.client.js";

export function buildPermissionApprovalMessage(
    request: OpenCodePermissionRequest,
): string {
    const patterns = request.patterns.length > 0
        ? request.patterns.map((pattern) => `- ${pattern}`).join("\n")
        : "- (none)";

    return [
        "*Permission Request*",
        "",
        `Permission: \`${escapeMarkdownV2(request.permission)}\``,
        `Session: \`${escapeMarkdownV2(request.sessionID)}\``,
        "",
        "Patterns:",
        patterns,
    ].join("\n");
}

export function buildPermissionApprovalResolvedMessage(
    requestId: string,
    reply: PermissionApprovalReply,
): string {
    return [
        "Permission request resolved.",
        "",
        `Request: ${requestId}`,
        `Reply: ${reply}`,
    ].join("\n");
}

export function buildPermissionApprovalKeyboard(requestId: string) {
    return {
        inline_keyboard: [[
            {
                text: "Allow once",
                callback_data: buildPermissionApprovalCallbackData("once", requestId),
            },
            {
                text: "Always allow",
                callback_data: buildPermissionApprovalCallbackData("always", requestId),
            },
            {
                text: "Reject",
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

function escapeMarkdownV2(value: string): string {
    return value.replaceAll(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}
