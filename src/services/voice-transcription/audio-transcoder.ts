import { spawn, spawnSync, type ChildProcessWithoutNullStreams, type SpawnSyncReturns } from "node:child_process";

export type VoiceTranscodingDependencyDetail = "ffmpeg_missing" | "wav_encoder_missing";

export type FfmpegProbeResult =
    | { status: "ready" }
    | {
        detail: VoiceTranscodingDependencyDetail;
        message: string;
        status: "dependency_missing";
    };

export interface FfmpegProbeLike {
    probe(): FfmpegProbeResult;
}

export interface AudioTranscodeInput {
    data: Uint8Array | ArrayBuffer;
    filename: string;
    sourceFormat: string;
    targetFormat: "wav";
}

export interface AudioTranscodeResult {
    data: Uint8Array;
    filename: string;
    format: "wav";
    mimeType: "audio/wav";
}

export interface AudioTranscoderLike {
    transcode(input: AudioTranscodeInput): Promise<AudioTranscodeResult>;
}

export class VoiceTranscodingDependencyError extends Error {
    readonly data: { detail: VoiceTranscodingDependencyDetail; message: string };
    readonly detail: VoiceTranscodingDependencyDetail;

    constructor(detail: VoiceTranscodingDependencyDetail, message: string) {
        super(message);
        this.name = "VoiceTranscodingDependencyError";
        this.detail = detail;
        this.data = { detail, message };
    }
}

export class VoiceTranscodingFailedError extends Error {
    readonly data: { message: string };

    constructor(message: string) {
        super(message);
        this.name = "VoiceTranscodingFailedError";
        this.data = { message };
    }
}

export interface SystemFfmpegProbeOptions {
    command?: string;
    spawnSyncFn?: typeof spawnSync;
}

export interface SystemFfmpegWavTranscoderOptions {
    command?: string;
    spawnFn?: typeof spawn;
    timeoutMs?: number;
}

const DEFAULT_FFMPEG_COMMAND = "ffmpeg";
const DEFAULT_TRANSCODE_TIMEOUT_MS = 10_000;
const WAV_ENCODER_NAME = "pcm_s16le";

export class SystemFfmpegProbe implements FfmpegProbeLike {
    private readonly command: string;
    private readonly spawnSyncFn: typeof spawnSync;

    constructor(options: SystemFfmpegProbeOptions = {}) {
        this.command = options.command?.trim() || DEFAULT_FFMPEG_COMMAND;
        this.spawnSyncFn = options.spawnSyncFn ?? spawnSync;
    }

    probe(): FfmpegProbeResult {
        const versionCheck = this.run(["-version"]);

        if (isMissingCommandResult(versionCheck)) {
            return {
                detail: "ffmpeg_missing",
                message: "System ffmpeg is not available in PATH.",
                status: "dependency_missing",
            };
        }

        if (versionCheck.status !== 0) {
            return {
                detail: "ffmpeg_missing",
                message: joinNonEmptyParts([
                    "System ffmpeg check failed.",
                    versionCheck.stderr,
                    versionCheck.stdout,
                ]) ?? "System ffmpeg check failed.",
                status: "dependency_missing",
            };
        }

        const encoderCheck = this.run(["-hide_banner", "-encoders"]);

        if (isMissingCommandResult(encoderCheck)) {
            return {
                detail: "ffmpeg_missing",
                message: "System ffmpeg is not available in PATH.",
                status: "dependency_missing",
            };
        }

        const encoderOutput = joinNonEmptyParts([
            encoderCheck.stdout,
            encoderCheck.stderr,
        ]) ?? "";

        if (encoderCheck.status !== 0 || !encoderOutput.includes(WAV_ENCODER_NAME)) {
            return {
                detail: "wav_encoder_missing",
                message: "System ffmpeg does not provide the pcm_s16le encoder required for WAV output.",
                status: "dependency_missing",
            };
        }

        return { status: "ready" };
    }

    private run(args: string[]): SpawnSyncReturns<string> {
        return this.spawnSyncFn(this.command, args, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });
    }
}

export class SystemFfmpegWavTranscoder implements AudioTranscoderLike {
    private readonly command: string;
    private readonly spawnFn: typeof spawn;
    private readonly timeoutMs: number;

    constructor(options: SystemFfmpegWavTranscoderOptions = {}) {
        this.command = options.command?.trim() || DEFAULT_FFMPEG_COMMAND;
        this.spawnFn = options.spawnFn ?? spawn;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TRANSCODE_TIMEOUT_MS;
    }

