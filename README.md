# opencode-tbot

A Telegram plugin for driving [OpenCode](https://opencode.ai) from chat.
Built on [grammY](https://grammy.dev) and `@opencode-ai/sdk`.

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> This project is not built by the OpenCode team and is not affiliated with them.

## Overview

`opencode-tbot` lets you operate OpenCode from Telegram with one active binding per chat.

- Plain text messages are forwarded to the current OpenCode session.
- Telegram photos and image documents are uploaded as OpenCode file parts.
- Permission requests raised by OpenCode can be approved or rejected from Telegram inline buttons.
- Session error events can be reported back to the bound Telegram chat.
- Chat bindings, language selection, and model or agent preferences are stored in a JSON state file.

## Requirements

- A running OpenCode host process that loads the plugin.
- A Telegram bot token.
- Node.js `>=22.12.0` for the CLI.

## Getting Telegram Credentials

- `botToken`: open Telegram, chat with `@BotFather`, run `/newbot`, and copy the token it returns.
- `userId` / `chatId`: open `@userinfobot` in Telegram and copy the numeric ID it returns. For a direct chat with your bot, you can use that value in `telegram.allowedChatIds`.

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
    "allowedChatIds": ["123456789"]
  },
  "tokens": {
    "showBreakdown": false
  }
}
```

### Fields

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `telegram.botToken` | Yes | - | Telegram bot token. Normally written by the installer into the global plugin config after `getMe` validation succeeds. |
| `telegram.allowedChatIds` | No | `[]` | Allowed Telegram chat IDs. If empty, the bot accepts messages from any chat. |
| `tokens.showBreakdown` | No | `false` | Global `/token` switch for showing a second footer line with `request input`, `output`, `reasoning`, `cache.read`, and `cache.write`. The first-line displayed total is always recalculated from those five metrics and is not stored in the worktree state file. |

## Quick Start

1. Install the plugin with `npm exec -- opencode-tbot@latest`.
2. Set `telegram.allowedChatIds` in `~/.config/opencode/opencode-tbot/config.json` if you want to restrict the bot to specific chats.
3. In Telegram, run `/status` to verify the connection.
4. Run `/new [title]`, or send a text or image message directly to start working.

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
| `/token` | Enable or disable the second footer line with the full token breakdown. This setting is global for the plugin. |
| `/language` | Switch the bot display language for the current chat and resync command descriptions. |

### Message Behavior

- Non-command text is treated as a prompt and sent to OpenCode.
- Telegram photos and image documents are forwarded as OpenCode file parts.
- Image attachments are processed in a temporary fork of the active session so later text-only prompts stay clean.
- Permission approvals are handled from Telegram inline buttons.
- `/cancel` aborts both the OpenCode session and the local Telegram wait state, so the next prompt can start immediately.
- Telegram voice message support was removed. Telegram voice uses OGG by default, and usable speech models would require transcoding. Given the added bundle size and maintenance cost, the feature was dropped, and voice messages now receive a localized rejection reply.

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode host process that loads the plugin.

### Do I need to install `opencode-tbot` globally?

No. `npm exec -- opencode-tbot@latest` is the recommended path. A global install only installs the CLI; OpenCode still reads plugin registration from `opencode.json`.

### What happens if the Telegram token is invalid?

`install` fails before writing `opencode.json` or `~/.config/opencode/opencode-tbot/config.json`. If the runtime later becomes invalid, the plugin is disabled and OpenCode should continue to start without crashing.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.
