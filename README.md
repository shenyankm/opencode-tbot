# opencode-tbot

A Telegram client for driving an [OpenCode](https://opencode.ai) server from chat.

[English](./README.md) | [简体中文](./README.zh-CN.md)

> This project is not built by the OpenCode team and is not affiliated with them.

---

## What It Is

`opencode-tbot` lets you talk to OpenCode through Telegram. Send a normal text message to the bot, and it forwards that prompt to the current OpenCode session and returns the result back to the same chat.

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
| `LOG_LEVEL` | No | Logger level. Default: `info`. |
| `BOT_STATE_DB_PATH` | No | SQLite file path for chat state. Default: `./data/opencode-tbot.sqlite`. |

## Running

Make sure your OpenCode server is already running, then start the bot:

```bash
pnpm dev
```

For a compiled run:

```bash
pnpm exec tsc -p tsconfig.json
pnpm start
```

## Features

- Send plain text prompts to OpenCode from Telegram
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

Any non-command text message is treated as a prompt and sent to OpenCode.

## Development

Type-check:

```bash
pnpm typecheck
```

Run tests:

```bash
pnpm test
```

## FAQ

### Do I need a running OpenCode server?

Yes. This repository is a Telegram client layer, not a replacement for the OpenCode server itself.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.

### Why is Node.js 22 recommended?

The project uses modern Node APIs, including `node:sqlite`, so Node.js 22 or newer is the safe baseline.
