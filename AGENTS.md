# AGENTS.md

Guidance for coding agents working in `opencode-tbot`.

## Scope

- This repo is a TypeScript/ESM Telegram plugin for OpenCode V2, using `@opencode/client` and `@opencode/plugin`.
- Runtime code lives in `src/`; generated output lives in `dist/`.
- Tests use the Node test runner through `tsx`.
- User-facing docs are maintained in `README.md`, `README.zh-CN.md`, and `README.ja.md`.
- No repo-local `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` files exist right now.
- If such rule files are added later, merge their instructions into this document instead of creating conflicting guidance.

## Toolchain

- Package manager: `pnpm`.
- Required runtime: Node `>=22.12.0`.
- Module mode: ESM with `NodeNext` resolution.
- Build tool: `vite`.
- Static check: `tsc` via `pnpm typecheck`.
- Test runner: `tsx --test tests/**/*.test.ts`.
- The env-gated host integration path requires the V2 `@opencode/cli` binary on PATH before setting `OPENCODE_HOST_E2E=1`. It builds and packs this checkout, starts an isolated shared service, and verifies Telegram commands and plugin cleanup.
- There is no committed GitHub Actions workflow in this repo right now; rely on the local verification commands below.

## Repo Map

- `src/plugin.ts`: V2 `Plugin.define` entrypoint, permission hook, event subscription, and runtime singleton lifecycle.
- `src/cli.ts`: install/update CLI for plugin registration and config writing.
- `src/app/`: config loading, bootstrap, DI container, runtime startup.
- `src/bot/`: Telegram commands, handlers, presenters, middleware, localized copy.
- `src/use-cases/`: application actions that coordinate services and repositories.
- `src/services/`: OpenCode SDK access, Telegram download, storage, scheduling.
- `src/repositories/`: in-memory and file-backed persistence adapters.
- `src/domain/`: core interfaces and entity shapes.
- `tests/`: unit-focused suite plus one env-gated integration test.
- `~/.config/opencode/opencode.json`: V2 `plugins` registration written by the installer; legacy `plugin` entries are migrated without losing options.
- `dist/`: generated bundle output; do not edit by hand.

## Commands

- `pnpm install`: install dependencies.
- `pnpm build`: build `src/index.ts`, `src/cli.ts`, and `src/plugin.ts` into `dist/`.
- `pnpm typecheck`: run the repo's required static gate.
- `pnpm test`: run the normal test suite; the integration test stays skipped unless `OPENCODE_HOST_E2E=1` is set.
- `pnpm exec tsx --test tests/cli.test.ts`: run one test file.
- `pnpm exec tsx --test --test-name-pattern "runCli prints the package version for --version" tests/cli.test.ts`: run one named test.
- `npm install -g @opencode/cli` then `OPENCODE_HOST_E2E=1 pnpm test`: run the V2 host integration coverage.
- There is no dedicated lint script today; treat `pnpm typecheck` as the required lint/static-quality command.

## Verification Defaults

- Source-only edits: run `pnpm typecheck` plus the most relevant focused test file.
- CLI edits: run `pnpm exec tsx --test tests/cli.test.ts`.
- OpenCode client edits: run `pnpm exec tsx --test tests/opencode.client.test.ts`.
- Telegram handler or presenter edits: run the targeted handler/presenter tests first, then `pnpm test` if behavior fans out.
- Packaging, entrypoint, or runtime-startup edits: run `pnpm build`, `pnpm typecheck`, and `pnpm test`.

## Code Style And Design

