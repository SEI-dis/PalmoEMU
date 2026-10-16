# 開発用の構成

通常の起動はリポジトリのルートで `node web/scripts/serve.cjs`。ビルド用ライブラリのインストールは不要です。

| 場所 | 役割 |
| --- | --- |
| `web/index.html`・`web/src/app.js` | 起動、画面間の遷移、ゲーム実行と保存処理の接続 |
| `web/src/shared.js`・`diagnostics.js` | 共通のDOM・設定ユーティリティと、許可した項目だけの端末内診断 |
| `web/src/views/` | ライブラリ、設定、ゲーム情報、ステート、スキンなどの画面 |
| `web/src/components/` | 共通の行・選択欄・ダイアログ、言語・容量・トレーナーカードの部品 |
| `web/src/core/` | 各エミュレーターの接続、機種別オプション、保存形式・巻き戻し |
| `web/src/rendering/` | 映像合成、フィルター、フレーム転送、音声の時間伸縮 |
| `web/src/storage/` | IndexedDB、セーブの直列化・履歴・バックアップ・ステート持ち運び |
| `web/src/library/` | ROMの追加・ZIP・パッチ・更新、ゲーム別設定とプレイ統計 |
| `web/src/skins/` | スキンの形式・選択・描画・画面配置・編集・プレビュー |
| `web/src/input/` | キー・パッド・タッチ・十字キーの入力と振動 |
| `web/src/capture/` | スクリーンショットボタン、録画、撮影結果のプレビュー |
| `web/src/link/` | Celio・端末内・直接通信、通信前の保存保護と入力接続 |
| `web/src/updates/` | オフライン準備、自動／手動更新、更新完了の案内 |
| `web/src/workers/` | 1回の要求で終了するWorkerの共通呼び出し。継続的なセーブWorkerは対象外 |
| `web/src/start-save/` | PokemonStartセーブ変換の接続・保存保護・互換性判定。提供エンジンと分離 |
| `web/src/i18n/`・`locales/` | 言語判定、翻訳、静的ページへの適用と各言語の辞書 |
| `web/scripts/start-save-migrate/` | 提供ツール更新時の候補検査と手順 |
| `web/scripts/i18n/` | 文言抽出、原文ハッシュ、翻訳差分、端末内翻訳モデルへの接続。ブラウザからは読み込まない |
| `web/scripts/`・`lib/` | 開発サーバー、検証・生成・公開準備の入口と共通処理 |
| `web/tests/` | 自作データによる検証。[目的別の案内](tests/README.md) |
| `web/cores/`・`web/vendor/` | 固定した版から取得・ビルドした配布物。手作業で書き換えない |
| `web/assets/` | アイコンとスキン。第三者素材の通知を保持する |
| `web/sources/`・`web/licenses/` | 対応ソース、ビルド記録、ライセンス原文 |
| `deployment/`・`.github/workflows/` | 検証後の公開手順とCI |
| `work/` | 個別の作業・検証出力。Gitと公開対象から除外 |

旧名 `local-play` を含む更新メッセージ・ロック・通知キーは、旧版と新版のタブが協調するため維持しています。
3DSの開発設定名、固定コアのビルド名、公開処理の排他グループと出力マーカーも内部の識別子です。
アプリ名の表記変更だけを理由に一括置換しないでください。過去の改名記録とコミットメッセージは当時の名前を残します。

画面はAPIを引数として受け取り、ゲームの起動・保存などを呼び出します。画面の部品からコアを直接操作せず、既存の保存・通信の保護処理を通してください。共有行の見た目は `components/rows.js`、プレイ中のメニュー構成は `components/manic-ui.js` を使用します。移植元の著作権・ライセンス表記は、ファイルを移動・分割しても保持します。

## 境界と変更範囲

`app.js`は画面とゲーム実行をつなぐ入口です。画面は渡されたAPIを呼び、部品が独自にセーブを書き込まないようにします。`storage/`の保存トランザクション・セッション所有権・遅延書き込みの遮断は、その層でまとめて管理します。`workers/task.js`はROM取り込みとセーブ変換の進捗・完了・失敗・終了処理だけを共通化し、継続セッションを持つ`storage/save-worker.js`には適用しません。

