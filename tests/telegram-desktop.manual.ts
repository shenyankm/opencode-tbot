// Run only for authorized manual acceptance: pnpm exec tsx tests/telegram-desktop.manual.ts.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Bot } from "grammy";
import { run } from "@grammyjs/runner";
import { preparePluginConfiguration } from "../src/app/plugin-config.js";
import { loadAppConfig } from "../src/app/config.js";
import { createAuthMiddleware } from "../src/bot/middlewares/auth.js";
import { telegramAuthorization } from "../src/services/telegram/authorization.js";
import { telegramRichMessages } from "../src/services/telegram/rich-messages.js";
import { telegramNetworkRecovery } from "../src/services/telegram/network-recovery.js";
import { executePromptRequest } from "../src/bot/handlers/prompt.handler.js";
import { registerThinkingCallbackRoute } from "../src/bot/handlers/callbacks/thinking-callback.handler.js";
import { registerPromptStopRoute } from "../src/bot/handlers/callbacks/prompt-stop.handler.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { FileThinkingMessageRepository } from "../src/repositories/thinking-message.repo.js";
import { TelegramThinkingMessages } from "../src/services/telegram/thinking-messages.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import { AbortPromptUseCase } from "../src/use-cases/abort-prompt.usecase.js";
import { setChatLanguage } from "../src/bot/i18n.js";
import { redactSensitiveText } from "../src/infra/utils/redact.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import type { ForegroundPromptDependencies } from "../src/bot/types.js";

const prepared = await preparePluginConfiguration({ cwd: process.cwd() });
const config = loadAppConfig(prepared.config);
if (!config.telegramAllowedChatIds.length) throw new Error("Manual QA requires a restricted configured chat.");
const directory = resolve(".codex-e2e/desktop-2026-10-20");
await mkdir(directory, { recursive: true, mode: 0o700 });
const logger = {
    child() { return this; }, debug() {}, info() {},
    warn(data: unknown, message?: string) { console.error(redactSensitiveText(`${message}: ${JSON.stringify(data)}`)); },
    error(data: unknown) { console.error(redactSensitiveText(JSON.stringify(data))); }, async flush() {},
} as AppLogger;
const bot = new Bot(config.telegramBotToken, { client: { apiRoot: config.telegramApiRoot, timeoutSeconds: 45, fetch: globalThis.fetch as never } });
bot.api.config.use(telegramAuthorization(config.telegramAllowedChatIds));
bot.api.config.use(telegramNetworkRecovery(logger));
bot.api.config.use(telegramRichMessages());
bot.use(createAuthMiddleware(config.telegramAllowedChatIds));
const sessionRepo = new InMemorySessionRepository();
const tracker = new ForegroundSessionTracker();
const events: unknown[] = [];
const dependencies: ForegroundPromptDependencies = {
    sessionRepo, logger, foregroundSessionTracker: tracker,
    thinkingMessages: new TelegramThinkingMessages(new FileThinkingMessageRepository(`${directory}/thinking`)),
    sendPromptUseCase: {
        async execute(input) {
            input.onExecutionSession?.("desktop-fixture");
            input.onInputReady?.("desktop-input");
            const emit = (type: string, extra = {}) => tracker.publish({ type, data: { sessionID: "desktop-fixture", assistantMessageID: "desktop-answer", ordinal: 0, ...extra } });
            emit("session.inbox.delivered", { inboxID: "desktop-input" });
            emit("session.step.started");
            let answer = "Desktop QA ✅ 中文 / 日本語 / English\n\n| Check | Result |\n|---|---|\n| Emoji | 😀🚀 |\n| Table | Preserved |\n\n```ts\n";
            for (let index = 1; index <= (input.text?.includes("stop") ? 60 : 20); index++) {
                input.signal?.throwIfAborted();
                emit("session.reasoning.delta", { delta: `Reasoning ${index}: 检查展开后的流式更新 / 展開したまま更新します。\n` });
                answer += `const item${index} = "中文・日本語・English 😀";\n`;
                emit("session.text.ended", { text: answer + "```" });
                await setTimeout(1000, undefined, { signal: input.signal });
            }
            answer += "```\nDESKTOP_QA_COMPLETE";
            return { projectId: "manual-qa", sessionId: "desktop-fixture", assistantReply: { bodyMd: answer, fallbackText: answer,
                assistantError: input.text?.includes("fail") ? { type: "APIError", message: "DESKTOP_QA_CONTROLLED_FAILURE" } : null,
                info: null, metrics: { durationMs: 20000, tokens: { total: 20, input: 10, output: 10, reasoning: 0, cacheRead: 0, cacheWrite: 0 } } } };
        },
    },
};
const abortPromptUseCase = new AbortPromptUseCase(sessionRepo, { abortSession: async () => true, cancelSessionInput: async () => {} }, tracker);
bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) events.push({ action: ctx.callbackQuery.data, at: new Date().toISOString() });
    await next();
    await writeFile(`${directory}/receipt.json`, JSON.stringify(events, null, 2), { mode: 0o600 });
});
registerThinkingCallbackRoute(bot, dependencies);
registerPromptStopRoute(bot, { ...dependencies, abortPromptUseCase });
bot.on("message:text", async (ctx) => {
    if (!ctx.message.text.startsWith("/qa")) return;
    const language = ctx.message.text.includes("zh") ? "zh-CN" : ctx.message.text.includes("ja") ? "ja" : "en";
    await setChatLanguage(sessionRepo, ctx.chat.id, language);
    events.push({ action: ctx.message.text, at: new Date().toISOString() });
    await executePromptRequest(ctx, dependencies, async () => ({ text: ctx.message.text }));
    await writeFile(`${directory}/receipt.json`, JSON.stringify(events, null, 2), { mode: 0o600 });
});
bot.catch((error) => logger.error(error.error));
await bot.init();
console.log(`Desktop acceptance ready: @${bot.botInfo.username}. Send /qa en, /qa zh, /qa ja, or /qa fail.`);
const runner = run(bot);
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => {
    tracker.dispose();
    void runner.stop().then(() => writeFile(`${directory}/receipt.json`, JSON.stringify(events, null, 2), { mode: 0o600 }));
});
await runner.task();
