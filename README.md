# opencode-tbot

A Telegram bot plugin for driving [OpenCode](https://opencode.ai) from chat.

[English](./README.md) | [简体中文](./README.zh-CN.md)

> This project is not built by the OpenCode team and is not affiliated with them.

## What It Is

`opencode-tbot` lets you talk to OpenCode through Telegram.

- Text messages are forwarded to the active OpenCode session.
- Telegram images are uploaded as OpenCode file parts, with the caption used as prompt text when present.
- Telegram voice messages can be transcribed through OpenRouter voice transcription before entering the normal prompt flow.
- Per-chat state is stored in SQLite, including the bound session, selected agent, selected model, reasoning variant, and preferred UI language.

This repository now runs only as an OpenCode plugin. There is no standalone bot process anymore.

## Installation

Follow these steps to register the plugin globally and configure the current OpenCode worktree.

### Requirements

- OpenCode must be installed and able to load plugins.
- Node.js 22.12.0 or newer is required for local builds and development.
- You need a Telegram bot token from BotFather.

### Configuration Layers

There are two configuration surfaces:

- global plugin registration in `~/.config/opencode/opencode.json`
- per-worktree Telegram runtime configuration in `tbot.config.json`

Windows note: `~` resolves to your user home directory.

### Manual Setup

1. Open or create `~/.config/opencode/opencode.json`.
2. Ensure the config uses the singular `plugin` key, not `plugins`.
3. Append `opencode-tbot@latest` to the `plugin` array if it is not already present.
4. In the OpenCode worktree where the bot should run, create or update `tbot.config.json`.
5. Start from `tbot.config.example.json` if you want a template.
6. Set `telegram.botToken`, then adjust optional fields as needed.
7. Restart OpenCode from the same worktree that contains `tbot.config.json`.
8. Send `/start` or `/status` to verify the plugin.

If `telegram.botToken` is already configured, the bot starts immediately after OpenCode reloads the plugin. If it is missing, interactive startup will prompt for the token and write it back to `tbot.config.json`. Non-interactive startup fails fast with a configuration error.

If you want an agent to perform the setup, use the contract in [INSTALL.md](./INSTALL.md).

### Example `tbot.config.json`

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

Global registration does not make Telegram credentials global. Each worktree reads its own `tbot.config.json` unless you intentionally reuse the same token across projects.

## Package Entry

The package root entry and [src/plugin.ts](./src/plugin.ts) both resolve to the plugin runtime. `dist/index.js` is the npm/OpenCode package entry, and `dist/plugin.js` remains the explicit subpath export.

For local development inside this repository, [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) re-exports `src/plugin.ts` so OpenCode can load the source tree directly.

## Configuration

`tbot.config.json` is the primary runtime config file. The legacy filename `opencode-tbot.config.json` is still accepted for backward compatibility.

Required field:

- `telegram.botToken`

Optional fields:

- `telegram.allowedChatIds`
- `database.path`
- `openrouter.apiKey`
- `openrouter.model`
- `openrouter.timeoutMs`
- `openrouter.transcriptionPrompt`
- `logLevel`
- `opencodeApiKey`

Configuration fields:

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `telegram.botToken` | Yes | - | Telegram bot token. If missing during interactive plugin startup, the plugin prompts and saves it to `tbot.config.json`. |
| `telegram.allowedChatIds` | No | `[]` | Array of allowed Telegram chat IDs. If empty, the bot accepts messages from any chat. |
| `database.path` | No | `./data/opencode-tbot.sqlite` | SQLite file path for chat state. The path is resolved relative to the current OpenCode worktree. |
| `openrouter.apiKey` | No | `""` | OpenRouter API key. Required only for Telegram voice transcription. |
| `openrouter.model` | No | `openai/gpt-audio-mini` | OpenRouter model used for audio transcription. |
| `openrouter.timeoutMs` | No | `30000` | Timeout for voice transcription requests in milliseconds. |
| `openrouter.transcriptionPrompt` | No | `""` | Optional extra instructions appended to the built-in transcription prompt. |
| `logLevel` | No | `info` | Logger level used by the plugin runtime. |
| `opencodeApiKey` | No | `""` | Compatibility field retained in plugin config. The runtime itself uses the injected OpenCode SDK client. |

Global installation does not imply global Telegram credentials. The plugin is registered once through `~/.config/opencode/opencode.json`, but `telegram.botToken` is still read from each worktree's `tbot.config.json` unless you manually reuse the same token across projects.

Voice transcription notes:

- Voice input is optional. If OpenRouter voice transcription is not configured, text and image prompts still work normally.
- v1 only handles Telegram `voice` messages, not `audio`, `document`, or `video_note`.
- Voice files are downloaded in memory and are not persisted locally.

Image upload notes:

- Telegram `photo` messages are supported.
- Telegram `document` messages are supported when the document is an image.
- Images are downloaded in memory and forwarded to OpenCode as file parts.

## Features

- Send plain text prompts to OpenCode from Telegram
- Send Telegram images to OpenCode, with optional caption text
- Send Telegram voice messages through OpenRouter voice transcription
- Create and switch OpenCode sessions in chat
- View and switch agents
- View and switch models and reasoning levels
- Inspect health, path, LSP status, and MCP status through `/status`
- Use English or Simplified Chinese UI
- Restrict access with an optional Telegram chat allowlist
- Persist chat bindings locally in SQLite

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

Any non-command text message is treated as a prompt and sent to OpenCode. If OpenRouter voice transcription is configured, Telegram `voice` messages are transcribed and sent through the same prompt path. Telegram image uploads are forwarded as OpenCode file parts.

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

Run a dependency audit:

```bash
pnpm audit
```

## Deployment

Supported deployment modes:

- Recommended npm installation: register `opencode-tbot@latest` globally in OpenCode and keep Telegram runtime config in each worktree's `tbot.config.json`.
- Agent-driven installation: let OpenCode, Claude Code, Cursor, or another agent apply the same setup using the prompt in [INSTALL.md](./INSTALL.md).
- Local development bridge: use [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) in this repository to re-export `src/plugin.ts`.
- Unpublished external project fallback: build `dist` and create a bridge file that re-exports `dist/plugin.js`.

The full deployment notes and tradeoffs are documented in [docs/deployment.md](./docs/deployment.md).

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode host process that loads the plugin.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.

### Why is Node.js 22 recommended?

The project uses modern Node APIs, including `node:sqlite`, so Node.js 22 or newer is the safe baseline.
