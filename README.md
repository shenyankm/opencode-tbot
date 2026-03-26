# opencode-tbot

A Telegram plugin for driving [OpenCode](https://opencode.ai) from chat.

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> This project is not built by the OpenCode team and is not affiliated with them.

## Overview

`opencode-tbot` lets you operate OpenCode from Telegram with one active binding per chat.

- Plain text messages are forwarded to the current OpenCode session.
- Telegram photos and image documents are uploaded as OpenCode file parts.
- Image turns run in a temporary forked session, so later text-only prompts do not inherit image context.
- Permission requests raised by OpenCode can be approved or rejected from Telegram inline buttons.
- Session error events can be reported back to the bound Telegram chat.
- Voice messages are explicitly rejected with a localized reply.
- Chat bindings, language selection, and model or agent preferences are stored in a JSON state file.

## Requirements

- A running OpenCode host process that loads the plugin.
- A Telegram bot token.
- Node.js `>=22.12.0` for the CLI and local development workflow.
- `pnpm` for repository development.

## Install, Update, And Uninstall

Recommended install:

```bash
npm exec -- opencode-tbot@latest
```

The installer:

- prompts for the Telegram bot token when running interactively
- validates the Telegram bot token with `getMe` before writing any config files
- writes or updates `~/.config/opencode/opencode.json` so `plugin` contains `opencode-tbot`
- writes or merges `~/.config/opencode/opencode-tbot/config.json`
- creates missing parent directories automatically
- prints a minimal success message on completion

`install` is the default command. For non-interactive runs, pass the token explicitly:

```bash
npm exec -- opencode-tbot@latest --bot-token <token>
```

Refresh the OpenCode plugin registration without changing the existing plugin config:

```bash
npm exec -- opencode-tbot@latest update
```

Remove the OpenCode plugin registration and keep the existing plugin config file:

```bash
npm exec -- opencode-tbot@latest uninstall
```

Print the CLI version:

```bash
npm exec -- opencode-tbot@latest --version
```

Show help:

```bash
npm exec -- opencode-tbot@latest --help
```

Notes:

- `install` only writes config after the Telegram token passes remote validation. If validation fails, no new config is written.
- `install` updates both `opencode.json` and the global plugin config file.
- `update` only refreshes `opencode.json` and leaves the existing plugin config contents untouched.
- `uninstall` removes `opencode-tbot` from `opencode.json` and keeps `~/.config/opencode/opencode-tbot/config.json` in place.
- OpenCode installs npm plugins automatically at startup from `opencode.json` and caches them under `~/.cache/opencode/node_modules/`, so `npm install -g opencode-tbot` is optional and not required for normal usage.
- Existing `~/.config/opencode/package.json`, `bun.lock`, `.gitignore`, or `node_modules` may belong to OpenCode itself. The installer does not delete or migrate them.
- The only supported conflict check is a same-name local file plugin under `~/.config/opencode/plugins/opencode-tbot.*`. If one exists, the installer stops and asks you to remove or rename it before enabling the npm plugin.

### CLI Options

Common options:

- `--help`
- `--version`

`install` supports:

- `--bot-token <token>` set the Telegram bot token non-interactively
- `--telegram-api-root <url>` override the Telegram Bot API root
- `--home-dir <path>` use a custom home directory

`update` supports:

- `--home-dir <path>`

`uninstall` supports:

- `--home-dir <path>`

## Configuration

Runtime config is loaded from:

- `~/.config/opencode/opencode-tbot/config.json`

Programmatic callers may also inject config explicitly. Injected values override file values.

OpenCode loads the npm plugin registration from:

- `~/.config/opencode/opencode.json`

This plugin does not read runtime settings from `.env`.

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
      "dir": "<home>/.local/share/opencode/log/plugins/opencode-tbot",
      "retention": {
        "maxFiles": 30,
        "maxTotalBytes": 314572800
      }
    }
  }
}
```

### Fields

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `telegram.botToken` | Yes | - | Telegram bot token. Normally written by the installer into the global plugin config after `getMe` validation succeeds. |
| `telegram.allowedChatIds` | No | `[]` | Allowed Telegram chat IDs. If empty, the bot accepts messages from any chat. |
| `telegram.apiRoot` | No | `https://api.telegram.org` | Telegram Bot API base URL. Useful for tests or self-hosted gateways. |
| `state.path` | No | `./data/opencode-tbot.state.json` | JSON state file path, resolved relative to the current OpenCode worktree. |
| `prompt.waitTimeoutMs` | No | `1800000` | Maximum total wait for one async prompt lifecycle. |
| `prompt.pollRequestTimeoutMs` | No | `15000` | Timeout for each individual recovery poll request to OpenCode. |
| `prompt.recoveryInactivityTimeoutMs` | No | `120000` | Recovery timeout that only applies when prompt progress stops advancing. |
| `logging.level` | No | `info` | Structured log level for host and file sinks. Unknown values normalize to `info`. |
| `logging.sinks.host` | No | `true` | Enable OpenCode host logging through `client.app.log(...)`. |
| `logging.sinks.file` | No | `true` | Enable plugin-owned JSONL file logs. |
| `logging.file.dir` | No | `<home>/.local/share/opencode/log/plugins/opencode-tbot` | Plugin JSONL log directory. Relative paths are resolved from the current OpenCode worktree. |
| `logging.file.retention.maxFiles` | No | `30` | Maximum number of retained plugin log files. |
| `logging.file.retention.maxTotalBytes` | No | `314572800` | Maximum total size of retained plugin log files. |

