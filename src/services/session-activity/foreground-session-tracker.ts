import { randomUUID } from "node:crypto";
import { createMessageAbortedError } from "../opencode/opencode.client.js";

export interface ForegroundSessionLease {
    readonly signal: AbortSignal;
    readonly id: string;
    attachInput(messageId: string): void;
    attachSession(sessionId: string): void;
    dispose(): void;
}

export interface ForegroundSessionTrackerLike {
    acquire(chatId: number, onProgress?: (event: PromptProgressEvent) => void): ForegroundSessionLease | null;
    publish(event: { type: string; data?: unknown }): void;
    getRequestId(chatId: number): string | null;
    abort(chatId: number, reason?: unknown, requestId?: string): boolean;
    begin(chatId: number, sessionId: string): () => void;
    clear(sessionId: string): boolean;
    fail(sessionId: string, error: unknown): boolean;
    getActiveSessionId(chatId: number): string | null;
    hasActiveRequest(chatId: number): boolean;
    isForeground(sessionId: string): boolean;
    listChatIds(sessionId: string): number[];
}

export interface PromptProgressEvent {
    type: string;
    data: Record<string, unknown>;
}

interface ForegroundRequestState {
    id: string;
    inputId: string | null;
    delivered: boolean;
    compacting: boolean;
    assistantIds: Set<string>;
    onProgress?: (event: PromptProgressEvent) => void;
    chatId: number;
    controller: AbortController;
    sessionId: string | null;
}

export class ForegroundSessionTracker implements ForegroundSessionTrackerLike {
    private readonly requests = new Map<number, ForegroundRequestState>();
    private readonly sessionChats = new Map<string, Set<number>>();

    acquire(chatId: number, onProgress?: (event: PromptProgressEvent) => void): ForegroundSessionLease | null {
        if (this.requests.has(chatId)) {
            return null;
        }

        const state: ForegroundRequestState = {
            id: randomUUID(),
            inputId: null,
            delivered: false,
            compacting: false,
            assistantIds: new Set(),
            onProgress,
            chatId,
            controller: new AbortController(),
            sessionId: null,
        };

        this.requests.set(chatId, state);

        return {
            signal: state.controller.signal,
            id: state.id,
            attachInput: (messageId: string) => { state.inputId = messageId; },
            attachSession: (sessionId: string) => {
                this.attachSession(chatId, sessionId);
            },
            dispose: () => {
                if (this.requests.get(chatId) === state) {
                    this.release(chatId);
                }
            },
        };
    }

    getRequestId(chatId: number): string | null {
        return this.requests.get(chatId)?.id ?? null;
    }

    publish(event: { type: string; data?: unknown }): void {
        if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) {
            return;
        }
        const data = event.data as Record<string, unknown>;
        if (typeof data.sessionID !== "string") {
            return;
        }
        for (const chatId of this.listChatIds(data.sessionID)) {
            const state = this.requests.get(chatId);
            if (!state || state.controller.signal.aborted) {
                continue;
            }
            if (event.type === "session.inbox.delivered") {
                state.delivered = data.inboxID === state.inputId;
                continue;
            }
            if (event.type === "session.compaction.started") {
                // Compression affects the shared session and may run before input delivery.
                state.compacting = true;
                state.onProgress?.({ type: event.type, data });
                continue;
            }
            if (event.type === "session.compaction.ended" || event.type === "session.compaction.failed") {
                if (state.compacting) {
                    state.compacting = false;
                    state.onProgress?.({ type: event.type, data });
                }
                continue;
            }
            if (!state.delivered) {
                continue;
            }
            if (event.type === "session.step.started" && typeof data.assistantMessageID === "string") {
                state.assistantIds.add(data.assistantMessageID);
            }
            if (typeof data.assistantMessageID === "string" && state.assistantIds.has(data.assistantMessageID)) {
                state.onProgress?.({ type: event.type, data });
            }
        }
    }

    abort(chatId: number, reason: unknown = createMessageAbortedError(), requestId?: string): boolean {
        const state = this.requests.get(chatId);

        if (!state || (requestId && state.id !== requestId)) {
            return false;
        }

        if (!state.controller.signal.aborted) {
            state.controller.abort(reason);
        }

        return true;
    }

    begin(chatId: number, sessionId: string): () => void {
        const lease = this.acquire(chatId);

        if (!lease) {
            return () => undefined;
        }

        lease.attachSession(sessionId);
        return () => {
            lease.dispose();
        };
    }

    clear(sessionId: string): boolean {
        const chatIds = this.listChatIds(sessionId);

        if (chatIds.length === 0) {
            return false;
        }

        for (const chatId of chatIds) {
            const state = this.requests.get(chatId);

            if (state?.sessionId === sessionId) {
                state.sessionId = null;
            }
        }

        this.sessionChats.delete(sessionId);
        return true;
    }

    fail(sessionId: string, error: unknown): boolean {
        const chatIds = this.listChatIds(sessionId);

        if (chatIds.length === 0) {
            return false;
        }

        this.clear(sessionId);

        for (const chatId of chatIds) {
            this.abort(chatId, error);
        }

        return true;
    }

    getActiveSessionId(chatId: number): string | null {
        return this.requests.get(chatId)?.sessionId ?? null;
    }

    hasActiveRequest(chatId: number): boolean {
        return this.requests.has(chatId);
    }

    isForeground(sessionId: string): boolean {
        return this.sessionChats.has(sessionId);
    }

    listChatIds(sessionId: string): number[] {
        return [...(this.sessionChats.get(sessionId) ?? new Set<number>())];
    }

    private attachSession(chatId: number, sessionId: string): void {
        const normalizedSessionId = sessionId.trim();
        const state = this.requests.get(chatId);

        if (!state || normalizedSessionId.length === 0) {
            return;
        }

        if (state.sessionId === normalizedSessionId) {
            return;
        }

        if (state.sessionId) {
            this.detachChatFromSession(chatId, state.sessionId);
        }

        state.sessionId = normalizedSessionId;

        const chatIds = this.sessionChats.get(normalizedSessionId) ?? new Set<number>();

        chatIds.add(chatId);
        this.sessionChats.set(normalizedSessionId, chatIds);
    }

    private release(chatId: number): void {
        const state = this.requests.get(chatId);

        if (!state) {
            return;
        }

        if (state.sessionId) {
            this.detachChatFromSession(chatId, state.sessionId);
        }

        this.requests.delete(chatId);
    }

    private detachChatFromSession(chatId: number, sessionId: string): void {
        const chatIds = this.sessionChats.get(sessionId);

        if (!chatIds) {
            return;
        }

        chatIds.delete(chatId);

        if (chatIds.size === 0) {
            this.sessionChats.delete(sessionId);
            return;
        }

        this.sessionChats.set(sessionId, chatIds);
    }
}

export const NOOP_FOREGROUND_SESSION_TRACKER: ForegroundSessionTrackerLike = {
    acquire() {
        return null;
    },
    publish() {},
    getRequestId() { return null; },
    abort() {
        return false;
    },
    begin() {
        return () => undefined;
    },
    clear() {
        return false;
    },
    fail() {
        return false;
    },
    getActiveSessionId() {
        return null;
    },
    hasActiveRequest() {
        return false;
    },
    isForeground() {
        return false;
    },
    listChatIds() {
        return [];
    },
};
