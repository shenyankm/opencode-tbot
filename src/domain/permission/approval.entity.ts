export type PermissionApprovalReply = "once" | "always" | "reject";
export type PermissionApprovalStatus = "pending" | PermissionApprovalReply;

export interface PendingPermissionApproval {
    requestId: string;
    sessionId: string;
    chatId: number;
    messageId: number;
    status: PermissionApprovalStatus;
    updatedAt: string;
}
