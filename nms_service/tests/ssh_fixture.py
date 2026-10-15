"""Synthetic SSH server for protocol tests; never connects to inventory devices."""
import socket
import threading
import time
import paramiko

RUNNING = 'version 15.2\nhostname fixture-running\ninterface GigabitEthernet0/1\n description fixture-uplink\n!\nend\n'
STARTUP = RUNNING.replace('fixture-running', 'fixture-startup')


class FixtureServer:
    def __init__(self, host='127.0.0.1', port=0, interactive=False, truncated=False):
        self.key = paramiko.RSAKey.generate(2048)
        self.host, self.port = host, port
        self.interactive, self.truncated = interactive, truncated
        self.commands, self.auth_attempts = [], 0
        self.stop = threading.Event()
        self.transports = []

    def __enter__(self):
        self.listener = socket.socket()
        self.listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
        self.listener.bind((self.host,self.port)); self.listener.listen(16); self.listener.settimeout(0.2)
        self.port = self.listener.getsockname()[1]
        self.thread = threading.Thread(target=self.accept,daemon=True); self.thread.start()
        return self

    def __exit__(self,*_):
        self.stop.set(); self.listener.close()
        for transport in self.transports: transport.close()
        self.thread.join(timeout=2)

    def accept(self):
        while not self.stop.is_set():
            try: connection,_ = self.listener.accept()
            except socket.timeout: continue
            except OSError: break
            threading.Thread(target=self.serve,args=(connection,),daemon=True).start()

    def serve(self,connection):
        fixture=self
        channels=[]
        class Handler(paramiko.ServerInterface):
            def check_auth_password(self,username,password):
                fixture.auth_attempts += 1
                return paramiko.AUTH_SUCCESSFUL if username=='fixture' and password=='fixture-password' else paramiko.AUTH_FAILED
            def get_allowed_auths(self,username): return 'password'
            def check_channel_request(self,kind,chanid):
                return paramiko.OPEN_SUCCEEDED if kind=='session' else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED
            def check_channel_exec_request(self,channel,command):
                if fixture.interactive: return False
                decoded=command.decode(); fixture.commands.append(decoded)
                def emit():
                    try:
                        time.sleep(0.02)
                        payload=STARTUP if decoded=='show startup-config' else RUNNING
                        if fixture.truncated: payload=payload.replace('end\n','')
                        channel.sendall(payload.encode()); channel.send_exit_status(0); channel.shutdown_write()
                    except (OSError,EOFError): pass
                threading.Thread(target=emit,daemon=True).start()
                return True
            def check_channel_pty_request(self,*_): return True
            def check_channel_shell_request(self,channel):
                def shell():
                    try:
                        time.sleep(0.02); channel.sendall(b'fixture-switch#')
                        pending=b''
                        while not fixture.stop.is_set():
                            chunk=channel.recv(4096)
                            if not chunk: break
                            pending+=chunk
                            while b'\n' in pending:
                                command,pending=pending.split(b'\n',1); decoded=command.decode().strip(); fixture.commands.append(decoded)
                                payload='' if decoded=='terminal length 0' else STARTUP if decoded=='show startup-config' else RUNNING
                                channel.sendall((decoded+'\r\n'+payload+'fixture-switch#').encode())
                    except (OSError,EOFError): pass
                threading.Thread(target=shell,daemon=True).start(); return True
        transport=paramiko.Transport(connection); self.transports.append(transport); transport.add_server_key(self.key)
        try:
            transport.start_server(server=Handler())
            while transport.is_active() and not self.stop.is_set():
                channel=transport.accept(timeout=0.2)
                if channel is not None: channels.append(channel)
        except (EOFError,OSError,paramiko.SSHException): pass
        finally: transport.close()


if __name__=='__main__':
    from pathlib import Path
    from nms_service.ssh.poller import host_key_fingerprint
    with FixtureServer(host='0.0.0.0',port=2222) as server:
        Path('/fixtures/ssh-fingerprint').write_text(host_key_fingerprint(server.key))
        server.stop.wait()
