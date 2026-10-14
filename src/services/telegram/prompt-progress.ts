import type { BotCopy } from "../../bot/copy.js";
import { redactSensitiveText } from "../../infra/utils/redact.js";
import type { PromptProgressEvent } from "../session-activity/foreground-session-tracker.js";
import { escapeTelegramHtml, splitTelegramText, TELEGRAM_MESSAGE_TARGET_LENGTH, type TelegramStaticReply } from "./telegram-format.js";

export class TelegramPromptProgress {
    private readonly reasoning = new Map<string, string>();
    private readonly answers = new Map<string, string>();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private writes = Promise.resolve();
    private lastTexts: string[] = [];
    private lastAnswer = "";
    private lastCompaction = "";
    private finished = false;
    private compacting = false;
    private compactionStatus: string | null = null;
    private phase: string;
    hasContent = false;

    constructor(
        private readonly copy: BotCopy,
        private readonly write: (replies: TelegramStaticReply<"HTML">[], terminal: boolean) => Promise<unknown>,
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
                parts.set(key, data.text);
            } else if (typeof data.delta === "string") {
                parts.set(key, (parts.get(key) ?? "") + data.delta);
            }
            this.hasContent ||= isReasoning;
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
        this.phase = this.copy.status[status];
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        await this.flush(true);
    }

    private flush(terminal: boolean): Promise<void> {
        this.writes = this.writes.then(async () => {
            const compaction = this.finished && this.compacting ? this.phase : this.compactionStatus;
            if (compaction && compaction !== this.lastCompaction && this.writeCompaction) {
                await this.writeCompaction(compaction, !this.compacting || this.finished);
                this.lastCompaction = compaction;
            }
            const replies = this.render();
            const texts = replies.map((reply) => reply.preferred.text);
            if (texts.length !== this.lastTexts.length || texts.some((text, index) => text !== this.lastTexts[index]) || terminal) {
                await this.write(replies, terminal || this.finished);
                this.lastTexts = texts;
            }
            const answer = [...this.answers.values()].join("\n\n");
            if (answer && answer !== this.lastAnswer && this.writeAnswer) {
                await this.writeAnswer(answer);
                this.lastAnswer = answer;
            }
        }).catch(this.onError);
        return this.writes;
    }

    private render(): TelegramStaticReply<"HTML">[] {
        const reasoning = [...this.reasoning.values()].join("\n");
        const status = this.finished && this.phase !== this.copy.status.completed ? this.phase : null;
        if (!reasoning) {
            const fallback = { text: status ?? this.copy.status.processing };
            return [{ preferred: fallback, fallback }];
        }
        const title = `💭 ${this.finished ? this.copy.status.thinking : this.copy.status.thinkingInProgress}`;
        // Reserve space for localized headings, part numbers and terminal status.
        const chunks = splitTelegramText(redactSensitiveText(reasoning), TELEGRAM_MESSAGE_TARGET_LENGTH - 64);
        return chunks.map((chunk, index) => {
            const heading = chunks.length > 1 ? `${title} · ${index + 1}` : title;
            return {
                preferred: {
                    text: `${status ? `${escapeTelegramHtml(status)}\n` : ""}<b>${escapeTelegramHtml(heading)}</b>\n<blockquote expandable>${escapeTelegramHtml(chunk)}</blockquote>`,
                    options: { parse_mode: "HTML" },
                },
                fallback: { text: [status, heading, chunk].filter(Boolean).join("\n") },
            };
        });
    }

}
