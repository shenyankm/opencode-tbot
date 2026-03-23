import type { Bot } from "grammy";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import type {
    BotDependencies,
    ForegroundPromptDependencies,
    PendingActionDependencies,
    UploadFeatureDependencies,
} from "../types.js";
import { executePromptRequest, type PromptExecutionContext } from "./prompt.handler.js";
import { replyIfSessionRenamePending } from "../session-rename.js";
import { ImageMessageUnsupportedError } from "../../use-cases/upload-file.usecase.js";

const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

interface TelegramPhotoSize {
    file_id: string;
    file_size?: number;
}

interface TelegramDocument {
    file_id: string;
    file_name?: string;
    file_size?: number;
    mime_type?: string;
}

interface FileContext extends PromptExecutionContext {
    getFile(): Promise<{ file_path?: string }>;
    message: {
        caption?: string;
        document?: TelegramDocument;
        photo?: TelegramPhotoSize[];
    };
}

type FileHandlerDependencies =
    & ForegroundPromptDependencies
    & PendingActionDependencies
    & UploadFeatureDependencies;

export async function handleImageMessage(ctx: FileContext, dependencies: FileHandlerDependencies) {
    const image = resolveTelegramImage(ctx.message);

    if (!image) {
        return;
    }

    if (await replyIfSessionRenamePending(ctx, dependencies)) {
        return;
    }

    await executePromptRequest(ctx, dependencies, async () => {
        if (typeof image.fileSize === "number" && image.fileSize > TELEGRAM_MAX_DOWNLOAD_BYTES) {
            throw new ImageMessageUnsupportedError(
                `Image file size ${image.fileSize} exceeds the Telegram download limit of ${TELEGRAM_MAX_DOWNLOAD_BYTES} bytes.`,
            );
        }

        const file = await ctx.getFile();
        const filePath = file.file_path?.trim();

        if (!filePath) {
            throw new ImageMessageUnsupportedError("Telegram did not provide a downloadable image file path.");
        }

        const promptFile = await dependencies.uploadFileUseCase.execute({
            expectedType: "image",
            filePath,
            filename: image.filename,
            mimeType: image.mimeType,
        });

        return {
            files: [promptFile],
            text: ctx.message.caption?.trim() || null,
        };
    });
}

export function registerFileHandler(bot: Pick<Bot, "on">, dependencies: BotDependencies) {
    bot.on("message:photo", async (ctx) => {
        await handleImageMessage(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });

    bot.on("message:document", async (ctx) => {
        await handleImageMessage(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}

function resolveTelegramImage(message: FileContext["message"]) {
    const document = message.document;

    if (document && isImageDocument(document)) {
        return {
            fileId: document.file_id,
            fileSize: document.file_size,
            filename: document.file_name ?? null,
            mimeType: document.mime_type ?? null,
        };
    }

    const photo = pickLargestPhoto(message.photo);

    if (!photo) {
        return null;
    }

    return {
        fileId: photo.file_id,
        fileSize: photo.file_size,
        filename: null,
        mimeType: "image/jpeg",
    };
}

function isImageDocument(document: TelegramDocument): boolean {
    const mimeType = document.mime_type?.trim().toLowerCase();
    const filename = document.file_name?.trim().toLowerCase() ?? "";

    return !!mimeType?.startsWith("image/")
        || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename);
}

function pickLargestPhoto(photos: TelegramPhotoSize[] | undefined): TelegramPhotoSize | null {
    if (!photos || photos.length === 0) {
        return null;
    }

    return photos.reduce<TelegramPhotoSize>((largest, current) => {
        const currentSize = current.file_size ?? 0;
        const largestSize = largest.file_size ?? 0;

        return currentSize >= largestSize ? current : largest;
    }, photos[0]);
}
