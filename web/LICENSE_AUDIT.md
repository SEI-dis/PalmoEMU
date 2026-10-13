# Web版の公開に向けた確認記録 — 2026-10-09

対象はこの `web/`、検査CIとGitHub Pages用テンプレート、Local-Playの公開対象Git履歴です。
ManicEMUの元のiOSリポジトリ全体やその履歴は取り込んでいません。
配布ファイルの一覧とハッシュは RELEASE_CONTENT.json、確認結果は RELEASE_REVIEW.json に記録しています。
これはコード・配布物の確認であり、あらゆる国の法的紛争が絶対に起きないという保証ではありません。

## 本家UIの移植とAGPL

本家のメニュー・設定のコードは、AGPLの条件に従って利用できます。クレジットだけでは足りません。
AGPL 4・5・6・13条に合わせ、著作権・無保証・ライセンス表示、変更日と変更内容、
改変後の編集可能なソース、対応コアのソース・ビルド手順を同じサイトから無料で取得できるようにしています。
設定→「クレジット・ライセンス」から取得できます。改変WebコードはAGPL-3.0-or-laterで提供します。
購入制限、秘密保持、改変禁止などAGPLに追加の制限を課しません。

ライセンス画面にはManicEMU本家、mGBA本家、64MiBフォーク、Web接続部、各コア、
通信処理、PDF.jsなどの作者・プロジェクト名とGitHubリンクを明示しています。
採用した固定版へのリンクと、同じサイトから取得できる対応ソースを掲載しています。
作者のGitHubページへのリンクだけを、通知保持や対応ソース提供の代替とは扱いません。

ManicEMUのゲームメニュー、手動／自動ステート一覧、編集→削除確認、一般／詳細／サポート／その他の
設定構成を移植しました。移植元の正確なSwiftファイルは sources/manicemu-ui/ に残しています。
ゲームメニューの項目順と上部ショートカットは GameOption / GameOptionsView、共通の行と
ナビゲーションは ASListPage / ASListItemView / ASNavigationView に基づいています。
これらの原本は固定コミットの内容と一致し、個別の著作権表示を保持しています。
UIKitをブラウザ用DOMへ、RealmをIndexedDBへ置き換え、Web版では購入機能やiCloud連携などを省きました。

## 以前の確認事項と対応

| 項目 | 今回の処置 | 証拠 |
| --- | --- | --- |
| 既成WASMと対応ソースが不明確 | FC/SFC/MDを固定バージョンのソースとWeb用のlibretro接続部からビルド。mGBAを含め同梱するソースだけで再ビルドし、JS/WASM全8ファイルのSHA-256一致を確認 | sources/build-evidence.json、各BUILD.md |
| 非商用コアとGPLコードとの組み合わせ | Snes9xとGenesis Plus GXを配布から除外。SFCはMesen-S、MDはClownMDEmuに置換。EmulatorJS・RetroArchフロントエンドも除外 | SOURCES.json、licenses/、ソースアーカイブ |
| 本家画像・ロゴ等の権利 | メニュー・設定のAGPLコードは保持し、アプリロゴ・ゲーム機ロゴを配布しない。ManicEMU標準スキンのみ、下記CC BY 4.0の個別確認に従って同梱。標準スキン4色と幾何学アイコンは新規作成。フォントはOS標準のみ | src/skin-art.js、src/skins.js、src/shared.js、assets/、NOTICES.md |
| 元ソースに含まれる画像・フォント・テストROM | Webビルドの依存ファイルと必要なビルド定義、ライセンスだけを選別。アーカイブ内部までROM形式・署名・危険パス・未登録変更を検査 | scripts/audit-content.py、RELEASE_CONTENT.json |

## コア・依存物の扱い

- mGBAとWeb bridge: MPL-2.0のファイル単位ソース公開・通知を維持。inihとEmscriptenの通知も同梱。
  MPL第3.3条によるAGPLとの組み合わせの扱いを MPL_SECONDARY_LICENSE.md に明記し、
  改変した room-link.js にも両方の許諾を表示。改変部分のMPL許諾も維持します。
- FCEUmm: GPL-2.0-or-laterからGPL-3.0を選択。Mesen-S: GPL-3.0-or-later。
  LGPL-2.1-or-laterの音声・フィルター部分はLGPL 3条に従いGPL-3.0との構成に使用。
  改変して再ビルドできる対応ソースを提供。ClownMDEmu: AGPL-3.0。
