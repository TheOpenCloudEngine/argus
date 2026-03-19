# PowerDNS Service

PowerDNS Authoritative Server, PowerDNS Admin, MariaDB를 Docker 및 Kubernetes 환경에 배포하는 프로젝트입니다. Argus Insight 플랫폼의 DNS 관리 서비스로, API를 통해 DNS 레코드를 프로그래밍 방식으로 관리합니다. Airgap 환경을 지원하기 위해 공식 이미지를 Dockerfile wrapper로 빌드하여 프라이빗 레지스트리(Zot)에 배포합니다.

## 프로젝트 구조

```
PowerDNS-service/
├── CLAUDE.md                            # 이 파일
├── Makefile                             # Docker 이미지 빌드/푸시/저장 오케스트레이션
├── versions.env                         # 컴포넌트 버전 핀
├── .gitignore
├── .dockerignore
├── mariadb/
│   ├── Dockerfile                       # FROM mariadb, 스키마 내장
│   ├── my.cnf                           # MariaDB 클라이언트 설정
│   └── mysql-init/
│       └── 01-schema.sql                # PowerDNS DB 스키마
├── powerdns-server/
│   └── Dockerfile                       # FROM pschiffe/pdns-mysql
├── powerdns-admin/
│   └── Dockerfile                       # FROM powerdnsadmin/pda-legacy
├── docker/
│   ├── docker-compose.yml               # Docker Compose 오케스트레이션
│   ├── my.cnf                           # bind mount용 my.cnf
│   └── mysql-init/
│       └── 01-schema.sql                # bind mount용 스키마
├── kubernetes/
│   ├── kustomization.yaml               # Kustomize 엔트리포인트
│   ├── namespace.yaml                   # argus-insight 네임스페이스
│   ├── secret.yaml                      # DB 비밀번호, API 키
│   ├── configmap.yaml                   # my.cnf + 스키마 SQL
│   ├── pvc.yaml                         # MySQL 데이터 볼륨
│   ├── powerdns-db.yaml                 # MariaDB Deployment + Service
│   ├── powerdns-server.yaml             # PowerDNS Server Deployment + Service
│   ├── powerdns-admin.yaml              # PowerDNS Admin Deployment + Service
│   └── powerdns-admin-ingress.yaml      # PowerDNS Admin Ingress
└── dist/                                # 빌드 산출물 (gitignored)
    └── powerdns-*.tar.gz                # docker save 이미지
```

## 빌드 방법

```bash
# Docker 이미지 빌드
make docker                      # 전체 빌드 (mariadb + server + admin)
make docker-mariadb              # MariaDB만 빌드
make docker-powerdns-server      # PowerDNS Server만 빌드
make docker-powerdns-admin       # PowerDNS Admin만 빌드

# 프라이빗 레지스트리 푸시
make docker-push                                                    # 기본 (argus-insight/ prefix)
make docker-push DOCKER_REGISTRY=zot.argus.local:5000/argus-insight # Zot Registry 지정

# Airgap 환경용 이미지 저장/로드
make docker-save                 # dist/ 에 tar.gz 저장
make docker-load                 # tar.gz 에서 이미지 로드

# 정리
make clean                       # dist/ 삭제

# Docker Compose
cd docker
docker compose --env-file ../versions.env up --build -d

# Kubernetes
kubectl apply -k kubernetes/
kubectl get all -n argus-insight -l app.kubernetes.io/name=powerdns-server
```

## 초기 관리자 계정

### PowerDNS Admin

| 항목 | 값 |
|---|---|
| URL | `http://localhost:15000` |
| 계정 | 최초 접속 시 관리자 계정 생성 (Sign Up) |

PowerDNS Admin은 최초 접속 시 회원가입 폼을 통해 관리자 계정을 생성합니다.

### MariaDB

| 항목 | 값 |
|---|---|
| root 비밀번호 | `Argus!nsight2026` |
| pdns 사용자 | `pdns` / `pdns` |

### PowerDNS API

| 항목 | 값 |
|---|---|
| API URL | `http://localhost:15001` |
| API Key | `Argus!nsight2026` |

## 버전 관리

`versions.env` 파일에서 모든 컴포넌트 버전을 관리합니다. 버전 변경 후 `make docker`로 재빌드합니다.

