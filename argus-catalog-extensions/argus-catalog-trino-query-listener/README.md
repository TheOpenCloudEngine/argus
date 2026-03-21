# Trino Query Audit Event Listener

Trino의 EventListener SPI를 구현하여 쿼리 실행 이벤트를 수집하고 Argus Catalog Metadata Sync로 전송하는 플러그인입니다.

## Requirement

* Trino 400+ (EventListener SPI)
* JDK 17+

## Build

```bash
mvn clean install
```

빌드 결과물:
* `target/trino-query-listener-1.0.0.jar` — Plugin JAR (Jackson 포함, shade plugin)

## Trino vs Hive/Impala 차이점

Trino의 EventListener SPI는 **쿼리가 읽은/쓴 테이블과 컬럼 정보를 네이티브로 제공**합니다. 따라서 Hive/Impala처럼 SQL 파싱이 불필요합니다.

| 항목 | Hive/Impala | Trino |
|------|-------------|-------|
| 수집 방식 | Hook/ASM bytecode | EventListener SPI (공식 플러그인) |
| SQL 파싱 | SQLGlot 파서 필요 | 불필요 (네이티브 IO metadata) |
| Input 테이블 | Hook/파서로 추출 | `QueryIOMetadata.getInputs()` |
| Output 테이블 | Hook/파서로 추출 | `QueryIOMetadata.getOutput()` |
| 컬럼 정보 | 파서로 추출 | `QueryInputMetadata.getColumns()` |

## 수집 정보

| 필드 | 소스 | 설명 |
|------|------|------|
| `queryId` | `QueryMetadata.getQueryId()` | Trino 쿼리 고유 ID |
| `query` | `QueryMetadata.getQuery()` | SQL 쿼리 텍스트 |
| `queryState` | `QueryMetadata.getQueryState()` | FINISHED, FAILED |
| `queryType` | `QueryContext.getQueryType()` | SELECT, INSERT, etc. |
| `user` | `QueryContext.getUser()` | 실행 사용자 |
| `principal` | `QueryContext.getPrincipal()` | Kerberos/OAuth principal |
| `source` | `QueryContext.getSource()` | 클라이언트 도구 (trino-cli, dbeaver) |
| `catalog` | `QueryContext.getCatalog()` | 기본 카탈로그 |
| `schema` | `QueryContext.getSchema()` | 기본 스키마 |
| `plan` | `QueryMetadata.getPlan()` | 쿼리 실행 계획 |
| `inputs` | `QueryIOMetadata.getInputs()` | 읽은 테이블 목록 (catalog.schema.table + columns) |
| `output` | `QueryIOMetadata.getOutput()` | 쓴 테이블 (catalog.schema.table + columns) |
| `wallTimeMs` | `QueryStatistics.getWallTime()` | 총 소요 시간 |
| `cpuTimeMs` | `QueryStatistics.getCpuTime()` | CPU 시간 |
| `failureInfo` | `QueryCompletedEvent.getFailureInfo()` | 에러 코드, 메시지 |
| `platformId` | 설정 파일 | Argus Catalog 플랫폼 ID |

## 동작 원리

```
┌──────────────────────────────────────────────────────────┐
│ Trino Coordinator                                         │
│                                                           │
│  ┌────────────────────────┐                              │
│  │ Query Execution Engine  │                              │
│  │                         │                              │
│  │  queryCreated()         │                              │
│  │  queryCompleted() ──────┼──▶ QueryAuditListener        │
│  └────────────────────────┘   │                          │
│                                │  buildPayload()          │
│                                │  - queryId, query        │
│                                │  - user, principal       │
│                                │  - inputs[] (tables)     │
│                                │  - output (table)        │
│                                │  - plan, timing          │
│                                ▼                          │
│                          QuerySender (async)              │
│                          POST /collector/trino/query ─────┼──▶ Metadata Sync
│                                                           │    (port 4610)
└──────────────────────────────────────────────────────────┘
```

## 전송 JSON 포맷

```json
{
  "queryId": "20260321_143012_00001_abcde",
  "query": "INSERT INTO analytics.summary SELECT a.id, b.name FROM catalog.sales.orders a JOIN catalog.master.users b ON a.user_id = b.id",
  "queryState": "FINISHED",
  "queryType": "INSERT",
  "user": "alice",
  "principal": "alice@REALM.COM",
  "source": "trino-cli",
  "catalog": "hive",
  "schema": "default",
  "createTime": 1742536200000,
  "executionStartTime": 1742536200500,
  "endTime": 1742536260000,
  "wallTimeMs": 60000,
  "cpuTimeMs": 45000,
  "plan": "Fragment 0 [SINGLE]\n  Output ...",
  "inputs": [
    {
      "catalog": "hive",
      "schema": "sales",
      "table": "orders",
      "columns": ["id", "user_id", "amount"]
    },
    {
      "catalog": "hive",
      "schema": "master",
      "table": "users",
      "columns": ["id", "name"]
    }
  ],
  "output": {
    "catalog": "hive",
    "schema": "analytics",
    "table": "summary",
    "columns": ["id", "name"]
  },
  "physicalInputBytes": 1073741824,
  "physicalInputRows": 1000000,
  "outputBytes": 52428800,
  "outputRows": 50000,
  "peakMemoryBytes": 268435456,
  "platformId": "trino-019538a3e7c84f2b1"
}
```

## Configuration

### Plugin 배포

```bash
# Trino 플러그인 디렉토리에 배포
mkdir -p <trino-install>/plugin/argus-query-audit/
cp target/trino-query-listener-1.0.0.jar <trino-install>/plugin/argus-query-audit/
```

### event-listener.properties

`etc/event-listener.properties` 파일 생성:

```properties
event-listener.name=argus-query-audit
target-url=http://metadata-sync:4610/collector/trino/query
platform-id=trino-019538a3e7c84f2b1
```

### 여러 EventListener 동시 사용

`etc/config.properties`에 추가:

```properties
event-listener.config-files=etc/event-listener.properties
```

## Deployment

1. 빌드한 JAR을 Trino **Coordinator** 노드의 `plugin/argus-query-audit/` 디렉토리에 배포
2. `etc/event-listener.properties` 파일 생성
3. Trino 서비스 재시작
4. Metadata Sync 서버의 `/collector/trino/query` 엔드포인트 수신 확인
