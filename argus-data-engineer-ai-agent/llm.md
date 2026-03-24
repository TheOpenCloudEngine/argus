# LLM 가이드 — Data Engineer AI Agent

이 문서는 Argus Data Engineer AI Agent에서 LLM을 선택하고, RAG/Fine-tuning을 활용하여 Agent 성능을 최적화하는 방법을 정리합니다.

---

## 1. Agent가 LLM에게 요구하는 능력

| 능력 | 난이도 | 설명 |
|------|--------|------|
| Tool-use (Function Calling) | **상** | 25개 도구 중 정확한 것을 골라 JSON 파라미터를 생성 |
| Multi-step Planning | **상** | 3~8단계 작업을 순서대로 계획하고 실행 |
| SQL/PySpark 코드 생성 | **중~상** | 플랫폼별 SQL 방언, 정확한 컬럼명 사용 |
| 컨텍스트 유지 | **중** | 이전 tool_result를 기억하고 다음 판단에 활용 |
| 한국어 이해 | **중** | 사용자가 한국어로 입력하는 경우 처리 |
| 도메인 지식 | **중** | ETL, 리니지, 데이터 품질 개념 이해 |

---

## 2. LLM별 적합도 평가

### Tier 1 — 프로덕션 권장

| 모델 | Tool-use | Planning | 코드 생성 | 한국어 | 비용 (1M tok) | 판정 |
|------|----------|----------|----------|--------|-------------|------|
| **Claude Sonnet 4** | 네이티브, 최상 | 최상 | 최상 | 우수 | ~$3/in $15/out | **최적** |
| **GPT-4o** | 네이티브 | 상 | 최상 | 우수 | ~$2.5/in $10/out | 적합 |
| **Claude Opus 4** | 네이티브, 최상 | 최상 | 최상 | 우수 | ~$15/in $75/out | 비용 과다 |

- **Claude Sonnet 4 권장 이유**: tool_use 프로토콜이 API에 네이티브로 내장되어 파싱 에러가 없고, 비용 대비 성능이 가장 우수함
- Opus는 이 수준의 작업에 과잉 스펙으로 비용 효율이 낮음

### Tier 2 — 제한적 사용 가능

| 모델 | Tool-use | Planning | 코드 생성 | 한국어 | 비용 | 판정 |
|------|----------|----------|----------|--------|------|------|
| **GPT-4o-mini** | 지원 | 중 | 중상 | 양호 | 저렴 | 간단 작업만 |
| **Claude Haiku 4** | 네이티브 | 중 | 중 | 양호 | 매우 저렴 | 간단 작업만 |

- 단일 도구 호출(검색, 미리보기)은 문제없음
- 5단계 이상 multi-step ETL 생성은 불안정

### Tier 3 — Ollama 로컬 모델 (Airgap/보안 환경)

| 모델 | Tool-use | Planning | 코드 생성 | 한국어 | 판정 |
|------|----------|----------|----------|--------|------|
| **Qwen2.5:72b** | 지원 | 중상 | 상 | 우수 | **로컬 최선** |
| **Qwen2.5:32b** | 지원 | 중 | 중상 | 양호 | 실용적 |
| **Llama3.1:70b** | 지원 | 중 | 상 | 미흡 | 한국어 약함 |
| **Qwen2.5:7b** | 불안정 | 하 | 중 | 양호 | 간단 작업만 |
| **Llama3.1:8b** | 불안정 | 하 | 중하 | 불가 | 부적합 |

- Airgap(폐쇄망) 환경이라면 **Qwen2.5:72b가 유일한 현실적 선택**
- 7b~8b 모델은 tool_use 자체가 불안정해서 Agent로 쓰기 어려움

---

## 3. LLM 수준에 따른 동작 차이

동일한 사용자 입력 `"sakila.film 테이블 데이터 좀 보여줘"`에 대한 LLM별 차이:

### 고수준 LLM (Claude Sonnet, GPT-4o)

```
Loop 1: search_datasets(query="sakila.film")     → dataset_id=42 찾음
Loop 2: preview_data(dataset_id=42, limit=10)     → 데이터 조회
Loop 3: 최종 답변 (깔끔한 테이블 출력)
→ 3회 만에 완료 ✅
```

### 중수준 LLM (Qwen2.5:32b, GPT-4o-mini)

