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

## Deployment Notes

`opencode-tbot` is deployed as an OpenCode plugin package. There is no standalone service entry.

There are two configuration layers:

- global plugin registration in `~/.config/opencode/opencode.json`
- plugin runtime defaults in `~/.config/opencode/opencode-tbot/config.json`

Optional project overrides can be added in:

- `<worktree>/tbot.config.json`
- legacy fallback: `<worktree>/opencode-tbot.config.json`

Use the installer as the primary path for end users:

```bash
npx opencode-tbot@latest install
```

For non-interactive environments:

```bash
npx opencode-tbot@latest install \
  --bot-token <telegram-token> \
  --disable-voice
```

Use `--enable-voice --openrouter-api-key <key>` when voice transcription is required.

## Local Development Bridge

Use this mode when developing from source inside this repository.

1. Install dependencies with `pnpm install`.
2. Build with `pnpm build` when you need the bundle.
3. Create `tbot.config.json` if you want worktree-specific overrides.
4. Start OpenCode in this worktree.
5. OpenCode loads [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts), which re-exports [src/plugin.ts](./src/plugin.ts).

## Unpublished External Project Bridge

Use this only when another OpenCode project must load this repository directly instead of the published npm package.

1. Build the plugin bundle with `pnpm build`.
2. In the target OpenCode plugin directory, create a bridge file that re-exports `dist/plugin.js`.
3. Register that bridge with OpenCode.
4. Provide global defaults or project overrides as needed.

Example bridge:

```ts
export { default } from "../path/to/opencode-tbot/dist/plugin.js";
```

## Runtime Expectations

Required:

- `telegram.botToken`

Optional:

- `telegram.allowedChatIds`
- `telegram.apiRoot`
- `state.path`
- `database.path` as a legacy alias
- `openrouter.apiKey`
- `openrouter.model`
- `openrouter.timeoutMs`
- `openrouter.transcriptionPrompt`
- `logLevel`

Notes:

- `state.path` defaults to `./data/opencode-tbot.state.json` and is resolved relative to the current OpenCode worktree.
- `database.path` is only a backward-compatible alias; there is no automatic sqlite migration.
- Logs are emitted through `client.app.log()`.
- Permission approvals and session notifications are handled through plugin hooks.

## Operational Notes

- The Telegram runtime is singleton-guarded per worktree.
- Repeated initialization in the same worktree reuses the active runtime.
- If the plugin is initialized for a different worktree in the same process, the current runtime is disposed and rebuilt for the new worktree.
- State is persisted in a JSON file with atomic rewrite semantics instead of sqlite.
