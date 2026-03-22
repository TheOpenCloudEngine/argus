"""리니지 변경 알림 ORM 모델.

스키마 변경 시 영향받는 리니지 관계를 감지하고 알림을 발행하기 위한
데이터 모델을 정의한다.

주요 테이블:
- argus_alert_subscription: 사용자별 알림 구독 설정
- argus_lineage_alert: 스키마 변경 영향 분석 결과 알림
- argus_alert_notification: 알림 전달 기록 (IN_APP, WEBHOOK, EMAIL)
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from app.core.database import Base


class AlertSubscription(Base):
    """알림 구독 설정.

    사용자가 특정 범위(데이터셋, 파이프라인, 플랫폼, 전체)의
    스키마 변경 알림을 받기 위한 구독 정보를 저장한다.

    scope_type별 동작:
    - DATASET: 특정 데이터셋의 변경만 수신 (scope_id = dataset_id)
    - PIPELINE: 특정 파이프라인에 연결된 리니지 변경만 수신
    - PLATFORM: 특정 플랫폼에 속한 데이터셋 변경만 수신
    - ALL: 모든 변경 수신
    """

    __tablename__ = "argus_alert_subscription"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(200), nullable=False)           # 구독자 식별자 (username 또는 email)
    scope_type = Column(String(32), nullable=False)         # 구독 범위: DATASET, PIPELINE, PLATFORM, ALL
    scope_id = Column(Integer)                              # scope_type에 따른 대상 ID (ALL이면 NULL)
    channels = Column(String(200), nullable=False, default="IN_APP")  # 알림 채널 (콤마 구분: IN_APP,WEBHOOK,EMAIL)
    severity_filter = Column(String(16), nullable=False, default="WARNING")  # 최소 수신 심각도 (INFO 이상, WARNING 이상 등)
    is_active = Column(String(5), nullable=False, default="true")    # 활성화 여부
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LineageAlert(Base):
    """리니지 변경 알림.

    스키마 변경이 리니지 관계에 영향을 미칠 때 생성되는 알림 이벤트.
    영향 분석 결과(severity)와 변경 상세 내역을 포함한다.

    생명주기: OPEN → ACKNOWLEDGED → RESOLVED / DISMISSED

    severity 판정 기준:
    - BREAKING: 매핑된 컬럼이 삭제됨 (downstream 파이프라인 깨짐)
    - WARNING: 매핑된 컬럼의 타입이 변경됨 (타입 불일치 가능)
    - INFO: 매핑되지 않은 컬럼 변경 또는 컬럼 추가
    """

    __tablename__ = "argus_lineage_alert"

    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_type = Column(String(32), nullable=False)         # 알림 유형: SCHEMA_CHANGE, LINEAGE_BROKEN, SYNC_FAILED
    severity = Column(String(16), nullable=False)           # 심각도: INFO, WARNING, BREAKING
    source_dataset_id = Column(                             # 변경이 발생한 원본 데이터셋
        Integer, ForeignKey("catalog_datasets.id", ondelete="CASCADE"), nullable=False
    )
    affected_dataset_id = Column(                           # 영향받는 대상 데이터셋 (downstream)
        Integer, ForeignKey("catalog_datasets.id", ondelete="CASCADE")
    )
    lineage_id = Column(                                    # 영향받는 리니지 관계 참조
        Integer, ForeignKey("argus_dataset_lineage.id", ondelete="SET NULL")
    )
    change_summary = Column(String(500), nullable=False)    # 변경 요약 (예: "'salary' dropped (mapped to salary_amt)")
    change_detail = Column(Text)                            # 변경 상세 JSON (영향 분석 결과 배열)
    status = Column(String(20), nullable=False, default="OPEN")  # 상태: OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED
    resolved_by = Column(String(200))                       # 해결한 사용자
    resolved_at = Column(DateTime(timezone=True))           # 해결 시각
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AlertNotification(Base):
    """알림 전달 기록.

    하나의 LineageAlert에 대해 여러 수신자에게 다양한 채널로
    전달된 기록을 저장한다. 전달 성공/실패 추적에 사용.
    """

    __tablename__ = "argus_alert_notification"

    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_id = Column(                                      # 원본 알림 참조
        Integer, ForeignKey("argus_lineage_alert.id", ondelete="CASCADE"), nullable=False
    )
    channel = Column(String(32), nullable=False)            # 전달 채널: IN_APP, WEBHOOK, EMAIL
    recipient = Column(String(200), nullable=False)         # 수신자 (user_id 또는 webhook URL)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20), nullable=False, default="SENT")  # 전달 상태: SENT, FAILED, READ
