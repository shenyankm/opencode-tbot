import { z } from "zod";
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

const bindingSchema = z.object({
    chatId: z.number().int().safe(), sessionId: z.string().nullable(), projectId: z.string().nullable(),
    directory: z.string().nullable(), agentName: z.string().nullable(), modelProviderId: z.string().nullable(),
    modelId: z.string().nullable(), modelVariant: z.string().nullable(), language: z.string().nullable(),
    updatedAt: z.string(),
});
const identity = { chatId: z.number().int().safe(), sessionId: z.string(), updatedAt: z.string() };
const stateSchema = z.object({
    version: z.literal(1),
    sessions: z.record(bindingSchema),
    pendingActions: z.record(z.object({ ...identity, kind: z.literal("session_rename"),
        menuMessageId: z.number().int().positive(), returnPage: z.number().int().nonnegative() })),
    pendingPermissions: z.record(z.object({ ...identity, requestId: z.string(), messageId: z.number().int().positive(),
        status: z.enum(["pending", "once", "always", "reject"]) })),
}).strict();

export function parseOpencodeTbotState(value: unknown): OpencodeTbotState {
    const state = stateSchema.parse(value);
    for (const [key, binding] of Object.entries(state.sessions)) {
        if (key !== String(binding.chatId)) throw new Error("State session identity mismatch.");
    }
    return state;
}
