"""One-time, hash-guarded repair of the approved webmail-test proxy only."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

TARGET = Path('/etc/nginx/conf.d/vhost_gxsoft.conf')
EXPECTED = 'd3e7df46f8c967d7cc43ad93f3d38565424de4f8ef4bf9e64982e0fc88dee880'
OLD = b'proxy_pass http://192.168.0.105;'
NEW = b'proxy_pass http://127.0.0.1:17540;'


def candidate(data):
    if hashlib.sha256(data).hexdigest() != EXPECTED:
        raise ValueError('Configuration changed; inspect again before applying')
    start = data.index(b'server {\n  listen 443 ssl;\n  ssl_certificate /etc/letsencrypt/live/webmail-test.gxsoft.co.kr/')
    end = data.index(b'\n}', start) + 2
    block = data[start:end]
    if block.count(OLD) != 3:
        raise ValueError('Expected exactly three webmail proxy locations')
    return data[:start] + block.replace(OLD, NEW) + data[end:]


def main():
    original = TARGET.read_bytes()
    updated = candidate(original)
    if '--apply' not in sys.argv:
        print('Validated: only the three approved webmail upstreams will change')
        return
    subprocess.run(['nginx', '-t'], check=True)
    backup = TARGET.with_name(TARGET.name + '.before-public-relay-20261021')
    if backup.exists():
        raise ValueError('Backup already exists; refusing to overwrite')
    shutil.copy2(TARGET, backup)
    fd, name = tempfile.mkstemp(prefix='.webmail-relay-', dir=TARGET.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(updated)
        shutil.copystat(TARGET, name)
        if TARGET.read_bytes() != original:
            raise ValueError('Concurrent configuration change; no overwrite')
        os.replace(name, TARGET)
        try:
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        except Exception:
            shutil.copy2(backup, TARGET)
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
            raise
        print('Applied three upstream replacements; backup:', backup)
    finally:
        if os.path.exists(name):
            os.unlink(name)


if __name__ == '__main__':
    main()
