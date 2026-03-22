"""리니지 변경 알림 서비스 레이어.

스키마 변경 시 리니지 컬럼 매핑과 교차 분석하여 영향도를 판정하고,
알림을 생성하고, 구독자에게 전달하는 핵심 비즈니스 로직을 제공한다.

주요 기능:
- 영향 분석 (Impact Analysis): 변경된 컬럼과 리니지 컬럼 매핑을 대조하여 영향도 판정
- 알림 생성: 영향 분석 결과를 기반으로 LineageAlert 생성
- 알림 전달: 구독자 + 데이터셋 Owner에게 IN_APP/WEBHOOK 알림 발송
- 알림/구독 CRUD: 알림 조회, 상태 변경, 구독 관리

영향 분석 흐름:
  1. 스키마 변경 감지 (save_schema_snapshot에서 호출)
  2. 변경된 데이터셋과 연결된 모든 리니지 관계 조회
  3. 각 리니지의 컬럼 매핑에서 변경된 컬럼이 매핑되어 있는지 확인
  4. 매핑된 컬럼이 삭제(DROP)되면 BREAKING, 타입 변경이면 WARNING, 나머지는 INFO
  5. 알림 생성 후 구독자와 Owner에게 알림 전달
"""

import json as _json
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alert.models import AlertNotification, AlertSubscription, LineageAlert
from app.alert.schemas import (
    AlertResponse,
    AlertSummary,
    AlertUpdateStatus,
    PaginatedAlerts,
    SubscriptionCreate,
    SubscriptionResponse,
)
from app.catalog.models import (
    Dataset,
    DatasetColumnMapping,
    DatasetLineage,
    Owner,
    Platform,
)

logger = logging.getLogger(__name__)

# 심각도 순위 (숫자가 높을수록 심각)
_SEVERITY_RANK = {"INFO": 0, "WARNING": 1, "BREAKING": 2}


# ---------------------------------------------------------------------------
# 영향 분석 (Impact Analysis)
# ---------------------------------------------------------------------------

