import type { OpenCodeClientLike, OpenCodeConfig } from "../services/opencode/opencode.client.js";

export class GetConfigUseCase {
    constructor(private readonly opencodeClient: OpenCodeClientLike) { }

    async execute(): Promise<OpenCodeConfig> {
        return this.opencodeClient.getConfig();
    }
}
