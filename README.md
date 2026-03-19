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

This repository runs as an OpenCode plugin. There is no standalone bot service.

## Installation

### Requirements

- OpenCode must be installed and able to load plugins.
- Node.js 22.12.0 or newer is required for local builds and development.
- You need a Telegram bot token from BotFather.

### Recommended Install Flow

Run:

```bash
npx opencode-tbot@latest install
```

The installer will:

1. register `opencode-tbot@latest` in `~/.config/opencode/opencode.json`
2. ask for your Telegram bot token
3. ask whether voice transcription should be enabled
4. ask for an OpenRouter API key if voice transcription is enabled
5. write plugin defaults to `~/.config/opencode/opencode-tbot/config.json`

Restart OpenCode after installation, then message the bot with `/start` or `/status`.

### Non-Interactive Install

For CI or scripted setup:

```bash
npx opencode-tbot@latest install \
  --bot-token <telegram-token> \
  --disable-voice
```

If voice transcription is enabled, `--openrouter-api-key` is required.

Useful flags:

- `--enable-voice`
- `--disable-voice`
- `--openrouter-api-key <key>`
- `--telegram-api-root <url>`
- `--skip-register`
- `--home-dir <path>`

`--skip-register` is mainly for tests or local packaging flows where plugin registration is handled separately.

## Configuration

The runtime config is loaded in this order:

1. global defaults from `~/.config/opencode/opencode-tbot/config.json`
2. project overrides from `<worktree>/tbot.config.json`
3. legacy project filename `<worktree>/opencode-tbot.config.json` if `tbot.config.json` is absent

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
| `database.path` | Legacy | - | Backward-compatible alias for `state.path`. No sqlite migration is performed. |
| `openrouter.apiKey` | No | `""` | OpenRouter API key. Required only when voice transcription is enabled. |
| `openrouter.model` | No | `openai/gpt-audio-mini` | OpenRouter model for voice transcription. |
| `openrouter.timeoutMs` | No | `30000` | Voice transcription timeout in milliseconds. |
| `openrouter.transcriptionPrompt` | No | `""` | Optional extra instruction appended to the transcription prompt. |
| `logLevel` | No | `info` | Plugin log level. Logs are emitted through `client.app.log()`. |

## Features

- Send text prompts to OpenCode from Telegram
- Send Telegram images to OpenCode with optional caption text
- Transcribe Telegram voice messages through OpenRouter
- Create and switch OpenCode sessions in chat
- View and switch agents
- View and switch models and reasoning levels
- Approve or reject OpenCode permission requests from Telegram
- Receive session error and idle notifications in Telegram
- Restrict access with an optional Telegram allowlist
- Persist chat bindings and pending actions in a JSON state file

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

## Local Development

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

## Deployment

Supported deployment modes:

- Recommended npm installation through `npx opencode-tbot@latest install`
- Non-interactive install for CI or scripted environments
- Local development bridge through `.opencode/plugins/opencode-tbot.ts`
- Unpublished external-project bridge that re-exports `dist/plugin.js`

Deployment details are documented in [docs/deployment.md](./docs/deployment.md).

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode host process that loads the plugin.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.

### Why is Node.js 22 recommended?

The project uses modern Node APIs for the CLI, tests, and local development. Runtime state storage is file-based and works in both Node and Bun-compatible plugin hosts.