async def analyze_and_create_alerts(
    session: AsyncSession,
    dataset_id: int,
    changes: list[dict],
) -> list[LineageAlert]:
    """스키마 변경사항을 리니지 컬럼 매핑과 대조하여 영향 분석 후 알림을 생성한다.

    save_schema_snapshot()에서 실제 변경이 감지된 후 호출된다.

    동작 흐름:
    1. 변경된 데이터셋과 연결된 모든 리니지 관계 조회
    2. 각 리니지의 컬럼 매핑에서 변경된 컬럼이 매핑되어 있는지 확인
    3. 매핑된 컬럼이 있으면 영향도를 판정하여 알림 생성
    4. 매핑이 없는 리니지는 DROP/MODIFY가 있을 때만 INFO 알림 생성

    Args:
        dataset_id: 스키마가 변경된 데이터셋의 ID
        changes: detect_schema_changes()의 결과.
                 각 항목: {"type": "ADD|DROP|MODIFY", "field": "컬럼명", ...}

    Returns:
        생성된 LineageAlert 객체 목록
    """
    if not changes:
        return []

    # 변경된 데이터셋과 연결된 모든 리니지 관계 조회 (source 또는 target)
    lineages = (await session.execute(
        select(DatasetLineage).where(
            or_(
                DatasetLineage.source_dataset_id == dataset_id,
                DatasetLineage.target_dataset_id == dataset_id,
            )
        )
    )).scalars().all()

    if not lineages:
        return []

    # 변경된 컬럼을 빠르게 조회하기 위한 맵: 컬럼명 → 변경 정보
    change_map = {c["field"]: c for c in changes}

    created_alerts: list[LineageAlert] = []

    for lineage in lineages:
        # 변경된 쪽과 영향받는 쪽을 결정
        # - source가 변경되면 target이 영향받음 (source_column 기준으로 매핑 확인)
        # - target이 변경되면 source가 영향받음 (target_column 기준으로 매핑 확인)
        if lineage.source_dataset_id == dataset_id:
            affected_id = lineage.target_dataset_id
            mapping_field = "source_column"  # 변경된 쪽의 컬럼명 필드
        else:
            affected_id = lineage.source_dataset_id
            mapping_field = "target_column"

        # 이 리니지에 등록된 컬럼 매핑 조회
        mappings = (await session.execute(
            select(DatasetColumnMapping).where(
                DatasetColumnMapping.dataset_lineage_id == lineage.id
            )
        )).scalars().all()

        if not mappings:
            # 컬럼 매핑이 없는 리니지: DROP/MODIFY가 있으면 INFO 알림만 생성
            has_breaking = any(c["type"] in ("DROP", "MODIFY") for c in changes)
            if has_breaking:
                alert = LineageAlert(
                    alert_type="SCHEMA_CHANGE",
                    severity="INFO",
                    source_dataset_id=dataset_id,
                    affected_dataset_id=affected_id,
                    lineage_id=lineage.id,
                    change_summary=_build_generic_summary(changes),
                    change_detail=_json.dumps(changes, ensure_ascii=False),
                )
                session.add(alert)
                created_alerts.append(alert)
            continue

        # 각 컬럼 매핑과 변경사항을 대조하여 영향 항목 수집
        impact_items = []
        for mapping in mappings:
            # 변경된 쪽의 매핑 컬럼명을 가져옴
            mapped_col = getattr(mapping, mapping_field)
            if mapped_col in change_map:
                change = change_map[mapped_col]
                # 반대쪽(영향받는 쪽)의 컬럼명
                other_col = (
                    mapping.target_column
                    if mapping_field == "source_column"
                    else mapping.source_column
                )
                severity = _determine_severity(change)
                impact_items.append({
                    "changed_column": mapped_col,    # 변경된 컬럼
                    "mapped_to": other_col,          # 매핑된 대상 컬럼
                    "change_type": change["type"],   # ADD, DROP, MODIFY
                    "severity": severity,            # 판정된 심각도
                    "before": change.get("before"),  # 변경 전 상태
                    "after": change.get("after"),    # 변경 후 상태
                })

        if not impact_items:
            continue

        # 영향 항목 중 가장 높은 심각도를 전체 알림의 심각도로 사용
        max_severity = max(impact_items, key=lambda x: _SEVERITY_RANK.get(x["severity"], 0))
        overall_severity = max_severity["severity"]

        summary = _build_impact_summary(impact_items)
        alert = LineageAlert(
            alert_type="SCHEMA_CHANGE",
            severity=overall_severity,
            source_dataset_id=dataset_id,
            affected_dataset_id=affected_id,
            lineage_id=lineage.id,
            change_summary=summary,
            change_detail=_json.dumps(impact_items, ensure_ascii=False),
        )
        session.add(alert)
        created_alerts.append(alert)

    if created_alerts:
        await session.flush()

        # 생성된 각 알림에 대해 구독자와 Owner에게 알림 전달
        for alert in created_alerts:
            await _dispatch_notifications(session, alert)

    return created_alerts


def _determine_severity(change: dict) -> str:
    """단일 스키마 변경에 대한 심각도를 판정한다.

    판정 기준:
    - DROP (컬럼 삭제) → BREAKING: 매핑된 컬럼이 사라져 파이프라인 깨짐
    - MODIFY + 타입 변경 → WARNING: 데이터 타입 불일치 가능성
    - MODIFY + 기타 속성 → INFO: 호환 가능한 변경
    - ADD (컬럼 추가) → INFO: 기존 매핑에 영향 없음
    """
    if change["type"] == "DROP":
        return "BREAKING"
    if change["type"] == "MODIFY":
        before = change.get("before") or {}
        after = change.get("after") or {}
        # field_type 또는 native_type이 변경되면 WARNING
        if "field_type" in before or "field_type" in after:
            return "WARNING"
        if "native_type" in before or "native_type" in after:
            return "WARNING"
        return "INFO"
    return "INFO"


