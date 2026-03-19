# Deployment

`opencode-tbot` is deployed as an OpenCode plugin package. There is no standalone service entry.

There are two configuration layers:

- global plugin registration in `~/.config/opencode/opencode.json`
- plugin runtime defaults in `~/.config/opencode/opencode-tbot/config.json`

Optional project overrides can be added in:

- `<worktree>/tbot.config.json`
- legacy fallback: `<worktree>/opencode-tbot.config.json`

## Recommended Installation

Use the installer:

```bash
npx opencode-tbot@latest install
```

This is the primary path for end users. It registers the plugin globally and writes the default runtime config.

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
5. OpenCode loads [.opencode/plugins/opencode-tbot.ts](../.opencode/plugins/opencode-tbot.ts), which re-exports [src/plugin.ts](../src/plugin.ts).

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