```
MARIADB_VERSION=11.7
PDNS_VERSION=4.9
PDNS_ADMIN_VERSION=v0.4.2
```

## Docker 이미지

| 공식 이미지 | Argus 이미지 | 설명 |
|---|---|---|
| `mariadb:11.7` | `argus-insight/powerdns-mariadb:11.7` | MariaDB + PowerDNS 스키마 내장 |
| `pschiffe/pdns-mysql:4.9-alpine` | `argus-insight/powerdns-server:4.9` | PowerDNS Authoritative Server |
| `powerdnsadmin/pda-legacy:v0.4.2` | `argus-insight/powerdns-admin:v0.4.2` | PowerDNS Admin Web UI |

### Airgap 배포 흐름

```
인터넷 환경                          Airgap 환경
┌─────────────────┐                ┌──────────────────┐
│ make docker     │                │ make docker-load │
│ make docker-save│ ──USB/SCP──▶  │ docker tag ...   │
│ (dist/*.tar.gz) │                │ docker push ...  │
└─────────────────┘                │   → Zot Registry │
                                   └──────────────────┘
```

## Docker Compose 배포

### 컨테이너 구성

| 서비스 | 이미지 | 포트 매핑 | 설명 |
|---|---|---|---|
| `mariadb` | `argus-insight/powerdns-mariadb:11.7` | `3306:3306` | MariaDB 데이터베이스 |
| `powerdns-server` | `argus-insight/powerdns-server:4.9` | `10053:53`, `15001:8081` | DNS 서버 + API |
| `powerdns-admin` | `argus-insight/powerdns-admin:v0.4.2` | `15000:80` | 관리 웹 UI |

### Docker 볼륨

| 볼륨 이름 | 컨테이너 경로 | 용도 |
|---|---|---|
| `argus-powerdns-mysql-data` | `/var/lib/mysql` | MariaDB 데이터 |

## Kubernetes 배포

### 리소스 구성

| 리소스 | 이름 | 설명 |
|---|---|---|
| Namespace | `argus-insight` | 전용 네임스페이스 (다른 서비스와 공유) |
| Secret | `powerdns-secrets` | DB 비밀번호, API 키 |
| ConfigMap | `powerdns-config` | my.cnf + DB 스키마 SQL |
| PVC | `argus-powerdns-mysql-data` | MySQL 데이터 (5Gi, ReadWriteOnce) |
| Deployment + Service | `powerdns-db` | MariaDB (포트 3306) |
| Deployment + Service | `powerdns-server` | DNS (53 UDP/TCP) + API (8081) |
| Deployment + Service | `powerdns-admin` | Web UI (포트 80, NodePort 8082) |
| Ingress | `powerdns-admin` | PowerDNS Admin HTTP 라우팅 |

### 배포 전 필수 설정

1. **secret.yaml**: `mysql_root_password`, `mysql_password`, `pdns_api_key`를 실제 값으로 변경
2. **pvc.yaml**: 스토리지 크기 조정 (기본 5Gi)
3. **powerdns-db.yaml, powerdns-server.yaml, powerdns-admin.yaml**: 이미지 경로를 프라이빗 레지스트리 주소로 변경

### 리소스 요구사항

| 컴포넌트 | CPU 요청 | CPU 제한 | 메모리 요청 | 메모리 제한 |
|---|---|---|---|---|
| MariaDB | 250m | 1 | 256Mi | 1Gi |
| PowerDNS Server | 100m | 500m | 128Mi | 512Mi |
| PowerDNS Admin | 100m | 500m | 128Mi | 512Mi |

## DB 스키마

PowerDNS MySQL 백엔드에 필요한 테이블:

| 테이블 | 용도 |
|---|---|
| `domains` | DNS 도메인(Zone) 목록 |
| `records` | DNS 레코드 (A, AAAA, CNAME, MX 등) |
| `supermasters` | 슈퍼마스터 서버 목록 |
| `comments` | 레코드 코멘트 |
| `domainmetadata` | 도메인 메타데이터 |
| `cryptokeys` | DNSSEC 키 |
| `tsigkeys` | TSIG 키 |

스키마는 `mariadb/mysql-init/01-schema.sql`에 정의되며, Docker 이미지 빌드 시 내장됩니다. Kubernetes에서는 ConfigMap으로도 마운트됩니다.

## 네이밍 규칙

