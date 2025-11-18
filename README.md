# Cylink - イベントライト制御システム

Cylinkは、スマートフォンの画面を光らせてイベントを盛り上げるWebアプリケーションです。管理者がリアルタイムで色を制御し、最大1000人規模の同時接続に対応しています。

## 主な機能

- **管理画面**: イベント作成、QRコード生成、リアルタイム色制御、接続ユーザー数表示
- **ユーザー画面**: QRコードスキャンまたはセッションID入力で参加、リアルタイム色同期
- **スケーラブル**: Redis AdapterによるWebSocketの水平スケーリング対応
- **AWS対応**: ECS Fargate、ALB、ElastiCacheを使用した本番環境構成

## 技術スタック

### フロントエンド
- Next.js 16 (App Router)
- React 19
- TypeScript
- TailwindCSS
- Socket.io Client
- QR Code React

### バックエンド
- Node.js 20
- Express
- Socket.io
- Redis (ioredis)
- TypeScript

### インフラ
- Docker & Docker Compose
- AWS ECS Fargate
- AWS ElastiCache (Redis)
- AWS Application Load Balancer
- AWS Route 53
- AWS Certificate Manager

## プロジェクト構成

```
cylink/
├── frontend/              # Next.jsフロントエンド
│   ├── app/
│   │   ├── page.tsx      # トップページ
│   │   ├── admin/        # 管理画面
│   │   ├── join/         # 参加ページ
│   │   └── event/        # イベント（ライト）ページ
│   ├── Dockerfile
│   └── package.json
├── backend/               # Node.jsバックエンド
│   ├── src/
│   │   └── index.ts      # WebSocketサーバー
│   ├── Dockerfile
│   └── package.json
├── docs/                  # ドキュメント
│   ├── AWS_SETUP.md      # AWS構築手順書
│   └── DOMAIN_SETUP.md   # ドメイン設定手順書
└── docker-compose.yml     # Docker Compose設定
```

## ローカル開発環境のセットアップ

### 必要な環境

- Node.js 20以上
- Docker & Docker Compose（推奨）
- npm

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd cylink
```

### 2. 環境変数の設定

**バックエンド**:

```bash
cd backend
cp .env.example .env
```

`.env`の内容:
```
PORT=3001
NODE_ENV=development
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:3000
```

**フロントエンド**:

```bash
cd ../frontend
cp .env.local.example .env.local
```

`.env.local`の内容:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 3. Docker Composeで起動（推奨）

```bash
# プロジェクトルートで実行
docker-compose up --build
```

アクセス:
- フロントエンド: http://localhost:3000
- バックエンド: http://localhost:3001

### 4. 手動セットアップ（Docker不使用）

**Redisをインストール**:

```bash
# macOS
brew install redis
redis-server

# または Dockerで起動
docker run -d -p 6379:6379 redis:7-alpine
```

**バックエンドの起動**:

```bash
cd backend
npm install
npm run dev
```

**フロントエンドの起動**:

```bash
cd frontend
npm install
npm run dev
```

## 使い方

### 1. 管理者としてイベントを作成

1. http://localhost:3000 にアクセス
2. 「管理者としてイベントを作成」をクリック
3. イベント名を入力して作成
4. QRコードが生成されます

### 2. 参加者がイベントに参加

**方法1: QRコードをスキャン**
- スマートフォンのカメラでQRコードを読み取る
- 自動的にイベントページにリダイレクト

**方法2: 手動で参加**
1. http://localhost:3000/join にアクセス
2. セッションIDを入力
3. 「参加する」をクリック

### 3. 色を制御

管理画面で以下の方法で色を変更:
- プリセットカラーボタンをクリック
- カスタムカラーピッカーで自由に色を選択

参加者の画面がリアルタイムで同じ色に変わります。

## 本番環境へのデプロイ

詳細な手順は以下のドキュメントを参照してください:

1. [AWS構築手順書](docs/AWS_SETUP.md)
   - AWSアカウント作成
   - VPC、ECS、Redis、ALB等の設定
   - 1000人規模対応のスケーラブル構成

2. [ドメイン設定手順書](docs/DOMAIN_SETUP.md)
   - ドメイン取得
   - Route 53でのDNS設定
   - SSL証明書の発行

### クイックデプロイ

```bash
# 1. ECRにログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com

