"""Tests for certmgr service - CA upload, host certificate generation."""

from unittest.mock import AsyncMock, patch

import pytest

from app.certmgr import service
from app.certmgr.schemas import HostCertRequest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def ca_dir(tmp_path):
    """Temporary CA directory."""
    d = tmp_path / "ca"
    d.mkdir()
    return d


@pytest.fixture
def cert_dir(tmp_path):
    """Temporary certificates directory."""
    d = tmp_path / "certificates"
    d.mkdir()
    return d


@pytest.fixture(autouse=True)
def _patch_dirs(ca_dir, cert_dir):
    """Patch CA_DIR and CERT_DIR to use temp directories."""
    with (
        patch.object(service, "CA_DIR", ca_dir),
        patch.object(service, "CERT_DIR", cert_dir),
    ):
        yield


SAMPLE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIItest\n-----END RSA PRIVATE KEY-----\n"
SAMPLE_CRT = "-----BEGIN CERTIFICATE-----\nMIItest\n-----END CERTIFICATE-----\n"


# ---------------------------------------------------------------------------
# CA upload tests
# ---------------------------------------------------------------------------


async def test_upload_ca_success(ca_dir):
    with patch.object(service, "_run", new_callable=AsyncMock) as mock_run:
        # First call: openssl x509 validate
        # Second call: key modulus md5
        # Third call: cert modulus md5
        mock_run.side_effect = [
            (0, "Certificate: ...", ""),
            (0, "md5hash123", ""),
            (0, "md5hash123", ""),
        ]
        result = await service.upload_ca(SAMPLE_KEY, SAMPLE_CRT)

    assert result.success is True
    assert (ca_dir / "ca.key").is_file()
    assert (ca_dir / "ca.crt").is_file()


