# AI 메타데이터 자동 생성 (LLM)

LLM(Large Language Model)을 활용하여 데이터 카탈로그의 메타데이터를 자동으로 생성하는 기능입니다. Ollama, OpenAI, Anthropic(Claude) 프로바이더를 지원하며, 테이블/컬럼 설명 생성, 태그 추천, PII 탐지를 제공합니다.

## 아키텍처

```
┌────────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  UI                │     │  AI Service      │     │  LLM Provider       │
│  (설정/생성 트리거)   │────▶│  (컨텍스트 조립 +   │────▶│  (Ollama / OpenAI / │
│                    │◀────│   결과 파싱)       │◀────│   Claude)           │
└────────────────────┘     └──────┬───────────┘     └─────────────────────┘
                                  │
                   ┌──────────────┼──────────────┐
                   ▼              ▼              ▼
            ┌───────────┐ ┌───────────┐ ┌──────────────────┐
            │ Dataset / │ │ Parquet   │ │ ai_generation_log│
            │ Schema ORM│ │ 샘플 데이터│ │ (감사 이력)       │
            └───────────┘ └───────────┘ └──────────────────┘
```

## LLM 프로바이더

### 지원 프로바이더

| 프로바이더 | 기본 모델 | API URL | 특성 |
|------------|-----------|---------|------|
| **ollama** | qwen2.5:7b | http://localhost:11434 | 로컬 실행, API 키 불필요, 한국어 우수 |
| **openai** | gpt-4o-mini | https://api.openai.com/v1 | 클라우드 API, 고품질, API 키 필요 |
| **anthropic** | claude-sonnet-4-20250514 | https://api.anthropic.com | 클라우드 API, 고품질, API 키 필요 |

### Ollama 권장 모델

| 모델 | 크기 | 한국어 | 추천 용도 |
|------|------|--------|-----------|
| `qwen2.5:7b` | 4.4GB | 우수 | **한국어 메타데이터 기본 권장** |
| `qwen2.5:14b` | 8.7GB | 우수 | 한국어 고품질 (RAM 16GB 이상) |
| `llama3.1:8b` | 4.7GB | 보통 | 범용 영문 메타데이터 |
| `gemma2:9b` | 5.4GB | 보통 | 다국어 지원 |
| `EEVE-Korean-10.8B` | 6.5GB | 최우수 | 한국어 특화 |

### Ollama 설치 및 모델 준비

```bash
# Ollama 설치 (Linux)
curl -fsSL https://ollama.ai/install.sh | sh

# 모델 다운로드
ollama pull qwen2.5:7b

# 실행 확인
ollama list
curl http://localhost:11434/api/tags
```

## 설정

### UI에서 설정 (Settings > LLM / AI)

1. **Settings** 페이지 > **LLM / AI** 탭 선택
2. **Enable AI Metadata Generation** 토글 활성화
3. **Provider** 선택: `Ollama (Local LLM)`
4. **Model** 선택: `qwen2.5:7b`
5. **API URL**: `http://localhost:11434` (기본값)
6. **Generation Language**: `Korean`
7. **Test Connection** 클릭하여 연결 확인
8. **Save** 클릭

### API로 설정

```bash
# 현재 설정 조회
curl http://localhost:4600/api/v1/settings/llm

# Ollama로 설정 변경
curl -X PUT http://localhost:4600/api/v1/settings/llm \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "provider": "ollama",
    "model": "qwen2.5:7b",
    "api_key": "",
    "api_url": "http://localhost:11434",
    "temperature": 0.3,
    "max_tokens": 1024,
    "auto_generate_on_sync": false,
    "language": "ko"
  }'

# 연결 테스트
curl -X POST http://localhost:4600/api/v1/settings/llm/test \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "provider": "ollama",
    "model": "qwen2.5:7b",
    "api_url": "http://localhost:11434"
  }'
```

### 설정 항목 상세

| 항목 | 기본값 | 설명 |
|------|--------|------|
| `enabled` | false | AI 메타데이터 생성 기능 활성화 |
| `provider` | openai | LLM 프로바이더: openai, ollama, anthropic |
| `model` | gpt-4o-mini | 사용할 LLM 모델 식별자 |
| `api_key` | (빈값) | API 키 (ollama는 불필요) |
| `api_url` | (빈값) | 프로바이더 엔드포인트 URL (빈값이면 기본 URL 사용) |
| `temperature` | 0.3 | 생성 temperature (0.0~1.0, 낮을수록 사실적) |
| `max_tokens` | 1024 | 응답 최대 토큰 수 |
| `auto_generate_on_sync` | false | 메타데이터 동기화 후 자동 생성 활성화 |
| `language` | ko | 생성 언어 (ko, en, ja, zh) |

