# DNS 설정 가이드 — PowerDNS + Argus Insight 클라이언트 DNS 구성

이 문서는 PowerDNS Authoritative Server를 Argus Insight 플랫폼의 내부 DNS로 사용할 때, 서버 및 클라이언트의 DNS resolver 설정 방법을 상세히 기술합니다.

---

## 1. 아키텍처 개요

```
[클라이언트 브라우저]
       │
       │  DNS 질의: argus-vscode-f7a3b2c1.dev.net
       ▼
[PowerDNS Authoritative Server]  ← 10.0.1.50:53
       │
       │  A 레코드: 10.0.1.50
       ▼
[Nginx Ingress Controller]  ← 10.0.1.50:443
       │
       ▼
[K8s Pod: code-server]
```

### 포트 구성

| 서비스 | 포트 | 프로토콜 | 용도 |
|--------|------|----------|------|
| PowerDNS DNS | 53 | UDP/TCP | DNS 질의 응답 |
| PowerDNS API | 8083 | TCP | REST API (레코드 관리) |
| PowerDNS Admin | 8082 | TCP | 관리 Web UI |

### 중요 특성

PowerDNS Authoritative Server는 **재귀 쿼리(recursion)를 지원하지 않습니다**. 즉, `dev.net` zone에 등록된 레코드만 응답하며, `github.com` 같은 외부 도메인은 `REFUSED`를 반환합니다. 따라서 클라이언트 DNS 설정에서 PowerDNS와 외부 DNS(예: 8.8.8.8)를 함께 구성해야 합니다.

---

## 2. PowerDNS 설정 (Argus Insight UI)

Settings > Domain에서 다음 값을 설정합니다:

| 설정키 | 값 | 설명 |
|--------|-----|------|
| `domain_name` | `dev.net` | 기본 도메인 |
| `dns_server_1` | `10.0.1.50` | Primary DNS (PowerDNS) |
| `pdns_ip` | `10.0.1.50` | PowerDNS 서버 IP |
| `pdns_port` | `8083` | PowerDNS API 포트 |
| `pdns_api_key` | `Argus!insight2026` | API 인증 키 |
| `pdns_admin_url` | `http://10.0.1.50:8082` | PowerDNS Admin URL |

---

## 3. Zone 생성

PowerDNS에 기본 zone이 필요합니다. PowerDNS Admin UI 또는 API로 생성합니다.

### API로 zone 생성

```bash
PDNS_IP=10.0.1.50
PDNS_PORT=8083
PDNS_API_KEY="Argus!insight2026"
DOMAIN=dev.net

# Zone 존재 여부 확인
curl -s -H "X-API-Key: ${PDNS_API_KEY}" \
  "http://${PDNS_IP}:${PDNS_PORT}/api/v1/servers/localhost/zones/${DOMAIN}." \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('name','NOT FOUND'))" 2>/dev/null \
  || echo "Zone not found"

# Zone 생성 (없는 경우)
curl -s -X POST \
  -H "X-API-Key: ${PDNS_API_KEY}" \
  -H "Content-Type: application/json" \
  "http://${PDNS_IP}:${PDNS_PORT}/api/v1/servers/localhost/zones" \
  -d "{
    \"name\": \"${DOMAIN}.\",
    \"kind\": \"Native\",
    \"nameservers\": [\"ns1.${DOMAIN}.\"]
  }"
```

### A 레코드 수동 등록 (테스트용)

```bash
curl -s -X PATCH \
  -H "X-API-Key: ${PDNS_API_KEY}" \
  -H "Content-Type: application/json" \
  "http://${PDNS_IP}:${PDNS_PORT}/api/v1/servers/localhost/zones/${DOMAIN}." \
  -d '{
    "rrsets": [{
      "name": "test.'"${DOMAIN}"'.",
      "type": "A",
      "ttl": 300,
      "changetype": "REPLACE",
      "records": [{"content": "10.0.1.50", "disabled": false}]
    }]
  }'
```

### 등록된 레코드 확인

```bash
# 전체 레코드 조회
curl -s -H "X-API-Key: ${PDNS_API_KEY}" \
  "http://${PDNS_IP}:${PDNS_PORT}/api/v1/servers/localhost/zones/${DOMAIN}." \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for rr in data.get('rrsets', []):
    for r in rr['records']:
        print(f\"{rr['name']:40s} {rr['type']:6s} {rr['ttl']:6d}  {r['content']}\")
"

# 특정 호스트 DNS 쿼리
dig @${PDNS_IP} test.${DOMAIN} A +short
```

---

## 4. Argus Insight 서버 DNS 설정

### 현재 구성

Argus Insight 서버(`10.0.1.50`)에서 PowerDNS의 `dev.net` 레코드와 외부 도메인(github.com 등)을 모두 resolve할 수 있어야 합니다.

### 핵심 문제

