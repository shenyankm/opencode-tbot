import type {
    OpenCodeClientLike,
    OpenCodeHealth,
} from "../services/opencode/opencode.client.js";

export class GetHealthUseCase {
    constructor(private readonly opencodeClient: OpenCodeClientLike) { }

    async execute(): Promise<OpenCodeHealth> {
        return this.opencodeClient.getHealth();
    }
}
