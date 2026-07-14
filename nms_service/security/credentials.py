"""Decrypt shared credential envelopes and encrypt sensitive NMS artifacts."""

import base64
import os
from typing import Iterable

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


PREFIX = "enc:v1"


class CredentialEnvelopeError(ValueError):
    pass


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _dedicated_key(value: str) -> bytes:
    candidate = value.strip()
    try:
        decoded = bytes.fromhex(candidate) if len(candidate) == 64 else base64.b64decode(candidate)
    except Exception as exc:
        raise CredentialEnvelopeError("Integration credential key is malformed") from exc
    if len(decoded) != 32:
        raise CredentialEnvelopeError("Integration credential key must contain 32 bytes")
    return decoded


def _session_key(secret: str) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"infrascope",
        info=b"integration-credentials:v1",
    ).derive(secret.encode("utf-8"))


def _keys(source: str) -> Iterable[bytes]:
    if source == "i":
        values = (
            os.getenv("INTEGRATION_CREDENTIALS_KEY", ""),
            os.getenv("INTEGRATION_CREDENTIALS_PREVIOUS_KEY", ""),
        )
        keys = [_dedicated_key(value) for value in values if value.strip()]
        if not keys:
            raise CredentialEnvelopeError("INTEGRATION_CREDENTIALS_KEY is required")
        return keys
    if source == "s":
        secret = os.getenv("NEXTAUTH_SECRET", "")
        if not secret.strip():
            raise CredentialEnvelopeError("NEXTAUTH_SECRET is required")
        return [_session_key(secret)]
    raise CredentialEnvelopeError("Credential key source is unsupported")


def decrypt_envelope(value: str, context: str) -> str:
    if not value.startswith(f"{PREFIX}:"):
        raise CredentialEnvelopeError("Plaintext NMS credentials are not accepted")
    parts = value.split(":")
    if len(parts) != 6 or parts[0:2] != ["enc", "v1"]:
        raise CredentialEnvelopeError("Credential envelope is malformed")
    ciphertext = _decode(parts[5]) + _decode(parts[4])
    for key in _keys(parts[2]):
        try:
            plaintext = AESGCM(key).decrypt(
                _decode(parts[3]),
                ciphertext,
                context.encode("utf-8"),
            )
            return plaintext.decode("utf-8")
        except Exception:
            continue
    raise CredentialEnvelopeError("Credential could not be decrypted")


def encrypt_envelope(value: str, context: str) -> str:
    dedicated = os.getenv("INTEGRATION_CREDENTIALS_KEY", "").strip()
    if dedicated:
        source, key = "i", _dedicated_key(dedicated)
    else:
        secret = os.getenv("NEXTAUTH_SECRET", "")
        if not secret.strip():
            raise CredentialEnvelopeError("A credential encryption key is required")
        source, key = "s", _session_key(secret)
    nonce = os.urandom(12)
    encrypted = AESGCM(key).encrypt(nonce, value.encode("utf-8"), context.encode("utf-8"))
    ciphertext, tag = encrypted[:-16], encrypted[-16:]
    return ":".join((PREFIX, source, _encode(nonce), _encode(tag), _encode(ciphertext)))


def decrypt_nms_credential(value: str, field: str) -> str:
    if field not in (
        "snmpCommunity",
        "snmpV3AuthPassword",
        "snmpV3PrivacyPassword",
        "sshPassword",
    ):
        raise CredentialEnvelopeError("Unsupported NMS credential field")
    return decrypt_envelope(value, f"infrascope:NMS_DEVICE:{field}:v1")


def encrypt_nms_backup(value: str) -> str:
    return encrypt_envelope(value, "infrascope:NMS_BACKUP:configuration:v1")