- GPLv3/AGPLv3はそれぞれ13条の結合規定に従い、GPL部分の元の通知を消さず提供。
  Mesen-S内部にあるRetroArch由来のGPLフィルターも、その通知を維持。
- BSD/MIT/zlib/Apache/LLVM exception等は licenses/ と元ソースコメントに全文・帰属を保持。
  PDF.jsのApacheライセンスに基づくブラウザ用ファイル、固定バージョン情報、ライブラリソースを提供。
  コアやPDF.jsの更新時はこの確認をやり直す必要があります。

## スキン・ROM・通信

Deltaのファイル形式を読む機能と、他人のスキンを再配布する権利は別です。
同梱は `BUNDLED_SKINS.json` に記録したCC BY 4.0の7件のみです。その他は同梱・プロキシ配布せず、利用者が選んだローカルファイルのみ端末で処理します。
作者ごとの利用条件が適用され、公式サイトで紹介されていても、再配布が許可されているとは限りません。
ゲームROM、実機から抽出したBIOS、利用者のセーブ、ゲーム画像、チートコード集は同梱しません。
FreeBIOSなどのオープンソースによる代替実装は、元の許諾・著作権表示を保持して同梱します。ROMやBIOSの入手先を案内しません。
所持やローカル処理だけで、任意のROMの取得・改変・利用が必ず適法になるとは表示しません。

通信プレイを始めない通常の動作では、取得先はこのサイトのアプリファイルだけです。
ユーザーファイルのアップロードAPI、分析・広告・クラウドセーブはありません。通信プレイを明示的に開始した場合だけ、
Celio中継サーバーへ接続し、32個のシリアル通信値と接続状態を送ります。ROM・セーブファイルを
送るAPIはありませんが、IPアドレスとゲームの通信内容はサーバー側へ伝わります。
liru55のMPL-2.0通信コードの改変版と原文・ライセンス・採用リビジョンを同梱しています。
既存のAGPLアプリ・GPLデバイス処理とのライセンス表示と対応ソースは維持しています。
個々のゲームで交換・対戦ができるかどうかは、ライセンスとは別に動作確認が必要です。
保存先・通信経路・HTTP送信防止と、その限界は PRIVACY_AUDIT.md に記録しています。

## 2026-10-09の公開前検査

- ROM共有のメニュー・実処理・未対応時のROMダウンロード処理を削除。古いメニュー設定でも復活しないことを確認。
- アーカイブ内も含めてROM・BIOS・第三者スキン・認証情報の候補を検査。公開対象Git履歴と現在の登録候補も検査。
- 本家参照ファイルの著作権・ライセンス・固定ハッシュ、対応ソースZIPと現在の編集可能なコードの一致を確認。
- 開発出力を除いた配布用コピーで検査し、公開工程では記録やソースZIPを自動で承認・再生成しない構成に変更。
- UIの機能別分割後にEdge全テストと対応WebKitテストを実施。結果・限界は RELEASE_VALIDATION.md に記録。

## 一次資料

