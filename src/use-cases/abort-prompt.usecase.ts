import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike, OpenCodeSessionStatus } from "../services/opencode/opencode.client.js";

export interface AbortPromptResult {
    sessionId: string | null;
    status: "aborted" | "no_session" | "not_running";
    sessionStatus: OpenCodeSessionStatus | null;
}

export class AbortPromptUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
    ) { }

    async execute(input: { chatId: number }): Promise<AbortPromptResult> {
        const binding = await this.sessionRepo.getByChatId(input.chatId);

        if (!binding?.sessionId) {
            return {
                sessionId: null,
                status: "no_session",
                sessionStatus: null,
            };
        }

        const sessionId = binding.sessionId;
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
