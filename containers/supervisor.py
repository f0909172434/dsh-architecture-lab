#!/usr/bin/env python3
"""Trusted guest controller. Run as a transient systemd unit, never in the trial.

A separate ExecStopPost removes the named container even if this controller is
killed. Docker's PID namespace, not a process-tree scan, owns all descendants.
"""
import json
import os
import re
import selectors
import subprocess
import sys
import time
from receipt import ROOT, cleanup, docker, save as save_receipt, validate_id
MAX_OUTPUT = 1024 * 1024
MAX_DURATION = 600
LEASE_SECONDS = 5


def emit(value):
    try:
        print('ARCHITECTURE_CONTAINER=' + json.dumps(value, separators=(',', ':')), flush=True)
    except BrokenPipeError:
        pass


def validate(config):
    if not isinstance(config, dict):
        raise ValueError('invalid run identity')
    validate_id(config.get('runId'))
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', config.get('image', '')):
        raise ValueError('immutable local image ID required')
    if type(config.get('timeoutMs')) is not int or not 1 <= config['timeoutMs'] <= MAX_DURATION * 1000:
        raise ValueError('invalid deadline')
    command = config.get('command')
    if not isinstance(command, list) or not command or not all(isinstance(x, str) and '\x00' not in x for x in command):
        raise ValueError('invalid command')
    env = config.get('env', {})
    allowed = {'DSH_HOME', 'DSH_PERMISSION_MODE', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_API_KEY', 'DSH_OFFLINE_PROBE'}
    if not isinstance(env, dict) or not set(env).issubset(allowed) or not all(isinstance(v, str) and '\x00' not in v for v in env.values()):
        raise ValueError('invalid child environment')
    if 'DEEPSEEK_API_KEY' in env and not re.fullmatch(r'[a-f0-9]{64}', env['DEEPSEEK_API_KEY']):
        raise ValueError('provider keys may not enter a container')
    return config


def read_config():
    data = b''
    deadline = time.monotonic() + LEASE_SECONDS
    selector = selectors.DefaultSelector()
    selector.register(sys.stdin.buffer, selectors.EVENT_READ)
    try:
        while b'\n' not in data:
            if not selector.select(max(0, deadline - time.monotonic())):
                raise ValueError('configuration deadline')
            chunk = os.read(sys.stdin.fileno(), 4096)
            if not chunk:
                raise ValueError('controller disconnected before configuration')
            data += chunk
            if len(data) > 128 * 1024:
                raise ValueError('configuration too large')
        first, rest = data.split(b'\n', 1)
        return validate(json.loads(first)), rest
    finally:
        selector.close()


def main():
    started = time.monotonic()
    config, pending = read_config()
    run_id = config['runId']
    if len(sys.argv) != 2 or validate_id(sys.argv[1]) != run_id:
        raise ValueError('systemd and configuration identity mismatch')
    name = 'dsh-lab-' + run_id
    directory = ROOT / run_id
    if directory.is_symlink() or directory.resolve() != directory:
        raise ValueError('invalid run directory')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    receipt_path = directory / 'supervisor.json'
    if receipt_path.exists():
        raise ValueError('run identity already used')
    receipt = {'schemaVersion': 1, 'runId': run_id, 'containerName': name, 'image': config['image'], 'startedAt': time.time(), 'cleanupVerified': False}

    def save():
        save_receipt(directory, receipt)

    save()
    args = ['create', '--name', name, '--label', 'dsh.architecture.run=' + run_id,
            '--pull=never', '--init', '--network=none', '--read-only', '--cap-drop=ALL', '--log-driver=none',
            '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=1536m', '--cpus=1',
            '--ulimit=nofile=1024:1024', '--ulimit=core=0:0', '--user=1000:1000', '--workdir=/work',
            '--tmpfs=/tmp:rw,nosuid,nodev,size=128m', '--env=HOME=/home/lab', '--env=TZ=UTC', '--env=LANG=C.UTF-8']
    for source, target in [('workspace', '/work'), ('home', '/home/lab'), ('memory', '/memory')]:
        path = directory / source
        if path.is_symlink():
            raise ValueError('invalid trial mount')
        path.mkdir(exist_ok=True)
        os.chown(path, 1000, 1000)
        args += ['--mount', f'type=bind,src={path},dst={target}']
    for key, value in config.get('env', {}).items():
        args += ['--env', key + '=' + value]
    args += [config['image'], *config['command']]
    child = None
    reason = None
    selector = selectors.DefaultSelector()
    stdout, stderr = bytearray(), bytearray()
    total = 0
    try:
        created = docker(*args)
        if created.returncode:
            raise RuntimeError('container creation failed: ' + created.stderr[-1000:])
        container_id = created.stdout.strip()
        if not re.fullmatch(r'[a-f0-9]{64}', container_id):
            raise RuntimeError('invalid container identity')
        receipt['containerId'] = container_id
        save()
        emit({'event': 'created', 'runId': run_id, 'containerId': container_id})
        child = subprocess.Popen(['/usr/bin/docker', 'start', '--attach', container_id], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        selector.register(sys.stdin.buffer, selectors.EVENT_READ, 'control')
        selector.register(child.stdout, selectors.EVENT_READ, 'stdout')
        selector.register(child.stderr, selectors.EVENT_READ, 'stderr')
        deadline = started + config['timeoutMs'] / 1000
        last_heartbeat = time.monotonic()
        while True:
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                if line == b'alive':
                    last_heartbeat = time.monotonic()
                elif line == b'stop':
                    reason = 'cancelled'
                else:
                    reason = 'invalid_control'
            if len(pending) > 128:
                reason = 'invalid_control'
            now = time.monotonic()
            if now >= deadline:
                reason = 'timeout'
            elif now - last_heartbeat > LEASE_SECONDS:
                reason = 'controller_lost'
            if reason:
                break
            # Drain both streams before accepting normal container completion.
            if child.poll() is not None and not any(key.data in ('stdout', 'stderr') for key in selector.get_map().values()):
                break
            for key, _ in selector.select(0.1):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if key.data == 'control':
                    if not chunk:
                        reason = 'controller_lost'
                    else:
                        pending += chunk
                elif not chunk:
                    selector.unregister(key.fileobj)
                else:
                    total += len(chunk)
                    if total > MAX_OUTPUT:
                        reason = 'output_limit'
                    else:
                        (stdout if key.data == 'stdout' else stderr).extend(chunk)
        inspected = docker('inspect', container_id, '--format', '{{json .State}}')
        if inspected.returncode == 0:
            receipt['stateBeforeCleanup'] = json.loads(inspected.stdout)
        receipt.update(reason=reason,stdout=stdout.decode('utf8', errors='replace'),stderr=stderr.decode('utf8', errors='replace'))
    except Exception as error:
        receipt.update(reason='supervisor_error', error=str(error))
    finally:
        selector.close()
        cleanup(run_id, receipt)
        if child:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
        receipt['finishedAt'] = time.time()
        save()
        emit({'event': 'finished', **receipt})
    return 0 if receipt['cleanupVerified'] else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        emit({'event': 'error', 'error': str(error)})
        sys.exit(1)
