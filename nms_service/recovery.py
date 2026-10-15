"""Streaming AES-GCM recovery bundles: a DB dump and its installation keys.

Passphrases arrive on stdin, never command arguments. Extraction authenticates
the entire stream before publishing either dump or keys. No database is changed.
"""
import argparse
import base64
import hashlib
import json
import os
import struct
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

MAGIC = b'ISRECOVERY\x01'
CHUNK = 1024 * 1024
KEY_NAMES = ('INTEGRATION_CREDENTIALS_KEY', 'INTEGRATION_CREDENTIALS_PREVIOUS_KEY', 'NEXTAUTH_SECRET', 'NMS_INTERNAL_TOKEN', 'DATABASE_URL')
INSTALLATION_FILES = ('environment.env', 'machine-id', 'license.json')


def key(passphrase, salt):
    if len(passphrase) < 16:
        raise ValueError('Recovery passphrase must contain at least 16 bytes')
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=600000).derive(passphrase)


def create_bundle(dump_path, output_path, passphrase, environment=None, installation_dir=None):
    environment = os.environ if environment is None else environment
    dump_path, output_path = Path(dump_path), Path(output_path)
    if output_path.exists():
        raise ValueError('Refusing to overwrite an existing recovery bundle')
    metadata = {'format': 1, 'createdAt': datetime.now(timezone.utc).isoformat(),
                'keys': {name: environment.get(name, '') for name in KEY_NAMES}}
    if installation_dir is not None:
        metadata['installationFiles'] = {}
        for name in INSTALLATION_FILES:
            source = Path(installation_dir) / name
            if source.is_file():
                if source.stat().st_size > 16384:
                    raise ValueError('Installation recovery file exceeds the size limit')
                metadata['installationFiles'][name] = base64.b64encode(source.read_bytes()).decode('ascii')
    if not metadata['keys']['INTEGRATION_CREDENTIALS_KEY'] and not metadata['keys']['NEXTAUTH_SECRET']:
        raise ValueError('Installation encryption keys are missing')
    salt, nonce = os.urandom(16), os.urandom(12)
    header = MAGIC + salt + nonce
    encryptor = Cipher(algorithms.AES(key(passphrase, salt)), modes.GCM(nonce)).encryptor()
    encryptor.authenticate_additional_data(header)
    encoded = json.dumps(metadata).encode()
    if len(encoded) > 65536:
        raise ValueError('Installation recovery metadata exceeds the size limit')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.recovery-', dir=output_path.parent)
    try:
        with os.fdopen(fd, 'wb') as target, dump_path.open('rb') as source:
            target.write(header)
            target.write(encryptor.update(struct.pack('>I', len(encoded)) + encoded))
            while chunk := source.read(CHUNK):
                target.write(encryptor.update(chunk))
            target.write(encryptor.finalize())
            target.write(encryptor.tag)
            target.flush()
            os.fsync(target.fileno())
        os.rename(temporary, output_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def extract_bundle(input_path, directory, passphrase):
    input_path, directory = Path(input_path), Path(directory)
    if directory.exists():
        raise ValueError('Recovery destination must be a new directory')
    directory.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.recovery-', dir=directory.parent) as temporary:
        authenticated = Path(temporary) / 'authenticated'
        with input_path.open('rb') as source:
            header = source.read(len(MAGIC) + 28)
            if not header.startswith(MAGIC) or len(header) != len(MAGIC) + 28:
                raise ValueError('Unsupported recovery bundle')
            salt, nonce = header[len(MAGIC):len(MAGIC)+16], header[-12:]
            remaining = input_path.stat().st_size - len(header) - 16
            if remaining < 4:
                raise ValueError('Recovery bundle is truncated')
            source.seek(-16, 2)
            tag = source.read(16)
            source.seek(len(header))
            decryptor = Cipher(algorithms.AES(key(passphrase, salt)), modes.GCM(nonce, tag)).decryptor()
            decryptor.authenticate_additional_data(header)
            with authenticated.open('xb') as target:
                os.chmod(authenticated, 0o600)
                while remaining:
                    chunk = source.read(min(CHUNK, remaining))
                    if not chunk:
                        raise ValueError('Recovery bundle is truncated')
                    remaining -= len(chunk)
                    target.write(decryptor.update(chunk))
                target.write(decryptor.finalize())
        with authenticated.open('rb') as source:
            size = struct.unpack('>I', source.read(4))[0]
            if size > 65536:
                raise ValueError('Invalid recovery metadata')
            metadata = json.loads(source.read(size))
            if metadata.get('format') != 1:
                raise ValueError('Unsupported recovery format')
            destination = Path(temporary) / 'result'
            destination.mkdir(mode=0o700)
            with (destination / 'database.dump').open('xb') as target:
                os.chmod(target.name, 0o600)
                while chunk := source.read(CHUNK):
                    target.write(chunk)
            with (destination / 'installation-keys.json').open('x') as target:
                os.chmod(target.name, 0o600)
                json.dump(metadata, target, indent=2)
            for name, value in metadata.get('installationFiles', {}).items():
                if name not in INSTALLATION_FILES:
                    raise ValueError('Unexpected installation recovery filename')
                with (destination / name).open('xb') as target:
                    os.chmod(target.name, 0o600)
                    target.write(base64.b64decode(value, validate=True))
            os.rename(destination, directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    create = sub.add_parser('create')
    create.add_argument('--dump', required=True)
    create.add_argument('--output', required=True)
    create.add_argument('--installation-dir')
    extract = sub.add_parser('extract')
    extract.add_argument('--input', required=True)
    extract.add_argument('--directory', required=True)
    args = parser.parse_args()
    passphrase = sys.stdin.buffer.readline(4096).rstrip(b'\r\n')
    try:
        if args.command == 'create':
            create_bundle(args.dump, args.output, passphrase, installation_dir=args.installation_dir)
        else:
            extract_bundle(args.input, args.directory, passphrase)
        print('Recovery operation completed.')
    except Exception as error:
        print(f'Recovery operation failed ({type(error).__name__}). No keys or passphrases are logged.', file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
