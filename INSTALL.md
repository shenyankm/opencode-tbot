# Install `opencode-tbot`

## Option A: Let OpenCode Or Another LLM Agent Install It

Paste this into OpenCode, Claude Code, Cursor, or another coding agent:

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

Windows note: in OpenCode config paths, `~` means your home directory.

## Option B: Manual Setup

### 1. Register the plugin globally

Edit `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-tbot@latest"]
}
```

If the file already exists, merge this into the existing JSON and keep other plugins.

### 2. Configure the current worktree

Create or update `tbot.config.json` in the project where OpenCode will run:

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

`telegram.botToken` is required for the bot to start.

### 3. Restart OpenCode

Restart OpenCode after updating `opencode.json` or `tbot.config.json`.

### 4. Verify The Plugin

OpenCode must be running from the same worktree that contains the `tbot.config.json` you configured.

- If you already set `telegram.botToken`, message the bot with `/start` or `/status`.
- If you skipped the token during installation, add it to `tbot.config.json` first and then restart OpenCode.

## Notes

- Plugin registration is global through `~/.config/opencode/opencode.json`.
- Telegram bot credentials stay local to each project through that worktree's `tbot.config.json`.
- If `telegram.botToken` is still missing at runtime and startup is interactive, the plugin can prompt for it on first run and write the value back to `tbot.config.json`.
- The legacy filename `opencode-tbot.config.json` is still accepted for backward compatibility.
