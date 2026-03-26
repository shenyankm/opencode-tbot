import type { TokenSettings } from "./token-settings.entity.js";

export interface TokenSettingsRepository {
    get(): Promise<TokenSettings>;
    set(settings: TokenSettings): Promise<void>;
}
