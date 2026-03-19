import type { Bot } from "grammy";
import type { BotDependencies } from "../types.js";
import { VoiceMessageUnsupportedError } from "../../services/telegram/telegram.client.js";
import { executePromptRequest, type PromptExecutionContext } from "./prompt.handler.js";
import { replyIfSessionRenamePending } from "../session-rename.js";

const DEFAULT_VOICE_FILE_NAME = "telegram-voice.ogg";
const DEFAULT_VOICE_MIME_TYPE = "audio/ogg";
const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

interface VoiceContext extends PromptExecutionContext {
    getFile(): Promise<{ file_path?: string }>;
    message: {
        voice?: {
            duration: number;
            file_id: string;
            file_size?: number;
            mime_type?: string;
        };
    };
}

export async function handleVoiceMessage(ctx: VoiceContext, dependencies: BotDependencies) {
    if (!ctx.message.voice) {
        return;
    }

    if (await replyIfSessionRenamePending(ctx, dependencies)) {
        return;
    }

    await executePromptRequest(ctx, dependencies, async () => {
        const voice = ctx.message.voice;

        if (!voice) {
            throw new VoiceMessageUnsupportedError("Telegram voice payload is missing.");
        }

        if (typeof voice.file_size === "number" && voice.file_size > TELEGRAM_MAX_DOWNLOAD_BYTES) {
            throw new VoiceMessageUnsupportedError(
                `Voice file size ${voice.file_size} exceeds the Telegram download limit of ${TELEGRAM_MAX_DOWNLOAD_BYTES} bytes.`,
            );
        }

        const file = await ctx.getFile();
        const filePath = file.file_path?.trim();

        if (!filePath) {
            throw new VoiceMessageUnsupportedError("Telegram did not provide a downloadable voice file path.");
        }

        const download = await dependencies.telegramFileClient.downloadFile({
            filePath,
        });
        const mimeType = voice.mime_type?.trim() || download.mimeType || DEFAULT_VOICE_MIME_TYPE;
        const filename = resolveVoiceFilename(filePath);
        const transcription = await dependencies.voiceTranscriptionService.transcribeVoice({
            data: download.data,
            filename,
            mimeType,
        });

        return {
            text: transcription.text,
        };
    });
}

export function registerVoiceHandler(bot: Bot, dependencies: BotDependencies) {
    bot.on("message:voice", async (ctx) => {
        await handleVoiceMessage(ctx, dependencies);
    });
}

function resolveVoiceFilename(filePath: string): string {
    const normalizedPath = filePath.trim();

    if (!normalizedPath) {
        return DEFAULT_VOICE_FILE_NAME;
    }

    const segments = normalizedPath.split("/");
    const filename = segments.at(-1)?.trim();

    return filename && filename.length > 0
        ? filename
        : DEFAULT_VOICE_FILE_NAME;
}