フォルダー整理では保存キー、DBスキーマ、ゲームデータの形式、更新のURL範囲とロック名を変更しません。Worker・コア・画像などの相対URLも移動先から解決する必要があります。`check-modules.cjs`が通常のimport、Worker・静的リソースへの参照、動的パスの基底、HTMLのスクリプト入口を検査します。ファイル移動時には`SOURCES.json`と変更通知の参照先も更新し、移植元の著作権・ライセンス原文と固定配布物は保持します。

検証スクリプトの公開コマンド名は維持しています。新しい共通処理は`scripts/lib/`へ置き、テストは既存の`package.json`と`test-all.cjs`から実行します。生成した対応ソースZIPは追跡せず、公開準備で再生成します。

## セーブ変換ツール

提供コードは `vendor/start-save-migrate/`、アプリ側の保護処理は `src/start-save/` に分離しています。対応版と変換先は提供された `manifest.js` から取得し、APIの接続は `provider.js`、扱える保存形式の条件は `contract.js` に集約します。未知の保存形式は自動承認しません。[更新手順](scripts/start-save-migrate/README.md)に従って候補と出典を確認し、原本・両スロット・RTC・ロールバックの回帰検査後に差し替えてください。

## PokemonStartの配布情報

`library/start-updates.js`は固定GitHub APIからのメタデータ取得・検査・キャッシュと、APIが403/429の際の固定公式READMEへの切り替えを担当し、`views/start-updates.js`が通知・設定と既存のROM更新画面への導線を提供します。ローカル名は通知の比較にだけ使い、ネット要求に混ぜません。配布情報はセーブ互換性の根拠にせず、引き継ぎ時は`start-save/rom-profile.js`と保存検査を必ず通します。PKS処理・提供HTMLのコードは組み込みません。

## 表示言語

「設定 → 言語」は初期値が「自動」です。対応言語は`languages.js`にまとめ、ブラウザの優先リストで最初に対応する言語を選びます。該当なしなら英語です。中国語はHans/Hant指定を地域より優先し、TW/HK/MOは繁体字、それ以外は簡体字にします。OSの設定を直接読むのではなく、ブラウザに公開された言語を使います。手動の選択は`palmo-language`に保存し、ゲーム別設定やバックアップの対象にはしません。

言語変更時には、ゲームを実行していない設定一覧から現在のページを再読み込みします。ゲーム中の別タブに変更を強制せず、そのタブの次回起動時に反映します。自動設定もページを開いた時点で解決するため、プレイ中に端末設定が変わってもゲームを中断しません。

翻訳する文言には `tr('保存')`、値を含む文言には `` tr`セーブ ${number}` `` を使います。HTMLの静的部分もタグ付きテンプレートで処理できます。`format.js` はソース側の文言と属性を翻訳してから値を差し込みます。ゲーム名、ROM・スキンの名前、入力内容などは翻訳の照合に渡しません。HTMLへ入れる利用者の値には、従来どおり `escapeHTML` が必要です。`tr` はHTMLの安全化を代行しません。

翻訳キーの `⟪0⟫` などは値の差し込み位置です。各言語の語順に合わせて並べ替えられますが、個数は変えないでください。ライセンス原文・著作権者名・コア由来の生の診断文は機械的に翻訳しません。静的ページは起動時の一度だけ翻訳し、利用者データが表示された後のDOMを書き換える監視処理は使いません。

ワーカーへは解決済みの `language` を渡し、`await setWorkerLanguage(...)`で辞書の読み込みを待ちます。日本語では辞書を読み込まず、他の言語では選択中の辞書と英語の代替辞書を並行して動的に読み込みます。両方の取得に失敗した場合は日本語原文で操作でき、保存済みの言語設定は次回の再試行用に保持します。全辞書をService Workerの初期キャッシュに含めるため、初回準備後はオフラインでも言語を切り替えられます。翻訳ファイルはアプリのオフライン対象に含まれ、外部の翻訳サービスへ接続しません。

## 更新資産の再利用

`sw.js` は版別のCache StorageとSRIを維持する。更新対象は「新版shell ∪ 保存済みの資産 ∪ 旧版とハッシュが異なる資産」。旧版のマニフェスト・完全保存の記録がない初回移行、または旧版を全体保存済みの場合は全体を対象にする。新規インストールはshellのみ。未使用で変更もないコア等は使用時に取得する。初回移行で全体保存になった利用者も、以降その範囲を維持する。

