# opencode-tbot

涓€涓€氳繃 Telegram 椹卞姩 [OpenCode](https://opencode.ai) 鐨勬彃浠跺紡鏈哄櫒浜恒€?
[English](./README.md) | [绠€浣撲腑鏂嘳(./README.zh-CN.md)

> 鏈」鐩苟闈炵敱 OpenCode 瀹樻柟鍥㈤槦寮€鍙戯紝涔熶笉闅跺睘浜?OpenCode 瀹樻柟銆?
## 椤圭洰璇存槑

`opencode-tbot` 鍏佽浣犵洿鎺ュ湪 Telegram 涓拰 OpenCode 浜や簰銆?
- 鏂囨湰娑堟伅浼氳杞彂鍒板綋鍓?OpenCode 浼氳瘽銆?- Telegram 鍥剧墖浼氫綔涓?OpenCode 鏂囦欢鐗囨涓婁紶锛屽浘鐗囪鏄庝細浣滀负 prompt 鏂囨湰涓€璧峰彂閫併€?- Telegram 璇煶娑堟伅鍙互鍏堢粡杩囧吋瀹?OpenRouter 鐨勮闊宠浆鍐欐湇鍔★紝鍐嶈繘鍏ユ甯哥殑 OpenCode 娴佺▼銆?- 姣忎釜鑱婂ぉ鐨勪細璇濈粦瀹氥€佹ā鍨嬮€夋嫨銆佷唬鐞嗛€夋嫨銆佹帹鐞嗘。浣嶅拰鐣岄潰璇█閮戒細鎸佷箙鍖栧埌 SQLite銆?
椤圭洰鐜板湪鍙繚鐣欐彃浠舵ā寮忥紝涓嶅啀鏀寔鐙珛杩愯妯″紡銆?
## 瀹夎

杩欓噷鏈変袱灞傞厤缃細

- 鍏ㄥ眬 OpenCode 鎻掍欢娉ㄥ唽锛歚~/.config/opencode/opencode.json`
- 褰撳墠椤圭洰鐨?Telegram 杩愯閰嶇疆锛氳 worktree 涓嬬殑 `tbot.config.json`

### 鏂规 A锛氳 OpenCode 鎴栦唬鐞嗚嚜鍔ㄥ畨瑁?
鏈€鐪佷簨鐨勬柟寮忔槸鎶?[INSTALL.md](./INSTALL.md) 閲岀殑瀹夎濂戠害浜ょ粰 OpenCode銆丆laude Code銆丆ursor 鎴栧叾浠栫紪鐮佷唬鐞嗐€?
涔熷彲浠ョ洿鎺ュ鍒朵笅闈㈣繖娈垫彁绀鸿瘝锛?
```text
Install the opencode-tbot plugin for OpenCode.

Do all of the following without removing existing unrelated configuration:
1. Open or create ~/.config/opencode/opencode.json
2. Ensure the config uses the singular "plugin" key
3. Append "opencode-tbot@latest" to the "plugin" array if it is not already present
4. In the current project, open or create tbot.config.json
5. Ask me for the Telegram bot token and write it to telegram.botToken if I provide it
6. If I do not provide the token, leave tbot.config.json ready for manual completion and do not block plugin registration
7. Preserve any existing plugins and any unrelated configuration keys
8. After editing, show me the exact changes and tell me to restart OpenCode
```

Windows 涓?`~` 琛ㄧず褰撳墠鐢ㄦ埛鐨勪富鐩綍銆?
### 鏂规 B锛氭墜鍔ㄥ畨瑁?
1. 缂栬緫 `~/.config/opencode/opencode.json`锛屾敞鍐屽叏灞€鎻掍欢锛?
```json
{
  "plugin": ["opencode-tbot@latest"]
}
```

濡傛灉璇ユ枃浠跺凡缁忓瓨鍦紝璇蜂繚鐣欏師鏈夐厤缃紝鍙湪 `plugin` 鏁扮粍涓ˉ鍏?`opencode-tbot@latest`锛屼笉瑕佹敼鎴?`plugins`銆?
2. 鍦ㄥ綋鍓嶉」鐩腑鍒涘缓鎴栨洿鏂?`tbot.config.json`锛?
```json
{
  "telegram": {
    "botToken": "your_telegram_bot_token",
    "allowedChatIds": []
  },
  "database": {
    "path": "./data/opencode-tbot.sqlite"
  },
  "openrouter": {
    "apiKey": "",
    "model": "openai/gpt-audio-mini",
    "timeoutMs": 30000,
    "transcriptionPrompt": ""
  },
  "logLevel": "info",
  "opencodeApiKey": ""
}
```

3. 閲嶅惎 OpenCode銆?
### 缁?LLM 浠ｇ悊鐨勫悎骞惰鍒?
- `~/.config/opencode/opencode.json` 涓嶅瓨鍦ㄦ椂瑕佸垱寤?- 蹇呴』浣跨敤 `plugin`锛屼笉瑕佷娇鐢?`plugins`
- 鍙拷鍔?`opencode-tbot@latest`锛屼笉鑳介噸澶嶏紝涔熶笉鑳藉垹鎺夊叾浠栨彃浠?- 鍙慨鏀瑰綋鍓?worktree 鐨?`tbot.config.json`
- 鍐欏叆 `telegram.botToken` 鏃跺繀椤讳繚鐣欏叾浠栭厤缃瓧娈?
## 鍖呭叆鍙?
鍖呮牴鍏ュ彛鍜?[src/plugin.ts](./src/plugin.ts) 閮戒細瀵煎悜鎻掍欢杩愯鏃躲€俙dist/index.js` 鏄?npm/OpenCode 榛樿鍏ュ彛锛宍dist/plugin.js` 淇濈暀涓烘樉寮忓瓙璺緞瀵煎嚭銆?
濡傛灉鏄湪鏈粨搴撻噷鍋氭湰鍦板紑鍙戯紝[.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) 浠嶇劧淇濈暀涓烘簮鐮佹ˉ鎺ユ枃浠躲€?
## 閰嶇疆

`tbot.config.json` 涓嚦灏戦渶瑕侊細

- `telegram.botToken`

閰嶇疆椤硅鏄庯細

| 閰嶇疆椤?| 蹇呭～ | 璇存槑 |
| --- | --- | --- |
| `telegram.botToken` | 鏄?| Telegram 鏈哄櫒浜?token銆傛彃浠跺惎鍔ㄦ椂鑻ョ己澶变笖缁堢鍙氦浜掞紝浼氭彁绀鸿緭鍏ュ苟鍐欏洖 `tbot.config.json`銆?|
| `telegram.allowedChatIds` | 鍚?| 鍏佽璁块棶鐨?Telegram Chat ID 鏁扮粍銆備负绌烘椂鍏佽浠绘剰鑱婂ぉ銆?|
| `opencodeApiKey` | 鍚?| 淇濈暀鐨勫吋瀹归厤缃」銆傛彃浠惰繍琛屾椂鏈韩浣跨敤瀹夸富娉ㄥ叆鐨?OpenCode SDK client銆?|
| `openrouter.apiKey` | 否 | OpenRouter API Key，仅在启用 Telegram 语音转写时需要。 |
| `openrouter.model` | 否 | OpenRouter 语音转写模型，默认 `openai/gpt-audio-mini`。 |
| `openrouter.timeoutMs` | 否 | 语音转写超时时间，默认 `30000`。 |
| `openrouter.transcriptionPrompt` | 否 | 附加到内置转写指令后的可选提示词。 |
| `logLevel` | 鍚?| 鏃ュ織绾у埆锛岄粯璁?`info`銆?|
| `database.path` | 鍚?| SQLite 鐘舵€佹枃浠惰矾寰勶紝榛樿 `./data/opencode-tbot.sqlite`锛岀浉瀵瑰綋鍓?OpenCode worktree 瑙ｆ瀽銆?|

鍏ㄥ眬瀹夎骞朵笉浠ｈ〃鍏ㄥ眬 Telegram 鍑瘉銆傛彃浠堕€氳繃 `~/.config/opencode/opencode.json` 鍏ㄥ眬娉ㄥ唽锛屼絾 `telegram.botToken` 浠嶇劧鎸夐」鐩粠鍚勮嚜 worktree 鐨?`tbot.config.json` 璇诲彇锛岄櫎闈炰綘鎵嬪姩鍦ㄥ涓」鐩噷澶嶇敤鍚屼竴涓?token銆?
璇煶璇存槑锛?
- 璇煶杈撳叆鏄彲閫夎兘鍔涳紝涓嶉厤缃?OpenRouter 语音转写 鏃舵枃鏈拰鍥剧墖鍔熻兘浠嶇劧姝ｅ父銆?- 褰撳墠鍙鐞?Telegram `voice` 娑堟伅锛屼笉澶勭悊 `audio`銆乣document` 鎴?`video_note`銆?- 璇煶鏂囦欢鍙湪鍐呭瓨涓鐞嗭紝涓嶄細钀界洏淇濆瓨銆?
鍥剧墖璇存槑锛?
- 鏀寔 Telegram `photo` 娑堟伅銆?- 涔熸敮鎸佷互 `document` 褰㈠紡鍙戦€佺殑鍥剧墖鏂囦欢銆?- 鍥剧墖鍦ㄥ唴瀛樹腑涓嬭浇鍚庝細杞垚 OpenCode 鏂囦欢鐗囨涓婁紶銆?
## 鍔熻兘

- 鍦?Telegram 涓悜 OpenCode 鍙戦€佹枃鏈?prompt
- 鎶?Telegram 鍥剧墖杩炲悓鍙€?caption 涓€璧疯浆鍙戠粰 OpenCode
- 閫氳繃鍏煎 OpenRouter 鐨?OpenRouter 语音转写 鏈嶅姟澶勭悊 Telegram 璇煶娑堟伅
- 鍦ㄨ亰澶╀腑鍒涘缓鍜屽垏鎹?OpenCode 浼氳瘽
- 鏌ョ湅骞跺垏鎹唬鐞?- 鏌ョ湅骞跺垏鎹㈡ā鍨嬩笌鎺ㄧ悊妗ｄ綅
- 閫氳繃 `/status` 鏌ョ湅鍋ュ悍鐘舵€併€佽矾寰勩€丩SP 鍜?MCP 鐘舵€?- 鏀寔鑻辨枃鍜岀畝浣撲腑鏂囩晫闈?- 鏀寔 Telegram Chat ID 鐧藉悕鍗?- 浣跨敤 SQLite 鎸佷箙鍖栬亰澶╃姸鎬?
## 鍛戒护

- `/start` 鏄剧ず娆㈣繋淇℃伅鍜屽揩閫熷紑濮嬫彁绀?- `/help` 鏄剧ず瀹屾暣鍛戒护璇存槑鍜岀ず渚?- `/status` 鏌ョ湅 OpenCode 鍋ュ悍鐘舵€併€佽矾寰勩€丩SP 鍜?MCP 淇℃伅
- `/new [title]` 鍒涘缓鏂扮殑 OpenCode 浼氳瘽
- `/agents` 鎴?`/agent` 鏌ョ湅骞跺垏鎹唬鐞?- `/sessions` 鏌ョ湅骞跺垏鎹細璇?- `/cancel` 鍙栨秷浼氳瘽閲嶅懡鍚嶆垨涓褰撳墠璇锋眰
- `/model` 鎴?`/models` 鏌ョ湅骞跺垏鎹㈡ā鍨?- `/language` 鍒囨崲鏈哄櫒浜烘樉绀鸿瑷€

浠讳綍闈炲懡浠ゆ枃鏈兘浼氳褰撲綔 prompt 鍙戦€佸埌 OpenCode銆傞厤缃?OpenRouter 语音转写 鍚庯紝Telegram `voice` 娑堟伅浼氬厛杞啓鍐嶈繘鍏ュ悓涓€鏉?prompt 娴佺▼銆傚浘鐗囦細浣滀负 OpenCode 鏂囦欢鐗囨鍙戦€併€?
## 寮€鍙?
鏋勫缓鎻掍欢锛?
```bash
pnpm build
```

绫诲瀷妫€鏌ワ細

```bash
pnpm typecheck
```

杩愯娴嬭瘯锛?
```bash
pnpm test
```

渚濊禆瀹夊叏妫€鏌ワ細

```bash
pnpm audit
```

## 閮ㄧ讲

閮ㄧ讲璇存槑瑙?[docs/deployment.md](./docs/deployment.md)銆?