## 생성 기능

### 4가지 생성 유형

| 기능 | API 엔드포인트 | 설명 |
|------|----------------|------|
| **테이블 설명** | `POST /api/v1/ai/datasets/{id}/describe` | 테이블 목적과 내용을 설명하는 텍스트 생성 |
| **컬럼 설명** | `POST /api/v1/ai/datasets/{id}/describe-columns` | 모든 컬럼의 용도 설명을 일괄 생성 |
| **태그 추천** | `POST /api/v1/ai/datasets/{id}/suggest-tags` | 적절한 분류 태그를 추천 |
| **PII 탐지** | `POST /api/v1/ai/datasets/{id}/detect-pii` | 개인정보 포함 컬럼 자동 탐지 |

### 프롬프트 컨텍스트

LLM에 전달되는 컨텍스트 정보:

| 정보 | 출처 | 용도 |
|------|------|------|
| 테이블명, DB명 | `catalog_datasets` | 기본 식별 정보 |
| 컬럼명, 타입, 제약조건 | `catalog_dataset_schemas` | 스키마 구조 이해 |
| DDL | `platform_properties.ddl` | 테이블 정의 상세 |
| 샘플 데이터 (최대 5행) | `samples/{platform}/{dataset}/sample.parquet` | 실제 데이터 패턴 이해 |
| 행 수 | `platform_properties.estimated_rows` | 테이블 규모 |
| 플랫폼 타입 | `catalog_platforms.type` | DB 종류 |

샘플 데이터는 메타데이터 동기화 시 자동으로 수집되어 Parquet 파일로 저장됩니다.

## 사용 방법

### 방법 1: UI에서 개별 생성 (미리보기)

1. 데이터셋 상세 페이지로 이동
2. 우측 상단의 **AI Generate** 드롭다운 버튼 클릭
3. 원하는 기능 선택 (Generate Description / Generate Column Descriptions / Suggest Tags / Detect PII)
4. **Description/Columns**: 미리보기 다이얼로그에서 결과 확인 → **Apply** 또는 **Dismiss**
5. **Tags/PII**: 즉시 적용 후 토스트 메시지로 결과 표시

### 방법 2: API로 개별 생성

```bash
# 테이블 설명 생성 (미리보기만, 적용 안함)
curl -X POST http://localhost:4600/api/v1/ai/datasets/1/describe \
  -H "Content-Type: application/json" \
  -d '{"apply": false}'
# → {"dataset_id": 1, "description": "영화 정보를 저장하는...", "confidence": 0.87, "applied": false, "log_id": 1}

# 테이블 설명 생성 (즉시 적용)
curl -X POST http://localhost:4600/api/v1/ai/datasets/1/describe \
  -H "Content-Type: application/json" \
  -d '{"apply": true}'

# 컬럼 설명 일괄 생성
curl -X POST http://localhost:4600/api/v1/ai/datasets/1/describe-columns \
  -H "Content-Type: application/json" \
  -d '{"apply": true}'

# 태그 추천
curl -X POST http://localhost:4600/api/v1/ai/datasets/1/suggest-tags \
  -H "Content-Type: application/json" \
  -d '{"apply": true}'

# PII 탐지
curl -X POST http://localhost:4600/api/v1/ai/datasets/1/detect-pii \
  -H "Content-Type: application/json" \
  -d '{"apply": true}'

# 전체 생성 (설명 + 컬럼 + 태그 + PII)
curl -X POST http://localhost:4600/api/v1/ai/datasets/1/generate-all \
  -H "Content-Type: application/json" \
  -d '{"apply": true}'
```

### 방법 3: 일괄 생성 (Bulk)

UI의 **Settings > LLM / AI** 탭 하단 **Bulk AI Generation** 섹션에서 실행하거나 API로 호출합니다.

```bash
# 설명 없는 데이터셋에 대해 설명 자동 생성
curl -X POST http://localhost:4600/api/v1/ai/bulk-generate \
  -H "Content-Type: application/json" \
  -d '{
    "generation_types": ["description"],
    "apply": true,
    "empty_only": true
  }'

# 특정 플랫폼의 데이터셋만 전체 생성
curl -X POST http://localhost:4600/api/v1/ai/bulk-generate \
  -H "Content-Type: application/json" \
  -d '{
    "generation_types": ["description", "columns", "tags", "pii"],
    "apply": true,
    "empty_only": true,
    "platform_id": 1
  }'
```