PowerDNS Authoritative Server는 재귀 쿼리를 지원하지 않아, DNS resolver의 첫 번째 nameserver로 설정하면 외부 도메인 질의가 `REFUSED`됩니다. Ubuntu의 glibc resolver는 `REFUSED` 응답을 받으면 다음 nameserver로 fallback하지 않고 실패 처리합니다.

### 해결 방법: resolv.conf 모드 변경

systemd-resolved의 stub resolver(`127.0.0.53`)를 우회하고, upstream DNS 서버를 직접 사용합니다.

#### Step 1: Netplan에 DNS 서버 설정

```yaml
# /etc/netplan/90-NM-*.yaml (또는 해당 netplan 파일)
network:
  version: 2
  ethernets:
    enp6s0:                          # 실제 네트워크 인터페이스명
      addresses:
        - "10.0.1.50/24"
      nameservers:
        addresses:
          - 10.0.1.50                # PowerDNS (dev.net 전용)
          - 8.8.8.8                  # Google DNS (외부 도메인 fallback)
        search:
          - dev.net                  # 기본 검색 도메인
```

적용:

```bash
sudo netplan apply
```

#### Step 2: resolv.conf를 upstream 모드로 변경

기본 stub resolver(`/run/systemd/resolve/stub-resolv.conf`)는 `127.0.0.53`만 참조하며, 내부적으로 PowerDNS의 `REFUSED` 응답을 그대로 반환합니다.

upstream resolv.conf(`/run/systemd/resolve/resolv.conf`)로 심볼릭 링크를 변경하면, glibc resolver가 PowerDNS → 8.8.8.8 순서로 직접 쿼리합니다.

```bash
# 기존 심볼릭 링크 확인
ls -la /etc/resolv.conf
# lrwxrwxrwx 1 root root 39 ... /etc/resolv.conf -> ../run/systemd/resolve/stub-resolv.conf

# upstream resolv.conf로 변경
sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf

# 결과 확인 — nameserver가 10.0.1.50 + 8.8.8.8 이어야 함
cat /etc/resolv.conf | grep nameserver
# nameserver 10.0.1.50
# nameserver 8.8.8.8
```

#### Step 3: 동작 검증

```bash
# PowerDNS 도메인 resolve (dev.net zone)
getent hosts argus-vscode-test.dev.net
# 10.0.1.50    argus-vscode-test.dev.net

# 외부 도메인 resolve (8.8.8.8 fallback)
getent hosts github.com
# 20.200.245.247  github.com

# dig로 직접 확인
dig argus-vscode-test.dev.net +short
# 10.0.1.50

dig github.com +short
# 20.200.245.247
```

### DNS 질의 흐름

```
[glibc resolver: getent/curl/git]
       │
       │  ① nameserver 10.0.1.50 (PowerDNS)
       │     dev.net 레코드 → 응답 반환
       │     외부 도메인 → REFUSED
       │
       │  ② nameserver 8.8.8.8 (Google DNS)  ← ①이 REFUSED면 fallback
       │     외부 도메인 → 응답 반환
       ▼
[응답]
```

> **참고**: glibc resolver는 첫 번째 nameserver가 REFUSED를 반환하면 다음 nameserver로 fallback합니다. 단, NXDOMAIN(도메인 없음)은 fallback하지 않습니다. PowerDNS Authoritative Server는 자신의 zone에 없는 도메인에 대해 REFUSED(재귀 비활성)를 반환하므로 이 fallback이 동작합니다.

---

## 5. 클라이언트 PC DNS 설정

브라우저에서 `https://argus-vscode-xxx.dev.net`에 접근하려면 클라이언트 PC도 PowerDNS를 DNS 서버로 사용하거나, 로컬 hosts 파일에 등록해야 합니다.

### 방법 A: DNS 서버 설정 (권장)

클라이언트 PC의 네트워크 설정에서 DNS 서버를 추가합니다:

| 순서 | DNS 서버 | 용도 |
|------|----------|------|
| Primary | `10.0.1.50` | PowerDNS (dev.net) |
| Secondary | `8.8.8.8` | 외부 도메인 fallback |

#### Windows

```
설정 > 네트워크 > 이더넷/Wi-Fi > DNS 서버 할당 > 수동
  기본 DNS: 10.0.1.50
  대체 DNS: 8.8.8.8
```

#### macOS

```
시스템 설정 > 네트워크 > Wi-Fi/이더넷 > 세부 사항 > DNS
  10.0.1.50
  8.8.8.8
```

#### Linux

```bash
# systemd-resolved 사용 시
sudo resolvectl dns enp6s0 10.0.1.50 8.8.8.8

# 또는 /etc/resolv.conf 직접 편집
nameserver 10.0.1.50
nameserver 8.8.8.8
search dev.net
```

### 방법 B: hosts 파일 (임시/테스트용)

DNS 설정 변경이 어려운 경우, 개별 호스트명을 등록합니다:

#### Windows (`C:\Windows\System32\drivers\etc\hosts`)

```
10.0.1.50  argus-vscode-bbc989ab.dev.net
10.0.1.50  dev-sever.dev.net
```

