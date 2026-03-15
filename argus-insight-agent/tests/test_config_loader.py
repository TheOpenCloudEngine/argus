"""Tests for config loader."""

import pytest
from pathlib import Path

from app.core.config_loader import load_properties, load_config


@pytest.fixture
def config_dir(tmp_path):
    """Create a temp config directory with sample files."""
    props_content = """# Comment line
server.host=127.0.0.1
server.port=9090
log.level=DEBUG
"""
    yml_content = """server:
  host: ${server.host}
  port: ${server.port}
logging:
  level: ${log.level}
app:
  name: test-agent
"""
    (tmp_path / "config.properties").write_text(props_content)
    (tmp_path / "config.yml").write_text(yml_content)
    return tmp_path


def test_load_properties(config_dir):
    """Test Java-style properties file parsing."""
    props = load_properties(config_dir / "config.properties")
    assert props["server.host"] == "127.0.0.1"
    assert props["server.port"] == "9090"
    assert props["log.level"] == "DEBUG"


def test_load_properties_missing_file(tmp_path):
    """Test that missing properties file returns empty dict."""
    props = load_properties(tmp_path / "nonexistent.properties")
    assert props == {}


def test_load_config_resolves_variables(config_dir):
    """Test that ${var} in YAML is resolved from properties."""
    config = load_config(config_dir=config_dir)
    assert config["server"]["host"] == "127.0.0.1"
    assert config["server"]["port"] == "9090"
    assert config["logging"]["level"] == "DEBUG"
    assert config["app"]["name"] == "test-agent"


def test_load_config_missing_dir(tmp_path):
    """Test that missing config dir returns empty dict."""
    config = load_config(config_dir=tmp_path / "nonexistent")
    assert config == {}


def test_unresolved_variable(tmp_path):
    """Test that unresolved variables are left as-is."""
    (tmp_path / "config.properties").write_text("")
    (tmp_path / "config.yml").write_text("key: ${undefined.var}\n")
    config = load_config(config_dir=tmp_path)
    assert config["key"] == "${undefined.var}"
