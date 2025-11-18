# AWS構築手順書 - Cylink

このドキュメントでは、Cylinkアプリケーションを1000人規模の同時接続に対応できるようAWS上に構築する手順を説明します。

## 目次

1. [AWSアカウントの作成](#1-awsアカウントの作成)
2. [IAMユーザーの設定](#2-iamユーザーの設定)
3. [AWS CLIのインストールと設定](#3-aws-cliのインストールと設定)
4. [VPCとネットワーク設定](#4-vpcとネットワーク設定)
5. [ElastiCache (Redis) の設定](#5-elasticache-redis-の設定)
6. [ECR (Container Registry) の設定](#6-ecr-container-registry-の設定)
7. [ECS Fargateの設定](#7-ecs-fargateの設定)
8. [Application Load Balancer (ALB)の設定](#8-application-load-balancer-albの設定)
9. [Auto Scalingの設定](#9-auto-scalingの設定)
10. [Route 53でのDNS設定](#10-route-53でのdns設定)
11. [SSL証明書の設定](#11-ssl証明書の設定)
12. [デプロイ手順](#12-デプロイ手順)

---

## 1. AWSアカウントの作成

### 手順

1. **AWS公式サイトにアクセス**
   - https://aws.amazon.com/jp/ にアクセス
   - 「AWSアカウントを作成」をクリック

2. **メールアドレスとパスワードを設定**
   - ルートユーザーのメールアドレスを入力
   - AWSアカウント名を入力（例: cylink-production）

3. **連絡先情報の入力**
   - 個人またはビジネスを選択
   - 住所、電話番号を入力

4. **支払い情報の入力**
   - クレジットカード情報を登録
   - 本人確認のため、1ドルの一時的な請求が発生します

5. **IDの確認**
   - 電話番号による本人確認を実施

6. **サポートプランの選択**
   - 本番環境では「ビジネスサポート」を推奨（月額100ドル〜）
   - 開発段階では「ベーシックサポート」（無料）でOK

7. **アカウント作成完了**
   - 数分後にアカウントが有効化されます

### 注意事項

- ルートユーザーは強力な権限を持つため、MFA（多要素認証）を必ず有効化してください
- 日常的な作業にはIAMユーザーを使用します（次のセクション参照）

---

## 2. IAMユーザーの設定

### 管理者ユーザーの作成

1. **IAMコンソールにアクセス**
   - AWSマネジメントコンソールにログイン
   - 「IAM」サービスを検索して開く

2. **ユーザーの作成**
   - 左メニューから「ユーザー」を選択
   - 「ユーザーを作成」をクリック
   - ユーザー名: `cylink-admin`
   - 「AWSマネジメントコンソールへのアクセスを提供する」をチェック

3. **権限の設定**
   - 「ポリシーを直接アタッチ」を選択
   - 以下のポリシーをアタッチ:
     - `AdministratorAccess`（初期設定用、後で制限することを推奨）

4. **タグの追加（オプション）**
   - キー: `Project`, 値: `Cylink`

5. **確認と作成**
   - ユーザー作成後、認証情報をダウンロード
   - **重要**: パスワードとアクセスキーは安全に保管

### MFAの有効化

1. 作成したユーザーでログイン
2. 右上のアカウント名 → 「セキュリティ認証情報」
3. 「MFAデバイスの割り当て」をクリック
4. スマホアプリ（Google Authenticator等）を使用して設定

---

## 3. AWS CLIのインストールと設定

### macOS

```bash
# Homebrewでインストール
brew install awscli

# バージョン確認
aws --version
```

### 設定

```bash
# AWS認証情報を設定
aws configure

# 入力内容:
AWS Access Key ID: [IAMユーザーのアクセスキー]
AWS Secret Access Key: [IAMユーザーのシークレットキー]
Default region name: ap-northeast-1  # 東京リージョン
Default output format: json
```

---

## 4. VPCとネットワーク設定

### VPCの作成

```bash
# VPC作成
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=cylink-vpc}]'

# VPC IDを記録（例: vpc-0123456789abcdef0）
VPC_ID=<YOUR_VPC_ID>
```

### サブネットの作成

```bash
# パブリックサブネット1 (AZ: ap-northeast-1a)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone ap-northeast-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=cylink-public-1a}]'

# パブリックサブネット2 (AZ: ap-northeast-1c)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone ap-northeast-1c \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=cylink-public-1c}]'

# プライベートサブネット1 (AZ: ap-northeast-1a)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.11.0/24 \
  --availability-zone ap-northeast-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=cylink-private-1a}]'

# プライベートサブネット2 (AZ: ap-northeast-1c)
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.12.0/24 \
  --availability-zone ap-northeast-1c \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=cylink-private-1c}]'
```

### インターネットゲートウェイの作成

```bash
# IGW作成
aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=cylink-igw}]'

# IGW IDを記録
IGW_ID=<YOUR_IGW_ID>

# VPCにアタッチ
aws ec2 attach-internet-gateway \
  --internet-gateway-id $IGW_ID \
  --vpc-id $VPC_ID
```

### ルートテーブルの設定

```bash
# パブリックルートテーブル作成
aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=cylink-public-rt}]'

# ルートテーブルIDを記録
PUBLIC_RT_ID=<YOUR_PUBLIC_RT_ID>

# インターネットへのルート追加
aws ec2 create-route \
  --route-table-id $PUBLIC_RT_ID \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id $IGW_ID

# パブリックサブネットを関連付け
aws ec2 associate-route-table \
  --route-table-id $PUBLIC_RT_ID \
  --subnet-id <PUBLIC_SUBNET_1A_ID>

aws ec2 associate-route-table \
  --route-table-id $PUBLIC_RT_ID \
  --subnet-id <PUBLIC_SUBNET_1C_ID>
```

---

## 5. ElastiCache (Redis) の設定

WebSocketの水平スケーリングに必要なRedisを設定します。

### セキュリティグループの作成

```bash
# Redisセキュリティグループ作成
aws ec2 create-security-group \
  --group-name cylink-redis-sg \
  --description "Security group for Cylink Redis" \
  --vpc-id $VPC_ID

# セキュリティグループIDを記録
REDIS_SG_ID=<YOUR_REDIS_SG_ID>

# ECSからのアクセスを許可（後でECS SGを設定後に実行）
aws ec2 authorize-security-group-ingress \
  --group-id $REDIS_SG_ID \
  --protocol tcp \
  --port 6379 \
  --source-group <ECS_SG_ID>
```

### サブネットグループの作成

```bash
aws elasticache create-cache-subnet-group \
  --cache-subnet-group-name cylink-redis-subnet-group \
  --cache-subnet-group-description "Subnet group for Cylink Redis" \
  --subnet-ids <PRIVATE_SUBNET_1A_ID> <PRIVATE_SUBNET_1C_ID>
```

### Redisクラスターの作成

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id cylink-redis \
  --engine redis \
  --cache-node-type cache.t3.medium \
  --num-cache-nodes 1 \
  --cache-subnet-group-name cylink-redis-subnet-group \
  --security-group-ids $REDIS_SG_ID \
  --tags Key=Name,Value=cylink-redis
```

**待機時間**: 5〜10分

### Redisエンドポイントの確認

```bash
aws elasticache describe-cache-clusters \
  --cache-cluster-id cylink-redis \
  --show-cache-node-info

# エンドポイントをメモ（例: cylink-redis.abc123.0001.apne1.cache.amazonaws.com:6379）
```

---

## 6. ECR (Container Registry) の設定

### リポジトリの作成

```bash
# バックエンド用
aws ecr create-repository \
  --repository-name cylink/backend \
  --region ap-northeast-1

# フロントエンド用
aws ecr create-repository \
  --repository-name cylink/frontend \
  --region ap-northeast-1

# リポジトリURIを記録
# 例: 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/backend
```

### Dockerイメージのビルドとプッシュ

```bash
# ECRにログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com

# プロジェクトディレクトリに移動
cd /path/to/cylink

# バックエンドイメージをビルド
docker build -t cylink/backend ./backend

# タグ付け
docker tag cylink/backend:latest \
  <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/backend:latest

# プッシュ
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/backend:latest

# フロントエンドも同様に実施
docker build -t cylink/frontend \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
  ./frontend

docker tag cylink/frontend:latest \
  <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/frontend:latest

docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/frontend:latest
```

---

## 7. ECS Fargateの設定

### ECSクラスターの作成

```bash
aws ecs create-cluster \
  --cluster-name cylink-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy \
    capacityProvider=FARGATE,weight=1,base=1 \
    capacityProvider=FARGATE_SPOT,weight=4
```

### セキュリティグループの作成

```bash
# ECSタスク用セキュリティグループ
aws ec2 create-security-group \
  --group-name cylink-ecs-sg \
  --description "Security group for Cylink ECS tasks" \
  --vpc-id $VPC_ID

ECS_SG_ID=<YOUR_ECS_SG_ID>

# ALBからのアクセスを許可（後でALB SG設定後に実行）
aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG_ID \
  --protocol tcp \
  --port 3001 \
  --source-group <ALB_SG_ID>

aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG_ID \
  --protocol tcp \
  --port 3000 \
  --source-group <ALB_SG_ID>
```

### IAMロールの作成

タスク実行ロール:

```bash
# 信頼ポリシーファイル作成
cat > ecs-task-execution-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# ロール作成
aws iam create-role \
  --role-name cylinkEcsTaskExecutionRole \
  --assume-role-policy-document file://ecs-task-execution-trust-policy.json

# マネージドポリシーをアタッチ
aws iam attach-role-policy \
  --role-name cylinkEcsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

### タスク定義の作成 - バックエンド

```bash
cat > backend-task-definition.json <<EOF
{
  "family": "cylink-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<AWS_ACCOUNT_ID>:role/cylinkEcsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/backend:latest",
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "PORT",
          "value": "3001"
        },
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "REDIS_URL",
          "value": "redis://<REDIS_ENDPOINT>:6379"
        },
        {
          "name": "CORS_ORIGIN",
          "value": "https://yourdomain.com"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/cylink-backend",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

# タスク定義を登録
aws ecs register-task-definition \
  --cli-input-json file://backend-task-definition.json
```

### タスク定義の作成 - フロントエンド

```bash
cat > frontend-task-definition.json <<EOF
{
  "family": "cylink-frontend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::<AWS_ACCOUNT_ID>:role/cylinkEcsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "frontend",
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/frontend:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NEXT_PUBLIC_API_URL",
          "value": "https://api.yourdomain.com"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/cylink-frontend",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

# タスク定義を登録
aws ecs register-task-definition \
  --cli-input-json file://frontend-task-definition.json
```

### CloudWatch Logsグループの作成

```bash
aws logs create-log-group --log-group-name /ecs/cylink-backend
aws logs create-log-group --log-group-name /ecs/cylink-frontend
```

---

## 8. Application Load Balancer (ALB)の設定

### セキュリティグループの作成

```bash
# ALB用セキュリティグループ
aws ec2 create-security-group \
  --group-name cylink-alb-sg \
  --description "Security group for Cylink ALB" \
  --vpc-id $VPC_ID

ALB_SG_ID=<YOUR_ALB_SG_ID>

# HTTP/HTTPSアクセスを許可
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

### ALBの作成

```bash
aws elbv2 create-load-balancer \
  --name cylink-alb \
  --subnets <PUBLIC_SUBNET_1A_ID> <PUBLIC_SUBNET_1C_ID> \
  --security-groups $ALB_SG_ID \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4

# ALB ARNを記録
ALB_ARN=<YOUR_ALB_ARN>

# ALB DNSを記録（例: cylink-alb-123456789.ap-northeast-1.elb.amazonaws.com）
```

### ターゲットグループの作成

バックエンド用:

```bash
aws elbv2 create-target-group \
  --name cylink-backend-tg \
  --protocol HTTP \
  --port 3001 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30

BACKEND_TG_ARN=<YOUR_BACKEND_TG_ARN>
```

フロントエンド用:

```bash
aws elbv2 create-target-group \
  --name cylink-frontend-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path / \
  --health-check-interval-seconds 30

FRONTEND_TG_ARN=<YOUR_FRONTEND_TG_ARN>
```

### リスナーの作成

HTTP リスナー（後でHTTPSにリダイレクト設定）:

```bash
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$FRONTEND_TG_ARN
```

---

## 9. Auto Scalingの設定

### ECSサービスの作成

バックエンド:

```bash
aws ecs create-service \
  --cluster cylink-cluster \
  --service-name cylink-backend-service \
  --task-definition cylink-backend \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<PRIVATE_SUBNET_1A_ID>,<PRIVATE_SUBNET_1C_ID>],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$BACKEND_TG_ARN,containerName=backend,containerPort=3001"
```

フロントエンド:

```bash
aws ecs create-service \
  --cluster cylink-cluster \
  --service-name cylink-frontend-service \
  --task-definition cylink-frontend \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<PRIVATE_SUBNET_1A_ID>,<PRIVATE_SUBNET_1C_ID>],securityGroups=[$ECS_SG_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=$FRONTEND_TG_ARN,containerName=frontend,containerPort=3000"
```

### Auto Scalingポリシーの設定

```bash
# スケーリングターゲットの登録
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/cylink-cluster/cylink-backend-service \
  --min-capacity 2 \
  --max-capacity 10

# CPU使用率ベースのスケーリング
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/cylink-cluster/cylink-backend-service \
  --policy-name cpu-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

---

## 10. Route 53でのDNS設定

ドメインを取得後に実施します。

### ホストゾーンの作成

```bash
aws route53 create-hosted-zone \
  --name yourdomain.com \
  --caller-reference $(date +%s)

# ホストゾーンIDを記録
HOSTED_ZONE_ID=<YOUR_HOSTED_ZONE_ID>
```

### ALBへのAレコード作成

```bash
cat > create-record.json <<EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "<ALB_HOSTED_ZONE_ID>",
          "DNSName": "<ALB_DNS_NAME>",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file://create-record.json
```

---

## 11. SSL証明書の設定

### AWS Certificate Manager (ACM) で証明書を発行

```bash
aws acm request-certificate \
  --domain-name yourdomain.com \
  --subject-alternative-names www.yourdomain.com api.yourdomain.com \
  --validation-method DNS \
  --region ap-northeast-1

# 証明書ARNを記録
CERT_ARN=<YOUR_CERT_ARN>
```

### DNS検証

1. ACMコンソールで証明書の詳細を確認
2. CNAMEレコードをRoute 53に追加して検証

### HTTPSリスナーの追加

```bash
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$FRONTEND_TG_ARN
```

### HTTPからHTTPSへのリダイレクト設定

```bash
# 既存のHTTPリスナーを更新
aws elbv2 modify-listener \
  --listener-arn <HTTP_LISTENER_ARN> \
  --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"
```

---

## 12. デプロイ手順

### 継続的デプロイのための手順

```bash
# 1. コードを更新

# 2. 新しいイメージをビルド
docker build -t cylink/backend ./backend

# 3. タグ付け（バージョン管理推奨）
docker tag cylink/backend:latest \
  <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/backend:v1.1.0

# 4. プッシュ
docker push <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com/cylink/backend:v1.1.0

# 5. タスク定義を更新
# backend-task-definition.jsonのimageタグを更新

aws ecs register-task-definition \
  --cli-input-json file://backend-task-definition.json

# 6. サービスを更新（ローリングアップデート）
aws ecs update-service \
  --cluster cylink-cluster \
  --service cylink-backend-service \
  --task-definition cylink-backend \
  --force-new-deployment
```

---

## コスト見積もり（月額・東京リージョン）

### 基本構成（2タスク常時稼働）

- **ECS Fargate**
  - Backend: 0.5 vCPU, 1GB × 2タスク × 730時間 = 約$35
  - Frontend: 0.25 vCPU, 0.5GB × 2タスク × 730時間 = 約$18
- **ElastiCache Redis** (cache.t3.medium) = 約$60
- **ALB** = 約$25 + データ転送料
- **Route 53** (ホストゾーン) = $0.50
- **データ転送** = 変動（$0.114/GB）

**合計: 約$140〜200/月**（1000人規模のイベント時のスケーリングコストは別途）

### スケーリング時のコスト

1000人同時接続のイベント中（3時間）:
- バックエンドタスクが10個にスケール = 追加$0.50程度

---

## トラブルシューティング

### ECSタスクが起動しない

```bash
# ログ確認
aws logs tail /ecs/cylink-backend --follow
```

### WebSocket接続ができない

- ALBのStickyセッションが有効になっているか確認
- セキュリティグループでポートが開いているか確認

### Redisに接続できない

- セキュリティグループでECS SGからの6379ポートが許可されているか確認
- REDIS_URL環境変数が正しく設定されているか確認

---

## まとめ

以上でAWS上にCylinkアプリケーションの本番環境が構築されます。1000人規模の同時接続にも対応できるスケーラブルな構成です。

次は「ドメイン取得・DNS設定手順書」を参照してドメインを設定してください。
