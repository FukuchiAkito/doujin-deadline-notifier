# 実運用に向けた強化検討メモ

このドキュメントは、MVP完成後に検討する技術的な強化案をまとめたものです。
記載内容は現時点では設計検討であり、コードやAWS構成に未反映の項目を含みます。

## 1. DynamoDB設計

### Deadline IDの安定性

スクレイピングのたびにDeadlineのIDが変わると、既存Watchの紐付けが切れる可能性があります。
印刷所サイトの表記ゆれや説明文の微修正に影響されないよう、次のような正規化済み項目から決定論的にIDを生成します。

- `printShopId`
- `eventName`
- `eventDate`
- `label`
- `deliveryLabel`
- 必要に応じて`deadlineCondition`や`rowLabel`

将来的にはUUID v5、または正規化文字列のハッシュを利用します。締切日時だけをIDの材料にすると、締切変更時に別レコード扱いになるため注意します。

### 締切一覧用GSI

印刷所を横断して直近の締切を取得する必要が出た場合は、DeadlinesTableに次のGSIを追加します。

```text
GSI1PK = ALL_DEADLINES または STATUS#ACTIVE
GSI1SK = deadlineAt
```

現在のMVPはオレンジ工房の一覧取得が中心であり、すぐにGSIを追加する必要はありません。アクセス量や印刷所数が増えた段階で追加します。

### DeadlineのTTL

終了済みイベントを一定期間保持した後に自動削除するため、DeadlineレコードにTTL用のエポック秒属性を追加します。

- `ttl = eventDate`から一定期間後
- 監査や問い合わせに必要な保持期間を先に決める
- DynamoDB TTLは削除時刻を厳密に保証しないため、アプリ側でも過去データを除外する

履歴を残したい場合は、現行テーブルにTTLを追加する前に履歴テーブルやS3保存の要否を検討します。

## 2. Reminder Lambdaの冪等性

現在はPush送信成功後にWatchの`notifiedDays`を更新します。送信処理とDynamoDB更新の間でLambdaが停止すると、次回実行時に二重送信される可能性があります。

将来の改善案：

- `notifiedStages`または`notifiedDays`を通知成功時に条件付き更新する
- DynamoDBの`ConditionExpression`で同じ通知ステージの更新競合を防ぐ
- `lastNotifiedAt`を保存して調査可能にする
- 送信試行・成功・失敗を必要最小限のログで記録する

完全なExactly-once配信はWeb Pushの性質上保証できないため、実用上は「条件付き更新による重複抑制」と「失敗時の再試行」のバランスを取ります。

## 3. Web Pushの拡張

### iOS Safari / PWA

iOSではWeb Push利用時にホーム画面への追加が必要になるケースがあります。iOS端末では、次の導線をUIに追加します。

- ホーム画面への追加案内
- 通知許可が表示されない場合の説明
- PWAとして起動しているかの確認

これはWeb版のUX改善であり、MVPのサーバー構成を変更するものではありません。

### モバイルPushへの拡張

将来のネイティブアプリ対応では、Push購読をWeb Push専用の属性に固定しない構造へ拡張します。

```text
PushSubscription
├─ platform: web | ios | android
├─ provider: webpush | apns | fcm
├─ endpoint / token
├─ deviceId
└─ updatedAt
```

通知送信処理も、`NotificationSender`のようなプロバイダー単位の実装へ分離します。ただし、MVPではWeb Pushのみを維持します。

## 4. 匿名セッションからアカウント連携へ

現在はHttpOnly Cookieのセッションから`deviceId`を解決し、そのデバイスのWatchとPush購読だけを操作します。`deviceId`をリクエストパラメータから直接信頼しないことが重要です。

複数端末同期が必要になった場合は、次のように所有者の概念を抽象化します。

```text
現在: DEVICE#{deviceId}
将来: USER#{userId}
          ├─ Watch
          └─ 複数端末のPushSubscription
```

移行時は、WatchやPush購読の所有者キーを直接書き換えるのではなく、次のいずれかを検討します。

- `ownerId`を導入してデバイスとユーザーを抽象化する
- 既存データを移行するバッチを用意する
- 匿名セッションをアカウントへリンクするAPIを追加する

## 5. 優先順位

### 近い将来に検討

1. Deadline IDの決定論的生成をテストで固定する
2. Reminderの通知済み更新に条件付き書き込みを追加する
3. スクレイピング件数0件や急減を監視・通知する
4. iOS向けのPWAインストール案内を追加する

### 規模拡大時に対応

1. 複数印刷所とスクレーパー登録機構
2. 締切横断検索用GSI
3. Deadline TTLと履歴保持方針
4. ユーザーアカウントと複数端末同期
5. APNs / FCM対応

### MVPでは実装しない

- UUID v5専用ライブラリの導入
- APNs / FCM用インフラ
- 本格的なアカウント管理
- 通知配信基盤やキューの導入
- 複雑な加工条件の計算