### Notes

- `state.path` is resolved relative to the current OpenCode worktree.
- Relative `logging.file.dir` values are also resolved from the current OpenCode worktree. If omitted, the default log directory is created under the user's home directory.
- Telegram prompt handling is async-first: the plugin submits `session.promptAsync()` and then recovers the reply from session messages and session status.
- If `telegram.allowedChatIds` is left empty, the bot accepts messages from any chat. Restrict it in production.
- `/language` updates both the bot display language and the localized Telegram command descriptions for that chat.
- File logs are metadata-only by default. Prompt bodies, attachment contents, raw URLs, and secrets are not written.

## Quick Start

1. Install the plugin with `npm exec -- opencode-tbot@latest`.
2. Set `telegram.allowedChatIds` in `~/.config/opencode/opencode-tbot/config.json` if you want to restrict the bot to specific chats.
3. Start OpenCode in the target worktree so the plugin runtime can load.
4. In Telegram, run `/status` to verify the connection.
5. Run `/new [title]`, or send a text or image message directly to start working.

## Commands

| Command | What it does |
| --- | --- |
| `/start` | Show a short welcome message and quick-start steps. |
| `/status` | Show aggregated OpenCode health, version, workspace paths, plugin list, LSP status, and MCP status. |
| `/new [title]` | Create a new OpenCode session in the current project. |
| `/agents` or `/agent` | List available agents and switch the active one. |
| `/sessions` | List available sessions, switch the active one, and offer rename actions. |
| `/cancel` | Cancel pending session rename input or abort the running request for the current session. |
| `/model` or `/models` | Show models exposed by OpenCode for connected providers, switch the active one, and choose a reasoning level when available. |
| `/language` | Switch the bot display language for the current chat and resync command descriptions. |

### Message Behavior

- Non-command text is treated as a prompt and sent to OpenCode.
- Telegram photos and image documents are forwarded as OpenCode file parts.
- Image attachments are processed in a temporary fork of the active session so later text-only prompts stay clean.
- Permission approvals are handled from Telegram inline buttons.
- `/cancel` aborts both the OpenCode session and the local Telegram wait state, so the next prompt can start immediately.
- Telegram voice messages are not supported and receive a localized rejection reply.

## Logging

- OpenCode host log directory: `<home>/.local/share/opencode/log`
- Default plugin log directory: `<home>/.local/share/opencode/log/plugins/opencode-tbot`
- File format: append-only JSONL, one structured event per line
- Common correlation fields: `runtimeId`, `operationId`, `correlationId`, `updateId`, `chatId`, `sessionId`, `projectId`
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

Run the full test suite:

```bash
pnpm test
```

Run the CLI test file:

```bash
pnpm exec tsx --test tests/cli.test.ts
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

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode host process that loads the plugin.

### Do I need to install `opencode-tbot` globally?

No. `npm exec -- opencode-tbot@latest` is the recommended path. A global install only installs the CLI; OpenCode still reads plugin registration from `opencode.json`.

### What happens if the Telegram token is invalid?

`install` fails before writing `opencode.json` or `~/.config/opencode/opencode-tbot/config.json`. If the runtime later becomes invalid, the plugin is disabled and OpenCode should continue to start without crashing.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.
