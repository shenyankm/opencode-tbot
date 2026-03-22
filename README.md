# opencode-tbot

A Telegram plugin for driving [OpenCode](https://opencode.ai) from chat.

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> This project is not built by the OpenCode team and is not affiliated with them.

## Overview

`opencode-tbot` lets you operate OpenCode from Telegram.

- Text messages are forwarded to the active OpenCode session.
- Telegram photos and image documents are uploaded as OpenCode file parts.
- Image turns run in a temporary forked session, so later text-only prompts do not inherit image context.
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

The installer registers the plugin globally, writes the default runtime config, and prints both the config path and the default plugin log directory.

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

Runtime config is loaded from `~/.config/opencode/opencode-tbot/config.json`.

Legacy `<worktree>/tbot.config.json` files are ignored at runtime. If one is present, the plugin logs a warning so you can migrate its values into the global config.

Legacy `openrouter` voice-transcription settings are ignored at runtime. When the installer rewrites the config, it removes them.

### Example Global `config.json`

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
  "prompt": {
    "waitTimeoutMs": 1800000,
    "pollRequestTimeoutMs": 15000,
    "recoveryInactivityTimeoutMs": 120000
  },
  "logging": {
    "level": "info",
    "sinks": {
      "host": true,
      "file": true
    },
    "file": {
      "dir": "C:/Users/your-user/.local/share/opencode/log/plugins/opencode-tbot",
      "retention": {
        "maxFiles": 30,
        "maxTotalBytes": 314572800
      }
    }
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
| `prompt.waitTimeoutMs` | No | `1800000` | Maximum total wait for one async prompt lifecycle before the plugin stops waiting for OpenCode recovery. |
| `prompt.pollRequestTimeoutMs` | No | `15000` | Timeout for each individual recovery poll request to OpenCode. |
| `prompt.recoveryInactivityTimeoutMs` | No | `120000` | Recovery timeout that only applies when prompt progress stops advancing. |
| `logging.level` | No | `info` | Structured log level for both host and file sinks. |
| `logging.sinks.host` | No | `true` | Enable OpenCode host logging through `client.app.log({ body: ... })`. |
| `logging.sinks.file` | No | `true` | Enable plugin-owned JSONL file logs. |
| `logging.file.dir` | No | `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot` | Plugin JSONL log directory. |
| `logging.file.retention.maxFiles` | No | `30` | Maximum number of retained plugin log files. |
| `logging.file.retention.maxTotalBytes` | No | `314572800` | Maximum total size of retained plugin log files. |
| `logLevel` | No | `info` | Legacy alias for `logging.level`. Still accepted for compatibility. |

### Notes

- `state.path` is resolved relative to the current OpenCode worktree.
- Telegram prompt handling is async-first: the plugin submits `session.promptAsync()` and then recovers the reply from session messages and session status.
- `prompt.waitTimeoutMs` is the total safety cap; `prompt.recoveryInactivityTimeoutMs` only applies when OpenCode stops making progress.
- If `telegram.allowedChatIds` is left empty, the bot accepts messages from any chat. Restrict it in production.
- Permission approvals and session notifications are handled through plugin hooks.
- `/language` currently supports English, Simplified Chinese, and Japanese.
- Plugin logs are dual-written by default: OpenCode host logs through `client.app.log({ body: ... })`, plus plugin JSONL files.
- OpenCode host logs live under `%USERPROFILE%/.local/share/opencode/log`.
- The default plugin JSONL log directory is `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot`.
- File logs are metadata-only by default. Prompt bodies, attachment contents, raw URLs, and secrets are not written.

## Logging

- Host log directory: `%USERPROFILE%/.local/share/opencode/log`
- Plugin log directory: `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot`
- File format: append-only JSONL, one structured event per line
- Correlation fields: `runtimeId`, `operationId`, `correlationId`, `updateId`, `chatId`, `sessionId`, `projectId`
- Common components: `runtime`, `telegram`, `opencode`, `prompt`, `plugin-event`, `storage`
- Retention: keep the newest 30 files and at most 300 MB by default

## Quick Start

1. Install the plugin with `npm exec --package opencode-tbot@latest opencode-tbot -- install`.
2. Set `telegram.allowedChatIds` in `~/.config/opencode/opencode-tbot/config.json` if you want to restrict the bot to specific chats.
3. Start OpenCode in the target worktree so the plugin runtime can load.
4. In Telegram, run `/status` to verify the connection.
5. Run `/new [title]` or send a text message directly to start working.

## Commands

- `/start` show a short welcome message and quick-start steps
- `/status` show aggregated OpenCode health, path, plugin, LSP, and MCP status
- `/new [title]` create a new OpenCode session
- `/agents` or `/agent` list available agents and switch the active one
- `/sessions` list available sessions and switch the active one
- `/cancel` cancel session rename or abort the running request for the current session, including the local Telegram wait state
- `/model` or `/models` list available models and switch the active one
- `/language` switch the bot display language

Message handling:

- Non-command text is treated as a prompt and sent to OpenCode.
- Telegram photos and image documents are forwarded as OpenCode file parts.
- Image attachments are processed in a temporary fork of the active session so later text-only prompts stay clean.
- `/cancel` aborts both the OpenCode session and the local Telegram wait, so the next prompt can start immediately.
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

OpenCode may load both the local `.opencode/plugins/` bridge and an installed npm plugin such as `opencode-tbot@latest` in the same process. This repository now guards against duplicate Telegram runners, but local development is still clearer if you keep only one loading path enabled at a time.

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode host process that loads the plugin.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.