### 방법 4: 동기화 후 자동 생성

설정에서 `auto_generate_on_sync`를 활성화하면, 메타데이터 동기화(Sync) 완료 후 설명이 비어있는 데이터셋에 대해 백그라운드에서 자동으로 설명을 생성합니다.

```bash
# 자동 생성 활성화
curl -X PUT http://localhost:4600/api/v1/settings/llm \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "provider": "ollama",
    "model": "qwen2.5:7b",
    "auto_generate_on_sync": true,
    "language": "ko"
  }'

# 이후 메타데이터 동기화 실행 시 자동으로 AI 설명 생성
curl -X POST http://localhost:4600/api/v1/catalog/platforms/1/sync
```

## 요청/응답 스키마

### 공통 요청 (GenerateRequest)

```json
{
  "apply": false,     // true: 즉시 적용, false: 미리보기만
  "force": false,     // true: 기존 설명 있어도 재생성
  "language": "ko"    // 언어 오버라이드 (설정 기본값 사용 시 생략)
}
```

### 테이블 설명 응답

```json
{
  "dataset_id": 1,
  "description": "영화 텍스트 정보(제목, 설명)를 전문 검색용으로 저장하는 테이블",
  "confidence": 0.87,
  "applied": false,
  "log_id": 42
}
```

### 컬럼 설명 응답

```json
{
  "dataset_id": 1,
  "columns": [
    {"field_path": "film_id", "description": "영화 고유 식별자 (PK)", "confidence": 0.95, "had_existing": false},
    {"field_path": "title", "description": "영화 제목", "confidence": 0.92, "had_existing": false}
  ],
  "total_generated": 2,
  "applied": false
}
```

### 태그 추천 응답

```json
{
  "dataset_id": 1,
  "suggested_tags": ["영화", "미디어"],
  "new_tags": [{"name": "콘텐츠", "description": "콘텐츠 관련 데이터"}],
  "applied_tags": ["영화"],
  "created_tags": ["콘텐츠"],
  "applied": true,
  "log_id": 43
}
```

### PII 탐지 응답

```json
{
  "dataset_id": 1,
  "pii_columns": [
    {"name": "email", "pii_type": "EMAIL", "confidence": 0.95, "reason": "Column name and sample values match email pattern"},
    {"name": "phone_number", "pii_type": "PHONE", "confidence": 0.88, "reason": "Column contains phone number format"}
  ],
  "applied": true,
  "log_id": 44
}
```

PII 유형: `EMAIL`, `PHONE`, `SSN`, `NAME`, `ADDRESS`, `CREDIT_CARD`, `IP_ADDRESS`, `DATE_OF_BIRTH`, `NATIONAL_ID`, `OTHER`

## 제안 관리

미리보기 모드(`apply=false`)로 생성된 결과는 `catalog_ai_generation_log` 테이블에 저장되며, 나중에 개별적으로 적용하거나 거부할 수 있습니다.

```bash
# 미적용 제안 목록 조회
curl http://localhost:4600/api/v1/ai/datasets/1/suggestions

# 제안 적용
curl -X POST http://localhost:4600/api/v1/ai/suggestions/42/apply

# 제안 거부 (삭제)
curl -X POST http://localhost:4600/api/v1/ai/suggestions/42/reject
```

## 통계

```bash
curl http://localhost:4600/api/v1/ai/stats
```

```json
{
  "total_generations": 156,
  "applied_count": 120,
  "pending_count": 36,
  "total_prompt_tokens": 89420,
  "total_completion_tokens": 34210,
  "description_coverage": {
    "total_datasets": 200,
    "described_datasets": 120,
    "coverage_pct": 60.0
  },
  "by_type": {
    "description": 80,
    "tag_suggestion": 40,
    "pii_detection": 36
  },
  "provider": "ollama",
  "model": "qwen2.5:7b"
}
```

## API 엔드포인트 전체 목록

### 생성 API (`/api/v1/ai`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/datasets/{id}/describe` | 테이블 설명 생성 |
| POST | `/datasets/{id}/describe-columns` | 컬럼 설명 일괄 생성 |
| POST | `/datasets/{id}/suggest-tags` | 태그 추천 |
| POST | `/datasets/{id}/detect-pii` | PII 탐지 |
| POST | `/datasets/{id}/generate-all` | 전체 생성 (위 4개 동시) |
| POST | `/bulk-generate` | 다수 데이터셋 일괄 생성 |
| GET | `/datasets/{id}/suggestions` | 미적용 제안 목록 |
| POST | `/suggestions/{id}/apply` | 제안 적용 |
| POST | `/suggestions/{id}/reject` | 제안 거부 |
| GET | `/stats` | 생성 통계 |

