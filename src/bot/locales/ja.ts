import type { BotCopy } from "../copy.js";

export const JA_BOT_COPY: BotCopy = {
    locale: "ja",
    commands: {
        start: "ようこそとクイックスタートを表示",
        status: "システム状態を表示",
        new: "新しいセッションを作成",
        agents: "エージェントを表示して切り替え",
        sessions: "セッションを表示して切り替え",
        cancel: "名前変更を取り消すか実行中のリクエストを中止",
        model: "モデルを表示して切り替え",
        language: "言語を表示して切り替え",
    },
    start: {
        lines: [
            "# opencode-tbot へようこそ",
            "",
            "Telegram から OpenCode サーバーとやり取りできます。",
            "",
            "## クイックスタート",
            "1. `/status` を実行してサーバーの準備完了を確認します。",
            "2. `/new [title]` を実行して新しいセッションを作成します。",
            "",
            "そのままテキストまたは画像メッセージを送信できます。",
        ],
    },
    systemStatus: {
        title: "システム状態",
    },
    common: {
        notSelected: "未選択",
        openCodeDefault: "未選択（OpenCode のデフォルトを使用）",
        previousPage: "前へ",
        nextPage: "次へ",
        page(currentPage: number, totalPages: number) {
            return `ページ ${currentPage}/${totalPages}`;
        },
    },
    status: {
        processing: "処理中...",
        thinking: "思考",
        thinkingInProgress: "思考中…",
        expandThinking: "展開",
        collapseThinking: "折りたたむ",
        thinkingUnavailable: "この思考の内容は利用できません。",
        thinkingToggleFailed: "思考を更新できませんでした。もう一度お試しください。",
        compacting: "コンテキストを圧縮中です。しばらくお待ちください…",
        compacted: "コンテキストを圧縮しました。",
        compactionFailed: "コンテキストの圧縮に失敗しました。",
        completed: "完了",
        stopped: "停止済み",
        failed: "失敗",
        stop: "停止",
        expiredStop: "このリクエストは終了しました。",
        alreadyProcessing: "別のリクエストがまだ実行中です。完了するまで新しいプロンプトを送信しないでください。",
    },
    auth: {
        unauthorizedChat: "このチャットにはアクセス権がありません。",
    },
    prompt: {
        emptyResponse: "OpenCode から空の応答が返されました。",
    },
    replyMetrics: {
        contextLabel: "コンテキスト",
        durationLabel: "所要時間",
        workspaceLabel: "ワークスペース",
        modelLabel: "モデル",
        reasoningLabel: "推論レベル",
        agentLabel: "Agent",
        defaultReasoning: "既定",
        remaining: (percent) => `残り ${percent}%`,
        notAvailable: "該当なし",
    },
    abort: {
        noSession: "このチャットにはまだアクティブなセッションが紐付いていません。",
        notRunning: "現在のセッションで実行中のリクエストはありません。",
        aborted: "現在のセッションに中止シグナルを送信しました。",
    },
    permission: {
        requestTitle: "権限リクエスト",
        permissionLabel: "権限",
        sessionLabel: "セッション",
        patternsLabel: "対象パターン",
        noPatterns: "（なし）",
        allowOnce: "今回のみ許可",
        allowAlways: "常に許可",
        reject: "拒否",
        replyFailed: "権限リクエストへの応答に失敗しました。",
        replyLabels: {
            once: "今回のみ許可",
            always: "常に許可",
            reject: "拒否",
        },
        resolved(requestId: string, replyLabel: string) {
            return [
                "権限リクエストを処理しました。",
                "",
                `リクエスト: ${requestId}`,
                `結果: ${replyLabel}`,
            ].join("\n");
        },
    },
    sessionEvents: {
        unknownError: "不明なセッションエラーです。",
        failed(sessionId: string, error: string) {
            return [
                "セッションの実行に失敗しました。",
                "",
                `セッション: ${sessionId}`,
                `エラー: ${error}`,
            ].join("\n");
        },
    },
    errors: {
        unexpected: "予期しないエラーが発生しました。",
        providerAuth: "Provider の認証に失敗しました。",
        requestAborted: "リクエストは中止されました。",
        promptTimeout: "OpenCode リクエストがタイムアウトしました。",
        structuredOutput: "構造化出力の検証に失敗しました。",
        voiceUnsupported: "音声メッセージには対応していません。代わりにテキストまたは画像を送信してください。",
        imageDownload: "Telegram の画像ファイルをダウンロードできませんでした。",
        imageUnsupported: "画像ファイルが大きすぎるか、サポートされていません。",
        outputLength: "返信がモデルの出力上限に達しました。",
        contextOverflow: "会話がモデルのコンテキスト上限を超えました。",
        providerRequest: "Provider へのリクエストに失敗しました。",
        notFound: "要求されたリソースが見つかりませんでした。",
        badRequest: "リクエストは OpenCode に拒否されました。",
        causeLabel: "原因",
        statusCodeLabel: "ステータス",
    },
    health: {
        title: "サーバー状態",
        status(healthy: boolean) {
            return `状態: ${healthy ? "正常" : "異常"}`;
        },
        version(version: string) {
            return `バージョン: ${version}`;
        },
    },
    path: {
        title: "現在のパス",
        home(path: string) {
            return `ホーム: ${path}`;
        },
        state(path: string) {
            return `状態: ${path}`;
        },
        config(path: string) {
            return `設定: ${path}`;
        },
        worktree(path: string) {
            return `ワークツリー: ${path}`;
        },
        directory(path: string) {
            return `現在の作業ディレクトリ: ${path}`;
        },
    },
    sessions: {
        none: "現在のプロジェクトで利用できるセッションはありません。",
        title: "セッション一覧",
        actionTitle: "セッション操作",
        chooseAction: "このセッションに対する操作を選択してください。",
        currentProject(worktree: string) {
            return `現在のプロジェクト: ${worktree}`;
        },
        currentSession(session: string) {
            return `現在のセッション: ${session}`;
        },
        selectedSession(session: string) {
            return `選択中のセッション: ${session}`;
        },
        switched: "セッションを切り替えました。",
        created: "セッションを作成しました。",
        renamed: "セッション名を変更しました。",
        renameCancelled: "セッション名の変更を取り消しました。",
        renameEmpty: "セッション名は空にできません。新しい名前を送信するか /cancel を実行してください。",
        renameExpired: "このセッションはもう利用できません。/sessions を再実行してください。",
        renamePendingInput: "新しいセッション名の入力待ちです。プレーンテキストを送るか /cancel を実行してください。",
        renamePrompt(session: string) {
            return [
                `セッション名を変更: ${session}`,
                "次のテキストメッセージで新しいセッション名を送信してください。",
                "/cancel で取り消します。",
            ].join("\n");
        },
        switchAction: "切り替え",
        renameAction: "名前変更",
        backToList: "一覧に戻る",
        expired: "このセッションはもう利用できません。/sessions を再実行してください。",
    },
    lsp: {
        none: "現在のプロジェクトで LSP サーバーは検出されませんでした。",
        unavailable: "状態を取得できません：OpenCode V2 API は LSP 状態を公開していません。",
        title: "LSP サーバー",
        currentProject(worktree: string) {
            return `現在のプロジェクト: ${worktree}`;
        },
        connected: "接続済み",
        error: "エラー",
    },
    mcp: {
        none: "現在のプロジェクトで MCP サーバーは設定されていません。",
        title: "MCP サーバー",
        currentProject(worktree: string) {
            return `現在のプロジェクト: ${worktree}`;
        },
        connected: "接続済み",
        disabled: "無効",
        pending: "接続中",
        needsAuth: "認証が必要",
        failed(error: string) {
            return `失敗: ${error}`;
        },
    },
    agents: {
        none: "利用可能なエージェントはありません。",
        title: "エージェント一覧",
        current(agent: string) {
            return `現在のエージェント: ${agent}`;
        },
        switched: "エージェントを切り替えました。",
        expired: "このエージェントはもう利用できません。/agents を再実行してください。",
    },
    models: {
        none: "利用可能なモデルはありません。",
        title: "モデルを選択",
        choose: "下の番号でモデルを切り替えます。",
        current(model: string) {
            return `現在のモデル: ${model}`;
        },
        switched: "モデルを切り替えました。",
        currentReasoningLevel(variant: string) {
            return `現在の推論レベル: ${variant}`;
        },
        noReasoningLevels: "このモデルには選択可能な推論レベルがありません。",
        reasoningLevelsTitle: "推論レベル",
        model(model: string) {
            return `モデル: ${model}`;
        },
        modelNumber(modelIndex: number) {
            return `モデル番号: ${modelIndex}`;
        },
        expired: "このモデルはもう利用できません。/model を再実行してください。",
        reasoningLevelExpired: "この推論レベルはもう利用できません。/model を再実行してください。",
        defaultReasoningLevel: "デフォルト",
    },
    language: {
        title: "言語",
        choose: "Bot のメニューと返信に使う表示言語を選択してください。",
        current(label: string) {
            return `現在の言語: ${label}`;
        },
        switched: "言語を切り替えました。",
        expired: "この言語オプションはもう利用できません。/language を再実行してください。",
        labels: {
            en: "English",
            "zh-CN": "简体中文",
            ja: "日本語",
        },
    },
};

