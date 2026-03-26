import type { TokenSettingsRepository } from "../domain/token/token-settings.repository.js";

export interface ToggleTokenSettingInput {
    showBreakdown: boolean;
}

export interface ToggleTokenSettingResult {
    showBreakdown: boolean;
    updated: boolean;
}

export class ToggleTokenSettingUseCase {
    constructor(private readonly tokenSettingsRepo: TokenSettingsRepository) { }

    async execute(input: ToggleTokenSettingInput): Promise<ToggleTokenSettingResult> {
        const current = await this.tokenSettingsRepo.get();
        const normalizedShowBreakdown = input.showBreakdown === true;

        if (current.showBreakdown === normalizedShowBreakdown) {
            return {
                updated: false,
                showBreakdown: current.showBreakdown,
            };
        }

        await this.tokenSettingsRepo.set({
            showBreakdown: normalizedShowBreakdown,
        });

        return {
            updated: true,
            showBreakdown: normalizedShowBreakdown,
        };
    }
}
