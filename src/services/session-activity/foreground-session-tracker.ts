import { createMessageAbortedError } from "../opencode/opencode.client.js";

export interface ForegroundSessionLease {
    readonly signal: AbortSignal;
    attachSession(sessionId: string): void;
    dispose(): void;
}

export interface ForegroundSessionTrackerLike {
    acquire(chatId: number): ForegroundSessionLease | null;
    abort(chatId: number, reason?: unknown): boolean;
    begin(chatId: number, sessionId: string): () => void;
    clear(sessionId: string): boolean;
    fail(sessionId: string, error: unknown): boolean;
    getActiveSessionId(chatId: number): string | null;
    hasActiveRequest(chatId: number): boolean;
    isForeground(sessionId: string): boolean;
    listChatIds(sessionId: string): number[];
}

interface ForegroundRequestState {
    chatId: number;
    controller: AbortController;
    sessionId: string | null;
}

export class ForegroundSessionTracker implements ForegroundSessionTrackerLike {
    private readonly requests = new Map<number, ForegroundRequestState>();
    private readonly sessionChats = new Map<string, Set<number>>();

    acquire(chatId: number): ForegroundSessionLease | null {
        if (this.requests.has(chatId)) {
            return null;
        }

        const state: ForegroundRequestState = {
            chatId,
            controller: new AbortController(),
            sessionId: null,
        };

        this.requests.set(chatId, state);

        return {
            signal: state.controller.signal,
            attachSession: (sessionId: string) => {
                this.attachSession(chatId, sessionId);
            },
            dispose: () => {
                this.release(chatId);
            },
        };
    }

    abort(chatId: number, reason: unknown = createMessageAbortedError()): boolean {
        const state = this.requests.get(chatId);

        if (!state) {
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