- ManicEMUの[LICENSE](https://github.com/Manic-EMU/ManicEMU/blob/fbaeab79c214d5920bb51afa6f2d786fb2b12a58/LICENSE) と同梱AGPL本文
- [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/)、[GPL/AGPLの互換性](https://www.gnu.org/licenses/license-compatibility.en.html)
- [Mesen-S](https://github.com/libretro/Mesen-S/tree/9e4fdeb9b336470bc96beb8765b2e79c86a2da1e)、[ClownMDEmu](https://github.com/Clownacy/clownmdemu-libretro/tree/d43c2708b0a31c285ce16724b6c4a2e92af07346)
- [MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)、[文化庁：著作物の利用と許諾](https://www.bunka.go.jp/chosakuken/keiyaku_manual/1_1_1.html)
- [Delta公式スキン案内](https://faq.deltaemulator.com/using-delta/controller-skins)、[PDF.js](https://mozilla.github.io/pdf.js/getting_started/)

公開時はREADMEの手順に従い、check-releaseによる検査を行ってください。
ソースを削除した配布、別の素材・コアを追加した配布はこの確認の対象外です。

## 2026年10月9日の追加

ゲーム詳細をGameInfoView / GameInfoNavigationView / GameInfoDetailView / GameInfoCoverViewから移植し、
原本と変更通知を保持しました。NDSはlibretro/desmume2015の固定ソースをEmscripten 4.0.15で
ビルドしました。採用ファイルはGPL-2.0-or-laterと保持された許容的通知に従い、GPL-3.0を選択し、
AGPLとの結合は13条に従います。コンパイラの依存ファイルとビルド定義・通知を同梱します。
詳細は sources/nds-web/BUILD.md と sources/nds-build-evidence.json に記録します。
NDSの独立再ビルド成果物と配布JS/WASMのSHA-256を今回も比較し、一致を確認しました。
check-releaseはNDSも含め、対応ソースの固定ハッシュ・再ビルド証拠・配布バイナリを検査します。

外部カバーの検索・自動取得は、画像ごとの許諾を本プロジェクトで確認できないため公開版から除去しました。
Libretro Thumbnailsの公開リポジトリやクレジットを、個別画像の包括的な利用許諾とは扱いません。
カバー変更は端末内の画像選択と保存だけです。既存の利用者データは削除しません。
この判断は外部画像取得一般を違法と認定するものではありません。

## 選択できる追加コアと更新検査

VBA-Nextは `src/types.h` の「version 2, or ... any later version」に基づきGPL-3.0を選択します。
音声部分のLGPL-2.1-or-later、libretro-commonの許容的ライセンスと個別著作権表示も残します。
melonDSはGPL-3.0-or-laterで、FreeBIOSのBSD-2-Clause全文とGilead Kutnickの著作権表記を
Webページから参照できます。AGPLのWebアダプタとの結合はGPL/AGPL第13条に従います。

jgenesisはREADMEとLICENSEに基づくGPL-3.0です。AGPLのWebラッパーを追加し、即時セーブ出力用の
変更をソース内に明記しました。依存クレートのライセンスを一覧化し、MIT・Apache-2.0・BSD・Zlib・
Unicode等の通知とソースを同梱します。選択可能な代替ライセンスは原文を維持します。
対象ファイルには非商用限定のコアを採用していません。PicoDriveはその条件のため除外しました。
デスクトップUI・素材・テスト用バイナリは配布せず、未使用の32X内蔵ファームウェア参照を除去しました。
Webラッパーが生成するMD構成は本体単体だけです。Sega CD・32X・SFCの外部コプロセッサROMは同梱しません。

追加コアのソースは `alternate-c-cores-source.tar.gz` と `jgenesis-web-source.tar.gz`、ビルド手順は
`sources/alternate-web/BUILD.md`、依存一覧は同ディレクトリの `DEPENDENCIES.json` です。
公開判定では `sources/alternate-build-evidence.json` と配布バイナリ・アーカイブのハッシュを照合します。
ソースを取得できるリンクは `licenses.html` に常設し、変更版でも維持します。

64MBコアの更新検査は固定コミットから候補を作り、ソースの変更一覧・ビルド・保存互換性を確認します。
人によるライセンス確認と配布レビューを省略せず、Actionsの成果物は検査レポートだけに限定します。
新しい作者ソースや未審査のWASMを、自動で公開することはありません。

## 公開後の再確認 — 2026-10-09

### UIと構成

| 確認範囲 | 移植元・結果 |
| --- | --- |
| ライブラリ・下部タブ | GameListView / GamesNavigationView / HomeTabBar。機種別の一覧、検索、選択したタブのラベル表示を保持。ゲーム機のロゴは文字、アイコンは独自ベクターに置換 |
| ゲーム詳細・プレイ中メニュー | GameInfoView / GameInfoNavigationView / GameInfoDetailView / GameOptionsView / GameOption。詳細から明示的にプレイ、固定ヘッダー、グループと順序、ショートカットを確認 |
| ステート・復旧 | SaveStateListView。手動／自動、サムネイル、続ける、編集後の削除確認を確認。追記保存と自動復旧の保護はWeb版の安全策として維持 |
| 設定 | SettingsListView / SettingItem。「このWeb版について」を本家と同じ「その他」へ移動。購入・iCloud・ネイティブ専用項目は省略 |
| インポート | ImportServiceListView / ImportFileCollectionViewCell。独自の大きな導入カードを本家のファイル選択カードへ置換。クラウド・LAN・URLダウンロードは省略 |
| スキン・ボタン配置 | SkinSettingsView / FlexSkinSettingViewController / FlexItemView。プレビュー、ゲーム別スキン、画面／ボタンの編集を確認。標準の絵・幾何学アイコン、画面比率の維持と配置補助はWeb用 |
| 共通部品 | ASListPage / ASListItemView / ASNavigationView。行生成を src/components/rows.js に集約。既存DOM・エスケープ・入力操作を保持 |

参照Swiftは24ファイルすべて、固定コミットのGitオブジェクトとバイト単位で一致しました。
これは画面構成と操作のソース移植であり、UIKit自体の実行や全機能・全寸法の一致を意味しません。
Web版では音量・映像・入力設定は全ゲーム共通、スキン・配置・コア選択はゲーム別です。
この差は現在の設定モデルによるもので、ライセンスが移植を禁じているためではありません。
端末内保存、復旧、PWA更新、ブラウザの入力・音声・ファイル選択は引き続きWeb用の実装です。

### 各依存物の再確認

| 対象 | 確認した条件と配布上の処置 |
| --- | --- |
| ManicEMU | 原本の著作権・AGPL表示、変更通知、編集可能なWebソースとビルド手順、画面からのソース取得導線を保持 |
| mGBA / rom64 / Web接続部 | MPL原文と対応ソースを保持。第3.3条の追加許諾を明示。Exhibit Bを適用するソースヘッダーは検出されず、ライセンス本文中の雛形とは区別 |
| FCEUmm / DeSmuME 2015 / VBA-Next | GPL-2.0-or-laterの許諾を確認し、この構成ではGPL-3.0を選択。原文・作者・個別通知・対応ソースを保持 |
| Mesen-S / melonDS | GPLv3系の許諾と依存物通知を保持。MesenのLGPL部分の取り扱い、melonDSのBSD-2-Clause FreeBIOSの通知を確認 |
| ClownMDEmu | AGPL全文、コアとサブモジュールの固定版・作者通知・対応ソースを保持 |
| jgenesis | GPL-3.0の原文と改変通知を保持。依存一覧129項目の許諾種別、同梱ソースと通知を照合。MIT等の選択可能な許諾を維持 |
| Celio通信 | GPLデバイス処理とMPL通信処理を別ファイルで維持。後者の改変もMPLで提供し、組み合わせの追加許諾を明記。サーバー参照ソースと固定版を保持 |
| PDF.js / inih / ツールチェーン | Apache-2.0、BSD、MIT/NCSA、LLVM例外等の作者・全文・個別通知を保持。PDF.jsは同梱した固定版を使用 |
| 素材・利用者ファイル | 配布許諾を未確認のスキン、ゲーム画像、ゲームROM、実機抽出BIOSを同梱しない。許諾済みスキンは下記の固定一覧に限定。利用者ファイルのアップロードAPIは作成しない |

再スキャンの「non-commercial」候補2件は、claxonのApache-2.0説明と
gbc-lcdシェーダーのUnlicense本文で、いずれも商用・非商用の両方を許す文章でした。
非商用限定のコアを再導入したものではありません。
コアのバイナリと対応ソースの固定ハッシュ・再ビルド証拠は変更せず再照合します。

MPLの判断には[MPL本文](https://www.mozilla.org/en-US/MPL/2.0/)と
[Mozillaの組み合わせガイド](https://www.mozilla.org/en-US/MPL/2.0/combining-mpl-and-gpl/)を使用しました。
修正後、UI構成・通知・対応ソース・配布一覧を再確認し、公開には該当コミットのCI成功を必要とします。


## 2026-10-09 スキン互換対応の追加確認

Delta／Manicの公開形式仕様をもとに、配置の正規化・ブラウザ描画・入力アダプターを追加しました。
新規コードはAGPL-3.0-or-laterで提供します。Apple Core Imageのソースやバイナリは使用していません。
既存のManicEMU UI帰属表示、PDF.jsのApache-2.0表示は維持しています。

Solo Plastic GBA（aphaits）、Manic標準6機種、Delta標準DSの実ファイルはローカル検証専用です。
当初の互換テスト素材は同梱しません。後からCC BY 4.0の旧公式版7件だけを別途確認して同梱しました（下記参照）。Solo Plastic・Delta DSは同梱しません。
自動テストに使用する画像・ROMは新規作成したものです。公式案内へのリンクは配布許諾の代わりになりません。
未対応の効果・操作を明示し、完全互換という表示はしません。

## mGBA 6MiBセーブ対応版（2026-10-09）

`0ba86121bd92aa570d38301086d8e8f584238d62` のコンパイル依存ファイルを再収集し、配布するソースだけから別ディレクトリで再ビルド。JS・WASMの両方が一致しました。旧版との比較で、保持済みのライセンス・著作権通知と128件のコンパイル単位の冒頭通知に変更がないことを確認しました。ソース内の追加ライセンス通知も保持しています。Qtの自動バックアップ・USB接続コード、GUI素材はこのWebコアへ組み込んでいません。

ブリッジの変更はMPL-2.0で提供します。変更理由・固定リビジョン・ビルド手順は `sources/mgba-web-port/BUILD.md`、対応ソースと再ビルド結果は `SOURCES.json` と `sources/build-evidence.json` に記録しています。

3DSはループバックの専用開発サーバーだけで有効になる実装です。静的配布物の設定は無効で、Azaharのバイナリ・ユーザーのゲーム・鍵は含みません。3DSコアを配布する場合の依存物・対応ソース監査は別途必要です。今回の静的配布物のレビューを3DSバイナリの公開承認とは扱いません。


## 2026-10-09 CC BY 4.0の同梱スキン

`Manic-EMU/ManicEMUSkins` の固定コミット
`63c04f92febba461d10ea16ef00b0f76199a5b20` にある LICENSE（CC BY 4.0）と
README、GB・GBC・GBA・NES・SNES・MD・DS標準スキンを確認しました。
これは公開ライセンスによる許諾で、作者から個別の許諾回答を得たという意味ではありません。

- 原本ダウンロードのSHA-256、作品名、使用したファイル、配布用ファイルのハッシュを
  `BUNDLED_SKINS.json` に記録。参照するPDF 91枚を描画・目視確認し、ゲーム画像や
  コンソールメーカーのロゴ、外部フォントファイルを追加しないことを確認しました。
  作者によるManic EMUの表示は保持します。商標・意匠等の権利全般を保証する監査ではありません。
- 使用PDFと原文info.json、ライセンス・帰属・READMEを元素材ZIPに収録。macOSメタデータと未使用GB画像を除外。
  CC BY原文、元README、帰属・免責、変換内容を保持。画像はPNG、配置はWeb形式に変換。
- 選択画面からクレジットへリンク。コードのAGPLとは別の素材ライセンスとして明示し、
  追加制限やDRMを設けず、公認・推奨を示唆しません。
- 新しいSystem.coreの素材を一括採用しません。特にGBA最新版は旧版とバイト列が異なり、
  今回の許諾確認を引き継いだものとして扱いません。3DS・FLEX等も対象外です。
- `check-bundled-skins.py` で一覧外・変更・欠落・ZIP内の余分なファイルを拒否。
  `SOURCES.json` とリリースレビューで確認済み一覧自体も固定します。

一次資料：[採用版のLICENSE](https://github.com/Manic-EMU/ManicEMUSkins/blob/63c04f92febba461d10ea16ef00b0f76199a5b20/LICENSE)、
[CC BY 4.0の条件](https://creativecommons.org/licenses/by/4.0/deed.ja)。
配布元と素材の詳細は [素材の記録](sources/manic-skins/README.md) を参照してください。

## 0.3.15: 上流更新の反映（2026-10-12）

Celio-Serverの固定版8f509bdcのソース一式とGPL全文を検査し、テスト用ソースとして同梱します。
サーバーコードやnpm依存物をWeb実行物へ組み込む変更ではありません。room-link.jsの既存の
MPL-2.0通知、MPL 3.3によるAGPL-3.0-or-laterの提供、移植元ソースを維持し、変更日を追加しました。

FCEUmmは既存のGPL-2.0-or-laterのCファイル1件へ上流Mapper 176修正をバックポート。
元の権利通知は不変で、変更通知を追加しています。ステートの保存フィールド、依存関係、
残りのソースは変更していません。修正を含む対応ソースから独立再ビルドし、JS/WASMが一致しました。
修正版ソース・ビルド手順・ハッシュ・旧版との互換検査を同じ配布に揃えています。
新しいユーザー素材・ROM・ゲーム画像・BIOSは配布しません。詳細はUPSTREAM_REVIEW.mdとNOTICES.mdを参照してください。


## 0.3.16: 日本語の変更案内とタッチ操作（2026-10-12）

notices.htmlは日本語の要約として新規作成し、NOTICES.mdの原文・著作権表示・ライセンス全文・対応ソースへのリンクを維持します。原文の削除や非公式の翻訳への置き換えは行っていません。クレジット画面と履歴は同じrelease-notes.jsonから生成し、版の一致と生成結果を公開時に確認します。

追加するHTML・CSS・生成スクリプトと変更した検査はAGPL-3.0-or-later。新しい依存ライブラリ・第三者素材・コアはありません。Android向け対策はプレイ中だけのCSSによるスクロール伝播抑止で、ROM・セーブ・通信先・データ送信条件に変更はありません。対応ソースZIPと配布一覧へ新規ファイルを含めます。


## 0.3.17: 表示言語と構成整理（2026-10-12）

翻訳処理・英訳・共通部品・検査はAGPL-3.0-or-laterで新規作成。ManicEMU由来の画面をviewsへ、共通行をcomponentsへ移し、著作権者名と元のライセンス表示を保持しました。既存のGPL・MPLモジュールでは表示用の文言を翻訳関数へ渡す変更だけを行い、元のヘッダーと追加の提供条件を維持します。

英語化するのはアプリ側の説明と要約です。原ライセンス本文・著作権表示・原文へのリンクは残しています。新たな第三者ライブラリ、素材、コアバイナリ、通信先は加えていません。言語選択は端末のlocalStorageのみで、ROMやセーブの保存形式・保存キーは変更しません。対応ソース・移植対応表・配布記録にも移動先と新規ファイルを含めます。
## 0.3.18: 追加言語

中国語（簡体字・繁体字）・韓国語・スペイン語・フランス語・ドイツ語・ポルトガル語のアプリ文言を追加。元のライセンス全文・著作権者・URL・対応ソースは保持し、クレジットと変更通知の説明・要約を各言語で表示します。翻訳補助の経緯と範囲は`LOCALIZATION_REVIEW.md`に記録しています。翻訳用モデル・実行プログラムは開発用で、配布物・対応ソースZIPに含めません。新しい実行時ライブラリ、素材、コア、通信先は追加していません。

## 0.3.19: 翻訳用の開発ツール（2026-10-13）

Acorn 8.15.0の公式npm配布物から`dist/acorn.mjs`を取得し、npmのSHA-512 integrityを照合しました。元のMIT著作権・許諾文を`licenses/Acorn-MIT.txt`へ保存し、クレジットから上流・原文・ソースへリンクしています。Gitタグ8.15.0の注釈付きタグ`b63a4e15ce4ca3d4c85025f7e25cd83337198f78`はコミット`6dc537416ad628b3959b3ff963fbdcfdb380e0a3`を指します。そのタグのソースアーカイブ内のLICENSEと配布する原文を照合し、AUTHORSも保持しました。版・タグ・コミット・配布物と原文とソースのSHA-256は`SOURCES.json`と`scripts/i18n/vendor/acorn.json`に固定しています。

Acornは開発時のJavaScript構文解析だけに使用します。改変せずにMITの条件を保持して配布し、Web UIのAGPL表示をAcornへ適用するものではありません。翻訳生成器は新規のAGPL-3.0-or-laterコードです。Ollama・Gemmaの実行ファイルやモデルは同梱しません。使用する開発環境と原文を保持する範囲は`LOCALIZATION_REVIEW.md`に記録しています。コア、スキン、既存ライセンス原文の変更はありません。

ソースアーカイブには上流の同一リポジトリ内を指す作業用シンボリックリンクが2件あったため、配布検査の方針に従ってその2件だけを除去しました。通常ファイルの内容は全件一致を確認しています。変換前後のハッシュを固定し、`scripts/prepare-acorn.py`で再現できます。
