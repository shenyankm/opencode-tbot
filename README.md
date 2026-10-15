# opencode-tbot

Control [OpenCode](https://opencode.ai/v2/docs) from Telegram: chat, images, sessions, models, agents, and permission approvals. Built with grammY and the OpenCode V2 SDK; not affiliated with the OpenCode team.

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

## Quick Start

Requires OpenCode V2 compatible with SDK `2.0.29` and Node.js `>=22.12.0`. OpenCode V1 is unsupported.

1. Create a bot with Telegram’s `@BotFather` using `/newbot`. Get your numeric user ID from `@userinfobot` to restrict access to your private chat.
2. Install OpenCode and the plugin, then enter the bot token when prompted:

   ```bash
   npm install -g @opencode/cli@2.0.29
   npm exec -- opencode-tbot@latest
   ```

3. Set `telegram.allowedChatIds` in the config below, then start the shared host and load your project location from its directory:

   ```bash
   opencode serve --service
   # In another terminal, from your project directory:
   opencode api location.get --header "x-opencode-directory:$(node -p 'encodeURIComponent(process.cwd())')"
   ```

4. Keep OpenCode running. Open your bot in Telegram, send `/status`, then `/new [title]` or a message.

Starting the shared host alone does not load the project plugin. A standalone `opencode serve` lacks the service discovery required by this plugin. Use `opencode reload` to reload an existing shared host after configuration changes.

## Configuration

The installer validates the token before writing `~/.config/opencode/opencode-tbot/config.json`:

```json
{
  "telegram": {
    "botToken": "your_telegram_bot_token",
    "allowedChatIds": ["123456789"]
  }
}
```

An empty or omitted `allowedChatIds` allows every chat. The installer also registers `"plugins": ["opencode-tbot"]` in `~/.config/opencode/opencode.json`; plugin options can override file settings. Existing V1 registrations are migrated without dropping options. Runtime configuration does not use `.env`.

Chat preferences persist in a JSON state file. Thinking content and expansion state use private per-message files in `<state path>.thinking/`; keep these files to reopen older thinking after restarting. Redacted logs go to the host console and `~/.local/share/opencode/log/plugins/opencode-tbot/`.

## Commands

| Command | Action |
| --- | --- |
| `/start` | Show quick-start help. |
| `/status` | Show host, workspace, plugins, and MCP status. |
| `/new [title]` | Create a session in the current project. |
| `/sessions` | Switch or rename sessions. |
| `/model`, `/models` | Select a model and reasoning level; providers are grouped and the current choice is marked. |
| `/agents`, `/agent` | Select an agent. |
| `/cancel` | Stop the request or cancel a pending rename. |
| `/language` | Switch between English, Simplified Chinese, and Japanese. |

LSP status appears as unavailable because the V2 HTTP API does not expose it.

## Message Behavior

- All outgoing text uses Telegram Rich Messages, including command menus, permissions, live replies, and status. Native Markdown preserves headings, lists, code, and tables. Use an up-to-date Telegram client.
- Private-chat answers stream through native Rich Message drafts; completed chunks and the final answer are saved as messages. Other chat types use live message edits. Tables split only between rows and repeat their headers; incomplete rows wait for more output. A single long row may exceed the 1,024-character target; rows above the safe size are delivered as literal text without losing data.
- Thinking uses a compact “💭 Thinking · Expand” inline button. Expand/collapse edits the same message; expanded content keeps streaming. Thinking, answers, and status stay separate. Long thinking and answers remain complete in chunks of about 1,024 characters, preferring sentence and paragraph boundaries. Tool summaries are hidden.
- Stop buttons target their own request and preserve generated text. Cancellation also removes that request's pending input; cancelling preparation leaves the previously bound session running. Remote cancellation failures still release the local wait.
- Stopping or reloading the plugin ends local prompt waits. OpenCode retains ownership of ongoing session execution across plugin reloads; use `/cancel` to interrupt a session.
- Provider errors preserve generated answers and appear in a separate message. Context compression has a separate progress message.
- Final status shows workspace, `provider / model(reasoning)`, agent, remaining context, capacity, and duration (`s`/`m`/`h`). Model/agent changes, workspace moves, and compression refresh the same status; usage stays unavailable after compression until fresh tokens arrive.
- Photos and image documents run in a temporary session fork. Permission requests use approval buttons. Voice messages are unsupported.
- Transient network failures reconnect automatically; invalid tokens and competing pollers stop. Old model menus must be reopened with `/model` after upgrading.

Model and agent choices belong to the OpenCode session. Use separate sessions when chats or TUI clients need independent choices.

## Update and Uninstall

```bash
npm exec -- opencode-tbot@latest update
npm exec -- opencode-tbot@latest uninstall
```

Both commands preserve the plugin config; `update` refreshes registration and `uninstall` removes it. Use `--help` for CLI options.

## Development and CI

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

[CI](./.github/workflows/ci.yml) runs on pull requests and pushes to `main`: Node 22.12.0/24 typechecks, unit tests, builds, and CLI bundle checks. A separate job packs the plugin and tests it in OpenCode `2.0.29` with a local Telegram API stub; no real credentials or model requests are needed.

To run the host test locally with the matching OpenCode CLI on `PATH`:

```bash
OPENCODE_HOST_E2E=1 pnpm exec tsx --test tests/opencode-host.integration.test.ts
```
