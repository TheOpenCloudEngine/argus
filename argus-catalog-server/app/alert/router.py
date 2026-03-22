"""리니지 변경 알림 API 엔드포인트.

스키마 변경으로 인한 리니지 영향 알림을 조회하고 관리하는 API를 제공한다.

엔드포인트 요약:
- GET  /alerts/summary          - 미해결 알림 건수 (벨 배지용)
- GET  /alerts                  - 알림 목록 (필터: status, severity, dataset_id)
- GET  /alerts/{id}             - 알림 상세 조회
- PUT  /alerts/{id}/status      - 알림 상태 변경 (확인/해결/무시)
- POST /alerts/subscriptions    - 구독 등록
- GET  /alerts/subscriptions    - 구독 목록
- DELETE /alerts/subscriptions/{id} - 구독 삭제
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.alert import service
from app.alert.schemas import (
    AlertResponse,
    AlertSummary,
    AlertUpdateStatus,
    PaginatedAlerts,
    SubscriptionCreate,
    SubscriptionResponse,
)
from app.core.database import get_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ---------------------------------------------------------------------------
# 알림 요약 (UI 헤더 벨 배지용)
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=AlertSummary)
async def get_alert_summary(session: AsyncSession = Depends(get_session)):
    """미해결(OPEN) 알림의 심각도별 건수를 반환한다.

    UI 헤더의 알림 벨 아이콘에 배지 숫자를 표시하는 데 사용.
    30초 주기로 polling하여 실시간 알림 건수를 갱신한다.
    """
    return await service.get_alert_summary(session)


# ---------------------------------------------------------------------------
# 알림 CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedAlerts)
async def list_alerts(
    status: str | None = Query(None, description="필터: OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED"),
    severity: str | None = Query(None, description="필터: INFO, WARNING, BREAKING"),
    dataset_id: int | None = Query(None, description="원본 또는 영향 데이터셋 ID로 필터"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """리니지 변경 알림 목록을 조회한다. 상태, 심각도, 데이터셋 ID로 필터 가능."""
    return await service.list_alerts(session, status, severity, dataset_id, page, page_size)


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(alert_id: int, session: AsyncSession = Depends(get_session)):
    """알림 상세 정보를 조회한다. 변경 상세(change_detail) JSON 포함."""
    alert = await service.get_alert(session, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return await service._build_alert_response(session, alert)


@router.put("/{alert_id}/status", response_model=AlertResponse)
async def update_alert_status(
    alert_id: int,
    data: AlertUpdateStatus,
    session: AsyncSession = Depends(get_session),
):
    """알림 상태를 변경한다.

    상태 전이:
    - OPEN → ACKNOWLEDGED: 담당자가 확인
    - OPEN/ACKNOWLEDGED → RESOLVED: 문제 해결 완료
    - OPEN/ACKNOWLEDGED → DISMISSED: 조치 불필요로 판단
    """
    result = await service.update_alert_status(session, alert_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    await session.commit()
    return result


# ---------------------------------------------------------------------------
# 알림 구독 관리
# ---------------------------------------------------------------------------

@router.post("/subscriptions", response_model=SubscriptionResponse, status_code=201)
async def create_subscription(
    data: SubscriptionCreate, session: AsyncSession = Depends(get_session),
):
    """알림 구독을 등록한다.

    scope_type별 동작:
    - DATASET: 특정 데이터셋 변경 시 알림 (scope_id = dataset_id)
    - PIPELINE: 특정 파이프라인 관련 리니지 변경 시 알림
    - PLATFORM: 특정 플랫폼 소속 데이터셋 변경 시 알림
    - ALL: 모든 스키마 변경 알림 수신
    """
    result = await service.create_subscription(session, data)
    await session.commit()
    return result


@router.get("/subscriptions", response_model=list[SubscriptionResponse])
async def list_subscriptions(
    user_id: str | None = Query(None, description="사용자 ID로 필터"),
    session: AsyncSession = Depends(get_session),
):
    """알림 구독 목록을 조회한다."""
    return await service.list_subscriptions(session, user_id)


@router.delete("/subscriptions/{sub_id}", status_code=204)
async def delete_subscription(sub_id: int, session: AsyncSession = Depends(get_session)):
    """알림 구독을 삭제한다."""
    deleted = await service.delete_subscription(session, sub_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Subscription not found")
    await session.commit()
