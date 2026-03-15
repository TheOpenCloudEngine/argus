# Agent Heartbeat 시스템 설계

## 개요

Agent가 시작되면 config.yml 디렉토리의 `server.properties`를 읽어 Server 접속 정보를 얻고,
1분마다 Server의 `/api/v1/agent/heartbeat`로 자신의 상태를 전송한다.
Server는 수신한 정보를 DB에 저장하고, 3분간 heartbeat가 없는 Agent는 DISCONNECTED로 처리한다.

---

## 1. 테이블 스키마

### 1-1. `argus_agents` 테이블

Agent 마스터 정보. hostname이 PK.

```sql
CREATE TABLE argus_agents (
    hostname        VARCHAR(255)    PRIMARY KEY,
    ip_address      VARCHAR(45)     NOT NULL,
    version         VARCHAR(50),
    kernel_version  VARCHAR(255),
    os_version      VARCHAR(255),
    cpu_usage       FLOAT,
    memory_usage    FLOAT,
    status          VARCHAR(20)     NOT NULL DEFAULT 'UNREGISTERED',
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| hostname | VARCHAR(255) PK | Agent 호스트명 (unique identifier) |
| ip_address | VARCHAR(45) | Agent IP 주소 (IPv4/IPv6) |
| version | VARCHAR(50) | Agent 버전 (예: 0.1.0) |
| kernel_version | VARCHAR(255) | 커널 버전 (예: 6.18.5-arch1-1) |
| os_version | VARCHAR(255) | OS 버전 (예: Rocky Linux 9.3) |
| cpu_usage | FLOAT | CPU 전체 사용률 (0.0 ~ 100.0) |
| memory_usage | FLOAT | 메모리 전체 사용률 (0.0 ~ 100.0) |
| status | VARCHAR(20) | UNREGISTERED / REGISTERED / DISCONNECTED |
| created_at | TIMESTAMP | 최초 등록 시각 |
| updated_at | TIMESTAMP | 마지막 갱신 시각 |

### 1-2. `argus_agents_heartbeat` 테이블

Agent별 마지막 heartbeat 타임스탬프 추적.

```sql
CREATE TABLE argus_agents_heartbeat (
    hostname            VARCHAR(255)    PRIMARY KEY,
    last_heartbeat_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| hostname | VARCHAR(255) PK | Agent 호스트명 (argus_agents.hostname 참조) |
| last_heartbeat_at | TIMESTAMP | 마지막 heartbeat 수신 시각 |

---

## 2. Agent 측 변경사항

### 2-1. `server.properties` 로딩

- Agent 시작 시 `config.yml`이 위치한 디렉토리에서 `server.properties` 파일을 로딩
- Java properties 형식 (`key=value`)
- 기존 `config_loader.py`의 `load_properties()` 함수를 재사용

```properties
# server.properties
server.ip=localhost
server.port=8080
```

**변경 파일**: `argus-insight-agent/app/core/config.py`
- Settings 클래스에 `insight_server_ip`, `insight_server_port` 속성 추가
- config 디렉토리에서 `server.properties`를 별도 로딩

### 2-2. 시스템 정보 수집 (전역 변수)

Kernel/OS 버전은 시작 시 1회만 수집하여 전역 변수에 캐싱.

**새 파일**: `argus-insight-agent/app/heartbeat/system_info.py`

```python
import platform
import socket
import psutil

# 시작 시 1회 수집하여 캐싱 (변하지 않는 정보)
_kernel_version: str = platform.release()       # 예: "6.18.5-arch1-1"
_os_version: str = ""                           # 예: "Rocky Linux 9.3"
_hostname: str = socket.gethostname()

def _detect_os_version() -> str:
    """Read /etc/os-release or fall back to platform.platform()."""
    try:
        with open("/etc/os-release") as f:
            info = {}
            for line in f:
                if "=" in line:
                    k, v = line.strip().split("=", 1)
                    info[k] = v.strip('"')
            return info.get("PRETTY_NAME", platform.platform())
    except FileNotFoundError:
        return platform.platform()

# 모듈 로드 시 초기화
_os_version = _detect_os_version()

def get_static_info() -> dict:
    return {
        "hostname": _hostname,
        "kernel_version": _kernel_version,
        "os_version": _os_version,
    }

def get_dynamic_info() -> dict:
    """매 heartbeat마다 수집하는 동적 정보."""
    import psutil
    net = psutil.net_if_addrs()
    # 첫 번째 non-loopback IPv4 주소
    ip = "127.0.0.1"
    for iface, addrs in net.items():
        if iface == "lo":
            continue
        for addr in addrs:
            if addr.family.name == "AF_INET":
                ip = addr.address
                break
    return {
        "ip_address": ip,
        "cpu_usage": psutil.cpu_percent(interval=0),
        "memory_usage": psutil.virtual_memory().percent,
    }
```

### 2-3. Heartbeat Scheduler

기존 `MetricsScheduler` 패턴을 따르되, 60초 간격으로 단순 반복.

**새 파일**: `argus-insight-agent/app/heartbeat/scheduler.py`

```python
class HeartbeatScheduler:
    """60초 간격으로 Server에 heartbeat POST 전송."""

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    async def _run(self):
        while self._running:
            try:
                await self._send_heartbeat()
            except Exception as e:
                logger.warning(
                    "Argus Insight Server 연결 실패. "
                    "server.properties 파일의 server.ip=%s, server.port=%s 설정을 확인하세요.",
                    settings.insight_server_ip, settings.insight_server_port
                )
            await asyncio.sleep(60)

    async def _send_heartbeat(self):
        url = f"http://{settings.insight_server_ip}:{settings.insight_server_port}/api/v1/agent/heartbeat"
        payload = {
            **get_static_info(),
            **get_dynamic_info(),
            "version": settings.app_version,
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()

heartbeat_scheduler = HeartbeatScheduler()
```

### 2-4. Agent main.py 수정

lifespan에서 heartbeat_scheduler를 start/stop.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    _print_banner()
    await metrics_scheduler.start()
    await heartbeat_scheduler.start()    # 추가
    yield
    await heartbeat_scheduler.stop()     # 추가
    await metrics_scheduler.stop()
    terminal_manager.close_all()
```

### 2-5. Agent config 변경

**`packaging/config/config.yml`** - insight-server 섹션은 없음 (별도 server.properties 사용)

**`packaging/config/server.properties`** (신규)
```properties
# Argus Insight Server connection
server.ip=localhost
server.port=8080
```

---

## 3. Server 측 변경사항

### 3-1. SQLAlchemy ORM 모델

**새 파일**: `argus-insight-server/app/agent/models.py`

```python
from sqlalchemy import Column, String, Float, DateTime, func
from app.core.database import Base

class ArgusAgent(Base):
    __tablename__ = "argus_agents"

    hostname = Column(String(255), primary_key=True)
    ip_address = Column(String(45), nullable=False)
    version = Column(String(50))
    kernel_version = Column(String(255))
    os_version = Column(String(255))
    cpu_usage = Column(Float)
    memory_usage = Column(Float)
    status = Column(String(20), nullable=False, default="UNREGISTERED")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

class ArgusAgentHeartbeat(Base):
    __tablename__ = "argus_agents_heartbeat"

    hostname = Column(String(255), primary_key=True)
    last_heartbeat_at = Column(DateTime, server_default=func.now())
```

### 3-2. Agent Status Enum 변경

**수정 파일**: `argus-insight-server/app/agent/schemas.py`

기존 AgentStatus를 확장하여 heartbeat 상태를 포함:

```python
class AgentStatus(str, Enum):
    UNREGISTERED = "UNREGISTERED"   # 최초 heartbeat 수신, 아직 등록 미승인
    REGISTERED = "REGISTERED"       # 관리자가 승인한 에이전트
    DISCONNECTED = "DISCONNECTED"   # 3분간 heartbeat 없음

class HeartbeatRequest(BaseModel):
    hostname: str
    ip_address: str
    version: str | None = None
    kernel_version: str | None = None
    os_version: str | None = None
    cpu_usage: float | None = None
    memory_usage: float | None = None
```

### 3-3. Heartbeat API 엔드포인트

**수정 파일**: `argus-insight-server/app/agent/router.py`

```python
@router.post("/agent/heartbeat")
async def agent_heartbeat(req: HeartbeatRequest, session: AsyncSession = Depends(get_session)):
    """Agent heartbeat 수신. 없으면 UNREGISTERED로 INSERT, 있으면 UPDATE."""
    await heartbeat_service.process_heartbeat(session, req)
    return {"status": "ok"}
```

### 3-4. Heartbeat Service

**새 파일**: `argus-insight-server/app/agent/heartbeat_service.py`

```python
async def process_heartbeat(session: AsyncSession, req: HeartbeatRequest):
    """
    1. argus_agents 테이블: hostname으로 조회
       - 없으면: UNREGISTERED로 INSERT
       - 있으면: cpu_usage, memory_usage, ip_address 등 UPDATE (status는 변경하지 않음)
    2. argus_agents_heartbeat 테이블: UPSERT (hostname, last_heartbeat_at=now())
    """
```

### 3-5. Disconnect Checker (Background Scheduler)

**새 파일**: `argus-insight-server/app/agent/disconnect_checker.py`

1분 주기로 `argus_agents_heartbeat` 테이블을 조회하여 `last_heartbeat_at`이 현재 시간 - 3분 이전인 Agent의 status를 `DISCONNECTED`로 변경.

```python
class DisconnectChecker:
    """1분 주기로 heartbeat 타임아웃 에이전트를 DISCONNECTED 처리."""

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def _run(self):
        while self._running:
            try:
                async with async_session() as session:
                    await self._check_disconnected(session)
            except Exception:
                logger.exception("Disconnect checker error")
            await asyncio.sleep(60)

    async def _check_disconnected(self, session):
        threshold = datetime.utcnow() - timedelta(minutes=3)
        # argus_agents_heartbeat에서 last_heartbeat_at < threshold 인 hostname 조회
        # argus_agents 테이블의 status를 DISCONNECTED로 변경
        # 단, 이미 DISCONNECTED인 것은 제외

disconnect_checker = DisconnectChecker()
```

### 3-6. Server main.py 수정

lifespan에서 disconnect_checker 시작/종료 + DB 테이블 자동 생성:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    _print_banner()
    await init_database()
    # 테이블 자동 생성 (개발 편의용)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await disconnect_checker.start()      # 추가
    yield
    await disconnect_checker.stop()       # 추가
    await close_database()
```

### 3-7. Server init_database 수정

`database.py`의 `init_database()`에서 테이블 자동 생성을 추가하거나, main.py lifespan에서 처리.

---

## 4. 전체 데이터 흐름

```
[Agent 시작]
  ├─ server.properties 로딩 (server.ip, server.port)
  ├─ Kernel/OS 버전 수집 → 전역 변수 캐싱
  └─ HeartbeatScheduler 시작 (60초 간격)
       │
       ▼  POST /api/v1/agent/heartbeat
[Server]
  ├─ argus_agents 테이블: hostname으로 SELECT
  │   ├─ 없음 → INSERT (status=UNREGISTERED)
  │   └─ 있음 → UPDATE (cpu_usage, memory_usage, ip_address, version, updated_at)
  ├─ argus_agents_heartbeat 테이블: UPSERT (last_heartbeat_at=now())
  └─ 200 OK 반환

[Server DisconnectChecker] (60초 간격)
  ├─ argus_agents_heartbeat에서 last_heartbeat_at < (now - 3분) 인 hostname 조회
  └─ argus_agents.status → DISCONNECTED 로 변경
```

---

## 5. 변경 파일 목록

### Agent (argus-insight-agent)

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `app/core/config.py` | 수정 | insight_server_ip, insight_server_port 추가 |
| `app/heartbeat/__init__.py` | 신규 | 모듈 초기화 |
| `app/heartbeat/system_info.py` | 신규 | 정적/동적 시스템 정보 수집 |
| `app/heartbeat/scheduler.py` | 신규 | HeartbeatScheduler (60초 주기) |
| `app/main.py` | 수정 | lifespan에서 heartbeat_scheduler start/stop |
| `packaging/config/server.properties` | 신규 | server.ip, server.port |

### Server (argus-insight-server)

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `app/agent/models.py` | 신규 | ArgusAgent, ArgusAgentHeartbeat ORM 모델 |
| `app/agent/schemas.py` | 수정 | AgentStatus enum 변경, HeartbeatRequest 추가 |
| `app/agent/router.py` | 수정 | POST /agent/heartbeat 엔드포인트 추가 |
| `app/agent/heartbeat_service.py` | 신규 | Heartbeat 처리 (UPSERT) |
| `app/agent/disconnect_checker.py` | 신규 | 3분 타임아웃 DISCONNECTED 처리 |
| `app/main.py` | 수정 | lifespan에서 disconnect_checker, 테이블 생성 |
| `app/core/database.py` | 수정 (선택) | create_all 호출 추가 |
