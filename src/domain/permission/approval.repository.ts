import type { PendingPermissionApproval } from "./approval.entity.js";

export interface PermissionApprovalRepository {
    listByRequestId(requestId: string): Promise<PendingPermissionApproval[]>;
    set(approval: PendingPermissionApproval): Promise<void>;
}
