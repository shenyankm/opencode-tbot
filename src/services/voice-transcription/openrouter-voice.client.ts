import { basename, extname } from "node:path";

export interface VoiceTranscriptionInput {
    data: Uint8Array | ArrayBuffer;
    filename: string;
    mimeType?: string | null;
}

export interface VoiceTranscriptionResult {
    text: string;
}

export interface VoiceTranscriptionClientLike {
    transcribe(input: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult>;
}

export interface OpenRouterRequestOptionsLike {
    timeoutMs?: number;
}

export interface OpenRouterChatResponseLike {
    choices?: Array<{
        message?: {
            content?: unknown;
        };
    }>;
}

export interface OpenRouterSdkLike {
    chat: {
        send(
            request: {
                chatGenerationParams: {
                    messages: Array<{
                        role: "user";
                        content: Array<
                            | { text: string; type: "text" }
                            | {
                                inputAudio: {
                                    data: string;
                                    format: string;
                                };
                                type: "input_audio";
                            }
                        >;
                    }>;
                    model: string;
                    stream: false;
                    temperature: number;
                };
            },
            options?: OpenRouterRequestOptionsLike,
        ): Promise<OpenRouterChatResponseLike>;
    };
}

export interface OpenRouterVoiceTranscriptionClientOptions {
    model: string;
    timeoutMs: number;
    transcriptionPrompt?: string | null;
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

export class DisabledVoiceTranscriptionClient implements VoiceTranscriptionClientLike {
    async transcribe(): Promise<VoiceTranscriptionResult> {
        throw new VoiceTranscriptionNotConfiguredError(
            "Set openrouter.apiKey in tbot.config.json to enable Telegram voice transcription.",
        );
    }
}

export class OpenRouterVoiceTranscriptionClient implements VoiceTranscriptionClientLike {
    private readonly model: string;
    private readonly sdk: OpenRouterSdkLike;
    private readonly timeoutMs: number;
    private readonly transcriptionPrompt: string | null;

    constructor(
        options: OpenRouterVoiceTranscriptionClientOptions,
        sdk: OpenRouterSdkLike,
    ) {
        this.model = options.model;
        this.sdk = sdk;
        this.timeoutMs = options.timeoutMs;
        this.transcriptionPrompt = options.transcriptionPrompt?.trim() || null;
    }

    async transcribe(input: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult> {
        const format = resolveAudioFormat(input.filename, input.mimeType);
        const audioData = toBase64(input.data);
        const prompt = buildTranscriptionPrompt(this.transcriptionPrompt);

        let response: OpenRouterChatResponseLike;

        try {
            response = await this.sdk.chat.send(
                {
                    chatGenerationParams: {
                        messages: [{
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: prompt,
                                },
                                {
                                    type: "input_audio",
                                    inputAudio: {
                                        data: audioData,
                                        format,
                                    },
                                },
                            ],
                        }],
                        model: this.model,
                        stream: false,
                        temperature: 0,
                    },
                },
                {
                    timeoutMs: this.timeoutMs,
                },
            );
        } catch (error) {
            throw new VoiceTranscriptionFailedError(
                extractErrorMessage(error) ?? "Failed to reach OpenRouter voice transcription.",
            );
        }

        return {
            text: extractTranscript(response),
        };
    }
}

const MIME_TYPE_FORMAT_MAP: Record<string, string> = {
    "audio/aac": "aac",
    "audio/aiff": "aiff",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-aac": "aac",
    "audio/x-aiff": "aiff",
    "audio/x-flac": "flac",
    "audio/x-m4a": "m4a",
    "audio/x-wav": "wav",
    "audio/vnd.wave": "wav",
};

const FILE_EXTENSION_FORMAT_MAP: Record<string, string> = {
    ".aac": "aac",
    ".aif": "aiff",
    ".aiff": "aiff",
    ".flac": "flac",
    ".m4a": "m4a",
    ".mp3": "mp3",
    ".oga": "ogg",
    ".ogg": "ogg",
    ".wav": "wav",
};

export function resolveAudioFormat(
    filename: string,
    mimeType?: string | null,
): string {
    const normalizedMimeType = mimeType?.trim().toLowerCase() || null;

    if (normalizedMimeType && MIME_TYPE_FORMAT_MAP[normalizedMimeType]) {
        return MIME_TYPE_FORMAT_MAP[normalizedMimeType];
    }

    const extension = extname(basename(filename).trim()).toLowerCase();

    if (extension && FILE_EXTENSION_FORMAT_MAP[extension]) {
        return FILE_EXTENSION_FORMAT_MAP[extension];
    }

    return "ogg";
}

function toBase64(data: Uint8Array | ArrayBuffer): string {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    return Buffer.from(bytes).toString("base64");
}

function buildTranscriptionPrompt(transcriptionPrompt: string | null): string {
    const basePrompt = [
        "Transcribe the provided audio verbatim.",
        "Return only the transcript text.",
        "Do not translate, summarize, explain, or add speaker labels.",
        "If the audio is empty or unintelligible, return an empty string.",
    ].join(" ");

    return transcriptionPrompt
        ? `${basePrompt}\n\nAdditional instructions: ${transcriptionPrompt}`
        : basePrompt;
}

function extractTranscript(response: OpenRouterChatResponseLike): string {
    const content = response.choices?.[0]?.message?.content;

    if (typeof content === "string") {
        return content.trim();
    }

    if (!Array.isArray(content)) {
        return "";
    }

    return content
        .flatMap((item) =>
            isTextContentItem(item)
                ? [item.text.trim()]
                : [],
        )
        .filter((text) => text.length > 0)
        .join("\n")
        .trim();
}

function isTextContentItem(value: unknown): value is { text: string; type: "text" } {
    return !!value
        && typeof value === "object"
        && "type" in value
        && (value as { type?: unknown }).type === "text"
        && "text" in value
        && typeof (value as { text?: unknown }).text === "string";
}

function extractErrorMessage(error: unknown): string | null {
    return error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : null;
}
