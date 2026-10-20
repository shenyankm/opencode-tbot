import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { loadAppConfig } from "./config.js";
import { getGlobalPluginConfigFilePath, readPluginConfigFile } from "./plugin-config.js";
import { redactSensitiveText } from "../infra/utils/redact.js";

export interface DoctorCheck {
    name: string;
    status: "ok" | "fail" | "unknown";
    detail: string;
}

export async function diagnoseInstallation(options: { homeDir?: string; cwd?: string } = {}): Promise<DoctorCheck[]> {
    const checks: DoctorCheck[] = [];
    const homeDir = options.homeDir ?? homedir();
    const cwd = options.cwd ?? process.cwd();
    const [major, minor] = process.versions.node.split(".").map(Number);
    checks.push({ name: "Node", status: major > 22 || major === 22 && minor >= 12 ? "ok" : "fail", detail: process.version });
    const configFilePath = getGlobalPluginConfigFilePath(homeDir);
    try {
        const config = loadAppConfig(await readPluginConfigFile(configFilePath), { cwd, configFilePath });
        checks.push({ name: "Authorization", status: config.telegramAllowedChatIds.length ? "ok" : "fail",
            detail: config.telegramAllowedChatIds.length ? `Authorized chats: ${config.telegramAllowedChatIds.join(", ")}` : "Set telegram.allowedChatIds; an empty list denies all chats." });
        for (const path of [configFilePath, config.stateFilePath, config.loggingFileDir]) {
            let existing = resolve(path);
            while (true) {
                try {
                    await access(existing, constants.F_OK);
                    break;
                } catch (error) {
                    if (!(error instanceof Error && "code" in error && error.code === "ENOENT") || dirname(existing) === existing) throw error;
                    existing = dirname(existing);
                }
            }
            try {
                await access(existing, constants.W_OK);
                checks.push({ name: "Writable path", status: "ok", detail: path });
            } catch {
                checks.push({ name: "Writable path", status: "fail", detail: `Grant write access to ${existing}` });
            }
        }
        const response = await fetch(`${config.telegramApiRoot}/bot${config.telegramBotToken}/getWebhookInfo`, { signal: AbortSignal.timeout(5_000) });
        const body: unknown = await response.json();
        const webhook = body && typeof body === "object" && "result" in body ? body.result : null;
        if (webhook && typeof webhook === "object" && "url" in webhook && typeof webhook.url === "string") {
            checks.push({ name: "Telegram webhook", status: webhook.url ? "fail" : "ok", detail: webhook.url ? "Remove the webhook before starting long polling." : "No webhook configured." });
        } else {
            checks.push({ name: "Telegram access", status: "fail", detail: "Check the bot token and API root." });
        }
    } catch (error) {
        checks.push({ name: "Configuration / Telegram", status: "fail", detail: redactSensitiveText(error instanceof Error ? error.message : String(error)) });
    }
    try {
        const endpoint = await Service.discover({ file: join(homeDir, ".local", "state", "opencode", "service.json"), version: (version) => version.startsWith("2.") });
        if (!endpoint) throw new Error("Start OpenCode V2 with opencode serve --service.");
        const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) });
        const signal = AbortSignal.timeout(5_000);
        const info = await client.server.info({ signal });
        checks.push({ name: "Shared host", status: "ok", detail: `OpenCode ${info.version}` });
        const locations = await client.debug.location.list({ signal });
        checks.push({ name: "Location", status: locations.some((location) => resolve(location.directory) === resolve(cwd)) ? "ok" : "fail",
            detail: `Open ${cwd} in the shared host to load its plugin.` });
    } catch (error) {
        checks.push({ name: "Shared host", status: "fail", detail: redactSensitiveText(error instanceof Error ? error.message : String(error)) });
    }
    checks.push({ name: "Competing poller", status: "unknown", detail: "Telegram exposes no read-only poller lookup. Stop other instances if startup reports 409 Conflict." });
    return checks;
}
