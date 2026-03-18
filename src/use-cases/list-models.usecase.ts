import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeClientLike,
    OpenCodeConfiguredModel,
} from "../services/opencode/opencode.client.js";

export interface ListModelsResult {
    models: OpenCodeConfiguredModel[];
    currentModelProviderId: string | null;
    currentModelId: string | null;
    currentModelVariant: string | null;
}

export class ListModelsUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
    ) { }

    async execute(input: { chatId: number }): Promise<ListModelsResult> {
        const [binding, models] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.listModels(),
        ]);

        return {
            models,
            currentModelProviderId: binding?.modelProviderId ?? null,
            currentModelId: binding?.modelId ?? null,
            currentModelVariant: binding?.modelVariant ?? null,
        };
    }
}
