import type { SttClientLike, SttTranscriptionInput } from "./stt.client.js";
import { VoiceTranscriptEmptyError } from "./stt.client.js";

export interface SttServiceLike {
    transcribeVoice(input: SttTranscriptionInput): Promise<{ text: string }>;
}

export class SttService implements SttServiceLike {
    constructor(private readonly client: SttClientLike) { }

    async transcribeVoice(input: SttTranscriptionInput): Promise<{ text: string }> {
        const result = await this.client.transcribe(input);
        const text = result.text.trim();

        if (!text) {
            throw new VoiceTranscriptEmptyError("Voice transcription returned empty text.");
        }

        return { text };
    }
}
