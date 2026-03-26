import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
    calculateDisplayedTokenTotal,
    DEFAULT_TOKEN_SHOW_BREAKDOWN,
} from "../src/domain/token/token-settings.entity.js";
import { serializePluginConfig } from "../src/app/plugin-config.js";
import {
    FileTokenSettingsRepository,
    InMemoryTokenSettingsRepository,
} from "../src/repositories/token-settings.repo.js";
import { GetTokenSettingsUseCase } from "../src/use-cases/get-token-settings.usecase.js";
import { ToggleTokenSettingUseCase } from "../src/use-cases/toggle-token-setting.usecase.js";

test("calculateDisplayedTokenTotal sums the displayed token metrics", () => {
    const total = calculateDisplayedTokenTotal({
        input: 10,
        output: 12,
        reasoning: 5,
        cacheRead: 15,
        cacheWrite: 3,
    });

    assert.equal(total, 45);
});

test("calculateDisplayedTokenTotal returns null when every displayed metric is unavailable", () => {
    const total = calculateDisplayedTokenTotal({
        input: null,
        output: null,
        reasoning: null,
        cacheRead: null,
        cacheWrite: null,
    });

    assert.equal(total, null);
});

test("ToggleTokenSettingUseCase persists token settings without overwriting other plugin config sections", async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-token-settings-"));
    const configFilePath = join(homeDir, ".config", "opencode", "opencode-tbot", "config.json");

    mkdirSync(join(homeDir, ".config", "opencode", "opencode-tbot"), { recursive: true });
    writeFileSync(
        configFilePath,
        serializePluginConfig({
            telegram: {
                botToken: "telegram-token",
                allowedChatIds: [1],
            },
            state: {
                path: "./data/opencode-tbot.state.json",
            },
            tokens: {
                totalIncludes: ["input", "output"],
            },
            logging: {
                level: "debug",
            },
        }),
        "utf8",
    );

    const repo = new FileTokenSettingsRepository(configFilePath, {
        showBreakdown: DEFAULT_TOKEN_SHOW_BREAKDOWN,
    });
    const getTokenSettingsUseCase = new GetTokenSettingsUseCase(repo);
    const toggleTokenSettingUseCase = new ToggleTokenSettingUseCase(repo);

    const result = await toggleTokenSettingUseCase.execute({
        showBreakdown: true,
    });

    assert.deepEqual(result, {
        updated: true,
        showBreakdown: true,
    });
    assert.deepEqual(
        await getTokenSettingsUseCase.execute(),
        {
            showBreakdown: true,
        },
    );

    const writtenConfig = JSON.parse(readFileSync(configFilePath, "utf8")) as {
        logging?: { level?: string };
        state?: { path?: string };
        telegram?: { allowedChatIds?: number[]; botToken?: string };
        tokens?: { showBreakdown?: boolean; totalIncludes?: string[] };
    };

    assert.deepEqual(writtenConfig.telegram, {
        botToken: "telegram-token",
        allowedChatIds: [1],
    });
    assert.deepEqual(writtenConfig.state, {
        path: "./data/opencode-tbot.state.json",
    });
    assert.deepEqual(writtenConfig.logging, {
        level: "debug",
    });
    assert.deepEqual(writtenConfig.tokens, {
        showBreakdown: true,
    });
});

test("ToggleTokenSettingUseCase is idempotent when the selected token setting is already active", async () => {
    const repo = new InMemoryTokenSettingsRepository({
        showBreakdown: true,
    });
    const useCase = new ToggleTokenSettingUseCase(repo);

    const result = await useCase.execute({
        showBreakdown: true,
    });

    assert.deepEqual(result, {
        updated: false,
        showBreakdown: true,
    });
    assert.deepEqual(
        await repo.get(),
        {
            showBreakdown: true,
        },
    );
});
