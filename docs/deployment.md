# Deployment

`opencode-tbot` is deployed as an OpenCode plugin package. There is no standalone service entry anymore.

There are two layers to deployment:

- global plugin registration in `~/.config/opencode/opencode.json`
- per-worktree Telegram runtime configuration in `tbot.config.json`

## Recommended npm Installation

This is the primary installation mode for normal users.

1. Open or create `~/.config/opencode/opencode.json`.
2. Ensure the singular `plugin` key includes `opencode-tbot@latest`.
3. In the target worktree, create or update `tbot.config.json`.
4. Set `telegram.botToken` and any optional runtime fields.
5. Restart OpenCode.
6. Verify the bot by sending `/start` or `/status` after OpenCode reloads the plugin.

Example global config:

```json
{
  "plugin": ["opencode-tbot@latest"]
}
```

The plugin package is installed globally through OpenCode config, but the Telegram bot token remains local to the project's `tbot.config.json`.

## Agent-Driven Installation

An OpenCode or LLM agent can perform the same setup by:

1. Creating or merging `~/.config/opencode/opencode.json`
2. Appending `opencode-tbot@latest` to `plugin`
3. Creating or updating the current worktree `tbot.config.json`
4. Asking the user for the Telegram bot token and writing it to `telegram.botToken`
5. Preserving unrelated config in both files

The concise agent prompt is documented in [INSTALL.md](../INSTALL.md).

## Local Development Bridge

Use this mode when developing or testing the plugin from source without the published npm package.

1. Install dependencies with `pnpm install`.
2. Create `tbot.config.json` from `tbot.config.example.json`.
3. Set `telegram.botToken` manually, or let the plugin prompt for it on first interactive startup.
4. Start OpenCode in this worktree.
5. OpenCode loads [.opencode/plugins/opencode-tbot.ts](../.opencode/plugins/opencode-tbot.ts), which re-exports [src/plugin.ts](../src/plugin.ts).

The plugin resolves `database.path` relative to the current OpenCode worktree, so the default SQLite database lives under `./data/opencode-tbot.sqlite`.

## Unpublished External Project Fallback

Use this only when the npm package is unavailable and another OpenCode project must load the built artifact directly.

1. Build the plugin bundle with `pnpm build`.
2. In the target OpenCode project, create or update a plugin file that re-exports `dist/plugin.js`.
3. Add the required configuration to the target worktree's `tbot.config.json`.
4. Start OpenCode from the target worktree.

Example plugin bridge:

```ts
export { default } from "../path/to/opencode-tbot/dist/plugin.js";
```

## Configuration Expectations

Required:

- `telegram.botToken`

Optional:

- `telegram.allowedChatIds`
- `database.path`
- `logLevel`
- `opencodeApiKey`
- `openrouter.apiKey`
- `openrouter.model`
- `openrouter.timeoutMs`
- `openrouter.transcriptionPrompt`

If `telegram.botToken` is missing:

- interactive startup: the plugin prompts for the token and writes it to `<worktree>/tbot.config.json`
- non-interactive startup: the plugin exits with a configuration error and tells you to add the token manually

The legacy filename `opencode-tbot.config.json` is still accepted for backward compatibility.

## Operational Notes

- The plugin runtime is singleton-guarded per worktree. Repeated initialization in the same worktree reuses the active Telegram runner.
- If OpenCode initializes the plugin for a different worktree in the same process, the existing Telegram runtime is stopped and rebuilt against the new worktree.
- SQLite-backed chat state and pending actions remain local to the configured `database.path`.
