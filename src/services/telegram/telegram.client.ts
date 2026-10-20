import { abortable } from "../../infra/utils/abort.js";

export const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export interface DownloadTelegramFileInput {
    filePath: string;
    signal?: AbortSignal;
}

export interface DownloadTelegramFileResult {
    data: Uint8Array;
    mimeType: string | null;
}

export interface TelegramFileClientLike {
    downloadFile(input: DownloadTelegramFileInput): Promise<DownloadTelegramFileResult>;
}

export interface TelegramFileClientOptions {
    baseUrl?: string;
    apiRoot?: string;
    botToken: string;
}

export class TelegramFileDownloadError extends Error {
    readonly data: { message: string };

    constructor(message: string) {
        super(message);
        this.name = "TelegramFileDownloadError";
        this.data = { message };
    }
}

export class TelegramFileClient implements TelegramFileClientLike {
    private readonly baseUrl: string;
    private readonly fetchFn: typeof fetch;

    constructor(options: TelegramFileClientOptions, fetchFn: typeof fetch = fetch) {
        this.baseUrl = options.baseUrl ?? buildTelegramFileApiRoot(options.apiRoot, options.botToken);
        this.fetchFn = fetchFn;
    }

    async downloadFile(input: DownloadTelegramFileInput): Promise<DownloadTelegramFileResult> {
        const filePath = input.filePath.trim();

        if (!filePath) {
            throw new TelegramFileDownloadError("Telegram did not provide a downloadable file path.");
        }

        const signal = AbortSignal.any([
            ...(input.signal ? [input.signal] : []),
            AbortSignal.timeout(30_000),
        ]);
        signal.throwIfAborted();
        const url = new URL(filePath, this.baseUrl);
        if (!url.href.startsWith(this.baseUrl) || filePath.startsWith("/") || filePath.includes("..")) {
            throw new TelegramFileDownloadError("Invalid Telegram file path.");
        }
        let data: Uint8Array;
        let response: Response;
        try {
            response = await abortable(this.fetchFn(url, { signal }), signal);
            const contentLength = Number(response.headers.get("content-length"));
            if (contentLength > TELEGRAM_MAX_DOWNLOAD_BYTES) {
                void response.body?.cancel().catch(() => undefined);
                throw new TelegramFileDownloadError("Telegram file exceeds the 20 MiB download limit.");
            }
            const reader = response.body?.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            if (reader) {
                try {
                    while (true) {
                        const part = await abortable(reader.read(), signal);
                        if (part.done) break;
                        size += part.value.byteLength;
                        if (size > TELEGRAM_MAX_DOWNLOAD_BYTES) {
                            throw new TelegramFileDownloadError("Telegram file exceeds the 20 MiB download limit.");
                        }
                        chunks.push(part.value);
                    }
                } finally {
                    void reader.cancel().catch(() => undefined);
                    reader.releaseLock();
                }
            }
            data = Buffer.concat(chunks, size);
        } catch (error) {
            signal.throwIfAborted();
            if (error instanceof TelegramFileDownloadError) throw error;
            throw new TelegramFileDownloadError(extractErrorMessage(error) ?? "Failed to download the Telegram file.");
        }
        if (!response.ok) {
            throw new TelegramFileDownloadError(`Telegram file download failed with status ${response.status}: ${Buffer.from(data).toString("utf8").slice(0, 512)}`);
        }
        if (data.byteLength === 0) {
            throw new TelegramFileDownloadError("Telegram returned an empty file.");
        }

        return {
            data,
            mimeType: response.headers.get("content-type"),
        };
    }
}

export function buildTelegramFileApiRoot(apiRoot: string | undefined, botToken: string): string {
    const normalizedApiRoot = (apiRoot ?? "https://api.telegram.org").trim().replace(/\/+$/u, "");

    return `${normalizedApiRoot}/file/bot${botToken}/`;
}

function extractErrorMessage(error: unknown): string | null {
    return error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : null;
}