async def test_upload_ca_invalid_cert(ca_dir):
    with patch.object(service, "_run", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = (1, "", "unable to load certificate")
        result = await service.upload_ca(SAMPLE_KEY, "bad cert")

    assert result.success is False
    assert "invalid" in result.message.lower()


async def test_upload_ca_key_mismatch(ca_dir):
    with patch.object(service, "_run", new_callable=AsyncMock) as mock_run:
        mock_run.side_effect = [
            (0, "Certificate: ...", ""),
            (0, "md5_key", ""),
            (0, "md5_crt_different", ""),
        ]
        result = await service.upload_ca(SAMPLE_KEY, SAMPLE_CRT)

    assert result.success is False
    assert "match" in result.message.lower()


# ---------------------------------------------------------------------------
# CA info tests
# ---------------------------------------------------------------------------


async def test_get_ca_info_exists(ca_dir):
    (ca_dir / "ca.key").write_text(SAMPLE_KEY)
    (ca_dir / "ca.crt").write_text(SAMPLE_CRT)

    with patch.object(service, "_run", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = (
            0,
            "subject=CN = Test CA\nissuer=CN = Test CA\n"
            "notBefore=Jan  1 00:00:00 2025 GMT\nnotAfter=Dec 31 23:59:59 2035 GMT",
            "",
        )
        result = await service.get_ca_info()

    assert result.exists is True
    assert result.subject == "CN = Test CA"
    assert result.not_before is not None


async def test_get_ca_info_not_exists():
    result = await service.get_ca_info()
    assert result.exists is False


# ---------------------------------------------------------------------------
# CA delete tests
# ---------------------------------------------------------------------------


def test_delete_ca(ca_dir):
    (ca_dir / "ca.key").write_text(SAMPLE_KEY)
    (ca_dir / "ca.crt").write_text(SAMPLE_CRT)
    (ca_dir / "ca.srl").write_text("01")

    result = service.delete_ca()
    assert result.success is True
    assert not (ca_dir / "ca.key").exists()
    assert not (ca_dir / "ca.crt").exists()


def test_delete_ca_empty_dir(ca_dir):
    result = service.delete_ca()
    assert result.success is True
    assert "No files" in result.message


def test_delete_ca_no_dir(tmp_path):
    with patch.object(service, "CA_DIR", tmp_path / "nonexistent"):
        result = service.delete_ca()
    assert result.success is True


# ---------------------------------------------------------------------------
# Host certificate generation tests
# ---------------------------------------------------------------------------


async def test_generate_host_cert_no_ca():
    request = HostCertRequest(domain="example.com")
    result = await service.generate_host_cert(request)
    assert result.success is False
    assert "CA certificate not found" in result.message


async def test_generate_host_cert_success(ca_dir, cert_dir):
    # Create CA files
    (ca_dir / "ca.key").write_text(SAMPLE_KEY)
    (ca_dir / "ca.crt").write_text(SAMPLE_CRT)

    request = HostCertRequest(
        domain="example.com",
        country="KR",
        state="Gyeonggi-do",
        locality="Yongin-si",
        organization="Test Org",
        org_unit="Dev",
    )

    with (
        patch.object(service, "_run", new_callable=AsyncMock) as mock_run,
        patch("app.core.config.settings") as mock_settings,
    ):
        mock_settings.cert_days = 825
        mock_settings.cert_key_bits = 2048

        # genrsa, req -new, hostname, x509 -req
        mock_run.side_effect = [
            (0, "", ""),  # genrsa
            (0, "", ""),  # req -new (CSR)
            (0, "myhost", ""),  # hostname
            (0, "", ""),  # x509 -req (sign)
        ]

        # Mock file reads for chain/full PEM creation
        host_key = cert_dir / "host.key"
        host_csr = cert_dir / "host.csr"
        host_crt = cert_dir / "host.crt"

        # We need the files to exist for read_text calls
        # The service writes them via openssl, so we simulate that
        def side_effect_run(cmd):
            """Simulate openssl creating files."""
            if "genrsa" in cmd:
                host_key.write_text(SAMPLE_KEY)
                host_key.chmod(0o400)
            elif "req -new" in cmd:
                host_csr.write_text("CSR CONTENT")
            elif "x509 -req" in cmd:
                host_crt.write_text(SAMPLE_CRT)
            return AsyncMock(return_value=(0, "", ""))()

        mock_run.side_effect = None
        mock_run.side_effect = [
            _create_file_and_return(host_key, SAMPLE_KEY, (0, "", "")),
            _create_file_and_return(host_csr, "CSR", (0, "", "")),
            (0, "myhost", ""),  # hostname
            _create_file_and_return(host_crt, SAMPLE_CRT, (0, "", "")),
        ]

        result = await service.generate_host_cert(request)

    assert result.success is True
    assert "example.com" in result.message
    # Verify generated files
    assert (cert_dir / "host.key").is_file()
    assert (cert_dir / "host.ext").is_file()
    assert (cert_dir / "host.pem").is_file()
    assert (cert_dir / "host-full.pem").is_file()


def _create_file_and_return(path, content, return_val):
    """Helper: create file and return mock value."""
    path.write_text(content)
    if path.name.endswith(".key"):
        path.chmod(0o400)
    return return_val


async def test_generate_host_cert_genrsa_fails(ca_dir):
    (ca_dir / "ca.key").write_text(SAMPLE_KEY)
    (ca_dir / "ca.crt").write_text(SAMPLE_CRT)

    request = HostCertRequest(domain="example.com")

    with (
        patch.object(service, "_run", new_callable=AsyncMock) as mock_run,
        patch("app.core.config.settings") as mock_settings,
    ):
        mock_settings.cert_days = 825
        mock_settings.cert_key_bits = 2048
        mock_run.return_value = (1, "", "genrsa error")

        result = await service.generate_host_cert(request)

    assert result.success is False
    assert "Key generation failed" in result.message


# ---------------------------------------------------------------------------
# Host certificate info tests
# ---------------------------------------------------------------------------


async def test_get_host_cert_info_exists(cert_dir):
    (cert_dir / "host.crt").write_text(SAMPLE_CRT)
    (cert_dir / "host.key").write_text(SAMPLE_KEY)
    (cert_dir / "host.pem").write_text(SAMPLE_CRT)

    with patch.object(service, "_run", new_callable=AsyncMock) as mock_run:
        mock_run.return_value = (
            0,
            "subject=CN = example.com\nissuer=CN = Test CA\n"
            "notBefore=Jan  1 00:00:00 2025 GMT\nnotAfter=Mar 31 23:59:59 2027 GMT",
            "",
        )
        result = await service.get_host_cert_info()

    assert result.exists is True
    assert result.domain == "example.com"
    assert len(result.files) >= 2


async def test_get_host_cert_info_not_exists():
    result = await service.get_host_cert_info()
    assert result.exists is False


# ---------------------------------------------------------------------------
# Host certificate files listing tests
# ---------------------------------------------------------------------------


def test_list_host_cert_files(cert_dir):
    (cert_dir / "host.key").write_text(SAMPLE_KEY)
    (cert_dir / "host.crt").write_text(SAMPLE_CRT)
    (cert_dir / "host.pem").write_text(SAMPLE_CRT)
    (cert_dir / "host-full.pem").write_text(SAMPLE_CRT)

    result = service.list_host_cert_files()
    assert len(result.files) == 4
    assert "host.key" in result.files
    assert "host.crt" in result.files


def test_list_host_cert_files_empty(cert_dir):
    result = service.list_host_cert_files()
    assert result.files == []


# ---------------------------------------------------------------------------
# Host certificate delete tests
# ---------------------------------------------------------------------------


def test_delete_host_cert(cert_dir):
    (cert_dir / "host.key").write_text(SAMPLE_KEY)
    (cert_dir / "host.crt").write_text(SAMPLE_CRT)
    (cert_dir / "host.pem").write_text(SAMPLE_CRT)
    (cert_dir / "host-full.pem").write_text(SAMPLE_CRT)
    (cert_dir / "host.csr").write_text("CSR")
    (cert_dir / "host.ext").write_text("EXT")

    result = service.delete_host_cert()
    assert result.success is True

    # Only host.* files should be deleted, ca dir untouched
    host_files = [f for f in cert_dir.iterdir() if f.name.startswith("host")]
    assert len(host_files) == 0


def test_delete_host_cert_no_files(cert_dir):
    result = service.delete_host_cert()
    assert result.success is True
    assert "No host" in result.message
