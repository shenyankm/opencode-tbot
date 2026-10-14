# opencode-tbot

A Telegram plugin for driving [OpenCode](https://opencode.ai) from chat.
Built on [grammY](https://grammy.dev), `@opencode/client`, and `@opencode/plugin`.

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

- An OpenCode V2 host compatible with `@opencode/client` and `@opencode/plugin` `2.0.29` that loads the plugin. OpenCode V1 is not supported.
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
- writes or updates `~/.config/opencode/opencode.json` so `plugins` contains `opencode-tbot`
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
- Existing V1 `plugin` entries are migrated to V2 `plugins`, including package-and-options tuples. Other plugin options are preserved. `install` and `update` reject conflicting options for duplicate packages before writing config.

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

Runtime logs are redacted JSON in the host console. File logs are stored in `~/.local/share/opencode/log/plugins/opencode-tbot/` by default. `logging.sinks.host` and `logging.sinks.file` control these outputs.

### Example `opencode.json`

The installer writes `"plugins": ["opencode-tbot"]`. Use the object form to override global file settings through plugin options. The Telegram token can remain in `config.json`.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-tbot",
      "options": {
        "telegram": {
          "allowedChatIds": ["123456789"]
        }
      }
    }
  ]
}
```

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
| `tokens.showBreakdown` | No | `false` | Legacy setting accepted for compatibility; a separate context message now shows only remaining percentage and capacity. |

## Quick Start

1. Install the [OpenCode V2 CLI](https://opencode.ai/v2/docs/cli/commands) with `npm install -g @opencode/cli`.
2. Install the plugin with `npm exec -- opencode-tbot@latest`.
3. Set `telegram.allowedChatIds` in `~/.config/opencode/opencode-tbot/config.json` if you want to restrict the bot to specific chats.
4. Start the shared host with `opencode serve --service`, or run `opencode reload` if the V2 shared server is already running. Keep the host running.
5. In another terminal in your project directory, load its location and plugin with `opencode api location.get --header "x-opencode-directory:$(node -p 'encodeURIComponent(process.cwd())')"`.
6. In Telegram, run `/status` to verify the connection.
7. Run `/new [title]`, or send a text or image message directly to start working.

The plugin uses the shared V2 service. A standalone `opencode serve` does not expose the service discovery information it needs. Starting the shared host alone does not load a project; step 5 selects the project directory and starts the plugin.

## Commands

| Command | What it does |
| --- | --- |
| `/start` | Show a short welcome message and quick-start steps. |
| `/status` | Show aggregated OpenCode health, version, workspace paths, plugin list, and MCP status. The current V2 HTTP API cannot query LSP status; this appears as neutral "Status unavailable", rather than an error or an empty server list. |
| `/new [title]` | Create a new OpenCode session in the current project. |
| `/agents` or `/agent` | List available agents and switch the active one. |
| `/sessions` | List available sessions, switch the active one, and offer rename actions. |
| `/cancel` | Cancel pending session rename input or abort the running request for the current session. |
| `/model` or `/models` | Show models exposed by OpenCode for connected providers, switch the active one, and choose a reasoning level when available. |
| `/token` | Show the current context capacity and remaining percentage. |
| `/language` | Switch the bot display language for the current chat and resync command descriptions. |

### Message Behavior

- A compact, separate final status message shows the session workspace, provider/model, reasoning level, agent, remaining context percentage, model capacity, and whole-request duration (`s`, `m`, or `h`). Labels are bold and the workspace path is monospaced, with a plain-text fallback. Model/agent switches, workspace moves and compression refresh the same message while preserving that request’s duration. After compression, usage is unavailable until the next assistant step reports tokens; old or cumulative usage is never reused.
- Thinking is shown in full, with long content split into numbered, independently expandable quotes. Existing messages are updated during streaming; earlier thinking is never dropped. Each part uses a compact heading, with a plain-text fallback if formatting is rejected. Thinking and reply text are shown in separate messages; the streamed reply becomes the final answer without duplication. Tool summaries are not shown.
- Thinking and answers target about 1,024 visible characters per message, allowing small length variations to keep paragraphs and sentences intact. Only overlong sentences or unbroken text require a fallback split; all content is preserved.
- Context compression has its own status message, separate from thinking and answers. It updates from running to completed or failed and keeps Stop available while running; compression summaries never appear as answers.
- Requests show live previews of provider-supplied thinking and answers, with updates coalesced at most once per second.
- The Stop button targets its own request; `/cancel` remains available. Stopping preserves the generated preview.
- Long answers are sent completely in multiple messages, using plain text to avoid Markdown escaping expansion.
- Model and reasoning-level buttons use stable identities. Reopen `/model` to replace numeric buttons created before upgrading.

- Non-command text is treated as a prompt and sent to OpenCode.
- Telegram photos and image documents are forwarded as OpenCode file parts.
- Image attachments are processed in a temporary fork of the active session so later text-only prompts stay clean.
- Permission approvals are handled from Telegram inline buttons.
- `/cancel` aborts both the OpenCode session and the local Telegram wait state, so the next prompt can start immediately.
- Telegram voice message support was removed. Telegram voice uses OGG by default, and usable speech models would require transcoding. Given the added bundle size and maintenance cost, the feature was dropped, and voice messages now receive a localized rejection reply.

OpenCode V2 stores Agent and model choices on the session. Chats and TUI clients sharing one session can affect each other's choices; use separate sessions for independent selections.

## FAQ

### Do I need a running OpenCode instance?

Yes. This repository provides a Telegram integration layer and depends on the OpenCode V2 host process that loads the plugin.

### Do I need to install `opencode-tbot` globally?

No. `npm exec -- opencode-tbot@latest` is the recommended path. A global install only installs the CLI; OpenCode still reads plugin registration from `opencode.json`.

### What happens if the Telegram token is invalid?

`install` fails before writing `opencode.json` or `~/.config/opencode/opencode-tbot/config.json`. If the runtime later becomes invalid, the plugin is disabled and OpenCode should continue to start without crashing.

### What happens during a Telegram network outage?

The runtime waits for reconnection when startup validation hits a network error. Polling automatically resumes after network retry exhaustion. Safe reads and edits use bounded retries; message sends retry only failures confirmed before connection, avoiding duplicates after a lost response. TLS verification stays enabled. Invalid tokens and competing pollers still stop instead of retrying forever.

### Is this an official OpenCode project?

No. It integrates with OpenCode, but it is not built by the OpenCode team.
