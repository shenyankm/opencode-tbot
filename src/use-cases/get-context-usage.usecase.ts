import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike, OpenCodeContextUsage } from "../services/opencode/opencode.client.js";

export class GetContextUsageUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly client: Pick<OpenCodeClientLike, "getSessionContext">,
    ) { }

    async execute(input: { chatId: number; sessionId?: string }): Promise<OpenCodeContextUsage> {
        const binding = await this.sessionRepo.getByChatId(input.chatId);
        const sessionId = input.sessionId ?? binding?.sessionId;
        if (!sessionId) {
            return { capacity: null, used: null };
        }
        const hasSelectedModel = Boolean(binding?.modelProviderId && binding.modelId);
        const context = await this.client.getSessionContext(sessionId, binding?.modelProviderId && binding.modelId ? {
            providerID: binding.modelProviderId,
            id: binding.modelId,
        } : undefined);
        return context.session ? {
            ...context,
            session: {
                ...context.session,
                directory: context.session.directory ?? binding?.directory ?? null,
                variant: hasSelectedModel ? binding?.modelVariant ?? null : context.session.variant,
                agentName: binding?.agentName ?? context.session.agentName,
            },
        } : context;
    }
}
