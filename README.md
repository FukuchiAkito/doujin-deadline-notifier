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
2. `npx.cmd web-push generate-vapid-keys --json` で鍵を生成する。公開鍵と秘密鍵は必ず同じペアを使う。
3. private keyだけをSSM Parameter Storeの `/doujin-deadline-notifier/vapid-private-key` にSecureStringとして登録する。公開鍵はAmplifyの `NEXT_PUBLIC_VAPID_PUBLIC_KEY` とSAMの `VapidPublicKey` に同じ値を設定する。
4. `sam build --template-file infra/template.yaml` を実行し、次のように `--resolve-s3` と公開鍵パラメータを指定してデプロイする。

   `sam deploy --template-file .aws-sam/build/template.yaml --stack-name doujin-deadline-notifier --region ap-northeast-1 --capabilities CAPABILITY_IAM --resolve-s3 --parameter-overrides VapidPublicKey=<public-key>`

5. Amplify Hostingへリポジトリの `main` ブランチを接続し、`APP_ORIGIN` は末尾 `/` なしの本番URL（現在は `https://main.d3cnnf07w82zjd.amplifyapp.com`）、`NEXT_PUBLIC_VAPID_PUBLIC_KEY` はSAMと同じ公開鍵を設定する。
6. `VAPID_SUBJECT` は本番URLまたは実際の連絡先 `mailto:` に設定する。現在の本番originは `https://main.d3cnnf07w82zjd.amplifyapp.com`。
7. Amplify SSR Compute Roleに `infra/amplify-ssr-data-policy.json` を付与し、AmplifyアプリのCompute roleへ関連付ける。信頼ポリシーは `infra/amplify-ssr-compute-trust-policy.json` を使う。
8. Scraper Lambdaを手動実行して締切データを初回投入し、通知購読後にReminder Lambdaを手動実行して確認する。

LambdaはEventBridge Schedulerにより、スクレイピングを毎日06:00 JST、通知判定を毎日09:00 JSTに実行します。

## API

- `POST /api/v1/session`
- `GET /api/v1/deadlines`
- `GET /api/v1/watches`
- `POST /api/v1/watches`
- `PATCH /api/v1/watches/{deadlineId}`
- `DELETE /api/v1/watches/{deadlineId}`
- `POST /api/v1/push-subscriptions`