版キャッシュの `.offline-release.json` に版・ファイル一覧・integrity・active・全体保存の指定・移行元キャッシュ名を記録する。再利用前に本文をSHA-256で検証し、新版と一致したバイトだけを独立したResponseとして保存する。失敗したインストールからの再利用も検証・delete/putで再確定する。PC版WebKitで、失敗後の再試行時に単なるmatch/putでは永続ストアに残らないケースを回帰テストで確認した。削除するのは更新候補の当該エントリだけで、稼働中の旧版には触れない。

変更済み資産を未使用でも先に準備するのは、install開始後に旧ページがその機種を使う競合のため。activateではネットワークを使わず、旧キャッシュに後から増えた一致資産を複製し、claim後に記録済みの移行元だけを削除する。新しい候補のキャッシュや別アプリには触れない。容量不足などで引き継げないキャッシュは残し、読み込み時に再検証して利用する。次の起動時にも記録された移行元だけを片付ける冪等処理を行う。自然なactivationも同じ経路を通る。

`.offline-failure.json` は版・失敗種別・再試行期限・取得できた場合の保存容量推定値だけを旧キャッシュへ記録する。実際のQuotaExceededErrorでは同じ版の自動再試行を30分抑え、手動更新で解除できる。容量推定は診断情報であり、正確な予約容量や安全な削除可否の根拠にはしない。更新中は旧版と新版を一時的に二重保持する。ROM・セーブを消して空きを作る処理はない。

`download-progress.js` はinstalling workerから準備済み容量を取得し、各言語のパーセント形式で表示する。100%は対象資産の準備完了で、適用完了は従来のactivationで判断する。旧版UIにはこの表示処理がないため、最初の移行中から進捗率が表示される保証はない。

公開後、旧タブが未取得の変更済みコアを初めて要求すると、従来どおり旧SRIが新版のバイトを拒否する。これを解消したという主張はしない。保証するのは更新時の版混在防止と、検証して保存済みのオフライン資産の引き継ぎ。実iPhoneの速度・再ハッシュ時間は別途測定が必要。

## 更新完了の案内（0.3.23）

`build-release-notes.cjs`は`release-notes.json`の最新の版から先頭の最大3件を取り出し、9言語の本文・バージョン・同じ版の詳細リンクを`index.html`の`#latest-update-notes`テンプレートへ生成します。専用の要約は重複管理せず、`notices.html`には同じデータから全件を生成します。本文と詳細ページをオフライン対象に含めるため、表示時に外部の変更通知を取得する必要はありません。

`release-notice.js`は更新による再読み込みの直後にテンプレートを複製・翻訳して「更新しました」を表示します。初回利用では現在の版を基準として記録し、通知しません。通知を閉じるか「詳しく見る」を開くと、その版を既読として保存し、同じ版では再表示しません。既読版を古い版で上書きせず、保存キーはアプリのURLパスごとに分けます。Web Locksと共有の既読情報で通常の複数タブ表示を調整し、保存が拒否された場合はセッション内またはメモリ内の記録へ退避します。

起動時に通知を表示した場合は、閉じるまで保留中の取り込みやゲームリンクの処理を待ちます。非表示のタブ、ゲーム実行中、保存・取り込み中、入力欄の編集中、ほかのダイアログの表示中は通知を保留し、起動処理は継続します。ゲーム・セーブのデータや形式は変更しません。

## 変更時の確認