```
Loop 1: search_datasets(query="sakila.film")      → OK
Loop 2: get_dataset_detail(dataset_id=42)          → 불필요한 상세 조회
Loop 3: get_dataset_schema(dataset_id=42)          → 불필요한 스키마 조회
Loop 4: preview_data(dataset_id=42, limit=10)      → 이제야 데이터 조회
Loop 5: 최종 답변
→ 5회, 불필요한 도구 호출 2회 낭비 ⚠️
```

### 저수준 LLM (Qwen2.5:7b, Llama3.1:8b)

```
Loop 1: preview_data(dataset_id=0)                 → ID를 모르는데 0으로 추측 → 에러
Loop 2: search_datasets(query="film")              → 너무 넓은 검색
Loop 3: preview_data(dataset_id=15)                → 잘못된 ID 선택
Loop 4: search_datasets(query="sakila film table") → 재검색
Loop 5: preview_data(dataset_id=42)                → 이제야 성공
Loop 6: 최종 답변 (포맷이 깔끔하지 않음)
→ 6회, 에러 2회, 잘못된 판단 1회 ❌
```

### LLM 수준이 영향을 미치는 4가지 핵심 지점

**1) 도구 선택** — 어떤 도구를 쓸 것인가

```
사용자: "film 테이블에서 rental_rate 평균 구해줘"

고수준: execute_sql(sql="SELECT AVG(rental_rate) FROM film")   ← 직접 실행
저수준: generate_sql(...)                                      ← 코드만 생성, 실행 안 함
최저:   search_datasets → get_schema → get_detail → ...        ← 무한 조회
```

**2) 파라미터 정확도** — 인자를 맞게 넣는가

```
고수준: preview_data(dataset_id=42, limit=10, columns=["film_id","title","rental_rate"])
저수준: preview_data(dataset_id=42)                  ← 전체 컬럼 조회 (비효율)
최저:   preview_data(dataset_id="42")                ← 타입 오류 (string vs integer)
```

**3) 멀티스텝 계획** — 몇 번 만에 완료하는가

```
사용자: "MySQL sakila.film을 PostgreSQL DW로 ETL 만들어줘"

고수준 (6 steps):
  1. search_datasets("sakila.film")
  2. get_dataset_schema(42)
  3. get_platform_config(mysql_id)
  4. get_platform_config(pg_id)
  5. generate_pyspark(sources=[42], ...)
  6. 최종 답변

저수준 (12+ steps):
  1. search_datasets("sakila")          ← 너무 넓음
  2. search_datasets("sakila.film")     ← 재시도
  3. get_dataset_detail(42)             ← 불필요
  4. get_dataset_schema(42)
  5. get_platform_metadata(5)           ← 불필요
  6. get_platform_config(5)
  7. search_datasets("postgresql DW")   ← 타겟을 못 찾음
  8. get_catalog_stats()                ← 관련 없는 호출
  ...
  → max_steps(20) 초과 가능
```

**4) tool_use 프로토콜 준수** — JSON 형식이 맞는가

```json
// 정상 (Claude, GPT-4o)
{"type": "tool_use", "name": "preview_data", "input": {"dataset_id": 42}}

// 비정상 (소형 모델에서 발생 가능)
{"type": "tool_use", "name": "preview_data", "input": "dataset_id=42"}   // string으로 잘못 전달
{"type": "text", "text": "I'll call preview_data(42)"}                   // 도구 호출 대신 텍스트 출력
```

---

## 4. 현재 코드의 LLM 방어 메커니즘

| 문제 | 방어 코드 | 위치 |
|------|----------|------|
| 무한 루프 | `max_steps = 20` | `agent/engine.py` |
| 잘못된 도구명 | `Unknown tool` 에러 반환 | `tools/registry.py` |
| 위험한 실행 | SafetyLevel 승인 체크 | `tools/registry.py` |
| DML/DDL 실행 시도 | `_validate_read_only()` 차단 | `connectors/base.py` |
| DB 레벨 보호 | `SET SESSION TRANSACTION READ ONLY` | `connectors/mysql.py` |
| DB 레벨 보호 | `readonly=True` 트랜잭션 | `connectors/postgresql.py` |

---

## 5. RAG (Retrieval-Augmented Generation)

### RAG가 해결하는 문제

LLM이 시스템 프롬프트로만 도메인 지식을 받으므로, 매 요청마다 도구를 사용해 정보를 탐색해야 합니다. RAG를 적용하면 LLM 호출 전에 관련 컨텍스트를 미리 검색하여 주입함으로써 탐색 단계를 생략할 수 있습니다.

### RAG 동작 흐름

