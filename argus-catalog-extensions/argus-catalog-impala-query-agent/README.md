# Impala Query Agent

Java ASM 기반 bytecode instrumentation agent로, Impala Frontend의 `createExecRequest` 메서드를 계측하여 쿼리 실행 이벤트를 수집하고 REST API로 전송합니다.

## Requirement

* Impala 3.x / CDP 7.x (Java Frontend)
* JDK 11+

## Build

```bash
mvn clean install
```

빌드 결과물:
* `target/impala-query-agent-1.0.0.jar` — Agent JAR (ASM + Jackson 포함, shade plugin)

## 수집 정보

| 필드 | 설명 |
|------|------|
| `timestamp` | 쿼리 시작 시각 (epoch millis) |
| `query` | SQL 쿼리 텍스트 (`TQueryCtx.client_request.stmt`) |
| `plan` | 쿼리 실행 계획 (`TExecRequest.query_exec_request.query_plan`) |
| `user` | 연결된 사용자 (`TQueryCtx.session.connected_user`) |
| `delegateUser` | 위임된 사용자 (`TQueryCtx.session.delegated_user`) |
| `platformId` | Argus Catalog 플랫폼 ID (agent 파라미터로 설정) |

## 동작 원리

```
┌─────────────────────────────────────────────────────────┐
│ Impala Daemon (impalad) JVM                              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Frontend.createExecRequest(TQueryCtx, ...)       │   │
│  │                                                    │   │
│  │  ┌──── ASM Instrumented ────┐                     │   │
│  │  │ onMethodEnter:            │                     │   │
│  │  │   → QueryInterceptor     │                     │   │
│  │  │     .onQueryStart()       │                     │   │
│  │  │                           │                     │   │
│  │  │ ... original method ...   │                     │   │
│  │  │                           │                     │   │
│  │  │ onMethodExit:             │                     │   │
│  │  │   → QueryInterceptor     │                     │   │
│  │  │     .onQueryComplete()    │                     │   │
│  │  └───────────────────────────┘                     │   │
│  └──────────────────────────────────────────────────┘   │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────────────────┐                       │
│  │ QuerySender (async thread)    │                       │
│  │ POST /collector/impala/query  │──────────────────────┼──▶ Metadata Sync
│  └──────────────────────────────┘                       │    (port 4610)
└─────────────────────────────────────────────────────────┘
```

### ASM Instrumentation 대상

* **클래스**: `org.apache.impala.service.Frontend`
* **메서드**: `createExecRequest(TQueryCtx, StringBuilder)`
* **진입점**: `onMethodEnter` — TQueryCtx에서 query, user, delegateUser 추출
* **종료점**: `onMethodExit` — TExecRequest에서 query plan 추출
* **데이터 접근**: Reflection 사용 (Thrift 객체 컴파일 의존성 없음)

## 전송 JSON 포맷

```json
{
  "timestamp": 1742536200000,
  "query": "SELECT a.id, b.name FROM db.table_a a JOIN db.table_b b ON a.id = b.id",
  "plan": "01:EXCHANGE [UNPARTITIONED]\n|  ...\n00:SCAN HDFS [db.table_a a]\n   ...",
  "user": "alice",
  "delegateUser": "bob",
  "platformId": "impala-19d0bfe954e3fd2cd"
}
```

## Configuration

### Impala Daemon JVM 옵션

```bash
# 환경변수 또는 Cloudera Manager에서 설정
JAVA_TOOL_OPTIONS="-javaagent:/opt/argus/impala-query-agent-1.0.0.jar=targetUrl=http://metadata-sync:4610/collector/impala/query,platformId=impala-19d0bfe954e3fd2cd"
```

### Agent 파라미터

| 파라미터 | 필수 | 기본값 | 설명 |
|----------|------|--------|------|
| `targetUrl` | Yes | - | 수집 엔드포인트 URL |
| `platformId` | Yes | - | Argus Catalog 플랫폼 ID |
| `enabled` | No | `true` | Agent 활성화 여부 |

### Cloudera Manager

"Cloudera Manager > Impala > Configuration"에서 다음을 설정합니다.

* **Impala Daemon Java Configuration Options for Impala Daemon** (또는 Safety Valve):
  * `-javaagent:/opt/argus/impala-query-agent-1.0.0.jar=targetUrl=http://metadata-sync:4610/collector/impala/query,platformId=impala-19d0bfe954e3fd2cd`

## Deployment

1. 빌드한 `impala-query-agent-1.0.0.jar`를 모든 Impala Daemon 노드에 배포
2. Cloudera Manager에서 JVM 옵션 추가 후 Impala 서비스 재시작
3. Metadata Sync 서버의 `/collector/impala/query` 엔드포인트가 수신 가능한지 확인

## 주의사항

* Agent는 비동기 전송 (daemon thread)으로 Impala 쿼리 처리에 영향 없음
* ASM은 maven-shade-plugin으로 relocate하여 Impala 내부 라이브러리와 충돌 방지
* Reflection 기반으로 Impala 버전 간 호환성 유지 (메서드가 없으면 null 반환)