- `node web/scripts/check-modules.cjs`：import、Worker、静的リソースとHTML入口の読み込み先。
- `node web/scripts/check-i18n.mjs`：全辞書のキー、空訳、差し込み位置と変更履歴の言語を確認。原文の変更、未登録文言、欠落・空訳を検出する。
- `node web/tests/languages.cjs`と`languages-offline.cjs`：追加言語・地域判定・遅延読み込み・ワーカー・オフライン切り替え。
- `node web/tests/i18n.cjs`：別途起動した検証サーバーに対する言語・保存・画面の検査。`TEST_URL`、`BROWSER_ENGINE`、`PLAYWRIGHT_MODULE` は他のブラウザ検証と共通。
- `node web/scripts/test-all.cjs --serve` と `--webkit`：既存機能の回帰検査。既存の日本語UI検査は明示した日本語のブラウザ設定を使い、言語検査は英語・日本語・未対応言語を個別に指定。
- `release-notes.json`には同じ版の日本語の`changes`を追加・編集。`npm --prefix web run dev`または`node web/scripts/build-offline.cjs`が英語・追加言語を生成する。原文が変わらない手修正の訳は保持する。公開検査は生成せず、不足・古い原文ハッシュ・未登録文言を拒否する。HTMLもこの1つのデータから生成する。
- `scripts/i18n/state.json`は翻訳済み原文のハッシュ。生成器が更新するため手で承認しない。`exclusions.json`は翻訳不要な固定値の完全一致と理由だけを保持し、未使用の例外も拒否する。詳細は[翻訳手順](LOCALIZATION_REVIEW.md)を参照。
- 配布生成・ソースZIP・監査記録・CI・公開の順序は [公開手順](../deployment/README.md) を使用。ROMや実際のセーブを検証成果物へ入れない。

## 保存・入力・映像の拡張（0.3.20）

`nds-save.js`はDSVの構造だけを検証し、DBへは触れません。`save-history.js`は5分間隔の履歴選択だけを担当し、storage.jsの同一トランザクションが最新セーブ・直近履歴・長期履歴を確定します。DBはv5へ上げますが、既存ストア名・キー・バイナリ形式は維持します。

`ui-navigation.js`はメニュー中だけフォーカスを操作します。ゲーム中のinput-controls.jsと切り替わる際に押下状態を解放します。NES/SNES/MDは各プレイヤー16bitを使うコアABIで、セーブ／ステート形式は変更しません。

`gpu-filter.js`はMPL-2.0の映像効果アダプターです。video.jsは既存2Dキャンバスへ結果を合成し、スキンの複数画面とスクリーンショットを維持します。`gba-options.js`は明示許可された端末の動きのみ読み、一時停止時は中立値に戻し、終了時に解除します。

`rom-patch.js`と専用Classic Workerは、MITのRomPatcher.jsを形式別の境界検査後に実行します。Workerは入力バッファだけを受け取り、ゲームDBへ接続しません。中断時はWorkerを終了し、既存ファイルを更新しません。

## 保存移行と追加操作（0.3.24）

`rom-update.js`は元のセーブの検証と両ゲームのロックを担当し、`rom-import-worker.js`が新ROMの読取／ハッシュをUIスレッド外で処理します。`storage.js`の`commitROMUpdate`が新ROM・コピーしたセーブ・専用退避を一括保存します。退避は既存の`coverCatalogs`の予約prefixに置き、DBバージョンや従来の保存キーを変更しません。`views/rom-update.js`が選択・確認・完了・ROMだけの取り外しを担当します。

`state-transfer.js`は専用ステートファイルのスキーマ、ROMとコア、バイナリのハッシュ・容量を検証します。呼出元が保持するプレイセッションか非プレイ時のゲームロックの下で、`storage.addState`が新しいキーを原子的に追加します。`backup.js`は検証済みplanから選択されたゲームだけを抽出し、共通設定の復元を別の明示オプションで扱います。

入力確認は`views/input-test.js`と`input-controls.js`の一時セッション、タッチ調整は`dpad-input.js`・`touch-targets.js`・`views/touch-options.js`に分割します。テスト中にゲーム操作を呼ばず、終了時に入力・ポインター・タイマーを解放します。取り込みスキンの入力定義は変更しません。

DSの蓋は各ブリッジの`web_set_lid`／`web_get_lid`と既存コアの状態を使用します。GB/GBC端末内通信はmGBAの2つの独立したcoreコンテキストを1つのWASM内に保持し、`gb-link.h`が既存GBSIOLockstepへ接続します。`LocalLinkCore`の共通ループと、既存`saveLinkPair`の単一保存トランザクションを使い、GBAのネット／USB経路とは分けています。


