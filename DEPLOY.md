# Cylink デプロイ手順

## 現在の状態
- フロントエンド: Vercelにデプロイ済み (https://www.cylink.click)
- バックエンド: デプロイ待ち

## バックエンドデプロイ手順（Render.com）

### 1. Render.comにサインアップ/ログイン
https://render.com にアクセスしてGitHubアカウントでログイン

### 2. 新しいWebサービスを作成
1. Dashboard → "New" → "Web Service"
2. "Connect a repository" → GitHubリポジトリ `ToF-Aki/cylink` を選択
3. 以下の設定を入力:

| 項目 | 値 |
|------|-----|
| Name | cylink-backend |
| Region | Singapore (Asia Pacific) |
| Branch | main |
| Root Directory | backend |
| Runtime | Docker |
| Plan | Free |

### 3. 環境変数を設定
| Key | Value |
|-----|-------|
| PORT | 3001 |
| NODE_ENV | production |
| CORS_ORIGIN | https://www.cylink.click,https://cylink.click |

### 4. "Create Web Service" をクリック
ビルドが完了するまで数分待つ

### 5. バックエンドURLをコピー
例: `https://cylink-backend.onrender.com`

## Vercel環境変数更新

### 1. Vercelダッシュボード
https://vercel.com → cylink プロジェクト → Settings → Environment Variables

### 2. 環境変数を追加/更新
| Key | Value |
|-----|-------|
| NEXT_PUBLIC_API_URL | https://cylink-backend.onrender.com |

### 3. 再デプロイ
Deployments → 最新のデプロイ → "Redeploy"

## 動作確認
1. https://www.cylink.click/admin にアクセス
2. イベントを作成
3. QRコードをスマホで読み取り
4. 色が変更されることを確認
5. プログラムモードをテスト

## 注意事項
- Render.com無料プランはスリープ機能あり（15分アイドルで停止）
- 500人対応が必要な場合は有料プラン($7/月〜)を検討
- Redisは現在未設定（スケーリング時に追加）

## 新機能（v2）
- プログラムモード: タイムラインエディタで光のシーケンスを作成
- 新エフェクト: フェード、レインボー、ストロボ
- 500人同時接続対応の最適化済み
