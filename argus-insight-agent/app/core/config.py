"""Application configuration.

Configuration is loaded from two files in the config directory:

1. config.properties - Java-style key=value variable definitions
2. config.yml - Main YAML config that references properties via ${variable}

Default config directory: /etc/argus-insight-agent
Override with ARGUS_CONFIG_DIR environment variable.
"""

import os
from pathlib import Path

from app.core.config_loader import load_config


_CONFIG_DIR = Path(os.environ.get("ARGUS_CONFIG_DIR", "/etc/argus-insight-agent"))
_raw = load_config(config_dir=_CONFIG_DIR)


def _get(section: str, key: str, default=None):
    """Get a value from the loaded config dict."""
    return _raw.get(section, {}).get(key, default)


class Settings:
    """Global application settings loaded from config.yml + config.properties."""

    def __init__(self) -> None:
        # App
        self.app_name: str = _get("app", "name", "argus-insight-agent")
        self.app_version: str = _get("app", "version", "0.1.0")
        self.debug: bool = _get("app", "debug", False)

        # Server
        self.host: str = _get("server", "host", "0.0.0.0")
        self.port: int = int(_get("server", "port", 8600))

        # Logging
        self.log_level: str = _get("logging", "level", "INFO")
        self.log_dir: Path = Path(_get("logging", "dir", "/var/log/argus-insight-agent"))

        # Data
        self.data_dir: Path = Path(_get("data", "dir", "/var/lib/argus-insight-agent"))

        # Config
        self.config_dir: Path = _CONFIG_DIR

        # Command execution
        self.command_timeout: int = int(_get("command", "timeout", 300))
        self.command_max_output: int = int(_get("command", "max_output", 1024 * 1024))

        # Monitor
        self.monitor_interval: int = int(_get("monitor", "interval", 5))

        # Terminal
        self.terminal_shell: str = _get(
            "terminal", "shell", os.environ.get("SHELL", "/bin/bash")
        )
        self.terminal_max_sessions: int = int(_get("terminal", "max_sessions", 10))


settings = Settings()
