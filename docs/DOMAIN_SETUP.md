# ドメイン取得・DNS設定手順書 - Cylink

このドキュメントでは、Cylinkアプリケーション用のドメインを取得し、AWS Route 53でDNS設定を行う手順を説明します。

## 目次

1. [ドメイン名の選定](#1-ドメイン名の選定)
2. [ドメイン取得方法](#2-ドメイン取得方法)
3. [AWS Route 53でのドメイン取得](#3-aws-route-53でのドメイン取得)
4. [外部レジストラで取得したドメインの設定](#4-外部レジストラで取得したドメインの設定)
5. [DNSレコードの設定](#5-dnsレコードの設定)
6. [SSL証明書の発行と設定](#6-ssl証明書の発行と設定)
7. [動作確認](#7-動作確認)

---

## 1. ドメイン名の選定

### 推奨ドメイン名のポイント

- **短くて覚えやすい**: イベント参加者がURLを直接入力することもあるため
- **サービス名と一致**: `cylink.jp`, `cylink.com` など
- **TLD（トップレベルドメイン）の選択**:
  - `.com`: 国際的、信頼性が高い
  - `.jp`: 日本向けサービスに最適
  - `.io`: テック系サービスで人気
  - `.app`: アプリケーション向け

### 例
- cylink.jp
- cylink.com
- cylink.app
- getcylink.com

---

## 2. ドメイン取得方法

### 主要なドメインレジストラ

1. **AWS Route 53**（推奨）
   - AWS内で完結
   - 自動的にRoute 53ホストゾーンが作成される
   - 料金: .com = $13/年、.jp = $40/年

2. **お名前.com**
   - 日本最大級のレジストラ
   - .jp ドメインが比較的安価
   - 料金: .jp = 約1,200円/年

3. **ムームードメイン**
   - 初心者向け、UIがわかりやすい
   - 料金: .com = 約1,000円/年

4. **Google Domains**（現在Squarespaceに移行中）
   - シンプルなUI
   - 料金: .com = $12/年

---

## 3. AWS Route 53でのドメイン取得

### 手順

#### 3.1 Route 53コンソールにアクセス

1. AWSマネジメントコンソールにログイン
2. 「Route 53」サービスを検索して開く

#### 3.2 ドメインの登録

1. 左メニューから「ドメインの登録」をクリック
2. 希望するドメイン名を入力（例: cylink）
3. TLDを選択（例: .com）
4. 「チェック」をクリックして空き状況を確認

#### 3.3 ドメインの購入

1. 使用可能な場合、「カートに追加」
2. 登録期間を選択（1年〜10年）
   - **推奨**: 最初は1年で試す
3. 「続行」をクリック

#### 3.4 連絡先情報の入力

1. ドメイン所有者の情報を入力
   - 名前
   - 組織名（個人の場合は空欄でOK）
   - メールアドレス
   - 電話番号
   - 住所

2. **プライバシー保護**を有効化（推奨）
   - WHOIS情報を非公開にできます

3. 「続行」をクリック

#### 3.5 確認と購入

1. 入力内容を確認
2. 規約に同意
3. 「リクエストの完了」をクリック

#### 3.6 承認メール

- 登録したメールアドレスに承認メールが届きます
- メール内のリンクをクリックして承認（24時間以内）

#### 3.7 ドメインの有効化

- 承認後、数分〜1時間でドメインが有効になります
- Route 53にホストゾーンが自動作成されます

### AWS CLI での確認

```bash
# ドメイン登録ステータスの確認
aws route53domains get-domain-detail \
  --domain-name cylink.com \
  --region us-east-1

# ホストゾーン一覧の確認
aws route53 list-hosted-zones
```

---

## 4. 外部レジストラで取得したドメインの設定

お名前.comやムームードメインで取得した場合の設定方法です。

### 4.1 Route 53でホストゾーンを作成

```bash
# ホストゾーン作成
aws route53 create-hosted-zone \
  --name cylink.com \
  --caller-reference $(date +%s)

# ネームサーバー情報を記録
# 例:
# ns-123.awsdns-12.com
# ns-456.awsdns-34.net
# ns-789.awsdns-56.org
# ns-012.awsdns-78.co.uk
```

または、AWSマネジメントコンソールで:

1. Route 53 → 「ホストゾーンの作成」
2. ドメイン名を入力（例: cylink.com）
3. 「作成」をクリック
4. NSレコード（ネームサーバー）を確認してメモ

### 4.2 レジストラでネームサーバーを変更

#### お名前.comの場合

1. お名前.comにログイン
2. 「ドメイン設定」→「ネームサーバーの設定」
3. 「その他」タブを選択
4. 「その他のネームサーバーを使う」を選択
5. Route 53のNSレコード（4つ）を入力:
   ```
   ns-123.awsdns-12.com
   ns-456.awsdns-34.net
   ns-789.awsdns-56.org
   ns-012.awsdns-78.co.uk
   ```
6. 「確認」→「OK」

#### ムームードメインの場合

1. ムームードメインにログイン
2. 「ドメイン管理」→ 対象ドメインの「ネームサーバ設定変更」
3. 「GMOペパボ以外のネームサーバを使用する」を選択
4. Route 53のNSレコード（4つ）を入力
5. 「ネームサーバ設定変更」をクリック

### 4.3 DNS伝播の待機

- ネームサーバー変更後、DNS情報が世界中に伝播するまで **24〜48時間** かかる場合があります
- 通常は数時間で完了します

### 確認方法

```bash
# ネームサーバーの確認
dig NS cylink.com

# または
nslookup -type=NS cylink.com
```

---

## 5. DNSレコードの設定

AWS Route 53でDNSレコードを設定します。

### 5.1 ALBのDNS名を確認

AWS_SETUP.mdで作成したALBのDNS名を確認:

```bash
aws elbv2 describe-load-balancers \
  --names cylink-alb \
  --query 'LoadBalancers[0].[DNSName,CanonicalHostedZoneId]' \
  --output text

# 例の出力:
# cylink-alb-123456789.ap-northeast-1.elb.amazonaws.com
# Z14GRHDCWA56QT (ALBのホストゾーンID)
```

### 5.2 Aレコード（エイリアス）の作成

メインドメイン用:

```bash
cat > create-a-record.json <<EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "cylink.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z14GRHDCWA56QT",
          "DNSName": "cylink-alb-123456789.ap-northeast-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id <YOUR_HOSTED_ZONE_ID> \
  --change-batch file://create-a-record.json
```

wwwサブドメイン用:

```bash
cat > create-www-record.json <<EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "www.cylink.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z14GRHDCWA56QT",
          "DNSName": "cylink-alb-123456789.ap-northeast-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id <YOUR_HOSTED_ZONE_ID> \
  --change-batch file://create-www-record.json
```

### 5.3 APIサブドメイン用のレコード作成（オプション）

バックエンドAPIを別のサブドメインで公開する場合:

```bash
cat > create-api-record.json <<EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.cylink.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z14GRHDCWA56QT",
          "DNSName": "cylink-alb-123456789.ap-northeast-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id <YOUR_HOSTED_ZONE_ID> \
  --change-batch file://create-api-record.json
```

### AWSマネジメントコンソールでの設定

1. Route 53 → ホストゾーン → 対象ドメインを選択
2. 「レコードを作成」をクリック
3. **Aレコード（エイリアス）**:
   - レコード名: 空欄（ルートドメイン）または `www`
   - レコードタイプ: A
   - エイリアス: オン
   - トラフィックのルーティング先: 「Application Load BalancerとClassic Load Balancerへのエイリアス」
   - リージョン: アジアパシフィック（東京）
   - ロードバランサー: cylink-alb を選択
4. 「レコードを作成」をクリック

---

## 6. SSL証明書の発行と設定

### 6.1 AWS Certificate Manager (ACM) で証明書をリクエスト

```bash
aws acm request-certificate \
  --domain-name cylink.com \
  --subject-alternative-names www.cylink.com api.cylink.com \
  --validation-method DNS \
  --region ap-northeast-1

# 証明書ARNを記録
# 例: arn:aws:acm:ap-northeast-1:123456789012:certificate/abcd1234-5678-90ef-ghij-klmnopqrstuv
```

### 6.2 DNS検証の実施

#### AWS CLIでの確認

```bash
aws acm describe-certificate \
  --certificate-arn <CERT_ARN> \
  --region ap-northeast-1
```

出力からDNS検証用のCNAMEレコード情報を取得。

#### Route 53にCNAMEレコードを追加

AWSマネジメントコンソールで:

1. ACM → 証明書の詳細ページ
2. 「Route 53でレコードを作成」ボタンをクリック
3. 自動的にCNAMEレコードが追加されます

または、AWS CLIで:

```bash
cat > validation-record.json <<EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "_abc123.cylink.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [
          {
            "Value": "_xyz456.acm-validations.aws."
          }
        ]
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id <YOUR_HOSTED_ZONE_ID> \
  --change-batch file://validation-record.json
```

### 6.3 証明書の検証完了を待機

通常5〜30分で検証が完了します。

```bash
# ステータス確認
aws acm describe-certificate \
  --certificate-arn <CERT_ARN> \
  --region ap-northeast-1 \
  --query 'Certificate.Status'

# 「ISSUED」と表示されれば完了
```

### 6.4 ALBにHTTPSリスナーを追加

```bash
aws elbv2 create-listener \
  --load-balancer-arn <ALB_ARN> \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=<CERT_ARN> \
  --default-actions Type=forward,TargetGroupArn=<FRONTEND_TG_ARN>
```

### 6.5 HTTPからHTTPSへのリダイレクト設定

```bash
# 既存のHTTPリスナー（ポート80）を更新
aws elbv2 modify-listener \
  --listener-arn <HTTP_LISTENER_ARN> \
  --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"
```

---

## 7. 動作確認

### 7.1 DNS伝播の確認

```bash
# Aレコードの確認
dig cylink.com

# 期待される結果: ALBのIPアドレスが返ってくる

# 別のDNSサーバーからも確認
dig @8.8.8.8 cylink.com
```

### 7.2 HTTPアクセステスト

```bash
# HTTPでアクセス（リダイレクトされるはず）
curl -I http://cylink.com

# 期待される結果: 301 Moved Permanently、Location: https://cylink.com
```

### 7.3 HTTPSアクセステスト

```bash
# HTTPSでアクセス
curl -I https://cylink.com

# 期待される結果: 200 OK
```

### 7.4 ブラウザでの確認

1. ブラウザで `https://cylink.com` にアクセス
2. SSL証明書が有効であることを確認（鍵マークが表示される）
3. アプリケーションが正常に表示されることを確認

### 7.5 各ページの動作確認

- トップページ: `https://cylink.com`
- 管理画面: `https://cylink.com/admin`
- 参加ページ: `https://cylink.com/join`
- イベントページ: QRコードから、または直接URLで

---

## トラブルシューティング

### ドメインにアクセスできない

**原因と対処法**:

1. **DNS伝播中**
   - 最大48時間待つ
   - `dig cylink.com` でDNS情報を確認

2. **NSレコードが正しくない**
   - レジストラの設定を再確認
   - Route 53のNSレコードと一致しているか確認

3. **Aレコードが作成されていない**
   - Route 53でAレコードを確認
   - ALBのDNS名が正しいか確認

### SSL証明書エラー

**原因と対処法**:

1. **証明書が発行されていない**
   - ACMで証明書のステータスを確認
   - DNS検証が完了しているか確認

2. **証明書がALBにアタッチされていない**
   - ALBのHTTPSリスナーを確認
   - 証明書ARNが正しいか確認

3. **ドメイン名が一致しない**
   - 証明書に含まれるドメイン名を確認
   - SANs（Subject Alternative Names）にサブドメインが含まれているか確認

### WebSocketが動作しない

**原因と対処法**:

1. **ALBのStickyセッションが無効**
   ```bash
   aws elbv2 modify-target-group-attributes \
     --target-group-arn <BACKEND_TG_ARN> \
     --attributes Key=stickiness.enabled,Value=true Key=stickiness.type,Value=lb_cookie
   ```

2. **タイムアウト設定が短い**
   ```bash
   aws elbv2 modify-target-group-attributes \
     --target-group-arn <BACKEND_TG_ARN> \
     --attributes Key=deregistration_delay.timeout_seconds,Value=30
   ```

---

## メールサーバーの設定（オプション）

イベント通知メールを送信する場合は、以下のMXレコードとSPFレコードを設定します。

### Amazon SESを使用する場合

1. **SESでドメインを検証**
2. **MXレコードとTXTレコードを追加**

```bash
cat > email-records.json <<EOF
{
  "Changes": [
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "cylink.com",
        "Type": "MX",
        "TTL": 300,
        "ResourceRecords": [
          {
            "Value": "10 inbound-smtp.ap-northeast-1.amazonaws.com"
          }
        ]
      }
    },
    {
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "cylink.com",
        "Type": "TXT",
        "TTL": 300,
        "ResourceRecords": [
          {
            "Value": "\"v=spf1 include:amazonses.com ~all\""
          }
        ]
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id <YOUR_HOSTED_ZONE_ID> \
  --change-batch file://email-records.json
```

---

## コスト

### Route 53

- ホストゾーン: **$0.50/月**
- クエリ料金: 最初の10億クエリまで **$0.40/100万クエリ**
- ドメイン登録料: **.com = $13/年**、**.jp = $40/年**

### ACM（SSL証明書）

- パブリック証明書: **無料**
- 自動更新: **無料**

---

## まとめ

以上でドメイン取得とDNS設定が完了しました。

次のステップ:
1. アプリケーションの環境変数を更新（ドメイン名を反映）
2. ECSタスク定義を更新してデプロイ
3. 本番環境での動作確認

これで、Cylinkアプリケーションが独自ドメインで公開され、SSL/TLSで保護された状態で運用できます。