#### macOS / Linux (`/etc/hosts`)

```
10.0.1.50  argus-vscode-bbc989ab.dev.net
10.0.1.50  dev-sever.dev.net
```

> **주의**: VS Code Server는 인스턴스마다 고유한 hostname(`argus-vscode-{instance_id}.dev.net`)을 사용합니다. 인스턴스를 새로 생성할 때마다 hosts 파일에 새 hostname을 추가해야 하므로, 운영 환경에서는 DNS 서버 설정(방법 A)을 권장합니다.

---

## 6. K8s CoreDNS 연동 (선택사항)

K8s 클러스터 내부에서 `dev.net` 도메인을 resolve해야 하는 경우, CoreDNS에 PowerDNS를 conditional forwarder로 추가합니다.

```bash
kubectl edit configmap coredns -n kube-system
```

```
.:53 {
    ...
    forward . /etc/resolv.conf
    ...
}

# 추가
dev.net:53 {
    errors
    cache 30
    forward . 10.0.1.50
}
```

```bash
# CoreDNS 재시작
kubectl rollout restart deployment coredns -n kube-system
```

---

## 7. 트러블슈팅

### DNS resolve 실패

```bash
# 1. PowerDNS가 응답하는지 확인
dig @10.0.1.50 argus-vscode-test.dev.net A +short
# 10.0.1.50 이 나와야 함

# 2. PowerDNS API에서 레코드 확인
curl -s -H "X-API-Key: Argus!insight2026" \
  "http://10.0.1.50:8083/api/v1/servers/localhost/zones/dev.net." \
  | python3 -c "import json,sys; [print(r['name']) for r in json.load(sys.stdin).get('rrsets',[])]"

# 3. /etc/resolv.conf 확인
cat /etc/resolv.conf | grep nameserver
# nameserver 10.0.1.50  ← PowerDNS
# nameserver 8.8.8.8    ← fallback

# 4. resolv.conf 심볼릭 링크 확인
ls -la /etc/resolv.conf
# /etc/resolv.conf -> /run/systemd/resolve/resolv.conf  (upstream 모드)
# stub 모드(/run/systemd/resolve/stub-resolv.conf)가 아닌지 확인

# 5. glibc resolver 테스트
getent hosts argus-vscode-test.dev.net
getent hosts github.com
```

### 외부 도메인 resolve 실패 (github.com 등)

```bash
# 원인: PowerDNS가 REFUSED 반환 → fallback 안 됨

# 확인
nslookup github.com 10.0.1.50
# ** server can't find github.com: REFUSED  ← 정상 (authoritative only)

nslookup github.com 8.8.8.8
# Address: 20.200.245.247  ← 정상

# 해결: resolv.conf가 upstream 모드인지 확인
ls -la /etc/resolv.conf
# /run/systemd/resolve/resolv.conf 이어야 함 (stub-resolv.conf가 아님)
```

### PowerDNS Zone에 레코드가 없음

```bash
# Argus Insight Server 배포 로그 확인
grep "DNS registration\|register_dns" /root/projects/argus-insight/argus-insight-server/logs/server.log | tail -5

# 404 Not Found → zone이 없음
# Zone 생성 (위 Section 3 참고)

# 수동 A 레코드 추가
curl -s -X PATCH \
  -H "X-API-Key: Argus!insight2026" \
  -H "Content-Type: application/json" \
  "http://10.0.1.50:8083/api/v1/servers/localhost/zones/dev.net." \
  -d '{
    "rrsets": [{
      "name": "argus-vscode-bbc989ab.dev.net.",
      "type": "A", "ttl": 300, "changetype": "REPLACE",
      "records": [{"content": "10.0.1.50", "disabled": false}]
    }]
  }'
```

### resolv.conf가 재부팅 후 stub 모드로 복귀

```bash
# 영구 적용: systemd-resolved 서비스 파일에서 심볼릭 링크를 유지
# 또는 /etc/systemd/system/fix-resolv.service 생성

cat > /etc/systemd/system/fix-resolv.service << 'EOF'
[Unit]
Description=Fix resolv.conf to upstream mode
After=systemd-resolved.service
Requires=systemd-resolved.service

[Service]
Type=oneshot
ExecStart=/bin/ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fix-resolv.service
```

---

## 8. 설정 파일 요약

| 파일 | 용도 | 핵심 내용 |
|------|------|-----------|
| `/etc/netplan/90-NM-*.yaml` | Netplan 네트워크 설정 | nameservers: [10.0.1.50, 8.8.8.8], search: [dev.net] |
| `/etc/resolv.conf` | DNS resolver 설정 | 심볼릭 링크 → `/run/systemd/resolve/resolv.conf` (upstream 모드) |
| `/etc/nsswitch.conf` | NSS 호스트 조회 순서 | `hosts: files mdns4_minimal [NOTFOUND=return] dns mymachines` |
| Argus UI > Settings > Domain | PowerDNS 연동 설정 | pdns_ip, pdns_port, pdns_api_key, domain_name |