```
사용자: "고객 주문 데이터를 일별 집계 테이블로 ETL 만들어줘"
                │
                ▼
        ┌── RAG Retrieval ──────────────────────────────────┐
        │                                                    │
        │  1) 카탈로그 임베딩 검색 (argus-catalog에 이미 존재)  │
        │     → "고객 주문" → dataset: orders, customers      │
        │     → 스키마, 리니지, 태그 정보 자동 첨부            │
        │                                                    │
        │  2) 사내 ETL 패턴 검색 (새로 추가)                  │
        │     → "일별 집계" → 기존 daily_agg_*.py 코드 검색   │
        │     → 회사 표준 ETL 템플릿 첨부                     │
        │                                                    │
        │  3) 데이터 표준 사전 검색 (argus-catalog에 이미 존재) │
        │     → "고객" → standard_term: 고객(CUST)            │
        │     → 컬럼 네이밍 규칙 첨부                         │
        │                                                    │
        └────────────┬───────────────────────────────────────┘
                     ▼
             LLM에 enriched prompt 전달
             (검색 없이도 이미 컨텍스트가 풍부)
```

### RAG 적용 전후 비교

```
=== RAG 없음 (현재) ===
User: "고객 주문 일별 집계 ETL"
  Loop 1: search_datasets("고객 주문")           ← LLM이 직접 검색
  Loop 2: get_dataset_schema(orders)
  Loop 3: get_dataset_schema(customers)
  Loop 4: search_glossary("고객")                ← 용어 확인
  Loop 5: get_platform_config(mysql_id)
  Loop 6: generate_pyspark(...)
  Loop 7: 최종 답변
→ 7 loops, ~12,000 tokens

=== RAG 있음 ===
User: "고객 주문 일별 집계 ETL"
  [RAG] 자동 enrichment: 관련 데이터셋 3개 + 스키마 + 용어 첨부
  Loop 1: generate_pyspark(sources=[42,43])      ← 이미 ID를 알고 있음
  Loop 2: 최종 답변
→ 2 loops, ~6,000 tokens
```

### RAG 구현 — argus-catalog 기존 인프라 활용

argus-catalog-server에 이미 pgvector 임베딩 + 하이브리드 검색이 구현되어 있으므로, Agent에서 이를 활용하는 RAG 레이어만 추가하면 됩니다:

```python
# agent/rag.py

class AgentRAG:
    """Agent 요청 전에 관련 컨텍스트를 검색하여 LLM에 주입."""

    async def enrich_prompt(self, user_message: str, catalog: CatalogClient) -> str:
        """사용자 메시지를 분석하여 관련 카탈로그 정보를 자동 첨부."""

        # 1) 시맨틱 검색으로 관련 데이터셋 찾기
        datasets = await catalog.search_datasets(user_message, limit=5)

        # 2) 찾은 데이터셋의 스키마를 미리 가져오기
        schemas = []
        for ds in datasets.get("results", [])[:3]:
            schema = await catalog.get_dataset_schema(ds["id"])
            schemas.append({"dataset": ds["name"], "columns": schema})

        # 3) 관련 용어 사전 검색
        glossary = await catalog.search_glossary(user_message, limit=5)

        # 4) enriched context 조립
        context = f"""
## 관련 데이터셋 (자동 검색 결과)
{json.dumps(datasets.get("results", [])[:3], ensure_ascii=False, indent=2)}

## 스키마 정보
{json.dumps(schemas, ensure_ascii=False, indent=2)}

## 관련 비즈니스 용어
{json.dumps(glossary, ensure_ascii=False, indent=2)}

## 사용자 요청
{user_message}
"""
        return context
```

### RAG 효과 요약

| 지표 | RAG 없음 | RAG 있음 | 개선 |
|------|---------|---------|------|
| LLM 호출 횟수 | 7회 | 2회 | **70% 감소** |
| 토큰 사용량 | ~12,000 | ~6,000 | **50% 감소** |
| 응답 속도 | ~15초 | ~4초 | **3~4배 향상** |
| 저수준 LLM 성공률 | 40% | 70% | 탐색 실수 기회 감소 |

---

## 6. Fine-tuning

### Fine-tuning이 해결하는 문제

| 문제 | Fine-tuning 효과 |
|------|------------------|
| 도구 선택 실수 | "이 패턴이면 이 도구" 학습 → 정확도 향상 |
| 불필요한 도구 호출 | 최적 경로 학습 → step 수 감소 |
| 코드 생성 품질 | 회사 코딩 컨벤션 학습 → 일관된 스타일 |
| 한국어 DE 용어 | "리니지", "파이프라인", "적재" 등 정확한 이해 |

