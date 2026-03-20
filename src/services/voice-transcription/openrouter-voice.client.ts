import { basename, extname } from "node:path";
import {
    SystemFfmpegProbe,
    SystemFfmpegWavTranscoder,
    type AudioTranscoderLike,
    type FfmpegProbeLike,
    type FfmpegProbeResult,
    type VoiceTranscodingDependencyDetail,
    VoiceTranscodingDependencyError,
    VoiceTranscodingFailedError,
} from "./audio-transcoder.js";

export {
    SystemFfmpegProbe,
    SystemFfmpegWavTranscoder,
    VoiceTranscodingDependencyError,
    VoiceTranscodingFailedError,
};
export type {
    AudioTranscoderLike,
    FfmpegProbeLike,
    VoiceTranscodingDependencyDetail,
};

export interface VoiceTranscriptionInput {
    data: Uint8Array | ArrayBuffer;
    filename: string;
    mimeType?: string | null;
}

export interface VoiceTranscriptionResult {
    text: string;
}

export type VoiceRecognitionStatus =
    | {
        detail?: undefined;
        model: string | null;
        status: "configured";
    }
    | {
        detail: VoiceTranscodingDependencyDetail;
        model: string | null;
        status: "dependency_missing";
    }
    | {
        detail?: undefined;
        model: null;
        status: "not_configured";
    };

export interface VoiceTranscriptionClientLike {
    getStatus(): VoiceRecognitionStatus;
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

export type VoiceAudioFormat = "ogg" | "mp3" | "wav";

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
    getStatus(): VoiceRecognitionStatus {
        return {
            status: "not_configured",
            model: null,
        };
    }

    async transcribe(): Promise<VoiceTranscriptionResult> {
        throw new VoiceTranscriptionNotConfiguredError(
            "Set openrouter.apiKey in the global config (~/.config/opencode/opencode-tbot/config.json) to enable Telegram voice transcription.",
        );
    }
}

export class OpenRouterVoiceTranscriptionClient implements VoiceTranscriptionClientLike {
    private readonly audioTranscoder: AudioTranscoderLike;
    private readonly ffmpegProbeResult: FfmpegProbeResult;
    private readonly model: string;
    private readonly sdk: OpenRouterSdkLike;
    private readonly timeoutMs: number;
    private readonly transcriptionPrompt: string | null;

    constructor(
        options: OpenRouterVoiceTranscriptionClientOptions,
        sdk: OpenRouterSdkLike,
        audioTranscoder: AudioTranscoderLike = new SystemFfmpegWavTranscoder(),
        ffmpegProbe: FfmpegProbeLike = new SystemFfmpegProbe(),
    ) {
        this.audioTranscoder = audioTranscoder;
        this.ffmpegProbeResult = ffmpegProbe.probe();
        this.model = options.model;
        this.sdk = sdk;
        this.timeoutMs = options.timeoutMs;
        this.transcriptionPrompt = options.transcriptionPrompt?.trim() || null;
    }

    getStatus(): VoiceRecognitionStatus {
        if (this.ffmpegProbeResult.status === "dependency_missing") {
            return {
                status: "dependency_missing",
                model: this.model,
                detail: this.ffmpegProbeResult.detail,
            };
        }

        return {
            status: "configured",
            model: this.model,
        };
    }

    async transcribe(input: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult> {
        const sourceFormat = resolveAudioFormat(input.filename, input.mimeType);
        const preparedAudio = await prepareAudioForTranscription(
            input,
            sourceFormat,
            this.audioTranscoder,
            this.ffmpegProbeResult,
        );
        const audioData = toBase64(preparedAudio.data);
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
                                        format: preparedAudio.format,
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
                buildTranscriptionErrorMessage(error, {
                    format: preparedAudio.format,
                    model: this.model,
                }),
            );
        }

        return {
            text: extractTranscript(response),
        };
    }
}

async function prepareAudioForTranscription(
    input: VoiceTranscriptionInput,
    sourceFormat: VoiceAudioFormat,
    audioTranscoder: AudioTranscoderLike,
    ffmpegProbeResult: FfmpegProbeResult,
): Promise<{
    data: Uint8Array;
    format: "wav";
}> {
    if (sourceFormat === "wav") {
        return {
            data: toUint8Array(input.data),
            format: "wav",
        };
    }

    ensureTranscodingDependencyReady(ffmpegProbeResult);
    const transcoded = await audioTranscoder.transcode({
        data: input.data,
        filename: input.filename,
        sourceFormat,
        targetFormat: "wav",
    });

    return {
        data: transcoded.data,
        format: transcoded.format,
    };
}

const MIME_TYPE_FORMAT_MAP: Record<string, VoiceAudioFormat> = {
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/vnd.wave": "wav",
};

const FILE_EXTENSION_FORMAT_MAP: Record<string, VoiceAudioFormat> = {
    ".mp3": "mp3",
    ".oga": "ogg",
    ".ogg": "ogg",
    ".wav": "wav",
};

