import type {
    OpenCodeHealth,
} from "../services/opencode/opencode.client.js";
import type { OpenCodeHealthReader } from "../services/opencode/opencode.ports.js";

export class GetHealthUseCase {
    constructor(private readonly opencodeClient: OpenCodeHealthReader) { }

    async execute(): Promise<OpenCodeHealth> {
        return this.opencodeClient.getHealth();
    }
}
