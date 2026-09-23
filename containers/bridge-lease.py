#!/usr/bin/env python3
"""SSH reverse socket lifetime, owned by the trusted guest login user."""
import os
import selectors
import stat
import sys
import time
from pathlib import Path
from receipt import validate_id

run_id = validate_id(sys.argv[1])
directory = Path('/run/dsh-architecture-bridges') / run_id
socket = directory / 'broker.sock'
selector = selectors.DefaultSelector()
selector.register(sys.stdin.buffer, selectors.EVENT_READ)
started = last = time.monotonic()
pending = b''
try:
    if not stat.S_ISSOCK(socket.lstat().st_mode):
        raise ValueError('reverse socket missing')
    # Parent is user-owned 0700. The trial receives only this read-only bind
    # mount, not its directory or any other trial's socket.
    os.chmod(socket, 0o666)
    print('ARCHITECTURE_BRIDGE_READY', flush=True)
    while time.monotonic() - started < 610 and time.monotonic() - last < 5:
        if not selector.select(0.2):
            continue
        chunk = os.read(sys.stdin.fileno(), 4096)
        if not chunk:
            break
        pending += chunk
        while b'\n' in pending:
            line, pending = pending.split(b'\n', 1)
            if line != b'alive':
                raise ValueError('invalid bridge control')
            last = time.monotonic()
        if len(pending) > 128:
            raise ValueError('invalid bridge control')
finally:
    selector.close()
    socket.unlink(missing_ok=True)
    directory.rmdir()