### 설정 API (`/api/v1/settings`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/llm` | LLM 설정 조회 |
| PUT | `/llm` | LLM 설정 변경 |
| POST | `/llm/test` | 연결 테스트 |

## 모듈 구조

```
app/ai/
├── __init__.py
├── base.py                # LLMProvider 추상 클래스
├── registry.py            # 싱글톤 프로바이더 관리자
├── prompts.py             # 4종 프롬프트 템플릿
├── service.py             # 생성 오케스트레이션, 컨텍스트 조립, JSON 파싱
├── schemas.py             # Pydantic 요청/응답 스키마
├── router.py              # /api/v1/ai 엔드포인트
├── models.py              # AIGenerationLog ORM
└── providers/
    ├── __init__.py
    ├── openai.py          # OpenAI Chat Completions API
    ├── ollama.py          # Ollama /api/generate
    └── anthropic.py       # Anthropic Messages API
```

## 데이터베이스

### catalog_ai_generation_log 테이블

모든 AI 생성 이력을 기록하는 감사 테이블입니다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | SERIAL | PK |
| `entity_type` | VARCHAR(20) | dataset, column, tag, pii |
| `entity_id` | INT | 대상 엔티티 ID |
| `dataset_id` | INT (FK) | 데이터셋 참조 |
| `field_name` | VARCHAR(500) | 컬럼명 (컬럼 레벨일 때) |
| `generation_type` | VARCHAR(30) | description, tag_suggestion, pii_detection |
| `generated_text` | TEXT | 생성된 텍스트 |
| `applied` | BOOLEAN | 적용 여부 |
| `provider` | VARCHAR(50) | 프로바이더명 |
| `model` | VARCHAR(100) | 모델명 |
| `prompt_tokens` | INT | 입력 토큰 수 |
| `completion_tokens` | INT | 출력 토큰 수 |
| `created_at` | TIMESTAMPTZ | 생성 시각 |

### catalog_dataset_schemas.pii_type 컬럼

PII 탐지 결과를 저장하는 컬럼이 `catalog_dataset_schemas` 테이블에 추가되었습니다.

```sql
-- PostgreSQL
ALTER TABLE catalog_dataset_schemas ADD COLUMN IF NOT EXISTS pii_type VARCHAR(50);
```

## 프론트엔드 UI

### Settings > LLM / AI 탭

```
┌─────────────────────────────────────────────────────┐
│ AI Metadata Status                                   │
│ Description Coverage: 45/120 (37.5%)                 │
│ Provider: ollama / qwen2.5:7b                        │
│ Generations: 156 (120 applied, 36 pending)           │
│ Tokens: 123,630                                      │
│ [████████░░░░░░░░░░░░] 37.5%                        │
├─────────────────────────────────────────────────────┤
│ LLM Provider                                         │
│ Enable AI Metadata Generation    [ON]                │
│ Provider     [Ollama (Local LLM) ▼]                  │
│ Model        [qwen2.5:7b ▼]                          │
│ API URL      [http://localhost:11434]                 │
│ Language     [Korean ▼]                               │
│ Temperature  [0.3 ─────○──────── ]                   │
│ Max Tokens   [1024]                                   │
│ Auto-generate on Sync  [OFF]                         │
│ [Save]  [Test Connection]                            │
├─────────────────────────────────────────────────────┤
│ Bulk AI Generation                                   │
│ [Generate Descriptions]  [Generate All]              │
└─────────────────────────────────────────────────────┘
```

### 데이터셋 상세 > AI Generate 버튼

데이터셋 상세 페이지 헤더에 **AI Generate** 드롭다운 버튼이 표시됩니다 (관리자만).

```
[AI Generate ▼]
├── Generate Description        → 미리보기 다이얼로그
├── Generate Column Descriptions → 미리보기 다이얼로그 (테이블)
├── Suggest Tags                → 즉시 적용 + 토스트
└── Detect PII                  → 즉시 적용 + 토스트
```

- **Description 미리보기**: 생성된 설명 텍스트 + Confidence + [Apply] / [Dismiss]
- **Columns 미리보기**: 컬럼별 설명 테이블 (Column, Description, Confidence) + [Apply All] / [Dismiss]