export function resolveAudioFormat(
    filename: string,
    mimeType?: string | null,
): VoiceAudioFormat {
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
    const bytes = toUint8Array(data);

    return Buffer.from(bytes).toString("base64");
}

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function ensureTranscodingDependencyReady(result: FfmpegProbeResult): void {
    if (result.status === "dependency_missing") {
        throw new VoiceTranscodingDependencyError(result.detail, result.message);
    }
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

interface VoiceTranscriptionErrorContext {
    format: string;
    model: string;
}

function isTextContentItem(value: unknown): value is { text: string; type: "text" } {
    return !!value
        && typeof value === "object"
        && "type" in value
        && (value as { type?: unknown }).type === "text"
        && "text" in value
        && typeof (value as { text?: unknown }).text === "string";
}

function buildTranscriptionErrorMessage(
    error: unknown,
    context: VoiceTranscriptionErrorContext,
): string {
    const parsedBody = parseJsonBody(extractStringField(error, "body"));
    const rawMessages = dedupeNonEmptyStrings([
        extractErrorMessage(error),
        extractErrorMessage(readField(error, "error")),
        extractErrorMessage(readField(error, "data")),
        extractErrorMessage(readField(readField(error, "data"), "error")),
        extractErrorMessage(parsedBody),
        extractErrorMessage(readField(parsedBody, "error")),
        extractMetadataRawMessage(error),
        extractMetadataRawMessage(parsedBody),
    ]);
    const messages = rawMessages.some((message) => !isGenericProviderMessage(message))
        ? rawMessages.filter((message) => !isGenericProviderMessage(message))
        : rawMessages;
    const providerName = extractProviderName(error) ?? extractProviderName(parsedBody);
    const statusCode = extractNumericField(error, "statusCode") ?? extractNumericField(parsedBody, "statusCode");
    const errorCode = extractErrorCode(error, parsedBody);

    return joinNonEmptyParts([
        ...messages,
        `model: ${context.model}`,
        `format: ${context.format}`,
        providerName ? `provider: ${providerName}` : null,
        statusCode !== null ? `status: ${statusCode}` : null,
        errorCode !== null ? `code: ${errorCode}` : null,
    ]) ?? "Failed to reach OpenRouter voice transcription.";
}

function extractErrorMessage(error: unknown): string | null {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }

    return extractStringField(error, "message");
}

function extractMetadataRawMessage(value: unknown): string | null {
    const metadata = readField(value, "metadata")
        ?? readField(readField(value, "error"), "metadata")
        ?? readField(readField(readField(value, "data"), "error"), "metadata");
    const raw = extractStringField(metadata, "raw");

    if (!raw) {
        return null;
    }

    return raw.length <= 280 ? raw : `${raw.slice(0, 277)}...`;
}

function extractProviderName(value: unknown): string | null {
    const candidates = [
        readField(value, "metadata"),
        readField(readField(value, "error"), "metadata"),
        readField(readField(readField(value, "data"), "error"), "metadata"),
    ];

    for (const candidate of candidates) {
        const providerName = extractStringField(candidate, "provider_name")
            ?? extractStringField(candidate, "providerName")
            ?? extractStringField(candidate, "provider");

        if (providerName) {
            return providerName;
        }
    }

    return null;
}

function extractErrorCode(...values: unknown[]): number | null {
    for (const value of values) {
        const candidates = [
            value,
            readField(value, "error"),
            readField(value, "data"),
            readField(readField(value, "data"), "error"),
        ];

        for (const candidate of candidates) {
            const code = extractNumericField(candidate, "code");

            if (code !== null) {
                return code;
            }
        }
    }

    return null;
}

function extractNumericField(value: unknown, fieldName: string): number | null {
    if (!value || typeof value !== "object" || !(fieldName in value)) {
        return null;
    }

    const fieldValue = (value as Record<string, unknown>)[fieldName];

    return typeof fieldValue === "number" && Number.isFinite(fieldValue)
        ? fieldValue
        : null;
}

function extractStringField(value: unknown, fieldName: string): string | null {
    if (!value || typeof value !== "object" || !(fieldName in value)) {
        return null;
    }

    const fieldValue = (value as Record<string, unknown>)[fieldName];

    return typeof fieldValue === "string" && fieldValue.trim().length > 0
        ? fieldValue.trim()
        : null;
}

function readField(value: unknown, fieldName: string): unknown {
    return value && typeof value === "object" && fieldName in value
        ? (value as Record<string, unknown>)[fieldName]
        : null;
}

function parseJsonBody(body: string | null): unknown {
    if (!body) {
        return null;
    }

    try {
        return JSON.parse(body);
    } catch {
        return null;
    }
}

function dedupeNonEmptyStrings(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const normalized = value?.trim();

        if (!normalized) {
            continue;
        }

        const key = normalized.toLowerCase();

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(normalized);
    }

    return result;
}

function joinNonEmptyParts(parts: Array<string | null | undefined>): string | null {
    const filtered = parts
        .map((part) => part?.trim())
        .filter((part): part is string => !!part);

    return filtered.length > 0 ? filtered.join(" | ") : null;
}

function isGenericProviderMessage(message: string): boolean {
    const normalized = message.trim().toLowerCase();

    return normalized === "provider returned error"
        || normalized === "failed to reach openrouter voice transcription.";
}
