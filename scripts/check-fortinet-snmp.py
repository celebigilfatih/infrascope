#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("NMS_LOG_DIR", "/tmp/infrascope-nms-check")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from nms_service.snmp.poller import (  # noqa: E402
    parse_sensor_temperature,
    select_fortinet_temperature,
)
from nms_service.snmp.session import SNMPAuthError, SNMPSession  # noqa: E402

assert parse_sensor_temperature("CPU: 42.5 C") == 42.5
assert parse_sensor_temperature("not available") is None
assert parse_sensor_temperature("999 C") is None

names = {
    "1.3.6.1.4.1.12356.101.4.3.2.1.2.7": "CPU Temperature",
    "1.3.6.1.4.1.12356.101.4.3.2.1.2.8": "Board Thermal Sensor",
    "1.3.6.1.4.1.12356.101.4.3.2.1.2.9": "Fan Speed",
}
values = {
    "1.3.6.1.4.1.12356.101.4.3.2.1.3.7": "54 C",
    "1.3.6.1.4.1.12356.101.4.3.2.1.3.8": "61.5 Celsius",
    "1.3.6.1.4.1.12356.101.4.3.2.1.3.9": "12000 RPM",
}
assert select_fortinet_temperature(names, values) == 61.5

session = SNMPSession(1, "FortiGate", "192.0.2.1", "secret", "v2c")
assert session._base_args()[:2] == ["-v", "2c"]

auth_no_priv = SNMPSession(
    2,
    "FortiGate-v3-auth",
    "192.0.2.2",
    version="v3",
    v3_username="monitor",
    v3_security_level="authNoPriv",
    v3_auth_protocol="SHA-256",
    v3_auth_password="auth-secret",
)
auth_no_priv_args = auth_no_priv._base_args()
assert auth_no_priv_args[:6] == ["-v", "3", "-l", "authNoPriv", "-u", "monitor"]
assert "-a" in auth_no_priv_args and "SHA-256" in auth_no_priv_args
assert "-A" in auth_no_priv_args and "auth-secret" in auth_no_priv_args
assert "-x" not in auth_no_priv_args and "-X" not in auth_no_priv_args
assert "-c" not in auth_no_priv_args

auth_priv = SNMPSession(
    3,
    "FortiGate-v3-priv",
    "192.0.2.3",
    version="3",
    v3_username="monitor",
    v3_security_level="authPriv",
    v3_auth_protocol="SHA",
    v3_auth_password="auth-secret",
    v3_privacy_protocol="AES",
    v3_privacy_password="privacy-secret",
)
auth_priv_args = auth_priv._base_args()
assert "-x" in auth_priv_args and "AES" in auth_priv_args
assert "-X" in auth_priv_args and "privacy-secret" in auth_priv_args
assert "-c" not in auth_priv_args

for version, community in (("3", "secret"), ("2c", "")):
    try:
        SNMPSession(1, "FortiGate", "192.0.2.1", community, version)
        raise AssertionError("Unsupported or incomplete SNMP credentials were accepted")
    except SNMPAuthError:
        pass

for invalid_kwargs in (
    {"v3_auth_protocol": "MD5"},
    {"v3_privacy_protocol": "DES"},
    {"v3_auth_password": "short"},
):
    defaults = {
        "version": "3",
        "v3_username": "monitor",
        "v3_security_level": "authPriv",
        "v3_auth_password": "auth-secret",
        "v3_privacy_password": "privacy-secret",
    }
    defaults.update(invalid_kwargs)
    try:
        SNMPSession(4, "FortiGate-invalid", "192.0.2.4", **defaults)
        raise AssertionError("Unsafe SNMPv3 parameters were accepted")
    except SNMPAuthError:
        pass

poller = (ROOT / "nms_service/snmp/poller.py").read_text()
for forbidden_oid in (
    "1.3.6.1.4.1.12356.101.13.2.1.1.2",
    "1.3.6.1.4.1.12356.101.13.2.1.2.1",
    "1.3.6.1.4.1.12356.101.13.2.1.3.1",
):
    assert forbidden_oid not in poller
assert "1.3.6.1.4.1.12356.101.4.1.3.0" in poller
assert "1.3.6.1.4.1.12356.101.4.1.4.0" in poller

oid_json = json.loads((ROOT / "nms_service/snmp/vendor_oids.json").read_text())
assert "1.3.6.1.4.1.12356.101.4.1.3" in oid_json
assert "1.3.6.1.4.1.12356.101.4.1.4" in oid_json
assert "1.3.6.1.4.1.12356.101.4.3.2.1.3" in oid_json

orchestrator = (ROOT / "nms_service/orchestrator.py").read_text()
assert 'device.snmp_community or "public"' not in orchestrator
assert 'decrypt_nms_credential(\n                            device.snmp_v3_auth_password, "snmpV3AuthPassword"' in orchestrator
assert 'decrypt_nms_credential(\n                            device.snmp_v3_privacy_password, "snmpV3PrivacyPassword"' in orchestrator

snmp_read = (ROOT / "lib/firewall/snmp-read.ts").read_text()
assert "nmsDeviceId: context.device.nmsDeviceId!" in snmp_read
assert "source: 'snmp'" in snmp_read
health_dto = snmp_read.split("export type FirewallSnmpHealth", 1)[1].split("};", 1)[0]
interface_dto = snmp_read.split("export type FirewallSnmpInterface", 1)[1].split("};", 1)[0]
assert "snmpCommunity" not in health_dto
assert "snmpCommunity" not in interface_dto

print("Fortinet SNMP v1/v2c/v3 OID, credential, scope, and freshness checks passed.")
