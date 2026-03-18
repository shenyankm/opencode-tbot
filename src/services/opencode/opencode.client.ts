import {
    createOpencodeClient,
    type OpencodeClient,
    type Part,
    type Project,
    type Session,
} from "@opencode-ai/sdk/client";

export interface OpenCodeClientOptions {
    baseUrl: string;
    apiKey?: string;
}

export interface PromptSessionInput {
    sessionId: string;
    prompt: string;
}

export interface PromptSessionResult {
    text: string;
}

export type OpenCodeProject = Project;
export type OpenCodeSession = Session;

type OpenCodeSdkClient = Pick<OpencodeClient, "project" | "session">;
type MaybeWrappedResponse<T> = T | { data: T };

const EMPTY_RESPONSE_TEXT = "OpenCode returned empty response.";

export interface OpenCodeClientLike {
    listProjects(): Promise<OpenCodeProject[]>;
    getCurrentProject(): Promise<OpenCodeProject>;
    createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession>;
    promptSession(input: PromptSessionInput): Promise<PromptSessionResult>;
}

export class OpenCodeClient implements OpenCodeClientLike {
    private readonly client: OpenCodeSdkClient;

    constructor(options: OpenCodeClientOptions, client?: OpenCodeSdkClient) {
        this.client = client ?? createOpencodeClient({
            baseUrl: options.baseUrl,
        });
    }

    async listProjects(): Promise<OpenCodeProject[]> {
        const response = await this.client.project.list({
            responseStyle: "data",
            throwOnError: true,
        }) as MaybeWrappedResponse<OpenCodeProject[]>;

        return unwrapSdkData(response);
    }

    async getCurrentProject(): Promise<OpenCodeProject> {
        const response = await this.client.project.current({
            responseStyle: "data",
            throwOnError: true,
        }) as MaybeWrappedResponse<OpenCodeProject>;

        return unwrapSdkData(response);
    }

    async createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession> {
        if (title) {
            const response = await this.client.session.create({
                query: { directory },
                body: { title },
                responseStyle: "data",
                throwOnError: true,
            }) as MaybeWrappedResponse<OpenCodeSession>;

            return unwrapSdkData(response);
        }

        const response = await this.client.session.create({
            query: { directory },
            responseStyle: "data",
            throwOnError: true,
        }) as MaybeWrappedResponse<OpenCodeSession>;

        return unwrapSdkData(response);
    }

    async promptSession(input: PromptSessionInput): Promise<PromptSessionResult> {
        const response = await this.client.session.prompt({
            path: { id: input.sessionId },
            body: {
                parts: [
                    {
                        type: "text",
                        text: input.prompt,
                    },
                ],
            },
            responseStyle: "data",
            throwOnError: true,
        }) as MaybeWrappedResponse<{ info: unknown; parts: Part[] }>;
        const data = unwrapSdkData(response);

        return {
            text: extractTextFromParts(data.parts) || EMPTY_RESPONSE_TEXT,
        };
    }
}

function extractTextFromParts(parts: Part[]): string {
    return parts
        .filter((part): part is Extract<Part, { type: "text"; text: string }> => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
}

function unwrapSdkData<T>(response: MaybeWrappedResponse<T>): T {
    if (response && typeof response === "object" && "data" in response) {
        return response.data;
    }

    return response;
}
