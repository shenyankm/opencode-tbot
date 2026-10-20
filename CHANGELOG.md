# Changelog

## Unreleased

- **Breaking security default:** reject empty chat allowlists, require an owner ID during installation, and enforce authorization on historical outbound notifications. Authorized groups trust all members.
- Atomically patch chat fields and reject superseded selections; preserve newer session, language, model and agent changes.
- Cancel preparation and downloads, enforce a 20 MiB actual-byte download cap, bound preparation and temporary cleanup, and keep successful answers when timestamp persistence fails.
- Atomically replace private token configuration, redact user-facing errors, validate state versions, and bound retained thinking and permission history.
- Add read-only `doctor`, explicit `prune`, clean production-package verification, complete local-provider host flows, lifecycle metrics, Promise checks, dependency automation and macOS/Windows CI coverage.
- Remove unused empty modules and separate localized copy and file log sinks without changing their public imports.

- Cancel outstanding local waits before stopping polling, and wait for an already-started stop operation before disposing the container.
- Remove the matching pending V2 inbox input during cancellation so an idle queued request cannot execute later.
- Use V2 interruption's authoritative boolean result instead of a racy session-status preflight, removing one remote round trip from cancellation.
- Keep cancellation attached to its original request, leave the previously bound session running during preparation, and release local waits even when remote cancellation fails.
- Bound status and interruption requests using the configured prompt polling request timeout.
- Preserve generated answers when a provider returns an error, and display the localized error separately.
- Retry formatted text as literal Rich text only after an explicit Telegram formatting rejection, across prompts, thinking, menus, help, and permission requests.
- Refresh locked transitive `picomatch` from `4.0.3` to `4.0.7`, removing two reported production dependency advisories without changing the pinned OpenCode SDK.

Mobile acceptance remains pending. See [latest validation results](https://github.com/shenyankm/opencode-tbot/blob/main/docs/validation/2026-10-20-optimizations/README.md) before publishing.

## 0.2.0 — 2026-10-15

See the [GitHub release](https://github.com/shenyankm/opencode-tbot/releases/tag/v0.2.0) for the OpenCode V2 migration and native Telegram streaming release.
