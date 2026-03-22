"""리니지 변경 알림 Pydantic 스키마.

Alert API의 요청/응답 유효성 검증 및 직렬화를 위한 모델 정의.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 열거형 (Enums)
# ---------------------------------------------------------------------------

class AlertType(str, Enum):
    """알림 유형."""
    SCHEMA_CHANGE = "SCHEMA_CHANGE"    # 스키마 변경으로 인한 리니지 영향
    LINEAGE_BROKEN = "LINEAGE_BROKEN"  # 리니지 관계 단절
    SYNC_FAILED = "SYNC_FAILED"        # 메타데이터 동기화 실패


class AlertSeverity(str, Enum):
    """알림 심각도. 높을수록 긴급한 대응이 필요."""
    INFO = "INFO"          # 정보성 (매핑되지 않은 컬럼 변경, 컬럼 추가)
    WARNING = "WARNING"    # 경고 (매핑된 컬럼의 타입 변경)
    BREAKING = "BREAKING"  # 파괴적 변경 (매핑된 컬럼 삭제)


class AlertStatus(str, Enum):
    """알림 처리 상태. OPEN → ACKNOWLEDGED → RESOLVED 순으로 진행."""
    OPEN = "OPEN"                # 새로 생성된 알림
    ACKNOWLEDGED = "ACKNOWLEDGED"  # 담당자가 확인함
    RESOLVED = "RESOLVED"        # 문제 해결 완료
    DISMISSED = "DISMISSED"      # 무시 (조치 불필요로 판단)


class ScopeType(str, Enum):
    """구독 범위. 어떤 수준에서 알림을 받을지 결정."""
    DATASET = "DATASET"    # 특정 데이터셋 변경만 구독
    PIPELINE = "PIPELINE"  # 특정 파이프라인 관련 변경만 구독
    PLATFORM = "PLATFORM"  # 특정 플랫폼 소속 데이터셋 변경만 구독
    ALL = "ALL"            # 모든 변경 구독


# ---------------------------------------------------------------------------
# 알림 응답/수정 스키마
# ---------------------------------------------------------------------------

class AlertResponse(BaseModel):
    """알림 상세 응답. 원본/영향 데이터셋의 이름과 플랫폼 정보를 포함."""
    id: int
    alert_type: str                              # 알림 유형 (SCHEMA_CHANGE 등)
    severity: str                                # 심각도 (BREAKING, WARNING, INFO)
    source_dataset_id: int                       # 변경이 발생한 데이터셋 ID
    source_dataset_name: str | None = None       # 변경 데이터셋 이름 (JOIN 조회)
    source_platform_type: str | None = None      # 변경 데이터셋의 플랫폼 타입
    affected_dataset_id: int | None = None       # 영향받는 데이터셋 ID
    affected_dataset_name: str | None = None     # 영향받는 데이터셋 이름 (JOIN 조회)
    affected_platform_type: str | None = None    # 영향받는 데이터셋의 플랫폼 타입
    lineage_id: int | None = None                # 관련 리니지 관계 ID
    change_summary: str                          # 변경 요약 (사람이 읽을 수 있는 형태)
    change_detail: str | None = None             # 변경 상세 JSON
    status: str                                  # 처리 상태 (OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED)
    resolved_by: str | None = None               # 해결한 사용자
    resolved_at: datetime | None = None          # 해결 시각
    created_at: datetime                         # 알림 생성 시각


class AlertUpdateStatus(BaseModel):
    """알림 상태 변경 요청."""
    status: AlertStatus                          # 변경할 상태
    resolved_by: str | None = None               # 해결자 (RESOLVED/DISMISSED 시 기록)


class PaginatedAlerts(BaseModel):
    """페이지네이션된 알림 목록."""
    items: list[AlertResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# 구독 스키마
# ---------------------------------------------------------------------------

class SubscriptionCreate(BaseModel):
    """알림 구독 생성 요청."""
    user_id: str = Field(..., min_length=1, max_length=200)  # 구독자 식별자
    scope_type: ScopeType = ScopeType.ALL                     # 구독 범위
    scope_id: int | None = None                               # 범위 대상 ID (ALL이면 생략)
    channels: str = "IN_APP"                                  # 수신 채널 (콤마 구분)
    severity_filter: AlertSeverity = AlertSeverity.WARNING    # 최소 수신 심각도


class SubscriptionResponse(BaseModel):
    """알림 구독 응답."""
    id: int
    user_id: str
    scope_type: str
    scope_id: int | None = None
    channels: str
    severity_filter: str
    is_active: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# 알림 요약 (헤더 벨 배지용)
# ---------------------------------------------------------------------------

class AlertSummary(BaseModel):
    """미해결 알림 건수 요약. UI 헤더의 알림 벨 배지에 표시."""
    total_open: int = 0       # 전체 미해결 알림 수
    breaking_count: int = 0   # BREAKING 심각도 알림 수
    warning_count: int = 0    # WARNING 심각도 알림 수
    info_count: int = 0       # INFO 심각도 알림 수
