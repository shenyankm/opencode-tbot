# opencode-tbot

A Telegram client for driving an [OpenCode](https://opencode.ai) server from chat.

[English](./README.md) | [简体中文](./README.zh-CN.md)

> This project is not built by the OpenCode team and is not affiliated with them.

---

## What It Is

`opencode-tbot` lets you talk to OpenCode through Telegram. Send a normal text message to the bot, and it forwards that prompt to the current OpenCode session and returns the result back to the same chat.

If you configure an OpenAI-compatible speech-to-text endpoint, the bot can also accept Telegram voice messages, transcribe them, and forward the transcript into the same OpenCode flow.

The bot can also accept Telegram images. It downloads the image from Telegram, converts it into an OpenCode file part, and forwards it together with the optional caption text.

The bot stores per-chat state in SQLite, including the active session, project binding, selected agent, selected model, selected reasoning variant, and preferred UI language.

## Installation

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Configuration

Set at least the following values in `.env`:

- `TELEGRAM_BOT_TOKEN`
- `OPENCODE_BASE_URL`

Environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token. |
| `TELEGRAM_ALLOWED_CHAT_IDS` | No | Comma-separated list of allowed Telegram chat IDs. If empty, the bot accepts messages from any chat. |
| `OPENCODE_BASE_URL` | Yes | OpenCode server URL, for example `http://127.0.0.1:4096`. |
| `OPENCODE_API_KEY` | No | Optional API key passed to the OpenCode client layer. |
| `STT_BASE_URL` | No | Base URL for an OpenAI-compatible speech-to-text API. Required only if you want Telegram voice transcription. |
| `STT_API_KEY` | No | Optional API key for the speech-to-text service. |
| `STT_MODEL` | No | Speech-to-text model name. Required only if you want Telegram voice transcription. |
| `STT_TIMEOUT_MS` | No | Timeout for speech-to-text requests in milliseconds. Default: `30000`. |
| `STT_LANGUAGE` | No | Optional default language hint passed to the speech-to-text API. |
| `STT_PROMPT` | No | Optional prompt passed to the speech-to-text API to bias transcription behavior. |
| `LOG_LEVEL` | No | Logger level. Default: `info`. |
| `BOT_STATE_DB_PATH` | No | SQLite file path for chat state. Default: `./data/opencode-tbot.sqlite`. |

Voice transcription notes:

- Voice input is optional. If STT is not configured, text prompts still work normally.
- v1 only handles Telegram `voice` messages, not `audio`, `document`, or `video_note`.
- The bot downloads the Telegram voice file in memory, sends it to the configured STT endpoint, and does not persist the audio locally.

Image upload notes:

- Telegram `photo` messages are supported.
- Telegram `document` messages are also supported if the document is an image.
- Images are downloaded in memory and forwarded to OpenCode as file parts. The Telegram bot token is not forwarded to OpenCode.
- If a caption is present, it is sent as the prompt text alongside the image.

## Running

Make sure your OpenCode server is already running, then start the bot:

```bash
pnpm dev
```

For a compiled run:

```bash
pnpm build
pnpm start
```

## Features

- Send plain text prompts to OpenCode from Telegram
- Send Telegram images to OpenCode, with optional caption text
- Send Telegram voice messages through an OpenAI-compatible STT service and continue with the normal OpenCode prompt flow
- Create and switch OpenCode sessions in chat
- View and switch agents
- View and switch models and reasoning levels
- Inspect health, path, LSP status, and MCP status
- Use English or Simplified Chinese UI
- Restrict access with an optional Telegram chat allowlist
- Persist chat bindings locally in SQLite

## Commands

- `/start` show a short bot overview
- `/health` check OpenCode server health
- `/path` show OpenCode paths and current working directory
- `/lsp` show LSP server status for the current project
- `/mcp` show MCP server status for the current project
- `/new [title]` create a new OpenCode session
- `/agents` or `/agent` list available agents and switch the active one
- `/sessions` list available sessions and switch the active one
- `/abort` abort the running request for the current session
- `/model` or `/models` list available models and switch the active one
- `/language` switch the bot display language

Any non-command text message is treated as a prompt and sent to OpenCode. If STT is configured, Telegram `voice` messages are transcribed and then sent through the same prompt path. Telegram image uploads are forwarded as OpenCode file parts, and their captions are used as prompt text when present.

## Development

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

## FAQ

### Do I need a running OpenCode server?

Yes. This repository is a Telegram client layer, not a replacement for the OpenCode server itself.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.

### Why is Node.js 22 recommended?

The project uses modern Node APIs, including `node:sqlite`, so Node.js 22 or newer is the safe baseline.
