import { request } from "undici";

export interface OpenCodeClientOptions {
    baseUrl: string;
    apiKey?: string;
}

export interface SendPromptInput {
    sessionId: string;
    prompt: string;
}

export interface SendPromptResult {
    text: string;
}

export class OpenCodeClient {
    constructor(private readonly options: OpenCodeClientOptions) { }

    async sendPrompt(input: SendPromptInput): Promise<SendPromptResult> {
        const url = new URL("/api/chat", this.options.baseUrl);

        const response = await request(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(this.options.apiKey
                    ? { authorization: `Bearer ${this.options.apiKey}` }
                    : {}),
            },
            body: JSON.stringify({
                sessionId: input.sessionId,
                prompt: input.prompt,
            }),
        });

        if (response.statusCode >= 400) {
            const body = await response.body.text();
            throw new Error(`OpenCode request failed: ${response.statusCode} ${body}`);
        }

        const data = (await response.body.json()) as { text?: string };

        return {
            text: data.text ?? "",
        };
    }
}