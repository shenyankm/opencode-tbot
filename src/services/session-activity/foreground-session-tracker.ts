export interface ForegroundSessionTrackerLike {
    begin(sessionId: string): () => void;
    clear(sessionId: string): boolean;
    isForeground(sessionId: string): boolean;
}

export class ForegroundSessionTracker implements ForegroundSessionTrackerLike {
    private readonly counts = new Map<string, number>();

    begin(sessionId: string): () => void {
        const currentCount = this.counts.get(sessionId) ?? 0;

        this.counts.set(sessionId, currentCount + 1);

        return () => {
            this.decrement(sessionId);
        };
    }

    clear(sessionId: string): boolean {
        const wasForeground = this.counts.has(sessionId);

        this.counts.delete(sessionId);

        return wasForeground;
    }

    isForeground(sessionId: string): boolean {
        return this.counts.has(sessionId);
    }

    private decrement(sessionId: string) {
        const currentCount = this.counts.get(sessionId);

        if (!currentCount || currentCount <= 1) {
            this.counts.delete(sessionId);
            return;
        }

        this.counts.set(sessionId, currentCount - 1);
    }
}

export const NOOP_FOREGROUND_SESSION_TRACKER: ForegroundSessionTrackerLike = {
    begin() {
        return () => undefined;
    },
    clear() {
        return false;
    },
    isForeground() {
        return false;
    },
};
