# 同人誌締切監視

オレンジ工房の公開締切情報を取得し、ブラウザ単位で作業進捗とWeb Push通知を管理する2日MVPです。

## MVP範囲

- オレンジ工房のみ
- 締切一覧、監視追加、`未着手 / 作業中 / 入稿済み` の進捗更新
- 7日・3日・1日前のWeb Push通知
- 匿名ブラウザセッション。リクエストで端末IDを受け取らず、`HttpOnly` Cookieから所有者を解決

ページ数、加工、PP、納品方法などにより締切が変わるため、アプリの情報は参考情報です。入稿前には必ず公式ページを確認してください。

## ローカル起動

```powershell
Copy-Item .env.example .env.local
npm.cmd run dev
```

ローカル環境ではDynamoDB未設定時に開発用の締切データとインメモリストアを使います。本番では3テーブルすべての環境変数が必須です。

## AWSデプロイ

1. オレンジ工房に、対象URLを1日1〜2回取得し締切情報を表示することの許諾を確認する。
2. `sam build --template-file infra/template.yaml` と `sam deploy --guided --template-file .aws-sam/build/template.yaml` を実行する。
3. 出力された3テーブル名をAmplify Hostingの `DEADLINES_TABLE`、`USER_DATA_TABLE`、`SESSIONS_TABLE` に設定する。
4. `npx.cmd web-push generate-vapid-keys` で鍵を生成し、秘密鍵をSSM Parameter Storeの `/doujin-deadline-notifier/vapid-private-key` にSecureStringとして登録する。
5. Amplify Hostingへリポジトリを接続し、`APP_ORIGIN`、`NEXT_PUBLIC_VAPID_PUBLIC_KEY`、`VAPID_PUBLIC_KEY`、`VAPID_SUBJECT` を設定する。
6. Scraper Lambdaを手動実行して締切データを初回投入し、通知購読後にReminder Lambdaを手動実行して確認する。

LambdaはEventBridge Schedulerにより、スクレイピングを毎日06:00 JST、通知判定を毎日09:00 JSTに実行します。

## API

- `POST /api/v1/session`
- `GET /api/v1/deadlines`
- `GET /api/v1/watches`
- `POST /api/v1/watches`
- `PATCH /api/v1/watches/{deadlineId}`
- `DELETE /api/v1/watches/{deadlineId}`
- `POST /api/v1/push-subscriptions`
