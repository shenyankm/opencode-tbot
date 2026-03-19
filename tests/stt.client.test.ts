import assert from "node:assert/strict";
import test from "node:test";
import {
    DisabledSttClient,
    OpenAiCompatibleSttClient,
    VoiceTranscriptionFailedError,
    VoiceTranscriptionNotConfiguredError,
} from "../src/services/stt/stt.client.js";
import { SttService } from "../src/services/stt/stt.service.js";

test("OpenAiCompatibleSttClient sends multipart transcription requests and trims the returned text", async () => {
    const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
    const client = new OpenAiCompatibleSttClient(
        {
            apiKey: " secret-token ",
            baseUrl: "https://stt.example/v1",
            language: "zh",
            model: "gpt-4o-mini-transcribe",
            prompt: "transcribe carefully",
            timeoutMs: 10_000,
        },
        async (input, init) => {
            calls.push({ input, init });

            return new Response(JSON.stringify({
                text: "  hello from voice  ",
            }), {
                status: 200,
                headers: {
                    "content-type": "application/json",
                },
            });
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
    assert.equal(calls.length, 1);
    assert.equal(String(calls[0].input), "https://stt.example/v1/audio/transcriptions");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer secret-token");
    assert.equal((calls[0].init?.headers as Record<string, string>).Accept, "application/json");
    assert.ok(calls[0].init?.signal instanceof AbortSignal);
    assert.ok(calls[0].init?.body instanceof FormData);

    const formData = calls[0].init?.body as FormData;
    const file = formData.get("file");

    assert.equal(formData.get("model"), "gpt-4o-mini-transcribe");
    assert.equal(formData.get("language"), "zh");
    assert.equal(formData.get("prompt"), "transcribe carefully");
    assert.equal(formData.get("response_format"), "json");
    assert.ok(file instanceof File);
    assert.equal(file.name, "voice.ogg");
    assert.equal(file.type, "audio/ogg");
});

test("OpenAiCompatibleSttClient surfaces non-2xx responses as typed transcription errors", async () => {
    const client = new OpenAiCompatibleSttClient(
        {
            baseUrl: "https://stt.example/v1",
            model: "gpt-4o-mini-transcribe",
            timeoutMs: 10_000,
        },
        async () => new Response("upstream failed", { status: 502 }),
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
                "STT request failed with status 502: upstream failed",
            );
            return true;
        },
    );
});

test("DisabledSttClient reports that voice transcription is not configured", async () => {
    const client = new DisabledSttClient();

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
                "Set STT_BASE_URL and STT_MODEL to enable Telegram voice transcription.",
            );
            return true;
        },
    );
});

test("SttService rejects empty transcription payloads", async () => {
    const service = new SttService({
        async transcribe() {
            return {
                text: "   ",
            };
        },
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
