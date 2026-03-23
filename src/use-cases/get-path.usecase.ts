import type { OpenCodePath } from "../services/opencode/opencode.client.js";
import type { OpenCodePathReader } from "../services/opencode/opencode.ports.js";

export class GetPathUseCase {
    constructor(private readonly opencodeClient: OpenCodePathReader) { }

    async execute(): Promise<OpenCodePath> {
        return this.opencodeClient.getPath();
    }
}
