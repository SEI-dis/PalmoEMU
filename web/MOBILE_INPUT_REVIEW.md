# モバイルのジェスチャー確認（2026-10-12）

0.3.16では、Androidのブラウザ操作がゲーム入力へ干渉する経路を確認しました。
ブラウザの誤操作をゲーム画面内で抑え、入力欄・通信パネル・通常のページ操作を維持します。
Android端末固有の現象を再現した報告ではありません。

| 操作 | 現状と対応 |
| --- | --- |
| 下へ引っ張って更新、端のスクロール効果 | 追加対応。`#player`と、ゲームを開いている間だけのhtml/bodyに`overscroll-behavior: none`を指定。ゲーム中のダイアログは`contain`で外へ伝播させず、内部スクロールを維持する。ライブラリへ戻ると通常の値へ戻る |
| ダブルタップ、タップしてからドラッグする拡大、2本指の拡大 | 既存の`touch-action`とプレイヤー内のジェスチャー抑止を維持。ゲームボタン／画面は`none`、通信欄の縦スクロールを許すプレイヤーは`pan-y`。ページ全体のviewportにズーム禁止は設定しない |
| 長押しの文字選択・検索・画像メニュー・ドラッグ | 既存の`user-select`、iOS用の`-webkit-touch-callout`、contextmenu/selectstart/dragstart抑止でプレイヤーの文字・余白を含めて対応。Androidに無効なiOS専用CSSだけに依存していない |
| 通信番号・編集欄の選択、コピー・貼り付け | input／textarea／select／contenteditableをイベント抑止から除外。タッチの終了を一律に取り消さず、メニュー・保存・読込・速度などのネイティブclickを維持 |
| ブラウザやOSがタッチを中断した後の入力 | 既存のpointercancel、touchcancel、キャプチャ消失、全指の終了、次のタッチ開始時の解除を維持。長押しをタイマーで打ち切らない。回転・一時停止でも解除する |
| 戻る・ホーム・アプリ切替、通知の操作 | OSの操作を奪わない。WebページからネイティブAndroidアプリ用の除外APIを使うことはできない。履歴を増やして戻る操作を閉じ込める処理は追加しない |
| Androidの拡大補助・スクリーンリーダー、ブラウザの拡大強制 | アクセシビリティ設定として維持。ブラウザの通常ジェスチャー対策とOSの拡大補助は別。Webアプリから無効にする対象にしない |

## 根拠

- [Chrome：overscrollと引っ張り更新](https://developer.chrome.com/blog/overscroll-behavior) — 固定パネルのスクロール伝播と、ルート要素での更新ジェスチャー抑止。
- [W3C Pointer Events：touch-action](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property) — 先祖要素との判定、ジェスチャー開始後の変更は適用されないこと、選択やリンク操作は別の既定動作であること。
- [Chrome：passiveなタッチリスナー](https://developer.chrome.com/blog/scrolling-intervention) — ルートのリスナーでpreventDefaultだけに依存しない。追加対応はCSSで行い、新しい非passiveリスナーやタッチごとの計算は追加しない。
- [Android：ジェスチャーナビゲーション](https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav) — OSの戻る・ホーム・アプリ切替とアプリ操作の違い。ここで説明されるネイティブAPIをWeb用APIとして扱わない。
- [Android：画面の拡大補助](https://support.google.com/accessibility/android/answer/6006949?hl=ja) — OSのユーザー補助設定による拡大とWebページのズームは別。

## 自動確認の範囲

`player-gestures.cjs`でプレイヤー表示中／終了後のoverscroll設定、メニューと通信欄、
連打・ピンチ・速度ボタン・中断復帰・回転後の操作を確認します。
Chromiumでは実タッチイベントを注入し、通常ページが拡大できる対照試験も行います。
`player-selection.cjs`、`touch-recovery.cjs`、`link-panel.cjs`で選択・入力・同時押し・
通知欠落時の復旧・パネルの操作を継続確認します。ROMは自作の合成データだけを使用します。

使用したWindows版のPlaywright WebKitは`overscroll-behavior`を実装していません。
このCSSだけの検査は未対応と明記してスキップし、残りの入力検査は実行します。
CIでも対応を検出して同じ範囲を区別します。Chromium側ではCSS対応を必須にしています。
PCでの自動確認は、Android Chromeの更新アニメーションやiPhoneホーム画面版、
Samsung Internet・Firefox Android、OSの拡大補助を実機で確認したことにはなりません。