# 2. イメージをビルド＆プッシュ
docker build -t cylink/backend ./backend
docker tag cylink/backend:latest <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/backend:latest
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/backend:latest

docker build -t cylink/frontend --build-arg NEXT_PUBLIC_API_URL=https://yourdomain.com ./frontend
docker tag cylink/frontend:latest <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/frontend:latest
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/frontend:latest

# 3. ECSサービスを更新
aws ecs update-service \
  --cluster cylink-cluster \
  --service cylink-backend-service \
  --force-new-deployment

aws ecs update-service \
  --cluster cylink-cluster \
  --service cylink-frontend-service \
  --force-new-deployment
```

## アーキテクチャ

### システム構成図

```
[参加者のスマホ] ─┐
[参加者のスマホ] ─┼─→ [ALB] ─→ [ECS Fargate]
[管理者PC]      ─┘            ├─ Frontend (Next.js)
                              └─ Backend (Socket.io)
                                   │
                                   └─→ [ElastiCache Redis]
                                        (セッション同期)
```

### スケーリング戦略

1. **ECS Auto Scaling**
   - CPU使用率70%でスケールアウト
   - 最小2タスク、最大10タスク

2. **Redis Adapter**
   - 複数のバックエンドタスク間でWebSocket接続を共有
   - Pub/Subパターンでリアルタイム同期

3. **ALB**
   - ヘルスチェックで異常タスクを自動除外
   - Stickyセッションでユーザー接続を維持

## パフォーマンス

- **同時接続数**: 1000人以上対応
- **レイテンシ**: 色変更の伝播 < 100ms
- **可用性**: ALB + マルチAZ構成で99.9%以上

## セキュリティ

- **HTTPS/TLS**: ACM証明書による暗号化通信
- **CORS**: 許可されたオリジンのみアクセス可能
- **VPC**: バックエンドとRedisはプライベートサブネット配置
- **IAM**: 最小権限の原則に基づくロール設定

## トラブルシューティング

### ローカル開発

**WebSocket接続エラー**:
- バックエンドが起動しているか確認: `curl http://localhost:3001/health`
- Redisが起動しているか確認: `redis-cli ping`

**フロントエンドが表示されない**:
- `.env.local`の`NEXT_PUBLIC_API_URL`が正しいか確認
- Next.jsを再起動: `npm run dev`

### 本番環境

**ECSタスクが起動しない**:
```bash
# ログ確認
aws logs tail /ecs/cylink-backend --follow
```

**WebSocketが切断される**:
- ALBのアイドルタイムアウトを確認（デフォルト60秒）
- Stickyセッションが有効か確認

## コスト見積もり

### 開発環境（ローカル）
- **無料**（Dockerのみ）

### 本番環境（AWS）
- **基本構成**: 約$140〜200/月
  - ECS Fargate: $53
  - ElastiCache Redis: $60
  - ALB: $25
  - Route 53: $0.50
  - データ転送: 変動

- **1000人イベント時（3時間）**: 追加$0.50程度

## ライセンス

ISC

## サポート

質問や問題が発生した場合は、GitHubのIssuesで報告してください。

## ロードマップ

- [ ] エフェクトモード（点滅、グラデーション等）
- [ ] イベント履歴の保存
- [ ] 参加者統計ダッシュボード
- [ ] マルチイベント同時開催対応
- [ ] モバイルアプリ化

---

**Cylink** - スマホをライトに変えて、イベントを盛り上げる