def _build_impact_summary(items: list[dict]) -> str:
    """영향 항목들로부터 사람이 읽을 수 있는 요약 문자열을 생성한다."""
    parts = []
    for item in items[:3]:  # 요약에는 최대 3개까지만 표시
        if item["change_type"] == "DROP":
            parts.append(f"'{item['changed_column']}' dropped (mapped to {item['mapped_to']})")
        elif item["change_type"] == "MODIFY":
            parts.append(f"'{item['changed_column']}' modified (mapped to {item['mapped_to']})")
        else:
            parts.append(f"'{item['changed_column']}' added")
    summary = "; ".join(parts)
    if len(items) > 3:
        summary += f" (+{len(items) - 3} more)"
    return summary


def _build_generic_summary(changes: list[dict]) -> str:
    """컬럼 매핑이 없는 리니지에 대한 일반적인 변경 요약을 생성한다."""
    added = sum(1 for c in changes if c["type"] == "ADD")
    dropped = sum(1 for c in changes if c["type"] == "DROP")
    modified = sum(1 for c in changes if c["type"] == "MODIFY")
    parts = []
    if dropped:
        parts.append(f"{dropped} column(s) dropped")
    if modified:
        parts.append(f"{modified} column(s) modified")
    if added:
        parts.append(f"{added} column(s) added")
    return "Schema changed: " + ", ".join(parts)


# ---------------------------------------------------------------------------
# 알림 전달 (Notification Dispatch)
# ---------------------------------------------------------------------------

async def _dispatch_notifications(session: AsyncSession, alert: LineageAlert) -> None:
    """구독자와 데이터셋 Owner에게 알림을 전달한다.

    전달 대상 결정 순서:
    1. argus_alert_subscription에서 활성 구독자 조회
    2. 각 구독자의 scope/severity 필터를 적용하여 대상 여부 판정
    3. 구독자의 channels 설정에 따라 IN_APP/WEBHOOK/EMAIL 전달
    4. 원본/영향 데이터셋의 Owner에게도 IN_APP 알림 전달
    """
    # 모든 활성 구독 조회
    subs = (await session.execute(
        select(AlertSubscription).where(
            AlertSubscription.is_active == "true",
        )
    )).scalars().all()

    for sub in subs:
        # 심각도 필터 확인: 알림 심각도가 구독자의 최소 수신 심각도보다 낮으면 건너뜀
        if _SEVERITY_RANK.get(alert.severity, 0) < _SEVERITY_RANK.get(sub.severity_filter, 0):
            continue

        # 범위(scope) 필터 확인
        if sub.scope_type == "DATASET":
            # 특정 데이터셋 구독: 원본 또는 영향 데이터셋이 일치해야 함
            if sub.scope_id not in (alert.source_dataset_id, alert.affected_dataset_id):
                continue
        elif sub.scope_type == "PIPELINE":
            # 특정 파이프라인 구독: 리니지의 pipeline_id가 일치해야 함
            if alert.lineage_id:
                lineage = (await session.execute(
                    select(DatasetLineage.pipeline_id).where(
                        DatasetLineage.id == alert.lineage_id
                    )
                )).scalar_one_or_none()
                if lineage != sub.scope_id:
                    continue
            else:
                continue
        elif sub.scope_type == "PLATFORM":
            # 특정 플랫폼 구독: 원본 데이터셋의 platform_id가 일치해야 함
            ds = (await session.execute(
                select(Dataset.platform_id).where(Dataset.id == alert.source_dataset_id)
            )).scalar_one_or_none()
            if ds != sub.scope_id:
                continue
        # scope_type == "ALL": 모든 알림 수신 (필터 없음)

        # 구독자의 채널 설정에 따라 알림 전달 기록 생성
        channels = [ch.strip() for ch in sub.channels.split(",")]
        for channel in channels:
            notification = AlertNotification(
                alert_id=alert.id,
                channel=channel,
                recipient=sub.user_id,
            )
            session.add(notification)

            # WEBHOOK 채널이면 즉시 외부 전송
            if channel == "WEBHOOK":
                await _send_webhook(session, alert, sub.user_id)

    # 데이터셋 Owner에게도 IN_APP 알림 전달 (구독 없이도 자동)
    owner_names = set()
    for ds_id in (alert.source_dataset_id, alert.affected_dataset_id):
        if ds_id:
            owners = (await session.execute(
                select(Owner.owner_name).where(Owner.dataset_id == ds_id)
            )).scalars().all()
            owner_names.update(owners)

    for owner in owner_names:
        notification = AlertNotification(
            alert_id=alert.id,
            channel="IN_APP",
            recipient=owner,
        )
        session.add(notification)

    await session.flush()


