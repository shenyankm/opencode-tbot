# Changelog

## Unreleased

- Keep cancellation attached to its original request, leave the previously bound session running during preparation, and release local waits even when remote cancellation fails.
- Bound status and interruption requests using the configured prompt polling request timeout.
- Preserve generated answers when a provider returns an error, and display the localized error separately.
- Retry formatted text as literal Rich text only after an explicit Telegram formatting rejection, across prompts, thinking, menus, help, and permission requests.
- Refresh locked transitive `picomatch` from `4.0.3` to `4.0.7`, removing two reported production dependency advisories without changing the pinned OpenCode SDK.

Mobile acceptance remains pending. See [validation results](https://github.com/shenyankm/opencode-tbot/blob/main/docs/validation/2026-10-15-round-1.md) before publishing.

## 0.2.0 — 2026-10-15

See the [GitHub release](https://github.com/shenyankm/opencode-tbot/releases/tag/v0.2.0) for the OpenCode V2 migration and native Telegram streaming release.
