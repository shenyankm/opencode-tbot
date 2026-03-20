# opencode-tbot

A Telegram plugin for driving [OpenCode](https://opencode.ai) from chat.

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> This project is not built by the OpenCode team and is not affiliated with them.

## Overview

`opencode-tbot` lets you operate OpenCode from Telegram.

- Text messages are forwarded to the active OpenCode session.
- Telegram photos and image documents are uploaded as OpenCode file parts.
- Telegram voice messages are explicitly rejected with a localized reply.
- Permission requests raised by OpenCode can be approved or rejected from Telegram inline buttons.
- Session completion and error events can be reported back to the bound Telegram chat.
- Chat bindings are stored in a JSON state file.

## Requirements

- A running OpenCode host process that loads the plugin.
- A Telegram bot token.
- Node.js `>=22.12.0` for the CLI and local development workflow.

## Install

Recommended install:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- install
```

The installer registers the plugin globally and writes the default runtime config.

Check the installed CLI version:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --version
```

Update the registered npm plugin spec in OpenCode:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- update
```

### CLI Options

`install` supports:

- `--bot-token <token>` set the Telegram bot token non-interactively
- `--telegram-api-root <url>` override the Telegram Bot API root
- `--plugin-spec <spec>` register a custom npm plugin spec
- `--skip-register` only rewrite plugin config without touching OpenCode plugin registration
- `--home-dir <path>` use a custom home directory

`update` supports:

- `--plugin-spec <spec>`
- `--home-dir <path>`

## Configuration

Runtime config is loaded in this order:

1. Global defaults from `~/.config/opencode/opencode-tbot/config.json`
2. Project overrides from `<worktree>/tbot.config.json`

Project config is merged on top of the global config. `telegram` and `state` are deep-merged by section.

Legacy `openrouter` voice-transcription settings are ignored at runtime. When the installer rewrites the config, it removes them.

The repository also includes [tbot.config.example.json](./tbot.config.example.json) as a minimal reference.

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
| `logLevel` | No | `info` | Plugin log level. Logs are emitted through `client.app.log()`. |

### Notes

- `state.path` is resolved relative to the current OpenCode worktree.
- If `telegram.allowedChatIds` is left empty, the bot accepts messages from any chat. Restrict it in production.
- Permission approvals and session notifications are handled through plugin hooks.
- `/language` currently supports English, Simplified Chinese, and Japanese.

## Quick Start

1. Install the plugin with `npm exec --package opencode-tbot@latest opencode-tbot -- install`.
2. Set `telegram.allowedChatIds` in `tbot.config.json` if you want to restrict the bot to specific chats.
3. Start OpenCode in the target worktree so the plugin runtime can load.
4. In Telegram, run `/status` to verify the connection.
5. Run `/new [title]` or send a text message directly to start working.

## Commands

- `/start` show a short welcome message and quick-start steps
- `/status` show aggregated OpenCode health, path, plugin, LSP, and MCP status
- `/new [title]` create a new OpenCode session
- `/agents` or `/agent` list available agents and switch the active one
- `/sessions` list available sessions and switch the active one
- `/cancel` cancel session rename or abort the running request for the current session
- `/model` or `/models` list available models and switch the active one
- `/language` switch the bot display language

Message handling:

- Non-command text is treated as a prompt and sent to OpenCode.
- Telegram photos and image documents are forwarded as OpenCode file parts.
- Telegram voice messages are not supported and receive a localized rejection reply.

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
