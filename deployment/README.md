# PalmoEMU の公開・更新手順

公開用ワークフローは [Publish PalmoEMU](../.github/workflows/web-pages.yml) です。
公開先は [PalmoEMU](https://sei-dis.github.io/PalmoEMU/)、公開用リポジトリは
[SEI-dis/PalmoEMU](https://github.com/SEI-dis/PalmoEMU) です。GitHub Pagesで `main` の検査済みコミットを公開します。
push は検査だけを実行し、サイトの公開は手動実行に限定しています。

## 初回公開

1. GitHub Pages を利用できるリポジトリを用意します。GitHub Free では公開リポジトリが必要です。
   非公開を維持する場合は、対応プランまたは別の静的ホスティングが必要です。
   リポジトリの公開設定を変えると、ファイルだけでなく Git 履歴も公開されます。
2. 公開するリポジトリの **Settings → Pages** で
   **Build and deployment → Source → GitHub Actions** を選択します。
3. **Actions → Validate Web release** で、
   公開する `main` のコミットが成功していることを確認します。
4. **Actions → Publish PalmoEMU** から
   **Run workflow → Branch: main → Run workflow** を実行します。
5. `build` と `deploy` が成功したら、実行結果の `github-pages` リンクを開きます。
   標準URLは `https://<アカウント名>.github.io/<リポジトリ名>/` です。
   初回は反映に少し時間がかかることがあります。
6. ライブラリ、設定、クレジット、対応ソースのダウンロードを確認します。
   iPhone は Safari で開き、共有メニューから「ホーム画面に追加」すると利用しやすくなります。

## 次回以降の更新

1. 公開ごとに `web/package.json` のバージョンを上げ、`web/release-notes.json` の先頭へ同じ版の日本語・英語の変更点と日付を追加し、READMEも更新します。`build-offline.cjs` がHTMLへ反映し、設定はその値と配布内容から生成したビルド番号を表示します。
   変更に応じたテストと、[配布内容・対応ソースの更新](../web/README.md#変更後の生成ファイル)を行います。
   ライセンス・配布内容の確認記録を内容のレビュー後に更新します。
2. コミットして `main` に push します。
3. 同じコミットの **Validate Web release** が成功するまで待ちます。
4. **Publish PalmoEMU** を `main` で手動実行します。
5. 公開URLで確認します。初回利用では更新操作は不要です。準備済みの更新は、全タブでプレイや保存・取り込み・編集が終わり、ライブラリか設定の一覧に戻ると自動で反映します。手動で反映する場合は、
   ゲームを保存・終了後に「設定 → アプリの更新」を開き、その画面以外のアプリのタブを閉じて更新します。
   サイトデータは削除しないでください。準備済みの更新は、旧版を使うタブをすべて閉じた後にも切り替わります。

公開処理は同じコミットのCI成功と、配布一覧・ライセンス・対応ソース・レビュー記録の整合性を確認します。
検査待ち・失敗・記録不一致では公開せずに停止します。公開中に新しい変更をpushした場合は、
公開ワークフローのコミット番号と公開したいコミットが一致することを確認してください。

## 配布物と利用者データ

公開するのは検査で生成した `work/release/web/` の内容だけです。
作業フォルダー全体、テスト出力、ROM・BIOS・セーブなどの個人データをアップロードしないでください。
`licenses.html`、`licenses/`、`sources/` と著作権・変更通知は公開後も維持します。

`127.0.0.1:4173` と公開URLは保存領域が別です。ローカル版のゲーム一覧やセーブは自動移行されません。
移行時はローカル版でセーブをエクスポートし、公開版で手元のROMを追加してセーブをインポートします。
異なるブラウザ・端末間でも保存領域は別です。

## 公開を止める・変更を戻す

公開停止は **Settings → Pages → Unpublish site** で行います。
不具合を戻す場合は、修正コミットまたは `git revert` を使い、配布記録・対応ソースを再生成して検査後に再公開します。
古い実行の再実行だけでは、その版を現在の公開対象として再確認したことにはなりません。

公式資料: [GitHub Pagesの作成](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)、
[カスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 公開URLの変更（2026-10-09）

`Local-Play` を `PalmoEMU` へ改名し、新URLは `https://sei-dis.github.io/PalmoEMU/` です。
GitHubのリポジトリURLは転送されますが、旧Pages URLは自動転送されません。
ブックマークは新URLへ変更してください。旧URLで追加したホーム画面アイコンは、新URLから追加し直します。
ホーム画面版の保存データが通常タブと共有されない環境もあるため、再追加前にセーブを書き出してください。
通常タブでは同じ `https://sei-dis.github.io` の保存領域を使い、データベース名と設定キーは変更しません。
オフライン用キャッシュはURLごとなので、新URLで再度保存します。開発用 `SEI-dis/Web-emu` は別リポジトリです。
