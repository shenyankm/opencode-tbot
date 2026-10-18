import type { BotCopy } from "../../bot/copy.js";
import { redactSensitiveText } from "../../infra/utils/redact.js";
import type { PromptProgressEvent } from "../session-activity/foreground-session-tracker.js";
import { splitTelegramText, TELEGRAM_MESSAGE_TARGET_LENGTH, type TelegramStaticReply } from "./telegram-format.js";

import type { ThinkingContent } from "../../domain/thinking/thinking-message.entity.js";
import { buildThinkingMessageReply } from "./thinking-messages.js";

export interface TelegramProgressReply extends TelegramStaticReply<"HTML"> {
    thinking?: ThinkingContent;
}

export class TelegramPromptProgress {
    private readonly reasoning = new Map<string, string>();
    private readonly answers = new Map<string, string>();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private writes = Promise.resolve();
    private flushQueued = false;
    private reasoningChunks: string[] | null = null;
    private lastReasoningChunks: string[] | null | undefined;
    private lastTexts: string[] = [];
    private lastAnswer = "";
    private lastCompaction = "";
    private finished = false;
    private outcome: "completed" | "stopped" | "failed" | null = null;
    private compacting = false;
    private compactionStatus: string | null = null;
    private phase: string;
    get hasContent(): boolean {
        return [...this.reasoning.values()].some((text) => Boolean(text.trim()));
    }

    constructor(
        private readonly copy: BotCopy,
        private readonly write: (replies: TelegramProgressReply[], terminal: boolean) => Promise<unknown>,
        private readonly onError: (error: unknown) => void,
        private readonly writeAnswer?: (text: string) => Promise<void>,
        private readonly writeCompaction?: (text: string, terminal: boolean) => Promise<unknown>,
    ) {
        this.phase = copy.status.processing;
    }

    accept(event: PromptProgressEvent): void {
        if (this.finished) {
            return;
        }
        const { type, data } = event;
        if (type === "session.compaction.started" || type === "session.compaction.ended" || type === "session.compaction.failed") {
            this.compacting = type === "session.compaction.started";
            this.compactionStatus = this.compacting ? this.copy.status.compacting
                : type === "session.compaction.ended" ? this.copy.status.compacted : this.copy.status.compactionFailed;
            void this.flush(false);
            return;
        }
        if (type.startsWith("session.reasoning.") || type.startsWith("session.text.")) {
            const isReasoning = type.startsWith("session.reasoning.");
            const parts = isReasoning ? this.reasoning : this.answers;
            const key = `${String(data.assistantMessageID)}:${String(data.ordinal)}`;
            if (typeof data.text === "string") {
                if (isReasoning && parts.get(key) !== data.text) this.reasoningChunks = null;
                parts.set(key, data.text);
            } else if (typeof data.delta === "string") {
                if (isReasoning) this.reasoningChunks = null;
                parts.set(key, (parts.get(key) ?? "") + data.delta);
            }
        } else {
            return;
        }
        if (!this.timer) {
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.flush(false);
            }, 1_000);
        }
    }

    async finish(status: "completed" | "stopped" | "failed"): Promise<void> {
        if (this.finished && this.phase === this.copy.status[status]) {
            return this.writes;
        }
        this.finished = true;
        this.outcome = status;
        this.phase = this.copy.status[status];
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        await this.flush(true);
    }

    private flush(terminal: boolean): Promise<void> {
        if (!terminal && this.flushQueued) return this.writes;
        this.flushQueued = true;
        this.writes = this.writes.then(async () => {
            this.flushQueued = false;
            const compaction = this.finished && this.compacting ? this.phase : this.compactionStatus;
            if (compaction && compaction !== this.lastCompaction && this.writeCompaction) {
                await this.writeCompaction(compaction, !this.compacting || this.finished);
                this.lastCompaction = compaction;
            }
            if (terminal || this.reasoningChunks !== this.lastReasoningChunks) {
                const replies = this.render();
                const chunks = this.reasoningChunks;
                const texts = replies.map((reply) => JSON.stringify(reply.thinking ?? reply.preferred.text));
                if (texts.length !== this.lastTexts.length || texts.some((text, index) => text !== this.lastTexts[index]) || terminal) {
                    await this.write(replies, terminal || this.finished);
                    this.lastTexts = texts;
                }
                this.lastReasoningChunks = chunks;
            }
            const answer = [...this.answers.values()].join("\n\n");
            if (answer && answer !== this.lastAnswer && this.writeAnswer) {
                await this.writeAnswer(answer);
                this.lastAnswer = answer;
            }
        }).catch(this.onError);
        return this.writes;
    }

    private render(): TelegramProgressReply[] {
        if (!this.reasoningChunks) {
            const reasoning = [...this.reasoning.values()].join("\n");
            this.reasoningChunks = reasoning.trim()
                ? splitTelegramText(redactSensitiveText(reasoning), TELEGRAM_MESSAGE_TARGET_LENGTH - 64) : [];
        }
        const status = this.finished && this.phase !== this.copy.status.completed ? this.phase : null;
        if (!this.reasoningChunks.length) {
            const fallback = { text: status ?? this.copy.status.processing };
            return [{ preferred: fallback, fallback }];
        }
        const chunks = this.reasoningChunks;
        return chunks.map((text, index) => {
            const thinking: ThinkingContent = {
                text,
                ...(chunks.length > 1 ? { part: index + 1 } : {}),
                phase: this.outcome ?? "running",
            };
            return { ...buildThinkingMessageReply(thinking, false, this.copy), thinking };
        });
    }
}
