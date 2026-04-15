# StarRocks Query Audit Plugin

StarRocks의 AuditPlugin SPI를 구현하여 쿼리 실행 이벤트를 수집하고 Argus Catalog Metadata Sync로 전송하는 플러그인입니다.

## Requirement

* StarRocks 3.x+
* JDK 11+

## Build

```bash
mvn clean install
```

빌드 결과물:
* `target/starrocks-audit-plugin-1.0.0-jar-with-dependencies.jar` — Plugin JAR (Jackson 포함)

## 수집 정보

| 필드 | AuditEvent 필드 | 설명 |
|------|-----------------|------|
| `queryId` | `queryId` | 쿼리 고유 ID |
| `query` | `stmt` | SQL 쿼리 텍스트 |
| `user` | `user` | 실행 사용자 |
| `authorizedUser` | `authorizedUser` | 인증된 사용자 |
| `clientIp` | `clientIp` | 클라이언트 IP |
| `database` | `db` | 데이터베이스 |
| `catalog` | `catalog` | 카탈로그 |
| `state` | `state` | EOF(성공), ERR(실패), OK |
| `queryTimeMs` | `queryTime` | 실행 시간 (ms) |
| `scanRows` | `scanRows` | 스캔한 행 수 |
| `scanBytes` | `scanBytes` | 스캔한 바이트 |
| `returnRows` | `returnRows` | 반환된 행 수 |
| `cpuCostNs` | `cpuCostNs` | CPU 사용량 (ns) |
| `memCostBytes` | `memCostBytes` | 메모리 사용량 (bytes) |
| `digest` | `digest` | 쿼리 핑거프린트 |
| `timestamp` | `timestamp` | 이벤트 시각 (epoch ms) |
| `platformId` | plugin.conf | Argus Catalog 플랫폼 ID |

## 동작 원리

```
┌─────────────────────────────────────────────────────────┐
│ StarRocks FE                                             │
│                                                          │
│  Query 실행 → AuditEventProcessor                        │
│                  │                                       │
│                  ├─→ AuditLogBuilder (내장, fe.audit.log)  │
│                  │                                       │
│                  └─→ QueryAuditPlugin (Argus)             │
│                       │                                  │
│                       ├─ eventFilter(AFTER_QUERY) → true  │
│                       └─ exec(AuditEvent)                 │
│                            │                             │
│                            ▼                             │
│                       QuerySender (async queue)           │
│                       POST /collector/starrocks/query ────┼──▶ Metadata Sync
│                                                          │    (port 4610)
└─────────────────────────────────────────────────────────┘
```

## 전송 JSON 포맷

```json
{
  "queryId": "abc-123-def-456",
  "query": "SELECT a.id, b.name FROM db.orders a JOIN db.users b ON a.uid = b.id",
  "user": "alice",
  "authorizedUser": "alice@REALM",
  "clientIp": "10.10.10.100",
  "database": "analytics",
  "catalog": "default_catalog",
  "state": "EOF",
  "queryTimeMs": 1500,
  "scanRows": 10000,
  "scanBytes": 1048576,
  "returnRows": 100,
  "cpuCostNs": 500000000,
  "memCostBytes": 268435456,
  "timestamp": 1742536200000,
  "digest": "a1b2c3d4e5f6",
  "isQuery": true,
  "platformId": "starrocks-019538a3e7c84f2b1"
}
```

## Configuration

### 패키징

```bash
# 빌드 후 ZIP 생성
cd target
mkdir argus-query-audit
cp starrocks-audit-plugin-1.0.0-jar-with-dependencies.jar argus-query-audit/
cp ../src/main/resources/plugin.properties argus-query-audit/
cp ../src/main/resources/plugin.conf argus-query-audit/

# plugin.conf 수정
vi argus-query-audit/plugin.conf

zip -r argus-query-audit.zip argus-query-audit/
```

### plugin.conf

```properties
# Argus Catalog Metadata Sync collector endpoint
target_url=http://metadata-sync:4610/collector/starrocks/query

# Argus Catalog platform ID (from catalog_platforms.platform_id)
platform_id=starrocks-019538a3e7c84f2b1
```

### 설치

```sql
-- 모든 FE 노드에 동일한 경로로 ZIP 배포 후
INSTALL PLUGIN FROM "/opt/argus/argus-query-audit.zip";

-- 설치 확인
SHOW PLUGINS;
```

### 제거

```sql
UNINSTALL PLUGIN argus-query-audit;
```

## 주의사항

* `exec(AuditEvent)`는 StarRocks AuditEventProcessor에서 호출 — 반드시 non-blocking
* 내부 LinkedBlockingQueue (10,000 capacity)로 비동기 전송, 큐가 가득 차면 이벤트 드롭
* Jackson은 assembly JAR에 포함 (StarRocks FE 내 Jackson과 버전 충돌 가능 시 shade 적용 필요)
* 플러그인은 **모든 FE 노드**에 동일 경로로 배포해야 함
