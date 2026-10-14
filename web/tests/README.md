# 検証の案内

テストは自作のROM・セーブ・画像や固定した公開テスト用コードを使います。利用者のROM・セーブを成果物へ含めません。ブラウザ検証は通常利用のプロファイルとは分けます。

| 対象 | 主な検証 |
| --- | --- |
| モジュール・Workerの共通処理 | `module-links.cjs`、`worker-task.cjs` |
| コア・互換性 | `core.cjs`、`multicore.cjs`、`mgba-compatibility.cjs`、`nds-core.cjs` |
| セーブ・失敗時の保護 | `save-safety.cjs`、`save-worker.cjs`、`save-worker-fence.cjs`、`storage-protection.cjs` |
| セーブ変換の更新 | `start-save-component.cjs`、`start-save-migration.cjs`、`start-save-compatibility.cjs`、`start-rom-profile.cjs`、`start-save-ui.cjs` |
| ROM追加・更新・退避 | `rom-import.cjs`、`rom-zip.cjs`、`rom-update.cjs`、`backup.cjs`、`state-transfer.cjs` |
| スキン・画面・入力 | `skin-compatibility.cjs`、`responsive-skins.cjs`、`input-controls.cjs`、`touch-recovery.cjs` |
| 撮影・描画・音声 | `camera.cjs`、`recording-ui.cjs`、`runtime-performance.cjs`、`time-stretch.cjs` |
| 通信 | `room-link.cjs`、`direct-link.cjs`、`gb-local-link.cjs` |
| 更新・言語・プライバシー | `update.cjs`、`languages-offline.cjs`、`diagnostics.cjs`、`privacy.cjs` |
| 配布内容・対応ソース | `audit-content.py` と `../scripts/check-release.cjs` |

コマンドと環境変数の詳細は[開発README](../README.md)を参照してください。各テストの既存ファイル名・npmコマンドを入口として維持し、用途別の案内をここへ集めています。全対象の一覧はリポジトリのルートから `node web/scripts/test-all.cjs --list` で確認できます。

共通処理だけを確認する例:

```sh
node web/tests/module-links.cjs
node web/tests/worker-task.cjs
node web/scripts/check-modules.cjs
```

ブラウザ検証では `PLAYWRIGHT_MODULE`、`BROWSER_ENGINE`、`TEST_URL` を必要に応じて指定します。WebKitは `BROWSER_ENGINE=webkit` で実行します。自前でサーバーを用意するテストもあるため、対象のREADME説明とファイル先頭の設定を確認してください。

全件検証は通信の固定依存物を用意してから、次を実行します。

```sh
node web/scripts/test-all.cjs --serve
node web/scripts/test-all.cjs --serve --webkit
```

通信テストの準備は `python -B -X utf8 web/scripts/prepare-link-tests.py` と、出力される環境変数を使用します。テストは端末内の模擬中継へ接続します。

CIは両エンジンの検証を分割して実行します。結果は無視対象の `web/test-results/` に保存し、公開物へ含めません。PC版WebKitの合格は、iPhone実機の操作・速度・OSメニューまで保証するものではありません。