async def _send_webhook(session: AsyncSession, alert: LineageAlert, webhook_url: str) -> None:
    """알림 payload를 외부 webhook URL로 전송한다.

    Slack, Teams 등 외부 메신저 연동에 사용.
    타임아웃 10초, 실패 시 로그만 기록하고 예외를 전파하지 않음.
    """
    # 원본/영향 데이터셋의 이름과 플랫폼 정보 조회
    src_name = ""
    src_platform = ""
    if alert.source_dataset_id:
        row = (await session.execute(
            select(Dataset.name, Platform.type)
            .join(Platform, Dataset.platform_id == Platform.id)
            .where(Dataset.id == alert.source_dataset_id)
        )).first()
        if row:
            src_name, src_platform = row

    aff_name = ""
    aff_platform = ""
    if alert.affected_dataset_id:
        row = (await session.execute(
            select(Dataset.name, Platform.type)
            .join(Platform, Dataset.platform_id == Platform.id)
            .where(Dataset.id == alert.affected_dataset_id)
        )).first()
        if row:
            aff_name, aff_platform = row

    # Webhook payload 구성
    payload = {
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "source": {"dataset": src_name, "platform": src_platform},
        "affected": {"dataset": aff_name, "platform": aff_platform},
        "change_summary": alert.change_summary,
        "changes": _json.loads(alert.change_detail) if alert.change_detail else [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook_url, json=payload)
            logger.info("Webhook 전송 완료: %s (HTTP %d)", webhook_url, resp.status_code)
    except Exception as e:
        logger.warning("Webhook 전송 실패: %s - %s", webhook_url, e)


# ---------------------------------------------------------------------------
# 알림 CRUD
# ---------------------------------------------------------------------------

async def list_alerts(
    session: AsyncSession,
    status: str | None = None,
    severity: str | None = None,
    dataset_id: int | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedAlerts:
    """알림 목록을 페이지네이션하여 조회한다. status, severity, dataset_id로 필터 가능."""
    base = select(LineageAlert)
    count_base = select(func.count(LineageAlert.id))

    if status:
        base = base.where(LineageAlert.status == status)
        count_base = count_base.where(LineageAlert.status == status)
    if severity:
        base = base.where(LineageAlert.severity == severity)
        count_base = count_base.where(LineageAlert.severity == severity)
    if dataset_id:
        # 원본 또는 영향 데이터셋 중 하나라도 일치하면 포함
        base = base.where(
            or_(
                LineageAlert.source_dataset_id == dataset_id,
                LineageAlert.affected_dataset_id == dataset_id,
            )
        )
        count_base = count_base.where(
            or_(
                LineageAlert.source_dataset_id == dataset_id,
                LineageAlert.affected_dataset_id == dataset_id,
            )
        )

    total = (await session.execute(count_base)).scalar() or 0

    offset = (page - 1) * page_size
    alerts = (await session.execute(
        base.order_by(LineageAlert.created_at.desc()).offset(offset).limit(page_size)
    )).scalars().all()

    items = [await _build_alert_response(session, a) for a in alerts]
    return PaginatedAlerts(items=items, total=total, page=page, page_size=page_size)


async def get_alert(session: AsyncSession, alert_id: int) -> LineageAlert | None:
    """ID로 단일 알림을 조회한다."""
    result = await session.execute(
        select(LineageAlert).where(LineageAlert.id == alert_id)
    )
    return result.scalar_one_or_none()


async def update_alert_status(
    session: AsyncSession, alert_id: int, data: AlertUpdateStatus,
) -> AlertResponse | None:
    """알림 상태를 변경한다. RESOLVED/DISMISSED 시 해결자와 시각을 기록."""
    alert = await get_alert(session, alert_id)
    if not alert:
        return None
    alert.status = data.status.value
    if data.status.value in ("RESOLVED", "DISMISSED"):
        alert.resolved_by = data.resolved_by
        alert.resolved_at = datetime.now(timezone.utc)
    await session.flush()
    await session.refresh(alert)
    return await _build_alert_response(session, alert)


async def get_alert_summary(session: AsyncSession) -> AlertSummary:
    """미해결(OPEN) 알림의 심각도별 건수를 집계한다. UI 벨 배지용."""
    rows = (await session.execute(
        select(LineageAlert.severity, func.count(LineageAlert.id))
        .where(LineageAlert.status == "OPEN")
        .group_by(LineageAlert.severity)
    )).all()

    summary = AlertSummary()
    for severity, count in rows:
        summary.total_open += count
        if severity == "BREAKING":
            summary.breaking_count = count
        elif severity == "WARNING":
            summary.warning_count = count
        elif severity == "INFO":
            summary.info_count = count
    return summary


async def _build_alert_response(session: AsyncSession, alert: LineageAlert) -> AlertResponse:
    """LineageAlert ORM 객체를 AlertResponse로 변환한다.

    원본/영향 데이터셋의 이름과 플랫폼 정보를 JOIN하여 포함.
    """
    src_name = None
    src_platform = None
    if alert.source_dataset_id:
        row = (await session.execute(
            select(Dataset.name, Platform.type)
            .join(Platform, Dataset.platform_id == Platform.id)
            .where(Dataset.id == alert.source_dataset_id)
        )).first()
        if row:
            src_name, src_platform = row

    aff_name = None
    aff_platform = None
    if alert.affected_dataset_id:
        row = (await session.execute(
            select(Dataset.name, Platform.type)
            .join(Platform, Dataset.platform_id == Platform.id)
            .where(Dataset.id == alert.affected_dataset_id)
        )).first()
        if row:
            aff_name, aff_platform = row

    return AlertResponse(
        id=alert.id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        source_dataset_id=alert.source_dataset_id,
        source_dataset_name=src_name,
        source_platform_type=src_platform,
        affected_dataset_id=alert.affected_dataset_id,
        affected_dataset_name=aff_name,
        affected_platform_type=aff_platform,
        lineage_id=alert.lineage_id,
        change_summary=alert.change_summary,
        change_detail=alert.change_detail,
        status=alert.status,
        resolved_by=alert.resolved_by,
        resolved_at=alert.resolved_at,
        created_at=alert.created_at,
    )


# ---------------------------------------------------------------------------
# 구독 CRUD
# ---------------------------------------------------------------------------

async def create_subscription(
    session: AsyncSession, data: SubscriptionCreate,
) -> SubscriptionResponse:
    """알림 구독을 생성한다."""
    sub = AlertSubscription(
        user_id=data.user_id,
        scope_type=data.scope_type.value,
        scope_id=data.scope_id,
        channels=data.channels,
        severity_filter=data.severity_filter.value,
    )
    session.add(sub)
    await session.flush()
    await session.refresh(sub)
    return SubscriptionResponse.model_validate(sub)


async def list_subscriptions(
    session: AsyncSession, user_id: str | None = None,
) -> list[SubscriptionResponse]:
    """구독 목록을 조회한다. user_id로 필터 가능."""
    stmt = select(AlertSubscription)
    if user_id:
        stmt = stmt.where(AlertSubscription.user_id == user_id)
    stmt = stmt.order_by(AlertSubscription.created_at.desc())
    result = await session.execute(stmt)
    return [SubscriptionResponse.model_validate(s) for s in result.scalars().all()]


async def delete_subscription(session: AsyncSession, sub_id: int) -> bool:
    """구독을 삭제한다."""
    sub = (await session.execute(
        select(AlertSubscription).where(AlertSubscription.id == sub_id)
    )).scalar_one_or_none()
    if not sub:
        return False
    await session.delete(sub)
    await session.flush()
    return True
