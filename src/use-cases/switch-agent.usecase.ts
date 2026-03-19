import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type {
    OpenCodeAgent,
    OpenCodeClientLike,
} from "../services/opencode/opencode.client.js";

export type SwitchAgentResult =
    | {
        found: false;
    }
    | {
        found: true;
        agent: OpenCodeAgent;
    };

export class SwitchAgentUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly logger: AppLogger,
    ) { }

    async execute(input: { chatId: number; agentName: string }): Promise<SwitchAgentResult> {
        const [binding, agents] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.listAgents(),
        ]);
        const agent = agents.find((item) => item.name === input.agentName && !item.hidden);

        if (!agent) {
            return { found: false };
        }

        await this.sessionRepo.setCurrent({
            chatId: input.chatId,
            sessionId: binding?.sessionId ?? null,
            projectId: binding?.projectId ?? null,
            directory: binding?.directory ?? null,
            agentName: agent.name,
            modelProviderId: binding?.modelProviderId ?? null,
            modelId: binding?.modelId ?? null,
            modelVariant: binding?.modelVariant ?? null,
            language: binding?.language ?? null,
            updatedAt: new Date().toISOString(),
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
