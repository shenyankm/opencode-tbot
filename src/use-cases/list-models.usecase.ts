import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeClientLike,
    OpenCodeConfiguredModel,
} from "../services/opencode/opencode.client.js";
import {
    clearStoredModelSelection,
    clearStoredModelVariant,
} from "./binding-update.js";

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
        let [binding, models] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.listModels(),
        ]);

        if (binding?.modelProviderId && binding?.modelId) {
            const selectedModel = models.find((model) =>
                model.providerID === binding?.modelProviderId && model.id === binding?.modelId,
            );

            if (!selectedModel) {
                binding = await clearStoredModelSelection(this.sessionRepo, binding);
            } else if (binding.modelVariant && !(binding.modelVariant in selectedModel.variants)) {
                binding = await clearStoredModelVariant(this.sessionRepo, binding);
            }
        }

        return {
            models,
            currentModelProviderId: binding?.modelProviderId ?? null,
            currentModelId: binding?.modelId ?? null,
            currentModelVariant: binding?.modelVariant ?? null,
        };
    }
}
