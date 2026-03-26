import type { Bot } from "grammy";

export interface CallbackContext {
    api?: Pick<Bot["api"], "setMyCommands">;
    answerCallbackQuery(other?: { show_alert?: boolean; text?: string }): Promise<unknown>;
    callbackQuery: { data: string; message?: { message_id: number } };
    chat?: { id: number };
    editMessageText(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}
