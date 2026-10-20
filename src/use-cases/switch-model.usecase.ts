import { beginBindingSelection, emptyBinding } from "./binding-update.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type {
    OpenCodeConfiguredModel,
} from "../services/opencode/opencode.client.js";
import type { OpenCodeModelCatalog } from "../services/opencode/opencode.ports.js";

export type SwitchModelResult =
    | {
        found: false;
    }
    | {
        found: true;
        model: OpenCodeConfiguredModel;
        variant: string | null;
    };

export interface SwitchModelInput {
    chatId: number;
    modelId: string;
    providerId: string;
    variant?: string | null;
}

export class SwitchModelUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeModelCatalog,
        private readonly logger: AppLogger,
    ) { }

    async execute(input: SwitchModelInput): Promise<SwitchModelResult> {
        const assertCurrent = beginBindingSelection(this.sessionRepo, input.chatId, "model");
        const models = await this.opencodeClient.listModels();
        const model = models.find((item) =>
            item.providerID === input.providerId && item.id === input.modelId,
        );

        if (!model) {
            return { found: false };
        }

        const variant = input.variant ?? null;

        if (variant && !(variant in model.variants)) {
            return { found: false };
        }

        await this.sessionRepo.update(input.chatId, (current) => {
            assertCurrent();
            return {
                ...(current ?? emptyBinding(input.chatId)),
                modelProviderId: model.providerID,
                modelId: model.id,
                modelVariant: variant,
                updatedAt: new Date().toISOString(),
            };
        });

        this.logger.info(
            {
                chatId: input.chatId,
                providerId: model.providerID,
                modelId: model.id,
                variant,
            },
            "model switched",
        );

        return {
            found: true,
            model,
            variant,
        };
    }
}
