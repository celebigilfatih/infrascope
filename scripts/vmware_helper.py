"""Versioned stdin protocol and verified SDK lifecycle for VMware helpers."""
import importlib
import json
import os
import socket
import ssl
import sys
from urllib.parse import urlsplit


class HelperError(Exception):
    def __init__(self, code):
        self.code = code


def truthy(value):
    return value in ('true', '1', 'yes')


def production_guard():
    if os.environ.get('NODE_ENV') == 'production' and (
        truthy(os.environ.get('VMWARE_TLS_INSECURE')) or
        os.environ.get('NODE_TLS_REJECT_UNAUTHORIZED') == '0'
    ):
        raise HelperError('TLS_POLICY')


def tls_context(policy):
    production_guard()
    if not isinstance(policy, dict) or type(policy.get('verify')) is not bool:
        raise HelperError('INVALID_REQUEST')
    if not policy['verify']:
        if os.environ.get('NODE_ENV') not in ('development', 'test') or not truthy(os.environ.get('VMWARE_TLS_INSECURE')):
            raise HelperError('TLS_POLICY')
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        return context
    ca = policy.get('caPem')
    if ca is not None and (not isinstance(ca, str) or not ca.strip()):
        raise HelperError('INVALID_REQUEST')
    return ssl.create_default_context(cadata=ca)


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise HelperError('INVALID_REQUEST')
        value[key] = item
    return value


def read_request(operation):
    raw = sys.stdin.buffer.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise HelperError('INVALID_REQUEST')
    try:
        request = json.loads(raw.decode('utf-8'), object_pairs_hook=unique_object)
    except (ValueError, UnicodeError):
        raise HelperError('INVALID_REQUEST') from None
    if not isinstance(request, dict) or type(request.get('protocol')) is not int or request['protocol'] != 1 or request.get('operation') != operation:
        raise HelperError('INVALID_REQUEST')
    return request


def sdk():
    try:
        connect = importlib.import_module('pyVim.connect')
        vim = importlib.import_module('pyVmomi').vim
        return connect.SmartConnect, connect.Disconnect, vim
    except ImportError:
        raise HelperError('SDK_MISSING') from None


def collect(request, operation, collector):
    for field in ('host', 'username', 'password'):
        if not isinstance(request.get(field), str) or not request[field]:
            raise HelperError('INVALID_REQUEST')
    vm_id = request.get('vmId')
    if vm_id is not None and (not isinstance(vm_id, str) or not vm_id):
        raise HelperError('INVALID_REQUEST')
    try:
        target = urlsplit('https://' + request['host'])
        if not target.hostname or target.username is not None or target.password is not None or target.path or target.query or target.fragment:
            raise ValueError('Invalid authority')
        port = target.port or 443
    except ValueError:
        raise HelperError('INVALID_REQUEST') from None
    context = tls_context(request.get('tls'))
    smart_connect, disconnect, vim = sdk()
    socket.setdefaulttimeout(20)
    service = None
    try:
        service = smart_connect(host=target.hostname, port=port, user=request['username'], pwd=request['password'],
                                sslContext=context, httpConnectionTimeout=20, connectionPoolTimeout=20)
        content = service.RetrieveContent()
        return {'protocol': 1, 'success': True, operation: collector(content, vim, vm_id)}
    finally:
        if service is not None:
            disconnect(service)


def error_code(error):
    if isinstance(error, HelperError):
        return error.code
    if isinstance(error, ssl.SSLError):
        return 'TLS_ERROR'
    if isinstance(error, (TimeoutError, socket.timeout)):
        return 'SOURCE_TIMEOUT'
    name = type(error).__name__
    if name == 'InvalidLogin':
        return 'AUTH_FAILED'
    if name in ('NoPermission', 'NotAuthenticated'):
        return 'PERMISSION_DENIED'
    return 'SOURCE_ERROR'


def main(operation='preflight', collector=None):
    try:
        production_guard()
        request = read_request(operation)
        if operation == 'preflight':
            sdk()
            result = {'protocol': 1, 'success': True, 'runtime': {'python': sys.version.split()[0], 'sdk': 'pyvmomi'}}
        else:
            result = collect(request, operation, collector)
    except Exception as error:
        result = {'protocol': 1, 'success': False, 'code': error_code(error), 'error': 'VMware helper failed'}
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['success'] else 1


if __name__ == '__main__':
    sys.exit(main())