### Fine-tuning 학습 데이터 예시

Agent의 성공 사례를 tool_use 형식으로 기록하여 학습 데이터를 구축합니다:

```jsonl
{
  "messages": [
    {"role": "system", "content": "You are Argus DE Agent..."},
    {"role": "user", "content": "sakila.film 데이터 미리보기 해줘"},
    {"role": "assistant", "content": null, "tool_calls": [
      {"name": "search_datasets", "arguments": {"query": "sakila.film"}}
    ]},
    {"role": "tool", "content": "{\"results\":[{\"id\":42}]}"},
    {"role": "assistant", "content": null, "tool_calls": [
      {"name": "preview_data", "arguments": {"dataset_id": 42, "limit": 10}}
    ]},
    {"role": "tool", "content": "{\"rows\":[...]}"},
    {"role": "assistant", "content": "sakila.film 테이블의 샘플 데이터입니다:\n..."}
  ]
}
```

### 학습 데이터 구축 방법

1. **Agent 실행 로그 수집**: 성공한 대화를 `de_agent_messages` 테이블에서 추출
2. **전문가 검수**: 최적 경로가 아닌 사례를 수정하여 이상적인 도구 호출 순서로 보정
3. **패턴별 100~500개**: 미리보기, ETL 생성, 품질 진단, 영향도 분석 등 카테고리별 수집
4. **형식 변환**: 각 LLM 프로바이더의 fine-tuning 데이터 형식에 맞게 변환

### Fine-tuning 적용 전후 비교

```
=== Base 모델 (Qwen2.5:7b) ===
성공률: ~40%  (tool_use 파싱 실패, 잘못된 도구 선택)
평균 steps: 8~12
코드 품질: 일반적인 PySpark (회사 컨벤션 무시)

=== Fine-tuned Qwen2.5:7b ===
성공률: ~85%  (올바른 도구 선택, 정확한 파라미터)
평균 steps: 3~5
코드 품질: 회사 컨벤션 준수 (변수명, 에러 처리 패턴)
```

### Fine-tuning 적용 판단 기준

| 조건 | Fine-tuning 필요 여부 |
|------|----------------------|
| Claude Sonnet / GPT-4o 사용 | **불필요** — 이미 충분히 정확 |
| GPT-4o-mini / Haiku 사용 | **선택** — 복잡한 작업 정확도 향상에 도움 |
| Ollama 32b+ 모델 | **권장** — tool_use 정확도와 도메인 적응에 효과적 |
| Ollama 7b~8b 모델 | **필수** — fine-tuning 없이는 Agent로 사용 불가 |

---

## 7. 환경별 권장 구성

### 클라우드 환경 (인터넷 가능)

```
LLM:          Claude Sonnet 4 (API)
RAG:          ✅ (카탈로그 임베딩 검색 → step 수 절감, 비용 절감)
Fine-tuning:  ❌ (불필요)

결과: 2~3 steps, 성공률 95%+, 응답 2~5초
비용: ~$0.01~0.05/요청
```

### 하이브리드 환경 (비용 최적화)

```
LLM:          간단 작업 → Haiku/GPT-4o-mini (저비용)
              복잡 작업 → Claude Sonnet (고비용)
RAG:          ✅ (필수 — 저수준 모델 보정 + 비용 절감)
Fine-tuning:  ❌
라우팅:       의도 분류기로 작업 복잡도 판별 후 LLM 선택

결과: 간단 작업 $0.001/요청, 복잡 작업 $0.03/요청
```

### 폐쇄망 환경 (Airgap)

```
LLM:          Qwen2.5:32b~72b (Ollama, GPU 서버)
RAG:          ✅ (필수 — 로컬 모델의 탐색 실수 보정)
Fine-tuning:  ✅ (필수 — tool_use 정확도 + 도메인 지식)
하드웨어:     A100 80GB 또는 RTX 4090 x2

결과: 3~5 steps, 성공률 80~85%, 응답 10~30초
비용: GPU 서버 운영 비용만 발생
```

---

## 8. 기법별 효과 누적 비교

기준 작업: `"MySQL → PostgreSQL ETL 생성"` (복잡한 멀티스텝 작업)

