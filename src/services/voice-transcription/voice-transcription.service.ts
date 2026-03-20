import type {
    VoiceRecognitionStatus,
    VoiceTranscriptionClientLike,
    VoiceTranscriptionInput,
} from "./openrouter-voice.client.js";
import { VoiceTranscriptEmptyError } from "./openrouter-voice.client.js";

export type { VoiceRecognitionStatus } from "./openrouter-voice.client.js";

export interface VoiceTranscriptionServiceLike {
    getStatus(): VoiceRecognitionStatus;
    transcribeVoice(input: VoiceTranscriptionInput): Promise<{ text: string }>;
}

export class VoiceTranscriptionService implements VoiceTranscriptionServiceLike {
    constructor(private readonly client: VoiceTranscriptionClientLike) { }

    getStatus(): VoiceRecognitionStatus {
        return this.client.getStatus();
    }

    async transcribeVoice(input: VoiceTranscriptionInput): Promise<{ text: string }> {
        const result = await this.client.transcribe(input);
        const text = result.text.trim();

        if (!text) {
            throw new VoiceTranscriptEmptyError("Voice transcription returned empty text.");
        }

        return { text };
    }
}
