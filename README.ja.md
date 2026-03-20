# opencode-tbot

チャットから [OpenCode](https://opencode.ai) を操作するための Telegram プラグインです。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> このプロジェクトは OpenCode チームによって開発されたものではなく、公式な関連もありません。

## 概要

`opencode-tbot` を使うと、Telegram から OpenCode を操作できます。

- テキストメッセージは現在アクティブな OpenCode セッションに転送されます。
- Telegram の写真と画像ドキュメントは OpenCode のファイルパートとしてアップロードされます。
- Telegram の音声メッセージは明示的に拒否され、ローカライズされた返信を返します。
- OpenCode が発行した権限リクエストは、Telegram のインラインボタンから承認または拒否できます。
- セッション完了やエラーイベントは、紐付けられた Telegram チャットへ通知できます。
- チャットの紐付け状態は JSON の state ファイルに保存されます。

## 前提条件

- このプラグインを読み込む OpenCode ホストプロセスが動作していること。
- Telegram bot token を用意していること。
- CLI とローカル開発には Node.js `>=22.12.0` が必要です。

## インストール

推奨インストール方法:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- install
```

インストーラーはプラグインをグローバルに登録し、デフォルトのランタイム設定を書き込みます。

インストール済み CLI のバージョン確認:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --version
```

OpenCode に登録済みの npm プラグイン spec を更新:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- update
```

### CLI オプション

`install` で利用可能:

- `--bot-token <token>` Telegram bot token を非対話で設定
- `--telegram-api-root <url>` Telegram Bot API のベース URL を上書き
- `--plugin-spec <spec>` カスタム npm プラグイン spec を登録
- `--skip-register` OpenCode 側のプラグイン登録は変更せず、プラグイン設定だけを書き換え
- `--home-dir <path>` カスタム home ディレクトリを使用

`update` で利用可能:

- `--plugin-spec <spec>`
- `--home-dir <path>`

## 設定

ランタイム設定は次の順序で読み込まれます。

1. `~/.config/opencode/opencode-tbot/config.json` のグローバルデフォルト
2. `<worktree>/tbot.config.json` のプロジェクト上書き設定

プロジェクト設定はグローバル設定に上書きマージされます。`telegram` と `state` はセクション単位でディープマージされます。

古い `openrouter` 音声転写設定はランタイムでは無視され、インストーラーが設定を書き直す際にも削除されます。

リポジトリには最小構成の参考として [tbot.config.example.json](./tbot.config.example.json) も含まれています。

### `tbot.config.json` の例

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
  "logLevel": "info"
}
```

### フィールド

| フィールド | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `telegram.botToken` | はい | - | Telegram bot token。通常はインストーラーがグローバルプラグイン設定へ書き込みます。 |
| `telegram.allowedChatIds` | いいえ | `[]` | 許可する Telegram chat ID の配列。空の場合はすべての chat を受け付けます。 |
| `telegram.apiRoot` | いいえ | `https://api.telegram.org` | Telegram Bot API のベース URL。テストやセルフホストのゲートウェイ向けです。 |
| `state.path` | いいえ | `./data/opencode-tbot.state.json` | JSON state ファイルのパス。現在の OpenCode worktree からの相対パスとして解決されます。 |
| `logLevel` | いいえ | `info` | プラグインのログレベル。ログは `client.app.log()` 経由で出力されます。 |

### 補足

- `state.path` は現在の OpenCode worktree からの相対パスとして解決されます。
- `telegram.allowedChatIds` を空のままにすると、bot は任意の chat からのメッセージを受け付けます。本番では制限を設定してください。
- 権限承認とセッション通知はプラグインの hook で処理されます。
- `/language` は現在 English、简体中文、日本語 をサポートしています。

## クイックスタート

1. `npm exec --package opencode-tbot@latest opencode-tbot -- install` でプラグインをインストールします。
2. 特定の chat のみ許可したい場合は、`tbot.config.json` で `telegram.allowedChatIds` を設定します。
3. 対象の worktree で OpenCode を起動し、プラグインランタイムを読み込ませます。
4. Telegram で `/status` を実行し、接続を確認します。
5. `/new [title]` を実行するか、テキストメッセージを直接送信して使い始めます。

## コマンド

- `/start` 短いウェルカムメッセージとクイックスタート手順を表示
- `/status` OpenCode のヘルス、パス、プラグイン、LSP、MCP の状態をまとめて表示
- `/new [title]` 新しい OpenCode セッションを作成
- `/agents` または `/agent` 利用可能な agent を一覧表示し、アクティブな agent を切り替え
- `/sessions` 利用可能なセッションを一覧表示し、アクティブなセッションを切り替え
- `/cancel` セッション名の変更をキャンセルするか、現在のセッションで実行中のリクエストを中止
- `/model` または `/models` 利用可能なモデルを一覧表示し、アクティブなモデルを切り替え
- `/language` bot の表示言語を切り替え

メッセージ処理:

- コマンド以外のテキストは prompt として扱われ、OpenCode に送信されます。
- Telegram の写真と画像ドキュメントは OpenCode のファイルパートとして転送されます。
- Telegram の音声メッセージは未対応で、ローカライズされた拒否メッセージを返します。

## 開発

プラグインバンドルをビルド:

```bash
pnpm build
```

型チェック:

```bash
pnpm typecheck
```

テスト実行:

```bash
pnpm test
```

このリポジトリでソースベースのローカル読み込みを行う場合、OpenCode は [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) を使って `src/plugin.ts` を再エクスポートできます。

## FAQ

### 実行中の OpenCode インスタンスは必要ですか？

はい。このリポジトリが提供するのは Telegram 連携レイヤーであり、プラグインを読み込む OpenCode ホストプロセスに依存します。

### これは OpenCode の公式プロジェクトですか？

いいえ。OpenCode と連携するプロジェクトですが、OpenCode チームが開発したものではありません。
