import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeClientLike,
    OpenCodeConfiguredModel,
} from "../services/opencode/opencode.client.js";

export type SwitchModelResult =
    | {
        found: false;
    }
    | {
        found: true;
        model: OpenCodeConfiguredModel;
        variant: string | null;
    };

export class SwitchModelUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly logger: Logger,
    ) { }

    async execute(input: {
        chatId: number;
        providerId: string;
        modelId: string;
        variant?: string | null;
    }): Promise<SwitchModelResult> {
        const [binding, models] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.listModels(),
        ]);
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

        await this.sessionRepo.setCurrent({
            chatId: input.chatId,
            sessionId: binding?.sessionId ?? null,
            projectId: binding?.projectId ?? null,
            directory: binding?.directory ?? null,
            agentName: binding?.agentName ?? null,
            modelProviderId: model.providerID,
            modelId: model.id,
            modelVariant: variant,
            language: binding?.language ?? null,
            updatedAt: new Date().toISOString(),
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
