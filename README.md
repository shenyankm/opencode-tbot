# opencode-tbot

A Telegram plugin for driving [OpenCode](https://opencode.ai) from chat.

[English](./README.md) | [简体中文](./README.zh-CN.md)

> This project is not built by the OpenCode team and is not affiliated with them.

## What It Does

`opencode-tbot` lets you operate OpenCode from Telegram.

- Text messages are forwarded to the active OpenCode session.
- Telegram images are uploaded as OpenCode file parts.
- Telegram voice messages can be transcribed through OpenRouter before entering the normal prompt flow.
- Permission requests raised by OpenCode can be approved or rejected directly from Telegram inline buttons.
- Session completion and error events can be reported back to the bound Telegram chat.
- Chat state is stored in a JSON state file that works in both Node and Bun runtimes.

## Install

Run:

```bash
npx opencode-tbot@latest install
```

The installer registers the plugin globally and writes the default runtime config.

## Configuration

The runtime config is loaded in this order:

1. global defaults from `~/.config/opencode/opencode-tbot/config.json`
2. project overrides from `<worktree>/tbot.config.json`

Project config is merged on top of the global config. `telegram`, `state`, and `openrouter` are deep-merged by section.

### Example `tbot.config.json`

```json
{
  "telegram": {
    "botToken": "your_telegram_bot_token",
    "allowedChatIds": [123456789],
    "apiRoot": "https://api.telegram.org"
  },
  "state": {
    "path": "./data/opencode-tbot.state.json"
  },
  "openrouter": {
    "apiKey": "your_openrouter_api_key",
    "model": "openai/gpt-audio-mini",
    "timeoutMs": 30000,
    "transcriptionPrompt": ""
  },
  "logLevel": "info"
}
```

### Fields

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `telegram.botToken` | Yes | - | Telegram bot token. Normally written by the installer into the global plugin config. |
| `telegram.allowedChatIds` | No | `[]` | Allowed Telegram chat IDs. If empty, the bot accepts messages from any chat. |
| `telegram.apiRoot` | No | `https://api.telegram.org` | Telegram Bot API base URL. Useful for tests or self-hosted gateways. |
| `state.path` | No | `./data/opencode-tbot.state.json` | JSON state file path, resolved relative to the current OpenCode worktree. |
| `openrouter.apiKey` | No | `""` | OpenRouter API key. Required only when voice transcription is enabled. |
| `openrouter.model` | No | `openai/gpt-audio-mini` | OpenRouter model for voice transcription. |
| `openrouter.timeoutMs` | No | `30000` | Voice transcription timeout in milliseconds. |
| `openrouter.transcriptionPrompt` | No | `""` | Optional extra instruction appended to the transcription prompt. |
| `logLevel` | No | `info` | Plugin log level. Logs are emitted through `client.app.log()`. |

## Deployment

There are two configuration layers:

- global plugin registration in `~/.config/opencode/opencode.json`
- plugin runtime defaults in `~/.config/opencode/opencode-tbot/config.json`

Optional project overrides can be added in:

- `<worktree>/tbot.config.json`

Use the installer as the primary path for end users:

```bash
npx opencode-tbot@latest install
```

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
- `openrouter.apiKey`
- `openrouter.model`
- `openrouter.timeoutMs`
- `openrouter.transcriptionPrompt`
- `logLevel`

Notes:

- `state.path` defaults to `./data/opencode-tbot.state.json` and is resolved relative to the current OpenCode worktree.
- Logs are emitted through `client.app.log()`.
- Permission approvals and session notifications are handled through plugin hooks.

## Commands

- `/start` show the welcome message and quick-start steps
- `/help` show the full command reference and examples
- `/status` show aggregated OpenCode health, path, LSP, and MCP status
- `/new [title]` create a new OpenCode session
- `/agents` or `/agent` list available agents and switch the active one
- `/sessions` list available sessions and switch the active one
- `/cancel` cancel session rename or abort the running request for the current session
- `/model` or `/models` list available models and switch the active one
- `/language` switch the bot display language

Any non-command text message is treated as a prompt and sent to OpenCode. Telegram `voice` messages follow the same prompt flow after transcription when OpenRouter is configured. Telegram images are forwarded as OpenCode file parts.

## Development

Build the plugin bundle:

```bash
pnpm build
```

Type-check:

```bash
pnpm typecheck
```

Run tests:

```bash
pnpm test
```

For local source-based loading in this repository, OpenCode can use [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts), which re-exports `src/plugin.ts`.

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode host process that loads the plugin.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.
