import type { PendingPermissionApproval } from "./approval.entity.js";

export interface PermissionApprovalRepository {
    listBySessionId(sessionId: string): Promise<PendingPermissionApproval[]>;
    listByRequestId(requestId: string): Promise<PendingPermissionApproval[]>;
    set(approval: PendingPermissionApproval): Promise<void>;
}
