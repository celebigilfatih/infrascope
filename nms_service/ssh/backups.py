"""Fixed platform commands and bounded, complete SSH configuration capture."""
import json
import re
import socket
import time
import threading
from pathlib import Path

import paramiko

from nms_service.ssh.poller import SSHDeviceConfig, SSHSession

PROFILES = json.loads(Path(__file__).with_name("backup_profiles.json").read_text())
MAX_BYTES = 10 * 1024 * 1024
ANSI = re.compile(r"\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*\x07)")
PAGER = re.compile(r"--\s*more\s*--|----\s*more\s*----|press (?:any key|space)|<---\s*more", re.I)
ERROR = re.compile(r"(?im)^\s*(?:%\s*(?:invalid|error|ambiguous|incomplete)|error:|unknown command|unrecognized command|invalid input|permission denied|command fail|syntax error)")


class BackupError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code, self.retryable = code, retryable


def resolve_platform(device) -> str | None:
    explicit = getattr(device, "backup_platform", None)
    if explicit:
        return explicit if explicit in PROFILES else None
    identity = " ".join(str(getattr(device, field, "") or "") for field in ("operating_system", "vendor", "model")).lower()
    rules = (
        (r"comware|h3c|\b(51|55|58)\d{2}\b", "comware"),
        (r"aruba.?os.?cx|aos.?cx", "aruba_cx"),
        (r"procurve|arubaos.?switch|aos.?s\b|\b(25|26|28|29|38)\d{2}\b", "aruba_switch"),
        (r"huawei|\bvrp\b", "huawei_vrp"), (r"juniper|junos", "junos"),
        (r"fortinet|fortigate|fortios", "fortios"), (r"mikrotik|routeros", "routeros"),
        (r"arista|\beos\b", "arista_eos"), (r"nx.?os|nexus", "cisco_nxos"),
        (r"cisco|\bios\b", "cisco_ios"),
    )
    return next((platform for pattern, platform in rules if re.search(pattern, identity)), None)


def validate_configuration(output: str, platform: str) -> str:
    """Structural validation supplements transport completion; never log content."""
    output = ANSI.sub("", output).replace("\r", "").strip() + "\n"
    if len(output.encode()) > MAX_BYTES:
        raise BackupError("OUTPUT_TOO_LARGE", "Yapılandırma 10 MiB sınırını aşıyor.")
    if "\x00" in output or "\ufffd" in output or len(output.strip()) < 50:
        raise BackupError("INCOMPLETE_OUTPUT", "Yapılandırma çıktısı eksik veya bozuk.")
    if PAGER.search(output):
        raise BackupError("PAGED_OUTPUT", "Cihaz çıktısı sayfalama nedeniyle tamamlanamadı.")
    if ERROR.search(output):
        raise BackupError("COMMAND_REJECTED", "Cihaz yedekleme komutunu reddetti.")
    validation = PROFILES[platform]["validation"]
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if validation == "ios":
        valid = bool(re.search(r"(?m)^hostname\s+\S+", output)) and lines[-1] == "end"
    elif validation == "comware":
        valid = bool(re.search(r"(?m)^\s*sysname\s+\S+", output)) and lines[-1] == "return"
    elif validation == "procurve":
        valid = "Configuration Editor" in output and bool(re.search(r"(?m)^hostname\s+\S+", output))
    elif validation == "cx":
        valid = bool(re.search(r"(?m)^hostname\s+\S+", output)) and bool(re.search(r"(?im)^!.*version|^version\s", output))
    elif validation == "junos":
        meaningful = [line for line in lines if not line.startswith("#")]
        valid = len(meaningful) >= 2 and all(line.startswith("set ") for line in meaningful)
    elif validation == "fortios":
        depth = 0
        valid = "#config-version=" in output
        for line in lines:
            if line.startswith("config "):
                depth += 1
            elif line == "end":
                depth -= 1
            if depth < 0:
                valid = False
        valid = valid and depth == 0 and any(line.startswith("config ") for line in lines) and lines[-1] == "end"
    else:
        valid = bool(re.search(r"(?i)routeros", output)) and any(line.startswith("/") for line in lines)
    if not valid:
        if validation == "procurve":
            missing = []
            if "Configuration Editor" not in output:
                missing.append("Configuration Editor başlığı bulunamadı")
            if not re.search(r"(?m)^hostname\s+\S+", output):
                missing.append("hostname satırı bulunamadı")
            reason = "; ".join(missing)
        else:
            reason = "beklenen yapılandırma yapısı veya bitiş işareti bulunamadı"
        raise BackupError("INCOMPLETE_OUTPUT", f"{PROFILES[platform]['label']}: {reason}. "
                          "Seçilen platformu ve cihazın işletim sistemini kontrol edin; çıktı eksik olabilir. Yedek kaydedilmedi.")
    return output


