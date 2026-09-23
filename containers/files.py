#!/usr/bin/env python3
"""Bounded regular-file exchange; never unpack an agent-controlled archive."""
import base64
import json
import os
import stat
import sys
from pathlib import PurePosixPath
from receipt import ROOT, validate_id

MAX_FILE = 8 * 1024 * 1024
MAX_TOTAL = 48 * 1024 * 1024
MAX_FILES = 2048


def relative(value):
    if not isinstance(value, str) or '\x00' in value or '\\' in value:
        raise ValueError('invalid file path')
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ('', '.', '..') for part in value.split('/')):
        raise ValueError('invalid file path')
    if path.parts[0] not in ('workspace', 'home', 'memory'):
        raise ValueError('file is outside trial data')
    return path


def stage(directory):
    if directory.exists():
        raise ValueError('trial data already exists')
    data = sys.stdin.buffer.read(MAX_TOTAL * 2 + 1)
    if len(data) > MAX_TOTAL * 2:
        raise ValueError('staging input too large')
    files = json.loads(data)
    if not isinstance(files, list) or len(files) > MAX_FILES:
        raise ValueError('invalid staging manifest')
    decoded = []
    total = 0
    paths = set()
    for item in files:
        path = relative(item['path'])
        content = base64.b64decode(item['content'], validate=True)
        total += len(content)
        if len(content) > MAX_FILE or total > MAX_TOTAL or str(path) in paths:
            raise ValueError('invalid staging size or duplicate path')
        paths.add(str(path))
        decoded.append((path, content))
    directory.mkdir(parents=True, mode=0o700)
    for root in ('workspace', 'home', 'memory'):
        (directory / root).mkdir(mode=0o700)
        os.chown(directory / root, 1000, 1000)
    for path, content in decoded:
        target = directory / path
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as handle:
            handle.write(content)
        os.chown(target, 1000, 1000)
        parent = target.parent
        while parent != directory:
            os.chown(parent, 1000, 1000)
            parent = parent.parent
    print(json.dumps({'files': len(decoded), 'bytes': total}))


def export(directory):
    receipt = json.loads((directory / 'supervisor.json').read_text())
    if receipt.get('cleanupVerified') is not True or not receipt.get('systemdCleanupCheckedAt'):
        raise ValueError('cleanup must be verified before reading candidate data')
    files = []
    total = 0
    for subdir in ('workspace', 'home/sessions', 'memory'):
        root = directory / subdir
        if not root.exists():
            continue
        if root.is_symlink():
            raise ValueError('symbolic links cannot be exported')
        for base, directories, names in os.walk(root, followlinks=False):
            for name in directories + names:
                path = root.__class__(base) / name
                meta = path.lstat()
                if stat.S_ISDIR(meta.st_mode):
                    continue
                if not stat.S_ISREG(meta.st_mode) or meta.st_nlink != 1 or meta.st_size > MAX_FILE:
                    raise ValueError('only bounded, unlinked regular files can be exported')
                descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                with os.fdopen(descriptor, 'rb') as handle:
                    current = os.fstat(handle.fileno())
                    if (current.st_dev, current.st_ino) != (meta.st_dev, meta.st_ino):
                        raise ValueError('file changed during export')
                    content = handle.read(MAX_FILE + 1)
                total += len(content)
                if len(content) > MAX_FILE or total > MAX_TOTAL or len(files) >= MAX_FILES:
                    raise ValueError('export size limit exceeded')
                files.append({'path': str(path.relative_to(directory)), 'content': base64.b64encode(content).decode()})
    print(json.dumps(files, separators=(',', ':')))


if __name__ == '__main__':
    action, run_id = sys.argv[1:]
    directory = ROOT / validate_id(run_id)
    if action == 'stage':
        stage(directory)
    elif action == 'export':
        export(directory)
    else:
        raise ValueError('unknown file action')
