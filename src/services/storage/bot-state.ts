import type { PendingChatAction } from "../../domain/pending-action/pending-action.entity.js";
import type { PendingPermissionApproval } from "../../domain/permission/approval.entity.js";
import type { ChatSessionBinding } from "../../domain/session/session.entity.js";

export interface OpencodeTbotState {
    version: 1;
    sessions: Record<string, ChatSessionBinding>;
    pendingActions: Record<string, PendingChatAction>;
    pendingPermissions: Record<string, PendingPermissionApproval>;
}

export function createDefaultOpencodeTbotState(): OpencodeTbotState {
    return {
        version: 1,
        sessions: {},
        pendingActions: {},
        pendingPermissions: {},
    };
}