def _read_exec(client, command: str, deadline: float) -> str:
    stdin, stdout, stderr = client.exec_command(command, timeout=min(10, max(1, deadline - time.monotonic())), get_pty=False)
    channel = stdout.channel
    stdin.close()
    output, errors = bytearray(), bytearray()
    try:
        while True:
            if time.monotonic() >= deadline:
                raise BackupError("TIMEOUT", "SSH komutu zaman sınırını aştı.", True)
            received = False
            if channel.recv_ready():
                output.extend(channel.recv(65536))
                received = True
            if channel.recv_stderr_ready():
                errors.extend(channel.recv_stderr(65536))
                received = True
            if len(output) > MAX_BYTES or len(errors) > 65536:
                raise BackupError("OUTPUT_TOO_LARGE", "SSH çıktısı boyut sınırını aşıyor.")
            # Exit status alone is not EOF. Drain both streams before checking status.
            if (channel.eof_received or channel.closed) and not channel.recv_ready() and not channel.recv_stderr_ready():
                break
            if not received:
                time.sleep(0.02)
        status = channel.recv_exit_status() if channel.exit_status_ready() else -1
        if status not in (0, -1) or errors.strip():
            raise BackupError("COMMAND_REJECTED", "Cihaz yedekleme komutunu reddetti.")
        return output.decode("utf-8", errors="replace")
    finally:
        channel.close()
        stdout.close()
        stderr.close()


def _read_prompt(channel, deadline: float, prompt: str | None = None) -> tuple[str, str]:
    output = bytearray()
    while time.monotonic() < deadline:
        if channel.recv_ready():
            chunk = channel.recv(65536)
            if not chunk:
                break
            output.extend(chunk)
            if len(output) > MAX_BYTES:
                raise BackupError("OUTPUT_TOO_LARGE", "SSH çıktısı boyut sınırını aşıyor.")
            decoded = ANSI.sub("", output.decode("utf-8", errors="replace")).replace("\r", "")
            last = decoded.rstrip().split("\n")[-1].strip()
            if (prompt and last == prompt) or (not prompt and re.fullmatch(r"(?:<[^<>\n]{1,100}>|[^\n\s]{1,100}[#>])", last)):
                return decoded, last
            if PAGER.search(decoded):
                raise BackupError("PAGED_OUTPUT", "Cihaz sayfalamayı kapatmadı.")
        elif channel.closed:
            break
        else:
            time.sleep(0.02)
    raise BackupError("TIMEOUT", "SSH terminal çıktısı tamamlanmadı.", True)


def _read_interactive(client, profile, command: str, deadline: float) -> str:
    channel = client.invoke_shell(width=240, height=1000)
    channel.settimeout(10)
    try:
        _, prompt = _read_prompt(channel, deadline)
        pager = profile.get("pager")
        if pager:
            channel.sendall(pager + "\n")
            setup, _ = _read_prompt(channel, deadline, prompt)
            if ERROR.search(setup):
                raise BackupError("COMMAND_REJECTED", "Cihaz oturum sayfalama komutunu desteklemiyor.")
        channel.sendall(command + "\n")
        output, _ = _read_prompt(channel, deadline, prompt)
        lines = output.rstrip().splitlines()
        if lines and lines[-1].strip() == prompt:
            lines.pop()
        if lines and lines[0].strip() in (command, prompt + command, prompt + " " + command):
            lines.pop(0)
        return "\n".join(lines)
    finally:
        channel.close()


def capture_configuration(cfg: SSHDeviceConfig, platform: str, backup_type: str) -> str:
    profile = PROFILES.get(platform)
    if not profile:
        raise BackupError("UNSUPPORTED_PLATFORM", "Cihaz için yedekleme platformu seçilmelidir.")
    command = profile.get("running" if backup_type == "Running Config" else "startup") if backup_type in ("Running Config", "Startup Config") else None
    if not command:
        raise BackupError("UNSUPPORTED_TYPE", "Seçilen yedek türü bu platformda desteklenmiyor.")
    session = SSHSession(cfg)
    watchdog = None
    try:
        if not session.connect():
            error = getattr(session, "last_error", None)
            if isinstance(error, paramiko.AuthenticationException):
                raise BackupError("AUTH_FAILED", "SSH kimlik doğrulaması başarısız; otomatik tekrar durduruldu.")
            if error and ("host key" in str(error).lower() or "hostkey" in str(error).lower()):
                raise BackupError("HOST_KEY_REJECTED", "SSH cihaz anahtarı onaylı anahtarla eşleşmiyor.")
            raise BackupError("CONNECTION_FAILED", "SSH bağlantısı kurulamadı.", True)
        # Paramiko terminal negotiation can wait without a channel timeout.
        # Closing the transport bounds every underlying request, including PTY negotiation.
        def abort_transport():
            try:
                if session.client is not None:
                    session.client.close()
            except Exception:
                pass
        watchdog = threading.Timer(90, abort_transport)
        watchdog.daemon = True
        watchdog.start()
        deadline = time.monotonic() + 75
        try:
            output = _read_exec(session.client, command, deadline)
            return validate_configuration(output, platform)
        except (paramiko.SSHException, BackupError) as error:
            # Some switches implement only a terminal channel. Never retry credentials here.
            if isinstance(error, BackupError) and error.code != "PAGED_OUTPUT":
                raise
            output = _read_interactive(session.client, profile, command, deadline)
            return validate_configuration(output, platform)
    except (socket.timeout, TimeoutError) as error:
        raise BackupError("TIMEOUT", "SSH işlemi zaman sınırını aştı.", True) from error
    except (OSError, EOFError, paramiko.SSHException) as error:
        raise BackupError("CONNECTION_FAILED", "SSH bağlantısı kesildi.", True) from error
    finally:
        if watchdog is not None:
            watchdog.cancel()
        session.close()