`camera-button.js`は撮影ボタンの空き領域への初期配置と、タップ／キーボード／長押し移動を担当します。配置計算はレイアウト更新時に限り、フレームごとには行いません。撮影は`app.js`の共通関数から既存の`engine.screenshot()`を呼び、ゲーム画像を端末へダウンロードします。メニュー・スキンの撮影操作も同じ関数を使います。既存の配置編集と共通／ゲーム別設定を使い、取り込みスキンは撮影ボタンだけを編集できます。長押し移動は400msで開始し、完了時にstorage.setGameCameraPositionが最新のゲーム別配置へ該当方向のx/yだけを原子的に追加します。他のボタン・別方向の配置・スケール・透明度・セーブは変更せず、保存失敗時は表示位置を戻します。

保存履歴は従来のIndexedDB配列形式を維持し、save-history.jsで最新順・件数・合計96 MiBの上限を適用します。ブラウザ全体のquotaと単一値のシリアライズ上限を区別し、自動ステート・直近セーブ・5分間隔セーブを個別に制限します。単一巨大ステートはSaveProtectionで拒否してbatteryの保存を優先し、通常の更新は保存・履歴・sessionを同一トランザクションで確定します。IndexedDBイベント内の同期例外も明示的に全体をabortし、元のエラーを保持します。

大容量のゲーム内セーブ単体は分割せず1件を保持する例外を設けます。過去の大きなbatteryが新しい保存を妨げることを避けるためです。手動ステートは自動間引きせず、分割バックアップで結合する履歴配列には既存と同じ件数・96 MiB制限を適用します。ブラウザ上限による復元失敗時は既存の原子的な取消で元データを維持します。

`save-writer.js`は1 MiB以上の保存を`save-worker.js`へ複製して渡し、履歴の読み書きと全バイト比較を描画スレッドから移します。小さい保存とWorkerの初期化失敗時は、同じ`storage.commitProtectionBatch`をメインで実行します。非プレイ中の単発セーブ取り込みも、`useWorker:false`で従来の処理を使用します。コアからの取得・ハッシュ・ゲームのロックはページ側に残し、渡したバッファを切り離しません。保存形式・DBバージョンは維持し、通常の定期保存と自動ステートは約2分間隔です。mGBAの保存書き込み検知時はゲーム内セーブだけを先に保存します。

送信済みの保存がタイムアウト・通信障害で結果不明になった場合は、その保存を再送しません。`SaveProtection`が`sessions`ストアの条件付きトランザクションで旧所有者IDを失効させてから、次の新しいスナップショットを保存します。この処理は遅れた旧トランザクションと順序付けされ、旧IDの後発書き込みを拒否します。失効の確認に失敗した場合はゲームのWeb Lockと更新防止を維持し、次の保存・終了時に再試行します。`close()`も待機と失効確認を経てからロックを解放します。非表示中の時間を保存タイムアウトへ数えず、復帰後に待ち時間を取り直します。


## 診断・実行中の保護

`src/runtime/`は画面消灯防止と任意の動作計測を担当します。権限拒否やAPI未対応はゲームを停止させません。動作計測は描画元Canvasと実行コアを照合し、停止時間・別画面・利用者の映像／音声データを記録しません。`diagnostic-sources.js`は実在するアプリのソースパスだけを列挙した生成物です。`build-diagnostic-sources.cjs`が生成し、`check-modules.cjs`と公開検査で不整合を拒否します。任意のスタック文字列を許可するワイルドカードは使いません。

`src/storage/save-trigger.js`はmGBAの保存領域の更新カウンターと安定状態だけを読み、毎フレームのセーブ全体コピーを避けます。ゲーム内セーブの早期保存と重い復旧ステートの周期を分離します。コア変更・読み込み・巻き戻し等の世代変更後に、古い通知で保存しません。

Google Drive連携は未実装です。追加する場合もローカル用フルバックアップをそのまま送る設計にはせず、通常セーブ・選択した設定・プロフィールを明示的に抽出します。ROM・BIOS・ステート（実行メモリーを含む）・画像・スキン・認証トークンは対象外にします。認証・保存先・上書き競合・世代保持・復元前の退避を別の境界で扱います。


## 公開前の保存画面・読込整理（2026-10-16）

