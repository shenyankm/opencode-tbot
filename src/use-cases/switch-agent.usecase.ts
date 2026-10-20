import { beginBindingSelection, emptyBinding } from "./binding-update.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type {
    OpenCodeAgent,
} from "../services/opencode/opencode.client.js";
import type { OpenCodeAgentCatalog } from "../services/opencode/opencode.ports.js";
import { isSelectableAgent } from "./agent-selection.js";

export type SwitchAgentResult =
    | {
        found: false;
    }
    | {
        found: true;
        agent: OpenCodeAgent;
    };

export interface SwitchAgentInput {
    agentName: string;
    chatId: number;
}

export class SwitchAgentUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeAgentCatalog,
        private readonly logger: AppLogger,
    ) { }

    async execute(input: SwitchAgentInput): Promise<SwitchAgentResult> {
        const assertCurrent = beginBindingSelection(this.sessionRepo, input.chatId, "agent");
        const agents = await this.opencodeClient.listAgents();
        const agent = agents.find((item) => item.name === input.agentName && isSelectableAgent(item));

        if (!agent) {
            return { found: false };
        }

        await this.sessionRepo.update(input.chatId, (current) => {
            assertCurrent();
            return {
                ...(current ?? emptyBinding(input.chatId)),
                agentName: agent.name,
                updatedAt: new Date().toISOString(),
            };
        });

        this.logger.info(
            {
                chatId: input.chatId,
                agentName: agent.name,
            },
            "agent switched",
        );

        return {
            found: true,
            agent,
        };
    }
}
