export interface ForegroundSessionTrackerLike {
    begin(chatId: number, sessionId: string): () => void;
    clear(sessionId: string): boolean;
    getActiveSessionId(chatId: number): string | null;
    isForeground(sessionId: string): boolean;
    listChatIds(sessionId: string): number[];
}

export class ForegroundSessionTracker implements ForegroundSessionTrackerLike {
    private readonly chatStacks = new Map<number, string[]>();
    private readonly counts = new Map<string, number>();
    private readonly sessionChats = new Map<string, Map<number, number>>();

    begin(chatId: number, sessionId: string): () => void {
        const currentCount = this.counts.get(sessionId) ?? 0;

        this.counts.set(sessionId, currentCount + 1);
        this.incrementChat(chatId, sessionId);

        return () => {
            this.decrement(chatId, sessionId);
        };
    }

    clear(sessionId: string): boolean {
        const wasForeground = this.counts.has(sessionId);
        const chatCounts = this.sessionChats.get(sessionId);

        this.counts.delete(sessionId);
        this.sessionChats.delete(sessionId);

        for (const chatId of chatCounts?.keys() ?? []) {
            const stack = this.chatStacks.get(chatId);

            if (!stack) {
                continue;
            }

            const nextStack = stack.filter((trackedSessionId) => trackedSessionId !== sessionId);

            if (nextStack.length === 0) {
                this.chatStacks.delete(chatId);
                continue;
            }

            this.chatStacks.set(chatId, nextStack);
        }

        return wasForeground;
    }

    getActiveSessionId(chatId: number): string | null {
        const stack = this.chatStacks.get(chatId);

        return stack?.at(-1) ?? null;
    }

    isForeground(sessionId: string): boolean {
        return this.counts.has(sessionId);
    }

    listChatIds(sessionId: string): number[] {
        return [...(this.sessionChats.get(sessionId)?.keys() ?? [])];
    }

    private decrement(chatId: number, sessionId: string) {
        const currentCount = this.counts.get(sessionId);

        if (!currentCount || currentCount <= 1) {
            this.counts.delete(sessionId);
        } else {
            this.counts.set(sessionId, currentCount - 1);
        }

        this.decrementChat(chatId, sessionId);
    }

    private incrementChat(chatId: number, sessionId: string) {
        const stack = this.chatStacks.get(chatId) ?? [];

        stack.push(sessionId);
        this.chatStacks.set(chatId, stack);

        const chatCounts = this.sessionChats.get(sessionId) ?? new Map<number, number>();
        const currentCount = chatCounts.get(chatId) ?? 0;

        chatCounts.set(chatId, currentCount + 1);
        this.sessionChats.set(sessionId, chatCounts);
    }

    private decrementChat(chatId: number, sessionId: string) {
        const stack = this.chatStacks.get(chatId);

        if (stack) {
            const index = stack.lastIndexOf(sessionId);

            if (index >= 0) {
                stack.splice(index, 1);
            }

            if (stack.length === 0) {
                this.chatStacks.delete(chatId);
            } else {
                this.chatStacks.set(chatId, stack);
            }
        }

        const chatCounts = this.sessionChats.get(sessionId);

        if (!chatCounts) {
            return;
        }

        const currentCount = chatCounts.get(chatId) ?? 0;

        if (currentCount <= 1) {
            chatCounts.delete(chatId);
        } else {
            chatCounts.set(chatId, currentCount - 1);
        }

        if (chatCounts.size === 0) {
            this.sessionChats.delete(sessionId);
        } else {
            this.sessionChats.set(sessionId, chatCounts);
        }
    }
}

export const NOOP_FOREGROUND_SESSION_TRACKER: ForegroundSessionTrackerLike = {
    begin() {
        return () => undefined;
    },
    clear() {
        return false;
    },
    getActiveSessionId() {
        return null;
    },
    isForeground() {
        return false;
    },
    listChatIds() {
        return [];
    },
};
