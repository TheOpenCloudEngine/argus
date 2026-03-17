# Keycloak Service

Keycloak 26.1.0을 Docker 및 Kubernetes 환경에 배포하는 프로젝트입니다. Argus Insight 플랫폼의 통합 인증(SSO) 서비스로, OpenID Connect 기반의 사용자 인증 및 권한 관리를 제공합니다. GitLab, Argus Insight UI 등 플랫폼 내 서비스들의 Identity Provider 역할을 합니다. Airgap 환경을 지원하기 위해 공식 이미지를 Dockerfile wrapper로 빌드하여 프라이빗 레지스트리(Zot)에 배포합니다.

## 프로젝트 구조

```
keycloak-service/
├── CLAUDE.md                        # 이 파일
├── .gitignore
├── versions.env                     # Keycloak, PostgreSQL 버전 핀
├── docker/
│   ├── docker-compose.yml           # Docker Compose 오케스트레이션
│   ├── build-and-push.sh            # 이미지 빌드 & Private Registry push
│   ├── keycloak/
│   │   └── Dockerfile               # argus-insight/keycloak 이미지
│   └── postgresql/
│       ├── Dockerfile               # argus-insight/keycloak-postgresql 이미지
│       └── init-keycloak-db.sh      # DB 초기화 스크립트
└── kubernetes/
    ├── kustomization.yaml           # Kustomize 엔트리포인트
    ├── namespace.yaml               # argus-insight 네임스페이스
    ├── secret.yaml                  # admin 비밀번호, DB 크레덴셜
    ├── configmap.yaml               # Keycloak 환경 변수 설정
    ├── pvc.yaml                     # PostgreSQL 영구 볼륨
    ├── keycloak-postgresql.yaml     # PostgreSQL Deployment + Service
    ├── keycloak.yaml                # Keycloak Deployment + Service
    └── ingress.yaml                 # nginx Ingress
```

## 빌드 방법

```bash
cd docker

# Docker 이미지 빌드
./build-and-push.sh

# 빌드 + Zot Registry push
REGISTRY=registry.argus.local ./build-and-push.sh --push

# Docker Compose
docker compose --env-file ../versions.env up --build -d

# Kubernetes
kubectl apply -k kubernetes/
kubectl get all -n argus-insight -l app.kubernetes.io/name=keycloak
```

## 초기 관리자 계정

| 항목 | 값 |
|---|---|
| 사용자명 | `admin` |
| 비밀번호 | `Argus!nsight2026` |

- 최초 로그인 후 반드시 비밀번호를 변경하세요
- `KC_BOOTSTRAP_ADMIN_USERNAME`/`KC_BOOTSTRAP_ADMIN_PASSWORD`는 최초 기동 시에만 적용됩니다
- Docker 환경: `docker-compose.yml`의 환경 변수에서 설정
- Kubernetes 환경: `secret.yaml`의 `admin_password`에서 설정

## 버전 관리

`versions.env` 파일에서 모든 컴포넌트 버전을 관리합니다. 버전 변경 후 `./build-and-push.sh`로 재빌드합니다.

```
KEYCLOAK_VERSION=26.1.0
POSTGRES_VERSION=17.2
```

## Docker 이미지

Airgap 환경을 지원하기 위해 공식 이미지를 Dockerfile wrapper로 빌드합니다. 커스텀 테마, SPI 프로바이더 등을 이미지에 내장할 수 있습니다.

| 공식 이미지 | Argus 이미지 | 설명 |
|---|---|---|
| `quay.io/keycloak/keycloak:26.1.0` | `argus-insight/keycloak:26.1.0` | Keycloak 서버 |
| `postgres:17.2` | `argus-insight/keycloak-postgresql:17.2` | Keycloak 전용 PostgreSQL + 초기화 스크립트 |

### Airgap 배포 흐름

```
인터넷 환경                          Airgap 환경
┌─────────────────┐                ┌──────────────────┐
│ ./build-and-    │                │ docker load      │
│   push.sh       │ ──USB/SCP──▶  │ docker tag ...   │
│ docker save ... │                │ docker push ...  │
│ (*.tar.gz)      │                │   → Zot Registry │
└─────────────────┘                └──────────────────┘
```

1. 인터넷 환경에서 `./build-and-push.sh`로 이미지 빌드
2. `docker save`로 이미지를 tar 파일로 저장
3. tar 파일을 Airgap 환경으로 전달 (USB, SCP 등)
4. Airgap 환경에서 `docker load` 후 Zot Registry에 push

