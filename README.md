# opencode-tbot

A Telegram plugin for driving [OpenCode](https://opencode.ai) from chat.

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> This project is not built by the OpenCode team and is not affiliated with them.

## Overview

`opencode-tbot` lets you operate OpenCode from Telegram with a single bot binding per chat.

- Plain text messages are forwarded to the current OpenCode session.
- Telegram photos and image documents are uploaded as OpenCode file parts.
- Image turns run in a temporary forked session, so later text-only prompts do not inherit image context.
- Permission requests raised by OpenCode can be approved or rejected from Telegram inline buttons.
- Session error events can be reported back to the bound Telegram chat.
- Voice messages are explicitly rejected with a localized reply.
- Chat bindings and session selections are stored in a JSON state file.

## Requirements

- A running OpenCode host process that loads the plugin.
- A Telegram bot token.
- Node.js `>=22.12.0` for the CLI and local development workflow.
- `pnpm` for repository development.

## Install And Update

Recommended install:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- install
```

The installer:

- registers `opencode-tbot@latest` in the global OpenCode plugin list
- updates the resolved OpenCode config file
- writes or merges the global plugin runtime config
- prints the OpenCode config path, plugin config path, and default plugin log directory

If `~/.config/opencode/opencode.jsonc` already exists, the installer updates that file. Otherwise it uses `~/.config/opencode/opencode.json`.

Check the installed CLI version:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --version
```

Update the registered npm plugin spec in OpenCode without touching your bot token:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- update
```

`install` is the default command. For example, this also works for a non-interactive install:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --bot-token <token>
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

Runtime config is loaded only from:

- `~/.config/opencode/opencode-tbot/config.json`

OpenCode plugin registration is stored in the global OpenCode config:

- `~/.config/opencode/opencode.jsonc` when present
- otherwise `~/.config/opencode/opencode.json`

This plugin does not read runtime settings from `.env`. Use the global JSON config instead.

Legacy behavior:

- `<worktree>/tbot.config.json` is ignored at runtime. If one is present, the plugin logs a warning so you can migrate it.
- legacy `openrouter` voice-transcription settings are ignored at runtime and removed when the installer rewrites the config

### Example `config.json`

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
| `logging.level` | No | `info` | Structured log level for host and file sinks. Accepted values normalize to `debug`, `info`, `warn`, or `error`. |
| `logging.sinks.host` | No | `true` | Enable OpenCode host logging through `client.app.log({ body: ... })`. |
| `logging.sinks.file` | No | `true` | Enable plugin-owned JSONL file logs. |
| `logging.file.dir` | No | `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot` | Plugin JSONL log directory. Relative paths are resolved from the current OpenCode worktree. |
| `logging.file.retention.maxFiles` | No | `30` | Maximum number of retained plugin log files. |
| `logging.file.retention.maxTotalBytes` | No | `314572800` | Maximum total size of retained plugin log files. |
| `logLevel` | No | `info` | Legacy alias for `logging.level`. Still accepted for compatibility. |

### Notes

- `state.path` is resolved relative to the current OpenCode worktree.
- Relative `logging.file.dir` values are also resolved from the current worktree.
- Telegram prompt handling is async-first: the plugin submits `session.promptAsync()` and then recovers the reply from session messages and session status.
- If `telegram.allowedChatIds` is left empty, the bot accepts messages from any chat. Restrict it in production.
- Permission approvals and session error notifications are handled through plugin hooks.
- `/language` currently supports English, Simplified Chinese, and Japanese, and syncs localized Telegram command descriptions for that chat.
- File logs are metadata-only by default. Prompt bodies, attachment contents, raw URLs, and secrets are not written.

## Quick Start

1. Install the plugin with `npm exec --package opencode-tbot@latest opencode-tbot -- install`.
2. Set `telegram.allowedChatIds` in `~/.config/opencode/opencode-tbot/config.json` if you want to restrict the bot to specific chats.
3. Start OpenCode in the target worktree so the plugin runtime can load.
4. In Telegram, run `/status` to verify the connection.
5. Run `/new [title]` or send a text message directly to start working.

## Commands

| Command | What it does |
| --- | --- |
| `/start` | Show a short welcome message and quick-start steps. |
| `/status` | Show aggregated OpenCode health, version, workspace paths, plugin list, LSP status, and MCP status. |
| `/new [title]` | Create a new OpenCode session in the current project. |
| `/agents` or `/agent` | List available agents and switch the active one. |
| `/sessions` | List available sessions, switch the active one, and offer rename actions. |
| `/cancel` | Cancel pending session rename input or abort the running request for the current session. |
| `/model` or `/models` | List available models, switch the active one, and choose a reasoning level when available. |
| `/language` | Switch the bot display language for the current chat. |

### Message Behavior

- Non-command text is treated as a prompt and sent to OpenCode.
- Telegram photos and image documents are forwarded as OpenCode file parts.
- Image attachments are processed in a temporary fork of the active session so later text-only prompts stay clean.
- `/cancel` aborts both the OpenCode session and the local Telegram wait state, so the next prompt can start immediately.
- Telegram voice messages are not supported and receive a localized rejection reply.

## Logging

- Host log directory: `%USERPROFILE%/.local/share/opencode/log`
- Plugin log directory: `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot`
- File format: append-only JSONL, one structured event per line
- Correlation fields: `runtimeId`, `operationId`, `correlationId`, `updateId`, `chatId`, `sessionId`, `projectId`
- Common components: `runtime`, `telegram`, `opencode`, `prompt`, `plugin-event`, `storage`
- Default retention: newest 30 files and at most 300 MB total

## Development

Install dependencies:

```bash
pnpm install
```

Build the bundle:

```bash
pnpm build
```

Type-check:

```bash
pnpm typecheck
```

Run the normal test suite:

```bash
pnpm test
```

Run the integration path closest to CI:

```bash
npm install -g opencode-ai
OPENCODE_HOST_E2E=1 pnpm test
```

PowerShell:

```powershell
npm install -g opencode-ai
$env:OPENCODE_HOST_E2E="1"; pnpm test
```

Normal usage should rely on the globally installed npm plugin plus the global OpenCode config. This repository does not ship a default `.opencode/plugins` bridge.

If you need source-based local loading while developing in this repository, create `.opencode/plugins/opencode-tbot.ts` manually:

```ts
export { default } from "../../src/plugin.ts";
```

Keep only one loading path enabled at a time: either the manual local bridge or the globally installed `opencode-tbot@latest` plugin.

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode host process that loads the plugin.

### Why does OpenCode show the plugin as `file:///.../node_modules/...`?

That usually means a local project has `opencode-tbot` installed in its own `node_modules`. The CLI warns when it detects that layout. Remove the local package with `npm uninstall opencode-tbot` in that project and use the recommended `npm exec --package ...` install flow instead.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.