    async transcode(input: AudioTranscodeInput): Promise<AudioTranscodeResult> {
        if (input.targetFormat !== "wav") {
            throw new VoiceTranscodingFailedError(
                `Unsupported transcode target: ${input.targetFormat}.`,
            );
        }

        const sourceBytes = toUint8Array(input.data);

        return new Promise((resolve, reject) => {
            let settled = false;
            let timedOut = false;
            const stdoutChunks: Buffer[] = [];
            let stderr = "";
            const child = this.spawnFn(
                this.command,
                [
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    "pipe:0",
                    "-vn",
                    "-map_metadata",
                    "-1",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-c:a",
                    WAV_ENCODER_NAME,
                    "-f",
                    "wav",
                    "pipe:1",
                ],
                {
                    stdio: ["pipe", "pipe", "pipe"],
                    windowsHide: true,
                },
            );

            const finish = (callback: () => void) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeout);
                callback();
            };

            child.stdout.on("data", (chunk: Buffer | string) => {
                stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });

            child.stderr.setEncoding("utf8");
            child.stderr.on("data", (chunk: string) => {
                stderr += chunk;
            });

            child.once("error", (error) => {
                finish(() => {
                    if (isMissingCommandError(error)) {
                        reject(new VoiceTranscodingDependencyError(
                            "ffmpeg_missing",
                            "System ffmpeg is not available in PATH.",
                        ));
                        return;
                    }

                    reject(new VoiceTranscodingFailedError(
                        joinNonEmptyParts([
                            "Voice transcoding failed.",
                            error.message,
                        ]) ?? "Voice transcoding failed.",
                    ));
                });
            });

            child.once("close", (code, signal) => {
                finish(() => {
                    if (timedOut) {
                        reject(new VoiceTranscodingFailedError("Voice transcoding timed out."));
                        return;
                    }

                    if (code !== 0) {
                        if (isMissingWavEncoder(stderr)) {
                            reject(new VoiceTranscodingDependencyError(
                                "wav_encoder_missing",
                                "System ffmpeg does not provide the pcm_s16le encoder required for WAV output.",
                            ));
                            return;
                        }

                        reject(new VoiceTranscodingFailedError(
                            joinNonEmptyParts([
                                "Voice transcoding failed.",
                                stderr.trim() || null,
                                code !== null ? `exit code: ${code}` : null,
                                signal ? `signal: ${signal}` : null,
                            ]) ?? "Voice transcoding failed.",
                        ));
                        return;
                    }

                    const output = Buffer.concat(stdoutChunks);

                    if (output.byteLength === 0) {
                        reject(new VoiceTranscodingFailedError("Voice transcoding produced empty WAV output."));
                        return;
                    }

                    resolve({
                        data: new Uint8Array(output),
                        filename: replaceFileExtension(input.filename, ".wav"),
                        format: "wav",
                        mimeType: "audio/wav",
                    });
                });
            });

            const timeout = setTimeout(() => {
                timedOut = true;
                child.kill();
            }, this.timeoutMs);

            child.stdin.on("error", () => {
                // Ignore EPIPE; the process error/close handlers surface the useful failure.
            });
            child.stdin.end(Buffer.from(sourceBytes));
        });
    }
}

function isMissingCommandResult(result: SpawnSyncReturns<string>): boolean {
    return isMissingCommandError(result.error);
}

function isMissingCommandError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
        && "code" in error
        && ((error as NodeJS.ErrnoException).code === "ENOENT"
            || (error as NodeJS.ErrnoException).code === "UNKNOWN");
}

function isMissingWavEncoder(stderr: string): boolean {
    const normalized = stderr.trim().toLowerCase();

    return normalized.includes("unknown encoder")
        && normalized.includes(WAV_ENCODER_NAME);
}

function replaceFileExtension(filename: string, extension: ".wav"): string {
    const normalized = filename.trim();
    const lastDotIndex = normalized.lastIndexOf(".");

    if (lastDotIndex <= 0) {
        return `${normalized || "audio"}${extension}`;
    }

    return `${normalized.slice(0, lastDotIndex)}${extension}`;
}

function toUint8Array(data: Uint8Array | ArrayBuffer): Uint8Array {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function joinNonEmptyParts(parts: Array<string | null | undefined>): string | null {
    const filtered = parts
        .map((part) => part?.trim())
        .filter((part): part is string => !!part);

    return filtered.length > 0 ? filtered.join(" ") : null;
}
