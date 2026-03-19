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

There are two configuration surfaces:

- global plugin registration in `~/.config/opencode/opencode.json`
- per-project Telegram runtime configuration in the current worktree `tbot.config.json`

### Option A: Let OpenCode or an agent install it

The quickest path is to give an LLM agent the install contract from [INSTALL.md](./INSTALL.md).

Copy this prompt into OpenCode, Claude Code, Cursor, or another coding agent:

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

Windows note: `~` resolves to your user home directory.

### Option B: Manual setup

1. Register the plugin globally in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-tbot@latest"]
}
```

If `opencode.json` already exists, keep the singular `plugin` key, preserve existing entries, and append `opencode-tbot@latest` only if it is missing.

2. Create or update `tbot.config.json` in the project where OpenCode runs:

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

3. Restart OpenCode from the same worktree that contains `tbot.config.json`.

4. Verify the plugin:

- If `telegram.botToken` is already configured, send `/start` or `/status` to the bot.
- If you skipped the token during install, add it to `tbot.config.json` first and then restart OpenCode.

### For LLM agents

Merge rules for automated installers:

- create `~/.config/opencode/opencode.json` if it does not exist
- use `plugin`, not `plugins`
- append `opencode-tbot@latest` without duplicating it
- preserve unrelated JSON keys and existing plugin entries
- create or update only the current worktree `tbot.config.json`
- preserve unrelated config keys when writing `telegram.botToken`

## Package Entry

The package root entry and [src/plugin.ts](./src/plugin.ts) both resolve to the plugin runtime. `dist/index.js` is the npm/OpenCode package entry, and `dist/plugin.js` remains the explicit subpath export.

For local development inside this repository, [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) still acts as a source bridge.

## Configuration

Required in `tbot.config.json`:

- `telegram.botToken`

The legacy filename `opencode-tbot.config.json` is still accepted for backward compatibility.

Configuration fields:

| Field | Required | Description |
| --- | --- | --- |
| `telegram.botToken` | Yes | Telegram bot token. If missing during interactive plugin startup, the plugin prompts and saves it to `tbot.config.json`. |
| `telegram.allowedChatIds` | No | Array of allowed Telegram chat IDs. If empty, the bot accepts messages from any chat. |
| `opencodeApiKey` | No | Optional compatibility setting retained in plugin config. The plugin runtime itself uses the injected OpenCode SDK client. |
| `openrouter.apiKey` | No | OpenRouter API key. Required only for Telegram voice transcription. |
| `openrouter.model` | No | OpenRouter model used for audio transcription. Default: `openai/gpt-audio-mini`. |
| `openrouter.timeoutMs` | No | Timeout for voice transcription requests in milliseconds. Default: `30000`. |
| `openrouter.transcriptionPrompt` | No | Optional extra instructions appended to the built-in transcription prompt. |
| `logLevel` | No | Logger level. Default: `info`. |
| `database.path` | No | SQLite file path for chat state. Default: `./data/opencode-tbot.sqlite`. Resolved relative to the current OpenCode worktree. |

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

Deployment details are in [docs/deployment.md](./docs/deployment.md).

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode host process that loads the plugin.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.

### Why is Node.js 22 recommended?

The project uses modern Node APIs, including `node:sqlite`, so Node.js 22 or newer is the safe baseline.