| 구성 | 성공률 | Steps | 응답시간 | 코드 품질 |
|------|--------|-------|---------|----------|
| Base Qwen2.5:7b (아무것도 없음) | 30% | 12 | 60초 | 하 |
| + RAG | 50% | 6 | 30초 | 하 |
| + Fine-tuning | 75% | 5 | 25초 | 중 |
| + RAG + Fine-tuning | 85% | 3 | 15초 | 중상 |
| Claude Sonnet + RAG | 95% | 2 | 3초 | 상 |

RAG와 Fine-tuning의 효과는 곱해집니다:
- **RAG**: 탐색 단계 생략 → 실수할 기회 자체를 줄임
- **Fine-tuning**: 판단 정확도 향상 → 남은 단계에서의 실수를 줄임

---

## 9. LLM 개선 방향 로드맵

### 즉시 적용 가능 (코드 변경만)

1. **System Prompt 강화**: 저수준 LLM을 위한 step-by-step 가이드 추가
2. **Tool description 최적화**: 도구 설명에 "이 도구를 호출하기 전에 search_datasets를 먼저 호출하라" 같은 선후 관계 명시
3. **Tool 자체 보정**: `preview_data`가 `dataset_name`도 받을 수 있게 하여 search 단계 생략 가능하게 변경

### 단기 (RAG 레이어 추가)

1. **AgentRAG 클래스 구현**: argus-catalog의 하이브리드 검색 API 활용
2. **사내 ETL 패턴 임베딩**: 기존 성공 코드를 벡터화하여 유사 패턴 검색
3. **Engine에 RAG 통합**: `AgentEngine.run()` 진입 시 사용자 메시지를 enrichment

### 중기 (Fine-tuning)

1. **학습 데이터 수집 파이프라인**: Agent 실행 로그에서 성공 사례 자동 추출
2. **데이터 검수 도구**: 전문가가 최적 경로를 검수/보정할 수 있는 UI
3. **Ollama 모델 fine-tuning**: Qwen2.5:32b 기반으로 100~500개 사례 학습

### 장기 (하이브리드 라우팅)

1. **의도 분류기**: 사용자 요청의 복잡도를 판별하여 적절한 LLM으로 라우팅
2. **비용/품질 균형**: 간단한 작업은 Haiku, 복잡한 작업은 Sonnet으로 자동 분배
3. **Planner 레이어**: 자주 쓰는 작업 패턴을 워크플로우로 미리 정의하여 LLM 판단 부담 경감

---

## 10. 설정 방법

### config.yml에서 LLM 변경

```yaml
llm:
  provider: "anthropic"                    # anthropic, openai, ollama
  model: "claude-sonnet-4-20250514"        # 모델 ID
  api_key: "sk-ant-..."                    # API 키 (Ollama는 빈 값)
  api_url: ""                              # 커스텀 URL (Ollama: http://localhost:11434)
  temperature: 0.3                         # 낮을수록 일관적 (Agent는 0.2~0.4 권장)
  max_tokens: 4096                         # 코드 생성 시 충분한 크기 필요
```

### 런타임에서 LLM 변경 (Settings API)

```bash
# Ollama로 전환
curl -X PUT http://localhost:4700/api/v1/settings/llm \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ollama",
    "model": "qwen2.5:32b",
    "api_key": "",
    "api_url": "http://gpu-server:11434",
    "temperature": 0.3,
    "max_tokens": 4096
  }'

# Claude로 전환
curl -X PUT http://localhost:4700/api/v1/settings/llm \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "api_key": "sk-ant-...",
    "api_url": "",
    "temperature": 0.3,
    "max_tokens": 4096
  }'
```

### Temperature 권장값

| 용도 | Temperature | 이유 |
|------|-------------|------|
| Tool-use Agent | **0.2~0.3** | 도구 선택과 파라미터가 일관적이어야 함 |
| 코드 생성 | **0.3~0.5** | 약간의 창의성은 허용하되 정확성 우선 |
| 자유 질의응답 | **0.5~0.7** | 다양한 표현과 설명을 위해 |

---

## 결론

| 질문 | 권장 |
|------|------|
| 어떤 LLM을 써야 하나? | 클라우드: **Claude Sonnet 4**, 폐쇄망: **Qwen2.5:72b + fine-tuning** |
| RAG가 필요한가? | **어떤 환경이든 필수.** 비용↓ 속도↑ 정확도↑ |
| Fine-tuning이 필요한가? | 클라우드 LLM: **불필요**, 로컬 소형 모델: **필수** |
| 가장 가성비 좋은 개선? | **RAG 레이어 추가** (argus-catalog의 기존 임베딩 인프라 활용) |
