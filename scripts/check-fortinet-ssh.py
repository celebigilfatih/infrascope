#!/usr/bin/env python3
import base64
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["INTEGRATION_CREDENTIALS_KEY"] = base64.b64encode(bytes([17]) * 32).decode()
os.environ.setdefault("NMS_LOG_DIR", "/tmp/infrascope-nms-check")

from nms_service.security.credentials import (  # noqa: E402
    CredentialEnvelopeError,
    decrypt_envelope,
    decrypt_nms_credential,
    encrypt_nms_backup,
    encrypt_envelope,
)

password = encrypt_envelope("fortinet-password", "infrascope:NMS_DEVICE:sshPassword:v1")
assert "fortinet-password" not in password
assert decrypt_nms_credential(password, "sshPassword") == "fortinet-password"

try:
    decrypt_nms_credential("plaintext", "sshPassword")
    raise AssertionError("Plaintext NMS credential was accepted")
except CredentialEnvelopeError:
    pass

backup = encrypt_nms_backup("config system global\nend")
assert "config system global" not in backup
assert decrypt_envelope(backup, "infrascope:NMS_BACKUP:configuration:v1").endswith("end")

poller = (ROOT / "nms_service/ssh/poller.py").read_text()
service = "\n".join(
    path.read_text()
    for path in (ROOT / "nms_service").rglob("*.py")
)
assert "AutoAddPolicy" not in service
assert "PinnedHostKeyPolicy" in poller
assert '"status": "get system status"' in poller
assert '"backup": "show full-configuration"' in poller
assert "execute_command(" not in poller
assert "execute_operation" in poller
for forbidden in ('"config ', '"set ', '"unset ', '"execute ', "execute reboot"):
    assert forbidden not in poller.split("_READ_ONLY_COMMANDS", 1)[1].split("_VENDOR_ALIASES", 1)[0]

schema = (ROOT / "prisma/schema.prisma").read_text()
assert "sshHostKeyFingerprint" in schema
assert "sshHostKeyAlgorithm" in schema

device_api = (ROOT / "app/api/integrations/nms/devices/route.ts").read_text()
assert "protectNmsCredential" in device_api
assert "NMS_INTERNAL_TOKEN" in (ROOT / "docker-compose.yml").read_text()

print("Fortinet SSH pinning, allowlist, encrypted credential, and backup checks passed.")
