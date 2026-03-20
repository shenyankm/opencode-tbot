import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeAgent,
    OpenCodeClientLike,
} from "../services/opencode/opencode.client.js";
import { getSelectableAgents, resolveSelectedAgent } from "./agent-selection.js";
import { clearStoredAgentSelection } from "./binding-update.js";

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
        let [binding, agents] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.listAgents(),
        ]);
        const visibleAgents = getSelectableAgents(agents);
        const currentAgent = resolveSelectedAgent(visibleAgents, binding?.agentName);

        if (binding?.agentName && currentAgent?.name !== binding.agentName) {
            binding = await clearStoredAgentSelection(this.sessionRepo, binding);
        }

        return {
            agents: visibleAgents,
            currentAgentName: currentAgent?.name ?? null,
        };
    }
}