### Docker 이미지

| 규칙 | 패턴 | 예시 |
|---|---|---|
| 이미지 이름 | `argus-insight/<component>:<version>` | `argus-insight/powerdns-server:4.9` |
| 레지스트리 포함 | `<registry>/argus-insight/<component>:<version>` | `zot.argus.local:5000/argus-insight/powerdns-server:4.9` |
| 저장 파일명 | `<component>-<version>.tar.gz` | `powerdns-server-4.9.tar.gz` |

### Docker 볼륨

| 규칙 | 패턴 | 예시 |
|---|---|---|
| Docker Compose | `argus-powerdns-<용도>` | `argus-powerdns-mysql-data` |

### Kubernetes 리소스

| 리소스 | 패턴 | 예시 |
|---|---|---|
| PVC | `argus-powerdns-<용도>` | `argus-powerdns-mysql-data` |
| Secret | `powerdns-secrets` | — |
| ConfigMap | `powerdns-config` | — |
| Deployment | `powerdns-db`, `powerdns-server`, `powerdns-admin` | — |
| Service | `powerdns-db`, `powerdns-server`, `powerdns-admin` | — |
| Ingress | `powerdns-admin` | — |

### Kubernetes 라벨

| 라벨 | 값 | 설명 |
|---|---|---|
| `app.kubernetes.io/name` | `powerdns-db`, `powerdns-server`, `powerdns-admin` | 컴포넌트 식별 |
| `app.kubernetes.io/component` | `database` | PVC 용도 구분 |
| `app.kubernetes.io/part-of` | `argus-insight` | 플랫폼 소속 |

### 포트 할당

| 프로토콜 | Docker 호스트 포트 | 컨테이너 포트 | 설명 |
|---|---|---|---|
| DNS UDP/TCP | `10053` | `53` | DNS 쿼리 |
| HTTP (API) | `15001` | `8081` | PowerDNS REST API |
| HTTP (Admin) | `15000` | `80` | PowerDNS Admin Web UI (Docker Compose) |
| HTTP (Admin) | `8082` (NodePort) | `80` | PowerDNS Admin Web UI (Kubernetes) |
| MySQL | `3306` | `3306` | MariaDB |

## 코드 컨벤션

- Dockerfile의 `LABEL maintainer`: `Open Cloud Engine <fharenheit@gmail.com>`
- 패키지 라이선스: Apache-2.0
- `versions.env`에서 모든 컴포넌트 버전을 중앙 관리
- Makefile의 `DOCKER_REGISTRY` 변수로 레지스트리 주소를 주입 (기본값: `argus-insight`)

## 주의사항

- MariaDB Deployment strategy는 `Recreate`로 설정 (데이터 볼륨 동시 접근 방지)
- PowerDNS API Key는 외부에 노출하지 않도록 주의 (Secret으로 관리)
- DNS 포트(53)는 Docker에서 `10053`으로 매핑 (호스트의 기본 DNS와 충돌 방지)
- PowerDNS Admin은 최초 접속 시 관리자 계정을 직접 생성해야 합니다
- Kubernetes NodePort `8082`를 사용하려면 k3s 서버에 `--service-node-port-range=8000-32767` 설정 또는 `/etc/rancher/k3s/config.yaml`에 `service-node-port-range: "8000-32767"` 설정이 필요합니다
- **MariaDB 11.7 innodb_snapshot_isolation 이슈**: MariaDB 11.7부터 `innodb_snapshot_isolation`이 기본값 `ON`으로 변경되었습니다. 이 설정이 활성화되면 PowerDNS Admin의 세션 테이블(`sessions`) UPDATE 시 `Record has changed since last read` 에러가 발생하여 모든 Ajax 요청이 실패합니다. `configmap.yaml`의 my.cnf `[mariadbd]` 섹션에 `innodb_snapshot_isolation = OFF`를 설정하고, `powerdns-db.yaml`에서 해당 my.cnf를 `/etc/mysql/conf.d/custom.cnf`로 마운트하여 해결합니다
- PowerDNS Server의 liveness/readiness probe는 `tcpSocket`을 사용합니다. Kubernetes httpGet probe에서는 `$(ENV_VAR)` 형태의 환경변수 치환이 지원되지 않으므로 API Key 기반 HTTP probe 대신 TCP 포트 체크를 사용합니다
