"""Root-owned guest evidence, inaccessible to trial processes."""
import json
import os
import re
import subprocess
import time
from pathlib import Path

ROOT = Path('/var/lib/dsh-architecture-lab/runs')


def validate_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value):
        raise ValueError('invalid run identity')
    return value


def docker(*args, timeout=20):
    return subprocess.run(['/usr/bin/docker', *args], capture_output=True, text=True, timeout=timeout)


def save(directory, receipt):
    temporary = directory / 'supervisor.tmp'
    with open(temporary, 'w', encoding='utf8') as handle:
        os.chmod(temporary, 0o600)
        json.dump(receipt, handle, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, directory / 'supervisor.json')
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def cleanup(run_id, receipt):
    """Fail closed on an unreachable daemon or mismatched container identity."""
    name = 'dsh-lab-' + validate_id(run_id)
    receipt['cleanupVerified'] = False
    try:
        found = docker('ps', '--all', '--quiet', '--no-trunc', '--filter', 'name=^/' + name + '$')
        if found.returncode:
            raise RuntimeError('Docker inventory unavailable')
        ids = found.stdout.split()
        if len(ids) > 1:
            raise RuntimeError('ambiguous container identity')
        if ids:
            inspected = docker('inspect', ids[0])
            if inspected.returncode:
                raise RuntimeError('Docker identity inspection unavailable')
            item = json.loads(inspected.stdout)[0]
            if (item['Name'] != '/' + name or item['Config']['Labels'].get('dsh.architecture.run') != run_id
                    or item['Image'] != receipt['image']
                    or receipt.get('containerId', ids[0]) != ids[0]):
                raise RuntimeError('container identity mismatch; cleanup requires review')
            receipt['containerId'] = ids[0]
            receipt['stateBeforeCleanup'] = item['State']
            if not item['State']['Running']:
                receipt['exitCode'] = item['State']['ExitCode']
            removed = docker('rm', '--force', ids[0])
            receipt['removeStatus'] = removed.returncode
        verified = docker('ps', '--all', '--quiet', '--no-trunc', '--filter', 'name=^/' + name + '$')
        receipt['cleanupVerified'] = verified.returncode == 0 and not verified.stdout.strip()
        # A killed Docker CLI can leave a daemon-side create in flight. Even an
        # empty inventory cannot prove absence until creation was acknowledged.
        if receipt.get('creationPending'):
            receipt['cleanupVerified'] = False
            raise RuntimeError('container creation was not acknowledged; cleanup remains uncertain')
        if not receipt['cleanupVerified']:
            raise RuntimeError('container absence not confirmed')
    except Exception as error:
        receipt['cleanupError'] = str(error)
    receipt['cleanupCheckedAt'] = time.time()
    return receipt
