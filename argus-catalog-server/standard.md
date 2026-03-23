# Data Standard System — 데이터 표준 관리

## 개요

Argus Catalog의 데이터 표준 시스템은 조직의 데이터 표준(단어, 도메인, 용어, 코드)을 체계적으로 관리하고, 실제 데이터셋 컬럼과의 매핑을 통해 표준 준수율을 측정하는 기능을 제공한다.

## 핵심 개념 4계층

```
표준 사전 (Dictionary)
  ├── 표준 단어 (Word)        ← 원자적 단위: "고객", "번호", "금액"
  ├── 표준 도메인 (Domain)    ← 데이터 타입 정의: "번호" → VARCHAR(20)
  ├── 표준 용어 (Term)        ← 단어 조합 + 도메인: "고객번호" = 고객 + 번호
  └── 코드 그룹 (Code Group)  ← 허용 값 집합: "성별코드" → M/F/U
```

## 표준 단어 (Standard Word)

데이터 표준의 최소 단위. 용어를 구성하는 원자적 단어.

| 필드 | 설명 | 예시 |
|------|------|------|
| word_name | 한글명 | 고객 |
| word_english | 영문명 | Customer |
| word_abbr | 영문 약어 | CUST |
| word_type | 유형 | GENERAL, SUFFIX, PREFIX |
| is_forbidden | 금칙어 여부 | false |

**word_type:**
- `GENERAL`: 일반 단어 (고객, 전화, 상품)
- `SUFFIX`: 분류어/접미어 (번호, 코드, 금액, 일자, 명) → 도메인과 연결
- `PREFIX`: 접두어 (총, 순, 최대)

**금칙어:** `is_forbidden = true`인 단어는 사용 금지. 대체 단어를 안내.

**이음동의어:** `synonym_group_id`가 같은 단어들은 같은 의미. 표준 단어를 지정.

## 표준 도메인 (Standard Domain)

데이터 타입 표준. SUFFIX 단어와 연결되어 용어의 데이터 타입을 자동 결정.

| 도메인명 | 그룹 | 데이터 타입 | 길이 |
|---------|------|-----------|------|
| 번호 | 문자형 | VARCHAR | 20 |
| 금액 | 숫자형 | DECIMAL | 15,2 |
| 일자 | 일시형 | DATE | - |
| 코드 | 문자형 | VARCHAR | 20 |
| 명 | 문자형 | VARCHAR | 200 |

## 표준 용어 (Standard Term)

단어의 조합으로 구성된 업무 용어. 형태소 분석으로 자동 생성.

### 형태소 분석 흐름

```
입력: "고객전화번호"
  ▼
단어 사전에서 최장 매치 분해:
  "고객" (GENERAL) + "전화" (GENERAL) + "번호" (SUFFIX)
  ▼
자동 생성:
  영문명:    Customer Telephone Number
  영문약어:  CUST_TEL_NO
  물리명:    cust_tel_no
  ▼
도메인 추천 (마지막 SUFFIX "번호"):
  → 번호 도메인: VARCHAR(20)
```

### 용어 예시

| 용어명 | 구성 단어 | 약어 | 물리명 | 도메인 |
|-------|---------|------|--------|-------|
| 고객번호 | 고객 + 번호 | CUST_NO | cust_no | 번호 (VARCHAR(20)) |
| 주문금액 | 주문 + 금액 | ORD_AMT | ord_amt | 금액 (DECIMAL(15,2)) |
| 등록일자 | 등록 + 일자 | REG_DT | reg_dt | 일자 (DATE) |
| 성별코드 | 성별 + 코드 | GNDR_CD | gndr_cd | 코드 (VARCHAR(20)) |

## 코드 그룹 / 코드 값

코드형 도메인에 속하는 허용 값 집합.

```
성별코드 (Gender Code):
  M → 남성 (Male)
  F → 여성 (Female)
  U → 미상 (Unknown)
```

## 용어-컬럼 매핑

표준 용어와 실제 데이터셋 컬럼 간의 매핑.

| mapping_type | 설명 |
|-------------|------|
| MATCHED | 표준과 일치 (물리명, 타입 모두 일치) |
| SIMILAR | 유사 (물리명은 다르지만 의미 동일) |
| VIOLATION | 위반 (표준과 다른 타입/길이 사용) |

## 표준 준수율

```
준수율 = (MATCHED 컬럼 수 / 전체 컬럼 수) × 100%
```

## API 엔드포인트

### Dictionary (표준 사전)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/standards/dictionaries` | 사전 생성 |
| GET | `/api/v1/standards/dictionaries` | 사전 목록 |
| GET | `/api/v1/standards/dictionaries/{id}` | 사전 상세 |
| PUT | `/api/v1/standards/dictionaries/{id}` | 사전 수정 |
| DELETE | `/api/v1/standards/dictionaries/{id}` | 사전 삭제 |

### Word (표준 단어)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/standards/words` | 단어 등록 |
| GET | `/api/v1/standards/words?dictionary_id=` | 단어 목록 |
| PUT | `/api/v1/standards/words/{id}` | 단어 수정 |
| DELETE | `/api/v1/standards/words/{id}` | 단어 삭제 |

### Domain (표준 도메인)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/standards/domains` | 도메인 등록 |
| GET | `/api/v1/standards/domains?dictionary_id=` | 도메인 목록 |
| PUT | `/api/v1/standards/domains/{id}` | 도메인 수정 |
| DELETE | `/api/v1/standards/domains/{id}` | 도메인 삭제 |

### Term (표준 용어)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/standards/terms/analyze` | 형태소 분석 (자동 추천) |
| POST | `/api/v1/standards/terms` | 용어 등록 |
| GET | `/api/v1/standards/terms?dictionary_id=` | 용어 목록 |
| PUT | `/api/v1/standards/terms/{id}` | 용어 수정 |
| DELETE | `/api/v1/standards/terms/{id}` | 용어 삭제 |

### Code Group / Value

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/standards/code-groups` | 코드 그룹 등록 |
| GET | `/api/v1/standards/code-groups?dictionary_id=` | 코드 그룹 목록 |
| POST | `/api/v1/standards/code-groups/{id}/values` | 코드 값 추가 |
| DELETE | `/api/v1/standards/code-values/{id}` | 코드 값 삭제 |

### Mapping & Compliance

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/standards/mappings` | 용어-컬럼 매핑 등록 |
| GET | `/api/v1/standards/mappings` | 매핑 목록 |
| DELETE | `/api/v1/standards/mappings/{id}` | 매핑 삭제 |
| GET | `/api/v1/standards/compliance` | 표준 준수율 조회 |

### Change Log

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/standards/change-logs` | 변경 이력 조회 |

## UI

### Data Standards 페이지 (`/dashboard/standards`)

상단에 **표준 사전 선택** 드롭다운이 있고, 아래에 5개 탭으로 구성:

- **Words**: 표준 단어 목록 + 등록 다이얼로그
- **Domains**: 표준 도메인 목록 + 등록 다이얼로그
- **Terms**: 표준 용어 목록 + 형태소 분석 기반 등록 다이얼로그
- **Codes**: 코드 그룹 카드 목록 + 코드 값 관리
- **Compliance**: 표준 준수율 대시보드 (프로그레스 바 + 통계)
