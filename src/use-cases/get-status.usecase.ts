import type {
    OpenCodeHealth,
    OpenCodePath,
} from "../services/opencode/opencode.client.js";
import type { GetHealthUseCase } from "./get-health.usecase.js";
import type { GetPathUseCase } from "./get-path.usecase.js";
import type { ListLspResult, ListLspUseCase } from "./list-lsp.usecase.js";
import type { ListMcpResult, ListMcpUseCase } from "./list-mcp.usecase.js";

export interface StatusSectionOk<TData> {
    data: TData;
    status: "ok";
}

export interface StatusSectionError {
    error: unknown;
    status: "error";
}

export type StatusSectionResult<TData> = StatusSectionOk<TData> | StatusSectionError;

export interface GetStatusResult {
    health: StatusSectionResult<OpenCodeHealth>;
    lsp: StatusSectionResult<ListLspResult>;
    mcp: StatusSectionResult<ListMcpResult>;
    path: StatusSectionResult<OpenCodePath>;
}

export class GetStatusUseCase {
    constructor(
        private readonly getHealthUseCase: GetHealthUseCase,
        private readonly getPathUseCase: GetPathUseCase,
        private readonly listLspUseCase: ListLspUseCase,
        private readonly listMcpUseCase: ListMcpUseCase,
    ) { }

    async execute(input: { chatId: number }): Promise<GetStatusResult> {
        const [health, path, lsp, mcp] = await Promise.allSettled([
            this.getHealthUseCase.execute(),
            this.getPathUseCase.execute(),
            this.listLspUseCase.execute({ chatId: input.chatId }),
            this.listMcpUseCase.execute({ chatId: input.chatId }),
        ]);

        return {
            health: mapSettledResult(health),
            path: mapSettledResult(path),
            lsp: mapSettledResult(lsp),
            mcp: mapSettledResult(mcp),
        };
    }
}

function mapSettledResult<TData>(result: PromiseSettledResult<TData>): StatusSectionResult<TData> {
    if (result.status === "fulfilled") {
        return {
            data: result.value,
            status: "ok",
        };
    }

    return {
        error: result.reason,
        status: "error",
    };
}
