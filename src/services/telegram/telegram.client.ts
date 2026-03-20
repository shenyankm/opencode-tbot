export interface DownloadTelegramFileInput {
    filePath: string;
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

        let response: Response;

        try {
            response = await this.fetchFn(new URL(filePath, this.baseUrl));
        } catch (error) {
            throw new TelegramFileDownloadError(extractErrorMessage(error) ?? "Failed to download the Telegram file.");
        }

        if (!response.ok) {
            throw new TelegramFileDownloadError(await buildDownloadFailureMessage(response));
        }

        const data = new Uint8Array(await response.arrayBuffer());

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

async function buildDownloadFailureMessage(response: Response): Promise<string> {
    const responseText = await safeReadResponseText(response);
    const normalizedText = responseText?.trim();

    return normalizedText
        ? `Telegram file download failed with status ${response.status}: ${normalizedText}`
        : `Telegram file download failed with status ${response.status}.`;
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