## 설정

### 환경 변수

Keycloak은 환경 변수로 설정을 관리합니다. Docker 환경에서는 `docker-compose.yml`에, Kubernetes 환경에서는 `configmap.yaml`(비민감)과 `secret.yaml`(민감)에 분리하여 관리합니다.

#### 주요 설정

| 카테고리 | 환경 변수 | 기본값 | 설명 |
|---|---|---|---|
| Admin | `KC_BOOTSTRAP_ADMIN_USERNAME` | `admin` | 관리자 계정 (최초 기동 시에만 생성) |
| Admin | `KC_BOOTSTRAP_ADMIN_PASSWORD` | `Argus!nsight2026` | 관리자 비밀번호 (최초 로그인 후 변경) |
| Database | `KC_DB` | `postgres` | 데이터베이스 종류 |
| Database | `KC_DB_URL` | `jdbc:postgresql://keycloak-postgresql:5432/keycloak` | JDBC 연결 URL |
| Database | `KC_DB_USERNAME` | `keycloak` | DB 사용자 |
| Database | `KC_DB_PASSWORD` | `keycloak_db_password` | DB 비밀번호 (반드시 변경) |
| Hostname | `KC_HOSTNAME` | `sso.argus.local` | Keycloak 접근 호스트명 (OIDC issuer URL에 사용) |
| Hostname | `KC_HOSTNAME_STRICT` | `false` | 엄격 호스트명 검증 비활성화 |
| HTTP | `KC_HTTP_ENABLED` | `true` | HTTP 활성화 (리버스 프록시에서 TLS 종료) |
| HTTP | `KC_PROXY_HEADERS` | `xforwarded` | 리버스 프록시 헤더 처리 |
| Health | `KC_HEALTH_ENABLED` | `true` | 헬스체크 엔드포인트 활성화 (포트 9000) |
| Metrics | `KC_METRICS_ENABLED` | `true` | Prometheus 메트릭 엔드포인트 활성화 |
| Logging | `KC_LOG_LEVEL` | `info` | 로그 레벨 |

### PostgreSQL 설정

| 설정 | 기본값 | 설명 |
|---|---|---|
| `POSTGRES_DB` | `keycloak` | 데이터베이스 이름 |
| `POSTGRES_USER` | `keycloak` | 데이터베이스 사용자 |
| `POSTGRES_PASSWORD` | `keycloak_db_password` | 데이터베이스 비밀번호 (반드시 변경) |

## Docker Compose 배포

### 컨테이너 구성

| 서비스 | 이미지 | 포트 매핑 | 설명 |
|---|---|---|---|
| `keycloak` | `argus-insight/keycloak:26.1.0` | `8180:8080` | Keycloak 서버 |
| `keycloak-postgresql` | `argus-insight/keycloak-postgresql:17.2` | - | PostgreSQL 데이터베이스 |

### Docker 볼륨

| 볼륨 이름 | 컨테이너 경로 | 용도 |
|---|---|---|
| `argus-keycloak-db-data` | `/var/lib/postgresql/data` | PostgreSQL 데이터 |

### 헬스체크

#### Keycloak

- 엔드포인트: `/health/ready` (포트 9000)
- 주기: 30초
- 타임아웃: 10초
- 재시도: 5회
- 시작 대기: 60초

#### PostgreSQL

- 명령: `pg_isready -U keycloak -d keycloak`
- 주기: 10초
- 타임아웃: 5초
- 재시도: 5회
- 시작 대기: 30초

## Kubernetes 배포

### 리소스 구성

| 리소스 | 이름 | 설명 |
|---|---|---|
| Namespace | `argus-insight` | 전용 네임스페이스 (다른 서비스와 공유) |
| Secret | `keycloak-secrets` | admin 비밀번호, DB 크레덴셜 |
| ConfigMap | `keycloak-config` | Keycloak 환경 변수 설정 |
| PVC | `argus-keycloak-db-data` | PostgreSQL 데이터 (10Gi, ReadWriteOnce) |
| Deployment + Service | `keycloak-postgresql` | PostgreSQL (포트 5432) |
| Deployment + Service | `keycloak` | Keycloak 서버 (포트 8080) |
| Ingress | `keycloak` | nginx Ingress (`sso.argus.local`) |

### 배포 전 필수 설정

