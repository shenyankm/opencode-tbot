import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeAgent,
    OpenCodeClientLike,
} from "../services/opencode/opencode.client.js";

export interface ListAgentsResult {
    agents: OpenCodeAgent[];
    currentAgentName: string | null;
}

export class ListAgentsUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
    ) { }

    async execute(input: { chatId: number }): Promise<ListAgentsResult> {
        const [binding, agents] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.listAgents(),
        ]);

        return {
            agents: agents.filter((agent) => !agent.hidden),
            currentAgentName: binding?.agentName ?? null,
        };
    }
}
