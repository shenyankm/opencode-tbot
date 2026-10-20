import type { PromptSessionFilePartInput } from "../services/opencode/opencode.client.js";
import {
    TelegramFileDownloadError,
    type TelegramFileClientLike,
} from "../services/telegram/telegram.client.js";

export interface UploadFileInput {
    expectedType: "image";
    signal?: AbortSignal;
    filePath: string;
    filename?: string | null;
    mimeType?: string | null;
}

export class ImageFileDownloadError extends Error {
    readonly data: { message: string };

    constructor(message: string) {
        super(message);
        this.name = "ImageFileDownloadError";
        this.data = { message };
    }
}

export class ImageMessageUnsupportedError extends Error {
    readonly data: { message: string };

    constructor(message: string) {
        super(message);
        this.name = "ImageMessageUnsupportedError";
        this.data = { message };
    }
}

export class UploadFileUseCase {
    constructor(private readonly telegramFileClient: TelegramFileClientLike) { }

    async execute(input: UploadFileInput): Promise<PromptSessionFilePartInput> {
        if (input.expectedType !== "image") {
            throw new ImageMessageUnsupportedError("Only image uploads are supported.");
        }

        let download;

        try {
            download = await this.telegramFileClient.downloadFile({
                filePath: input.filePath,
                signal: input.signal,
            });
        } catch (error) {
            if (error instanceof TelegramFileDownloadError) {
                throw new ImageFileDownloadError(error.message);
            }

            throw error;
        }

        const mimeType = normalizeMimeType(input.mimeType ?? download.mimeType);

        if (!mimeType.startsWith("image/")) {
            throw new ImageMessageUnsupportedError(`Unsupported image MIME type: ${mimeType}`);
        }

        const filename = resolveFilename(input.filename, input.filePath, mimeType);

        return {
            filename,
            mime: mimeType,
            url: buildDataUrl(download.data, mimeType),
        };
    }
}

function buildDataUrl(data: Uint8Array, mimeType: string): string {
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function normalizeMimeType(value: string | null): string {
    const normalized = value?.trim().toLowerCase();

    return normalized && normalized.length > 0
        ? normalized
        : "application/octet-stream";
}

function resolveFilename(
    explicitFilename: string | null | undefined,
    filePath: string,
    mimeType: string,
): string {
    const preferredFilename = explicitFilename?.trim();

    if (preferredFilename) {
        return preferredFilename;
    }

    const filePathFilename = filePath.split("/").at(-1)?.trim();

    if (filePathFilename) {
        return filePathFilename;
    }

    return `telegram-upload${resolveExtension(mimeType)}`;
}

function resolveExtension(mimeType: string): string {
    switch (mimeType) {
        case "image/jpeg":
            return ".jpg";
        case "image/png":
            return ".png";
        case "image/webp":
            return ".webp";
        case "image/gif":
            return ".gif";
        default:
            return "";
    }
}
