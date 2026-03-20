import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
    SystemFfmpegProbe,
    SystemFfmpegWavTranscoder,
    VoiceTranscodingDependencyError,
    VoiceTranscodingFailedError,
} from "../src/services/voice-transcription/audio-transcoder.js";

class FakeChildProcess extends EventEmitter {
    readonly stdin = new PassThrough();
    readonly stdout = new PassThrough();
    readonly stderr = new PassThrough();

    kill(): boolean {
        this.emit("close", null, "SIGTERM");
        return true;
    }
}

test("SystemFfmpegProbe reports when ffmpeg is not available in PATH", () => {
    const probe = new SystemFfmpegProbe({
        spawnSyncFn() {
            return {
                error: Object.assign(new Error("spawn ffmpeg ENOENT"), {
                    code: "ENOENT",
                }),
                output: [],
                pid: 0,
                signal: null,
                status: null,
                stderr: "",
                stdout: "",
            };
        },
    });

    assert.deepEqual(probe.probe(), {
        detail: "ffmpeg_missing",
        message: "System ffmpeg is not available in PATH.",
        status: "dependency_missing",
    });
});

test("SystemFfmpegProbe reports when pcm_s16le is unavailable", () => {
    let calls = 0;
    const probe = new SystemFfmpegProbe({
        spawnSyncFn() {
            calls += 1;

            return {
                error: undefined,
                output: [],
                pid: 1,
                signal: null,
                status: 0,
                stderr: "",
                stdout: calls === 1 ? "ffmpeg version test" : "Encoders:\n A.... libmp3lame",
            };
        },
    });

    assert.deepEqual(probe.probe(), {
        detail: "wav_encoder_missing",
        message: "System ffmpeg does not provide the pcm_s16le encoder required for WAV output.",
        status: "dependency_missing",
    });
});

test("SystemFfmpegWavTranscoder converts audio to wav output", async () => {
    const calls: Array<{ args: string[]; command: string }> = [];
    const transcoder = new SystemFfmpegWavTranscoder({
        spawnFn(command, args) {
            calls.push({ command, args });
            const child = new FakeChildProcess();
            const inputChunks: Buffer[] = [];

            child.stdin.on("data", (chunk: Buffer | string) => {
                inputChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            child.stdin.on("end", () => {
                assert.deepEqual(Buffer.concat(inputChunks), Buffer.from([1, 2, 3]));
                child.stdout.end(Buffer.from([4, 5, 6]));
                child.stderr.end("");
                child.emit("close", 0, null);
            });

            return child as unknown as never;
        },
    });

    const result = await transcoder.transcode({
        data: Uint8Array.from([1, 2, 3]),
        filename: "voice.ogg",
        sourceFormat: "ogg",
        targetFormat: "wav",
    });

    assert.equal(calls[0]?.command, "ffmpeg");
    assert.deepEqual(calls[0]?.args, [
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
        "pcm_s16le",
        "-f",
        "wav",
        "pipe:1",
    ]);
    assert.deepEqual(result, {
        data: Uint8Array.from([4, 5, 6]),
        filename: "voice.wav",
        format: "wav",
        mimeType: "audio/wav",
    });
});

test("SystemFfmpegWavTranscoder surfaces missing ffmpeg as a dependency error", async () => {
    const transcoder = new SystemFfmpegWavTranscoder({
        spawnFn() {
            const child = new FakeChildProcess();

            queueMicrotask(() => {
                child.emit("error", Object.assign(new Error("spawn ffmpeg ENOENT"), {
                    code: "ENOENT",
                }));
            });

            return child as unknown as never;
        },
    });

    await assert.rejects(
        transcoder.transcode({
            data: Uint8Array.from([1, 2, 3]),
            filename: "voice.ogg",
            sourceFormat: "ogg",
            targetFormat: "wav",
        }),
        (error: unknown) => {
            assert.ok(error instanceof VoiceTranscodingDependencyError);
            assert.equal(error.detail, "ffmpeg_missing");
            assert.equal(error.message, "System ffmpeg is not available in PATH.");
            return true;
        },
    );
});

test("SystemFfmpegWavTranscoder surfaces timeouts as typed errors", async () => {
    const transcoder = new SystemFfmpegWavTranscoder({
        spawnFn() {
            return new FakeChildProcess() as unknown as never;
        },
        timeoutMs: 5,
    });

    await assert.rejects(
        transcoder.transcode({
            data: Uint8Array.from([1, 2, 3]),
            filename: "voice.ogg",
            sourceFormat: "ogg",
            targetFormat: "wav",
        }),
        (error: unknown) => {
            assert.ok(error instanceof VoiceTranscodingFailedError);
            assert.equal(error.message, "Voice transcoding timed out.");
            return true;
        },
    );
});
