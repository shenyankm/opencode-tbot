import assert from "node:assert/strict";
import test from "node:test";
import {
    DisabledVoiceTranscriptionClient,
    OpenRouterVoiceTranscriptionClient,
    VoiceTranscriptionFailedError,
    VoiceTranscriptionNotConfiguredError,
    resolveAudioFormat,
} from "../src/services/voice-transcription/openrouter-voice.client.js";
import { VoiceTranscriptionService } from "../src/services/voice-transcription/voice-transcription.service.js";

test("OpenRouterVoiceTranscriptionClient sends OpenRouter audio chat requests and trims the returned text", async () => {
    const calls: Array<{ options: { timeoutMs?: number } | undefined; request: unknown }> = [];
    const client = new OpenRouterVoiceTranscriptionClient(
        {
            model: "openai/gpt-audio-mini",
            timeoutMs: 10_000,
            transcriptionPrompt: "transcribe carefully",
        },
        {
            chat: {
                async send(request, options) {
                    calls.push({ request, options });

                    return {
                        choices: [{
                            message: {
                                content: "  hello from voice  ",
                            },
                        }],
                    };
                },
            },
        },
    );

    const result = await client.transcribe({
        data: Uint8Array.from([1, 2, 3]),
        filename: "voice.ogg",
        mimeType: "audio/ogg",
    });

    assert.deepEqual(result, {
        text: "hello from voice",
    });
    assert.deepEqual(client.getStatus(), {
        status: "configured",
        model: "openai/gpt-audio-mini",
    });
    assert.equal(calls.length, 1);

    const request = calls[0]?.request as {
        chatGenerationParams: {
            messages: Array<{
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
    };

    assert.equal(calls[0]?.options?.timeoutMs, 10_000);
    assert.equal(request.chatGenerationParams.model, "openai/gpt-audio-mini");
    assert.equal(request.chatGenerationParams.stream, false);
    assert.equal(request.chatGenerationParams.temperature, 0);
    assert.equal(request.chatGenerationParams.messages.length, 1);
    assert.equal(request.chatGenerationParams.messages[0]?.content[0]?.type, "text");
    assert.match(
        (request.chatGenerationParams.messages[0]?.content[0] as { text: string }).text,
        /Additional instructions: transcribe carefully/,
    );
    assert.deepEqual(request.chatGenerationParams.messages[0]?.content[1], {
        type: "input_audio",
        inputAudio: {
            data: Buffer.from(Uint8Array.from([1, 2, 3])).toString("base64"),
            format: "ogg",
        },
    });
});

test("OpenRouterVoiceTranscriptionClient accepts wav input without format conversion", async () => {
    const calls: unknown[] = [];
    const client = new OpenRouterVoiceTranscriptionClient(
        {
            model: "openai/gpt-audio-mini",
            timeoutMs: 10_000,
        },
        {
            chat: {
                async send(request) {
                    calls.push(request);
                    return {
                        choices: [{
                            message: {
                                content: [
                                    { type: "text", text: "  first line  " },
                                    { type: "text", text: "second line" },
                                ],
                            },
                        }],
                    };
                },
            },
        },
    );

    const result = await client.transcribe({
        data: Uint8Array.from([1, 2, 3]),
        filename: "voice.wav",
        mimeType: "audio/wav",
    });

    assert.deepEqual(result, {
        text: "first line\nsecond line",
    });
    assert.equal(calls.length, 1);
});

test("OpenRouterVoiceTranscriptionClient accepts mp3 input without format conversion", async () => {
    const calls: Array<{ request: unknown }> = [];
    const client = new OpenRouterVoiceTranscriptionClient(
        {
            model: "openai/gpt-audio-mini",
            timeoutMs: 10_000,
        },
        {
            chat: {
                async send(request) {
                    calls.push({ request });

                    return {
                        choices: [{
                            message: {
                                content: "mp3 transcript",
                            },
                        }],
                    };
                },
            },
        },
    );

    const result = await client.transcribe({
        data: Uint8Array.from([9, 8, 7]),
        filename: "voice.mp3",
        mimeType: "audio/mpeg",
    });

    assert.deepEqual(result, {
        text: "mp3 transcript",
    });

    const request = calls[0]?.request as {
        chatGenerationParams: {
            messages: Array<{
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
        };
    };

    assert.deepEqual(request.chatGenerationParams.messages[0]?.content[1], {
        type: "input_audio",
        inputAudio: {
            data: Buffer.from(Uint8Array.from([9, 8, 7])).toString("base64"),
            format: "mp3",
        },
    });
});

test("OpenRouterVoiceTranscriptionClient surfaces SDK failures as typed transcription errors", async () => {
    const client = new OpenRouterVoiceTranscriptionClient(
        {
            model: "openai/gpt-audio-mini",
            timeoutMs: 10_000,
        },
        {
            chat: {
                async send() {
                    throw new Error("upstream failed");
                },
            },
        },
    );

    await assert.rejects(
        client.transcribe({
            data: Uint8Array.from([1, 2, 3]),
            filename: "voice.wav",
            mimeType: "audio/wav",
        }),
        (error: unknown) => {
            assert.ok(error instanceof VoiceTranscriptionFailedError);
            assert.equal(
                error.message,
                "upstream failed | model: openai/gpt-audio-mini | format: wav",
            );
            return true;
        },
    );
});

test("OpenRouterVoiceTranscriptionClient surfaces nested provider details for OpenRouter errors", async () => {
    const client = new OpenRouterVoiceTranscriptionClient(
        {
            model: "openai/gpt-audio-mini",
            timeoutMs: 10_000,
        },
        {
            chat: {
                async send() {
                    const error = new Error("Provider returned error") as Error & {
                        body?: string;
                        statusCode?: number;
                    };

                    error.statusCode = 502;
                    error.body = JSON.stringify({
                        error: {
                            code: 10_001,
                            message: "Unsupported audio format",
                            metadata: {
                                provider_name: "OpenAI",
                            },
                        },
                    });

                    throw error;
                },
            },
        },
    );

    await assert.rejects(
        client.transcribe({
            data: Uint8Array.from([1, 2, 3]),
            filename: "voice.ogg",
            mimeType: "audio/ogg",
        }),
        (error: unknown) => {
            assert.ok(error instanceof VoiceTranscriptionFailedError);
            assert.equal(
                error.message,
                "Unsupported audio format | model: openai/gpt-audio-mini | format: ogg | provider: OpenAI | status: 502 | code: 10001",
            );
            return true;
        },
    );
});

test("DisabledVoiceTranscriptionClient reports that voice transcription is not configured", async () => {
    const client = new DisabledVoiceTranscriptionClient();

    assert.deepEqual(client.getStatus(), {
        status: "not_configured",
        model: null,
    });

    await assert.rejects(
        client.transcribe({
            data: Uint8Array.from([1, 2, 3]),
            filename: "voice.ogg",
            mimeType: "audio/ogg",
        }),
        (error: unknown) => {
            assert.ok(error instanceof VoiceTranscriptionNotConfiguredError);
            assert.equal(
                error.message,
                "Set openrouter.apiKey in the global config (~/.config/opencode/opencode-tbot/config.json) to enable Telegram voice transcription.",
            );
            return true;
        },
    );
});

test("VoiceTranscriptionService rejects empty transcription payloads", async () => {
    const service = new VoiceTranscriptionService({
        getStatus() {
            return {
                status: "configured" as const,
                model: "openai/gpt-audio-mini",
            };
        },
        async transcribe() {
            return {
                text: "   ",
            };
        },
    });

    assert.deepEqual(service.getStatus(), {
        status: "configured",
        model: "openai/gpt-audio-mini",
    });

    await assert.rejects(
        service.transcribeVoice({
            data: Uint8Array.from([1, 2, 3]),
            filename: "voice.ogg",
            mimeType: "audio/ogg",
        }),
        (error: unknown) => {
            assert.equal(
                error instanceof Error ? error.name : null,
                "VoiceTranscriptEmptyError",
            );
            return true;
        },
    );
});

test("resolveAudioFormat prefers MIME type, then extension, then ogg fallback", () => {
    assert.equal(resolveAudioFormat("voice.wav", "audio/ogg"), "ogg");
    assert.equal(resolveAudioFormat("voice.mp3", null), "mp3");
    assert.equal(resolveAudioFormat("voice.wav", null), "wav");
    assert.equal(resolveAudioFormat("voice.unknown", null), "ogg");
});