`save-catalog.js` は既存の `coverCatalogs` 内の専用キーに、保存本体を含まない索引を持つ。DBバージョンや既存セーブ形式は変えない。保存・復元・削除と索引を同一トランザクションで更新し、古い記録は初回に補完する。キーだけの照合で旧タブが追加した記録を検出し、読み込み・書き出し時には原本を再取得して日時・ハッシュ・コアを検証する。旧タブの同じキーへの上書きは一覧に即時反映されない場合があるが、そのまま古い選択を適用しない。バックアップの分割計画・書き出し世代確認・分割復元の継続判定には索引を使わず、readonlyトランザクションで原本から概要を作り直す。これにより旧タブが索引を更新しなくても、最新のセーブを退避対象から落とさない。

一覧は画像・日時などだけを保持する。画面の終了でDOM、イベント、選択、バックアップ検証プランを解放する。バックアップのゲーム選択一覧はlibraryだけを読み、保存内容は対象と操作が決まってから取得する。TrainerCardは変更がある記録だけを書き戻す。終了時のカバーは最大辺320pxの縮小画像で、PNG/WebPの小さい方を選ぶ。ステートとスクリーンショットの原画像は縮小しない。

`file-export.js` は独立したダイアログに準備済みファイルを保持し、保存/共有ボタンの新しいユーザー操作でOSのAPIを呼ぶ。親の復元プランを破棄せず、書き出し終了・キャンセルで参照とObject URLを解放する。ファイル選択・書き出し中は更新バリアを保持する。通常ダウンロードの完了はブラウザから保証されないため開始だけを表示する。

`offline-plan.js` は実際のスキン表現選択器と、現在の画面・回転・全画面・余白候補から必要な同梱画像を求める。選択保存は共通playback資産と選択コア/画像の和集合。全量保存と既存キャッシュの継承は残す。著作権・ライセンス原文はplaybackに保持し、開発手順3文書（ARCHITECTURE/LOCALIZATION_REVIEW/RELEASE_VALIDATION）は起動・選択保存の先行取得から除くが、配布と全量保存には残す。クレジットから辿るREADMEと初回GBA取り込みに必要な変換エンジンは初期保存に含む。英語辞書と変換エンジンの起動時実行読み込みは遅延させるが、オフライン準備とは切り分ける。

ページは表示前に選択言語を準備する。Workerは辞書の通信を待たず受信処理を先に登録し、各要求に含まれる言語を処理内で待つ。これによりWebKitで初回要求が辞書の読み込み中に失われることを防ぐ。選択言語の取得失敗時は英語、英語も取得できなければ日本語へ退避し、利用者の言語設定は次回の再試行用に保持する。

### Local cover editing

`views/cover.js` owns a draft image and the update-activity guard while its sheet is
open. `components/cover-crop-math.js` clamps an aspect-preserving square to the
source image; `cover-crop.js` renders that draft and owns pointer, keyboard, resize
and animation listeners. Only explicit Save commits a maximum-512px WebP cover
through the existing atomic `setGameCover` transaction. Save/history/state/ROM
records and the schema are unchanged. Cancel/close releases decoded pixels and
late decoding results. Current covers can be readjusted from their stored pixels;
the full original image and crop history are not stored. Saving locks sheet-close
until the transaction completes; failure keeps the draft available to retry.

### Sheet navigation

The main sheet accepts an optional root marker or explicit back action. Game-detail
child sheets use a back label matching their existing return route; root and
standalone dialogs retain Close. All close/back triggers use the same busy guard.
Navigation callbacks are replaced with the sheet and cleared on dismissal or game
startup so a pre-launch state view cannot route back after starting emulation.

Confirmation sheets keep their cancel/confirm pair and can use `confirmation:true`
to display Close while retaining the same guarded cancellation callback. ROM
selection passes its actual origin as `onBack`, including the import picker and
PokemonStart update notice. In-game shortcut visibility and matching list rows
share one selected set: enabled shortcuts appear once in the header; disabled
shortcuts remain in the list. Battery save import/export use the existing handlers
inside the unified save/history view; healthy export still validates the freshly
read save, and damaged-original export remains explicit. No save format changes.

File pickers are opened only by their explicit selection control, never by entering
the ROM-update view. Input-originated bubbling `cancel` events do not dismiss the
main dialog; dialog-originated Escape/cancel still uses the guarded close route.
The update coordinator continues receiving file-input cancellation to release its
picker activity guard.
