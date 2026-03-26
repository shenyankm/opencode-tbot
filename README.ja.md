# opencode-tbot

Telegram から [OpenCode](https://opencode.ai) を操作するためのプラグインです。
[grammY](https://grammy.dev) と `@opencode-ai/sdk` を基盤として実装しています。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> このプロジェクトは OpenCode チームによる公式開発ではなく、OpenCode の公式プロジェクトでもありません。

## 概要

`opencode-tbot` を使うと、Telegram から OpenCode を操作し、chat ごとに独立したアクティブなバインディング状態を保持できます。

- プレーンテキストメッセージは現在の OpenCode セッションに転送されます。
- Telegram の写真や画像ドキュメントは OpenCode の file part としてアップロードされます。
- OpenCode が発行した権限リクエストは Telegram のインラインボタンから承認または拒否できます。
- セッションエラーイベントは、バインド済みの Telegram chat に通知できます。
- chat のバインド、言語設定、モデルやエージェントの選択は JSON 状態ファイルに保存されます。

## 要件

- このプラグインを読み込む OpenCode Host プロセスが起動していること
- Telegram bot token
- CLI 用の Node.js `>=22.12.0`

## Telegram 認証情報の取得

- `botToken`: Telegram で `@BotFather` を開き、`/newbot` を実行して、返された token をコピーします。
- `userId` / `chatId`: Telegram で `@userinfobot` を開き、返された数値 ID をコピーします。bot とのダイレクトチャットでは、その値を `telegram.allowedChatIds` に使えます。

## インストール、更新、アンインストール

推奨インストール方法:

```bash
npm exec -- opencode-tbot@latest
```

インストーラーは次を行います。

- 対話実行時には Telegram bot token の入力を促します
- 設定ファイルを書き込む前に `getMe` で Telegram bot token を検証します
- `~/.config/opencode/opencode.json` を書き換え、`plugin` に `opencode-tbot` が含まれるようにします
- `~/.config/opencode/opencode-tbot/config.json` を書き込み、または既存内容とマージします
- 足りない親ディレクトリを自動作成します
- 完了時には最小限の成功メッセージだけを表示します

既存のプラグイン設定を変更せずに OpenCode のプラグイン登録だけを更新する場合:

```bash
npm exec -- opencode-tbot@latest update
```

OpenCode のプラグイン登録を削除し、既存のプラグイン設定ファイルは残す場合:

```bash
npm exec -- opencode-tbot@latest uninstall
```

CLI バージョンを表示:

```bash
npm exec -- opencode-tbot@latest --version
```

ヘルプを表示:

```bash
npm exec -- opencode-tbot@latest --help
```

補足:

- `install` は Telegram token のリモート検証に成功したあとでだけ設定を書き込みます。検証に失敗した場合、新しい設定は書き込まれません。
- `install` は `opencode.json` とグローバルプラグイン設定ファイルの両方を更新します。
- `update` は `opencode.json` だけを更新し、既存のプラグイン設定内容は変更しません。
- `uninstall` は `opencode.json` から `opencode-tbot` を削除し、`~/.config/opencode/opencode-tbot/config.json` はそのまま残します。

### CLI オプション

共通オプション:

- `--help`
- `--version`

`install` がサポートするオプション:

- `--bot-token <token>` Telegram bot token を非対話で設定
- `--telegram-api-root <url>` Telegram Bot API の root URL を上書き
- `--home-dir <path>` カスタム home ディレクトリを使用

`update` がサポートするオプション:

- `--home-dir <path>`

`uninstall` がサポートするオプション:

- `--home-dir <path>`

## 設定

実行時設定は次のパスから読み込まれます。

- `~/.config/opencode/opencode-tbot/config.json`

プログラムから設定を明示的に渡すこともできます。渡した値はファイル値を上書きします。

OpenCode は次のパスから npm プラグイン登録を読み込みます。

- `~/.config/opencode/opencode.json`

このプラグインは `.env` から実行時設定を読み込みません。

### `config.json` の例

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

### フィールド

| フィールド | 必須 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `telegram.botToken` | はい | - | Telegram bot token。通常は `getMe` 検証に成功したあとでインストーラーがグローバルプラグイン設定へ書き込みます。 |
| `telegram.allowedChatIds` | いいえ | `[]` | 許可する Telegram chat ID。空の場合は任意の chat からのメッセージを受け付けます。 |
| `tokens.showBreakdown` | いいえ | `false` | `/token` 用のグローバルスイッチです。`今回のリクエスト総入力`、`output`、`reasoning`、`cache.read`、`cache.write` を含む2行目のフッター内訳を表示するかを制御します。1行目の表示トークン合計は常にこの5項目から再計算され、worktree の状態ファイルには保存されません。 |

## クイックスタート

1. `npm exec -- opencode-tbot@latest` を実行します。
2. 特定の chat のみを許可したい場合は、`~/.config/opencode/opencode-tbot/config.json` で `telegram.allowedChatIds` を設定します。
3. Telegram で `/status` を実行して接続を確認します。
4. `/new [title]` を実行するか、テキストまたは画像メッセージを直接送って使い始めます。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/start` | 短いウェルカムメッセージとクイックスタートの案内を表示します。 |
| `/status` | OpenCode の health、version、workspace path、plugin list、LSP 状態、MCP 状態をまとめて表示します。 |
| `/new [title]` | 現在のプロジェクトに新しい OpenCode セッションを作成します。 |
| `/agents` または `/agent` | 利用可能なエージェントを一覧表示し、現在のエージェントを切り替えます。 |
| `/sessions` | 利用可能なセッションを一覧表示し、切り替えや名前変更操作を提供します。 |
| `/cancel` | 保留中のセッション名変更入力を取り消すか、現在のセッションで実行中のリクエストを中止します。 |
| `/model` または `/models` | OpenCode が接続済み provider 向けに公開しているモデルを表示し、現在のモデルや推論レベルを切り替えます。 |
| `/token` | 返信フッター2行目の完全なトークン内訳を表示するかどうかを切り替えます。この設定はプラグイン全体で共有されます。 |
| `/language` | 現在の chat の bot 表示言語を切り替え、コマンド説明を再同期します。 |

### メッセージの挙動

- コマンド以外のテキストは prompt として OpenCode に送信されます。
- Telegram の写真と画像ドキュメントは OpenCode の file part として転送されます。
- 画像添付は現在のアクティブセッションの一時 fork 内で処理されるため、後続のテキスト専用コンテキストを汚しません。
- 権限承認は Telegram のインラインボタンから処理できます。
- `/cancel` は OpenCode セッションの処理と Telegram 側の待機状態を同時に中止し、次の prompt をすぐ開始できるようにします。
- Telegram の音声メッセージ機能は廃止しました。Telegram の音声は既定で OGG 形式であり、利用可能な音声モデルを使うには追加のトランスコードが必要です。トランスコードによるサイズ増加と保守コストが大きいため、総合判断で機能を削除し、音声メッセージにはローカライズされた拒否案内を返します。

## FAQ

### 実行中の OpenCode インスタンスは必要ですか？

はい。このリポジトリは Telegram 連携レイヤーのみを提供し、プラグインを読み込む OpenCode Host プロセスに依存します。

### `opencode-tbot` をグローバルインストールする必要はありますか？

いいえ。推奨フローは `npm exec -- opencode-tbot@latest` です。グローバルインストールは CLI を入れるだけで、OpenCode 側のプラグイン登録は引き続き `opencode.json` から読み込まれます。

### Telegram token が無効な場合はどうなりますか？

`install` は `opencode.json` と `~/.config/opencode/opencode-tbot/config.json` を書き込む前に失敗します。実行中に token が無効化された場合でも、プラグインは無効化されるだけで、OpenCode 本体はクラッシュせずに起動を続ける想定です。

### これは OpenCode の公式プロジェクトですか？

いいえ。OpenCode と連携しますが、OpenCode チームが開発したものではありません。