1. **secret.yaml**: `admin_password`, `db_password`를 실제 값으로 변경
2. **configmap.yaml**: `KC_HOSTNAME`을 실제 도메인으로 변경
3. **ingress.yaml**: `host`를 실제 도메인으로 변경, TLS 필요 시 `tls` 섹션 주석 해제
4. **pvc.yaml**: 스토리지 크기 조정 (기본 10Gi)
5. **keycloak.yaml, keycloak-postgresql.yaml**: 이미지 경로를 프라이빗 레지스트리 주소로 변경

### 리소스 요구사항

| 컴포넌트 | CPU 요청 | CPU 제한 | 메모리 요청 | 메모리 제한 |
|---|---|---|---|---|
| Keycloak | 500m | 2 | 1Gi | 2Gi |
| PostgreSQL | 250m | 1 | 256Mi | 1Gi |

### Probe 설정

#### Keycloak

| Probe | 경로 | 포트 | 초기 대기 | 주기 | 설명 |
|---|---|---|---|---|---|
| startupProbe | `/health/ready` | 9000 | 30s | 10s (최대 30회) | 최초 기동 완료 대기 (최대 5분) |
| livenessProbe | `/health/live` | 9000 | 0s | 30s | 프로세스 정상 동작 확인 |
| readinessProbe | `/health/ready` | 9000 | 0s | 15s | 트래픽 수신 가능 여부 |

#### PostgreSQL

| Probe | 명령 | 초기 대기 | 주기 | 설명 |
|---|---|---|---|---|
| livenessProbe | `pg_isready` | 30s | 10s | 프로세스 정상 동작 확인 |
| readinessProbe | `pg_isready` | 10s | 5s | 트래픽 수신 가능 여부 |

### Ingress 설정

nginx Ingress Controller를 사용하며, OIDC 토큰 교환 등을 위해 다음 annotation이 적용됩니다:

| Annotation | 값 | 설명 |
|---|---|---|
| `proxy-body-size` | `10m` | 최대 요청 본문 크기 |
| `proxy-read-timeout` | `60` | 읽기 타임아웃 (초) |
| `proxy-connect-timeout` | `30` | 연결 타임아웃 (초) |
| `proxy-send-timeout` | `60` | 전송 타임아웃 (초) |
| `proxy-buffer-size` | `128k` | 프록시 버퍼 크기 (큰 OIDC 토큰 처리) |

## SSO 연동 (OpenID Connect)

Keycloak은 Argus Insight 플랫폼의 Identity Provider로, 각 서비스에 OIDC 기반 SSO를 제공합니다.

### Realm 구성

Keycloak 배포 후 Argus Insight 플랫폼을 위한 Realm을 구성합니다:

1. Admin Console(`http://sso.argus.local/admin`)에 접속
2. `argus` Realm 생성
3. 클라이언트 등록:
   - **argus-insight-ui**: Argus Insight 웹 UI (public client, PKCE)
   - **gitlab**: GitLab SSO 연동 (confidential client)

### 클라이언트 등록 예시

#### argus-insight-ui

| 설정 | 값 |
|---|---|
| Client ID | `argus-insight-ui` |
| Client Type | Public |
| Root URL | `http://argus.local` |
| Valid Redirect URIs | `http://argus.local/*` |
| Web Origins | `http://argus.local` |
| Authentication Flow | Standard flow (Authorization Code + PKCE) |

#### gitlab

| 설정 | 값 |
|---|---|
| Client ID | `gitlab` |
| Client Type | Confidential |
| Valid Redirect URIs | `http://gitlab.argus.local/users/auth/openid_connect/callback` |
| Authentication Flow | Standard flow (Authorization Code) |

## 백업 및 복원

### Realm 내보내기

```bash
# Docker
docker compose exec keycloak /opt/keycloak/bin/kc.sh export --dir /opt/keycloak/data/export --realm argus

# Kubernetes
kubectl exec -n argus-insight deploy/keycloak -- /opt/keycloak/bin/kc.sh export --dir /opt/keycloak/data/export --realm argus
```

### PostgreSQL 백업

```bash
# Docker
docker compose exec keycloak-postgresql pg_dump -U keycloak keycloak > keycloak_backup.sql

# Kubernetes
kubectl exec -n argus-insight deploy/keycloak-postgresql -- pg_dump -U keycloak keycloak > keycloak_backup.sql
```

