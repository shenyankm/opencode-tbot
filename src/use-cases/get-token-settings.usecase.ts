import type { TokenSettingsRepository } from "../domain/token/token-settings.repository.js";

export interface GetTokenSettingsResult {
    showBreakdown: boolean;
}

export class GetTokenSettingsUseCase {
    constructor(private readonly tokenSettingsRepo: TokenSettingsRepository) { }

    async execute(): Promise<GetTokenSettingsResult> {
        return this.tokenSettingsRepo.get();
    }
}
