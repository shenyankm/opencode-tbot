import { z } from "zod";

const TranscriptionResponseSchema = z.object({
    text: z.string(),
});

export interface SttTranscriptionInput {
    data: Uint8Array | ArrayBuffer;
    filename: string;
    language?: string | null;
    mimeType?: string | null;
}

export interface SttTranscriptionResult {
    text: string;
}

export interface SttClientLike {
    transcribe(input: SttTranscriptionInput): Promise<SttTranscriptionResult>;
}

export interface OpenAiCompatibleSttClientOptions {
    apiKey?: string | null;
    baseUrl: string;
    language?: string | null;
    model: string;
    prompt?: string | null;
    timeoutMs: number;
}

export class VoiceTranscriptionNotConfiguredError extends Error {
    readonly data: { message: string };

    constructor(message: string) {
        super(message);
        this.name = "VoiceTranscriptionNotConfiguredError";
        this.data = { message };
    }
}

export class VoiceTranscriptionFailedError extends Error {
    readonly data: { message: string };

    constructor(message: string) {
        super(message);
        this.name = "VoiceTranscriptionFailedError";
        this.data = { message };
    }
}

export class VoiceTranscriptEmptyError extends Error {
    readonly data: { message: string };

    constructor(message: string) {
        super(message);
        this.name = "VoiceTranscriptEmptyError";
        this.data = { message };
    }
}

export class DisabledSttClient implements SttClientLike {
    async transcribe(): Promise<SttTranscriptionResult> {
        throw new VoiceTranscriptionNotConfiguredError(
            "Set STT_BASE_URL and STT_MODEL to enable Telegram voice transcription.",
        );
    }
}

export class OpenAiCompatibleSttClient implements SttClientLike {
    private readonly apiKey: string | null;
    private readonly baseUrl: string;
    private readonly fetchFn: typeof fetch;
    private readonly language: string | null;
    private readonly model: string;
    private readonly prompt: string | null;
    private readonly timeoutMs: number;

    constructor(options: OpenAiCompatibleSttClientOptions, fetchFn: typeof fetch = fetch) {
        this.apiKey = options.apiKey?.trim() || null;
        this.baseUrl = options.baseUrl.endsWith("/")
            ? options.baseUrl
            : `${options.baseUrl}/`;
        this.fetchFn = fetchFn;
        this.language = options.language?.trim() || null;
        this.model = options.model;
        this.prompt = options.prompt?.trim() || null;
        this.timeoutMs = options.timeoutMs;
    }

    async transcribe(input: SttTranscriptionInput): Promise<SttTranscriptionResult> {
        const formData = new FormData();
        const fileBuffer = input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data);
        const fileData = new ArrayBuffer(fileBuffer.byteLength);
        const mimeType = input.mimeType?.trim() || "application/octet-stream";
        const language = input.language?.trim() || this.language;

        new Uint8Array(fileData).set(fileBuffer);
        formData.set("file", new File([fileData], input.filename, { type: mimeType }));
        formData.set("model", this.model);
        formData.set("response_format", "json");

        if (language) {
            formData.set("language", language);
        }

        if (this.prompt) {
            formData.set("prompt", this.prompt);
        }

        let response: Response;

        try {
            response = await this.fetchFn(
                new URL("audio/transcriptions", this.baseUrl),
                {
                    body: formData,
                    headers: buildHeaders(this.apiKey),
                    method: "POST",
                    signal: AbortSignal.timeout(this.timeoutMs),
                },
            );
        } catch (error) {
            throw new VoiceTranscriptionFailedError(
                extractErrorMessage(error) ?? "Failed to reach the STT service.",
            );
        }

        if (!response.ok) {
            throw new VoiceTranscriptionFailedError(await buildFailedResponseMessage(response));
        }

        const payload = await parseTranscriptionResponse(response);

        return {
            text: payload.text.trim(),
        };
    }
}

function buildHeaders(apiKey: string | null): HeadersInit {
    if (!apiKey) {
        return {
            Accept: "application/json",
        };
    }

    return {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
    };
}

async function parseTranscriptionResponse(response: Response): Promise<SttTranscriptionResult> {
    let payload: unknown;

    try {
        payload = await response.json();
    } catch {
        throw new VoiceTranscriptionFailedError("STT service returned invalid JSON.");
    }

    const parsed = TranscriptionResponseSchema.safeParse(payload);

    if (!parsed.success) {
        throw new VoiceTranscriptionFailedError("STT service returned an invalid transcription payload.");
    }

    return parsed.data;
}

async function buildFailedResponseMessage(response: Response): Promise<string> {
    const responseText = await safeReadResponseText(response);
    const normalizedText = responseText?.trim();

    return normalizedText
        ? `STT request failed with status ${response.status}: ${normalizedText}`
        : `STT request failed with status ${response.status}.`;
}

async function safeReadResponseText(response: Response): Promise<string | null> {
    try {
        const text = await response.text();

        return text.trim().length > 0 ? text : null;
    } catch {
        return null;
    }
}

function extractErrorMessage(error: unknown): string | null {
    return error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : null;
}