### PostgreSQL 복원

```bash
# Docker
docker compose exec -T keycloak-postgresql psql -U keycloak keycloak < keycloak_backup.sql

# Kubernetes
kubectl exec -i -n argus-insight deploy/keycloak-postgresql -- psql -U keycloak keycloak < keycloak_backup.sql
```

## 네이밍 규칙

### Docker 이미지

| 규칙 | 패턴 | 예시 |
|---|---|---|
| 이미지 이름 | `argus-insight/<component>:<version>` | `argus-insight/keycloak:26.1.0` |
| DB 이미지 이름 | `argus-insight/keycloak-postgresql:<version>` | `argus-insight/keycloak-postgresql:17.2` |
| 레지스트리 포함 | `<registry>/argus-insight/<component>:<version>` | `registry.argus.local/argus-insight/keycloak:26.1.0` |

### Docker 볼륨

| 규칙 | 패턴 | 예시 |
|---|---|---|
| Docker Compose | `argus-keycloak-<용도>` | `argus-keycloak-db-data` |

### Kubernetes 리소스

| 리소스 | 패턴 | 예시 |
|---|---|---|
| PVC | `argus-keycloak-<용도>` | `argus-keycloak-db-data` |
| Secret | `keycloak-secrets` | — |
| ConfigMap | `keycloak-config` | — |
| Deployment | `keycloak`, `keycloak-postgresql` | — |
| Service | `keycloak`, `keycloak-postgresql` | — |
| Ingress | `keycloak` | — |

### Kubernetes 라벨

| 라벨 | 값 | 설명 |
|---|---|---|
| `app.kubernetes.io/name` | `keycloak` 또는 `keycloak-postgresql` | 컴포넌트 식별 |
| `app.kubernetes.io/component` | `database` | PVC 용도 구분 |
| `app.kubernetes.io/part-of` | `argus-insight` | 플랫폼 소속 |

### 호스트명 및 URL

| 항목 | 패턴 | 예시 |
|---|---|---|
| External URL | `http://sso.<도메인>` | `http://sso.argus.local` |
| Admin Console | `http://sso.<도메인>/admin` | `http://sso.argus.local/admin` |
| Ingress Host | `sso.<도메인>` | `sso.argus.local` |
| K8s 내부 DNS | `keycloak.argus-insight.svc.cluster.local` | — |
| OIDC Issuer | `http://sso.<도메인>/realms/<realm>` | `http://sso.argus.local/realms/argus` |
| OIDC Discovery | `http://sso.<도메인>/realms/<realm>/.well-known/openid-configuration` | — |

### 포트 할당

| 프로토콜 | Docker 호스트 포트 | 컨테이너 포트 | 설명 |
|---|---|---|---|
| HTTP | `8180` | `8080` | Keycloak Web UI / API |
| Health | - | `9000` | 헬스체크 및 메트릭 엔드포인트 |
| PostgreSQL | - | `5432` | PostgreSQL (내부 전용) |

## 코드 컨벤션

- Dockerfile의 `LABEL maintainer`: `Argus Insight <argus@argus.local>`
- 패키지 라이선스: Apache-2.0
- `versions.env`에서 모든 컴포넌트 버전을 중앙 관리
- `build-and-push.sh`의 `REGISTRY` 변수로 레지스트리 주소를 주입 (기본값: `registry.argus.local`)

## 주의사항

- Keycloak은 최소 CPU 500m, RAM 1GB 권장
- `KC_BOOTSTRAP_ADMIN_USERNAME`/`KC_BOOTSTRAP_ADMIN_PASSWORD`는 최초 기동 시에만 적용되며, 이후 Admin Console에서 비밀번호 변경 필요
- `KC_HOSTNAME`은 반드시 실제 접근 가능한 URL로 설정해야 합니다 (OIDC issuer URL에 사용)
- 프로덕션 환경에서는 반드시 TLS를 활성화하세요 (OIDC 보안 요구사항)
- PostgreSQL의 기본 비밀번호(`keycloak_db_password`)는 반드시 변경해야 합니다
- Kubernetes 환경에서 PostgreSQL Deployment strategy는 `Recreate`로 설정되어 있습니다 (데이터 볼륨 동시 접근 방지)
- Airgap 환경에서는 `build-and-push.sh`로 이미지를 빌드한 후 `docker save`로 저장, 물리적으로 전달하여 `docker load`로 로드합니다