- **Layering**: keep Telegram wiring thin; put business logic in use cases and services, and persistence behind repository interfaces.
- **Dependency flow**: preserve the current shape of `bot -> use-cases -> services/repositories/domain`.
- **Dependency injection**: prefer constructor injection and bootstrap helpers over hidden singletons, except for the explicit runtime singleton in `src/plugin.ts`.
- **Imports**: group imports as builtins, third-party packages, then local modules.
- **Builtin imports**: use `node:` specifiers for Node modules.
- **Type imports**: use `import type` when the import is type-only; inline `type` specifiers are also common in mixed imports.
- **Local module paths**: keep `.js` endings in TypeScript imports because the project targets NodeNext ESM.
- **Path aliases**: do not introduce them unless the repo is explicitly reconfigured; current code uses relative imports.
- **Quotes**: use double quotes.
- **Semicolons**: keep them everywhere.
- **Indentation**: use 4 spaces.
- **Trailing commas**: keep them on multiline arrays, objects, call sites, and import lists.
- **Line wrapping**: prefer multiline formatting once an object literal or call becomes hard to scan.
- **Control flow**: favor early returns and small helpers over deep nesting.
- **Comments**: keep comments sparse and only for non-obvious behavior.
- **Type safety**: maintain `strict` TypeScript compatibility.
- **Contracts**: define interfaces/types for public boundaries and persisted shapes.
- **Inference**: use inference for obvious locals, but add explicit return types to exported functions and important helpers.
- **Untrusted input**: prefer `unknown` at boundaries, then narrow with guards or schema validation.
- **Validation**: keep using Zod for config and structured payload validation where the repo already does so.
- **Normalization**: trim and normalize optional input before use.
- **Avoid `any`**: production code should not rely on `any`; tests sometimes use `as never` for compact stubs.
- **Naming**: use `PascalCase` for classes/interfaces/types, `camelCase` for values/functions, and `UPPER_SNAKE_CASE` for constants.
- **Filenames**: use kebab-case.
- **Suffixes**: preserve current suffix patterns such as `.usecase.ts`, `.repo.ts`, `.entity.ts`, `.service.ts`, `.handler.ts`, and `.presenter.ts`.
- **Domain vocabulary**: match established identifiers exactly, including `chatId`, `sessionId`, `projectId`, `providerID`, `modelID`, `worktree`, and `apiRoot`.

## Errors, Logging, And Async Work

- Throw plain `Error` with direct, readable messages for validation failures and unsupported states.
- Use custom `Error` subclasses when callers need structured metadata, as with timeout-style failures.
- Catch errors when you can add fallback behavior, cleanup, retry logic, or better context.
- Avoid swallowing important failures; the main exception is non-critical logging/reporting code.
- Use `finally` for cleanup such as disposing runtimes, releasing prompt/session locks, or restoring streams.
- Prefer structured logger payloads over string-only logging.
- Never log secrets; existing logger helpers already redact token- and key-like fields.
- Keep async flows explicit with `await`; avoid fire-and-forget unless failure is intentionally ignored.
- Preserve the current atomic JSON write pattern for state persistence.
- Update persistent chat/session state through repositories instead of ad hoc file access.

## Telegram, Copy, And UX Rules

- Centralize user-facing copy in `src/bot/copy.ts`; do not scatter reply strings through handlers.
- Preserve localization support for English, Simplified Chinese, and Japanese.
- Keep `README.md`, `README.zh-CN.md`, and `README.ja.md` aligned when docs describe the same user-facing behavior.
- All text delivery uses the Rich Messages API transformer in `src/services/telegram/rich-messages.ts`. `parse_mode: "Markdown"` is an internal hint for native Rich Markdown, not legacy Markdown. Fall back to literal Rich text only after an explicit formatting rejection; never retry ambiguous sends.
- If you add or change a command, update command registration, localized copy, presenters, and tests together.
- Do not introduce voice transcription; the current behavior explicitly rejects voice messages.
- Preserve the repo's pattern of separating use-case results from presenter formatting.

## Testing Conventions

- Use `node:test` and `node:assert/strict`.
- Keep test names as full descriptive sentences.
- Prefer small factory helpers near the top of a test file for reusable stubs.
- Test observable behavior rather than internal implementation details.
- Cover fallback and error behavior, not only success paths.
- When output is localized or markdown-sensitive, assert both preferred and fallback behavior where relevant.
- Use env gating for external/integration coverage instead of making the default suite depend on external services.

## Config And Runtime Expectations

- Do not add `.env`-driven runtime configuration; there is already a test protecting against that.
- Plugin config is loaded from global defaults plus optional worktree overrides.
- `telegram` and `state` config sections are merged by section.
- Legacy `openrouter` config is intentionally ignored/stripped; do not reintroduce it.
- Keep state file paths relative to the OpenCode worktree unless there is a strong reason not to.
- Be careful with the runtime singleton in `src/plugin.ts`; changing worktrees must dispose and rebuild cleanly.
- The plugin connects to its own registered V2 shared service. Use `opencode serve --service`; do not start another service from plugin setup. Preserve the host PID check and encoded location header.
- V2 has no public LSP status endpoint. Report that section as unavailable instead of presenting an empty or fabricated server list.

## Agent Checklist

- Update the narrowest layer that can own the behavior.
- Preserve ESM `.js` import endings.
- Add or update tests when behavior changes.
- Run targeted verification commands before finishing.
- Run `pnpm typecheck` for all non-trivial TypeScript edits.
- Run `pnpm build` when touching entrypoints, packaging, or runtime bootstrap behavior.
- Check `README.md`, `README.zh-CN.md`, and `README.ja.md` for drift when changing commands, config flows, or user-facing behavior.
