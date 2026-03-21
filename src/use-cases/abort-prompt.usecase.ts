import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike, OpenCodeSessionStatus } from "../services/opencode/opencode.client.js";
import {
    NOOP_FOREGROUND_SESSION_TRACKER,
    type ForegroundSessionTrackerLike,
} from "../services/session-activity/foreground-session-tracker.js";

export interface AbortPromptResult {
    sessionId: string | null;
    status: "aborted" | "no_session" | "not_running";
    sessionStatus: OpenCodeSessionStatus | null;
}

export class AbortPromptUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly foregroundSessionTracker: ForegroundSessionTrackerLike = NOOP_FOREGROUND_SESSION_TRACKER,
    ) { }

    async execute(input: { chatId: number }): Promise<AbortPromptResult> {
        const activeSessionId = this.foregroundSessionTracker.getActiveSessionId(input.chatId);
        const binding = activeSessionId
            ? null
            : await this.sessionRepo.getByChatId(input.chatId);

        const sessionId = activeSessionId ?? binding?.sessionId ?? null;

        if (!sessionId) {
            return {
                sessionId: null,
                status: "no_session",
                sessionStatus: null,
            };
        }

        const sessionStatus = (await this.opencodeClient.getSessionStatuses())[sessionId] ?? null;

        if (!sessionStatus || sessionStatus.type === "idle") {
            return {
                sessionId,
                status: "not_running",
                sessionStatus,
            };
        }

        const aborted = await this.opencodeClient.abortSession(sessionId);

        return {
            sessionId,
            status: aborted ? "aborted" : "not_running",
            sessionStatus,
        };
    }
}
