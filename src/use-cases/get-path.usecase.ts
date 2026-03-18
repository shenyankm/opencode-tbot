import type { OpenCodeClientLike, OpenCodePath } from "../services/opencode/opencode.client.js";

export class GetPathUseCase {
    constructor(private readonly opencodeClient: OpenCodeClientLike) { }

    async execute(): Promise<OpenCodePath> {
        return this.opencodeClient.getPath();
    }
}
