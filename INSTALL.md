# Install `opencode-tbot`

## Recommended

Run:

```bash
npx opencode-tbot@latest install
```

The installer will:

1. update `~/.config/opencode/opencode.json`
2. ensure the `plugin` array contains `opencode-tbot@latest`
3. prompt for the Telegram bot token
4. ask whether voice transcription should be enabled
5. prompt for the OpenRouter API key when voice transcription is enabled
6. write plugin defaults to `~/.config/opencode/opencode-tbot/config.json`

Restart OpenCode after installation.

## Non-Interactive

Example:

```bash
npx opencode-tbot@latest install \
  --bot-token <telegram-token> \
  --disable-voice
```

If voice transcription is enabled:

```bash
npx opencode-tbot@latest install \
  --bot-token <telegram-token> \
  --enable-voice \
  --openrouter-api-key <openrouter-key>
```

Useful flags:

- `--telegram-api-root <url>`
- `--skip-register`
- `--home-dir <path>`

`--skip-register` only skips the OpenCode global registration step. The plugin config file is still written.

## Project Overrides

The installer writes global defaults to:

- `~/.config/opencode/opencode-tbot/config.json`

You can override them per worktree with:

- `<worktree>/tbot.config.json`
- legacy fallback: `<worktree>/opencode-tbot.config.json`

The runtime loads global defaults first, then deep-merges the project config on top.

Example project override:

```json
{
  "telegram": {
    "allowedChatIds": [123456789]
  },
  "state": {
    "path": "./data/opencode-tbot.state.json"
  },
  "logLevel": "info"
}
```

## Agent Prompt

If you want another coding agent to perform the install, give it this:

```text
Install opencode-tbot for OpenCode by running:
npx opencode-tbot@latest install

If the environment is non-interactive, use:
- --bot-token for the Telegram bot token
- --enable-voice or --disable-voice
- --openrouter-api-key when voice transcription is enabled

Do not remove unrelated existing configuration.
Preserve existing plugins in ~/.config/opencode/opencode.json.
Show me the final changes and tell me to restart OpenCode.
```
