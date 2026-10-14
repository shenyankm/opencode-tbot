import type { PendingPermissionApproval } from "../domain/permission/approval.entity.js";
import type { PermissionApprovalRepository } from "../domain/permission/approval.repository.js";
import type { OpencodeTbotState } from "../services/storage/bot-state.js";
import type { JsonStateStore } from "../services/storage/json-state-store.js";

function buildApprovalKey(requestId: string, chatId: number): string {
    return `${requestId}:${chatId}`;
}

export class InMemoryPermissionApprovalRepository implements PermissionApprovalRepository {
    private readonly approvalsByKey = new Map<string, PendingPermissionApproval>();

    async listBySessionId(sessionId: string): Promise<PendingPermissionApproval[]> {
        return [...this.approvalsByKey.values()].filter((approval) => approval.sessionId === sessionId);
    }

    async listByRequestId(requestId: string): Promise<PendingPermissionApproval[]> {
        return [...this.approvalsByKey.values()].filter((approval) => approval.requestId === requestId);
    }

    async set(approval: PendingPermissionApproval): Promise<void> {
        this.approvalsByKey.set(buildApprovalKey(approval.requestId, approval.chatId), approval);
    }
}

export class FilePermissionApprovalRepository implements PermissionApprovalRepository {
    constructor(private readonly store: JsonStateStore<OpencodeTbotState>) { }

    async listBySessionId(sessionId: string): Promise<PendingPermissionApproval[]> {
        const state = await this.store.read();
        return Object.values(state.pendingPermissions).filter((approval) => approval.sessionId === sessionId);
    }

    async listByRequestId(requestId: string): Promise<PendingPermissionApproval[]> {
        const state = await this.store.read();

        return Object.values(state.pendingPermissions).filter((approval) => approval.requestId === requestId);
    }

    async set(approval: PendingPermissionApproval): Promise<void> {
        await this.store.update((state) => {
            state.pendingPermissions[buildApprovalKey(approval.requestId, approval.chatId)] = approval;
        });
    }
}
