# iOS実装メモ（快適操作・操作して楽しい）

## 実施した対応

### 1. HTML（index.html）
- **format-detection**: `telephone=no` で電話番号の自動リンクを無効化
- **apple-mobile-web-app-capable**: ホーム画面に追加した際にフルスクリーン表示
- **apple-mobile-web-app-status-bar-style**: `black-translucent` でステータスバーとコンテンツの一体化
- **apple-mobile-web-app-title**: ホーム画面のアイコン名を「出張プログラム」に

### 2. 音声・触覚（app.js）
- **画面復帰で音声再開**: `visibilitychange` と `pageshow` でタブ復帰・bfcache復帰時に `AudioContext` と BGM を再開
- **触覚フィードバック**: ボタンタップ・ドロップ時に `navigator.vibrate(12)` で短い振動（対応端末のみ。iOS Safari は未対応のため無視される）
- **スタートボタン**: 「出張する？」タップ時にも触覚を発火

### 3. タッチ操作の快適さ（style.css）
- **タッチターゲット**: ボタン・タグ・入力欄を **44px 以上**（Apple HIG 推奨）に統一  
  - 月送りボタン、音量/作業モード、アクションボタン、地域タグ、追加ボタン、スタートボタン
- **入力フォント 16px**: `.custom-input` を `font-size: 16px` に固定し、iOS のフォーカス時ズームを防止
- **タップハイライト無効**: `-webkit-tap-highlight-color: transparent` でボタン・タグ・カレンダーセルのグレー閃光を抑制
- **:active フィードバック**: タップ時に `scale(0.96〜0.97)` で押した感を付与（スタート・アクション・タグ・カレンダー・追加ボタン）
- **トランジション**: ボタン・セルを `0.12s` の短い transition でスナップ感を向上

### 4. セーフエリア（既存＋補強）
- コンテナ・アクションバー・スタート画面に `env(safe-area-inset-*)` を適用済み
- スタート画面に `padding-top/bottom/left/right` でセーフエリアを追加し、ノッチ・ホームインジケータで隠れないように調整

## 操作して「楽しい」ポイント
- ボタン・タグ・カレンダーセルの **:active** で押した瞬間の視覚フィードバック
- 効果音（ぴこ）＋対応端末では **振動** で操作の手応え
- タップハイライトを消して **見た目をすっきり**、ドラクエ風UIの雰囲気を維持

## 注意（iOS Safari）
- **navigator.vibrate** は iOS Safari では未対応のため、振動は Android 等のみ
- ドラッグ＆ドロップは iOS 11+ で動作するが、不具合が出る場合はタッチ専用ドラッグ実装の検討を推奨
