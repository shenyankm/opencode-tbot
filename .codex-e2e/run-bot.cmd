@echo off
cd /d E:\Projects\opencode-tbot
pnpm exec tsx src/index.ts 1>> .codex-e2e\bot.out.log 2>> .codex-e2e\bot.err.log
