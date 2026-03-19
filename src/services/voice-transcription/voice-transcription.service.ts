import type {
    VoiceTranscriptionClientLike,
    VoiceTranscriptionInput,
} from "./openrouter-voice.client.js";
import { VoiceTranscriptEmptyError } from "./openrouter-voice.client.js";

export interface VoiceTranscriptionServiceLike {
    transcribeVoice(input: VoiceTranscriptionInput): Promise<{ text: string }>;
}

export class VoiceTranscriptionService implements VoiceTranscriptionServiceLike {
    constructor(private readonly client: VoiceTranscriptionClientLike) { }

    async transcribeVoice(input: VoiceTranscriptionInput): Promise<{ text: string }> {
        const result = await this.client.transcribe(input);
        const text = result.text.trim();

        if (!text) {
            throw new VoiceTranscriptEmptyError("Voice transcription returned empty text.");
        }

        return { text };
    }
}
