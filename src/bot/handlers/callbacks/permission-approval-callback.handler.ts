import type { Bot } from "grammy";
import type { PermissionApprovalRepository } from "../../../domain/permission/approval.repository.js";
import { getSafeChatCopy } from "../../i18n.js";
import { scopeDependenciesToTelegramContext } from "../../logger-context.js";
import type { OpenCodePermissionResponder } from "../../../services/opencode/opencode.ports.js";
import {
    buildPermissionApprovalResolvedMessage,
    parsePermissionApprovalCallbackData,
} from "../../../services/permission/telegram-approval.js";
import type {
    BotDependencies,
    ChatStateDependencies,
    PermissionApprovalCallbackData,
} from "../../types.js";
import type { CallbackContext } from "./callback-context.js";

const PERMISSION_PREFIX = "permission:";

export type PermissionApprovalCallbackDependencies =
    & ChatStateDependencies
    & {
        opencodeClient: OpenCodePermissionResponder;
        permissionApprovalRepo: PermissionApprovalRepository;
    };

export async function handlePermissionApprovalCallback(
    ctx: CallbackContext,
    dependencies: PermissionApprovalCallbackDependencies,
) {
    const data = ctx.callbackQuery.data as PermissionApprovalCallbackData;

    if (!data.startsWith(PERMISSION_PREFIX)) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    const parsed = parsePermissionApprovalCallbackData(data);

    if (!parsed) {
        return;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        const approvals = await dependencies.permissionApprovalRepo.listByRequestId(parsed.requestId);
        const approval = approvals.find((item) => item.chatId === ctx.chat?.id);

        if (!approval) {
            await ctx.editMessageText(copy.permission.replyFailed);
            return;
        }

        const accepted = await dependencies.opencodeClient.replyToPermission(
            approval.sessionId,
            parsed.requestId,
            parsed.reply,
        );

        if (!accepted) {
            await ctx.editMessageText(copy.permission.replyFailed);
            return;
        }

        await dependencies.permissionApprovalRepo.set({
            ...approval,
            status: parsed.reply,
            updatedAt: new Date().toISOString(),
        });

        await ctx.editMessageText(buildPermissionApprovalResolvedMessage(parsed.requestId, parsed.reply, copy));
    } catch (error) {
        dependencies.logger.error({ error, requestId: parsed.requestId }, "failed to reply to permission request");
        await ctx.editMessageText(copy.permission.replyFailed);
    }
}

export function registerPermissionApprovalCallbackRoute(
    bot: Pick<Bot, "callbackQuery">,
    dependencies: BotDependencies & Pick<PermissionApprovalCallbackDependencies, "opencodeClient" | "permissionApprovalRepo">,
): void {
    bot.callbackQuery(/^permission:/, async (ctx) => {
        await handlePermissionApprovalCallback(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
