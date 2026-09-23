#!/usr/bin/env python3
"""Trusted entry point; systemd owns lifetime independently of SSH/the host."""
import os
import sys
from receipt import validate_id

run_id = validate_id(sys.argv[1])
root = '/opt/dsh-architecture-lab'
os.execv('/usr/bin/systemd-run', [
    'systemd-run', '--quiet', '--pipe', '--wait', '--collect',
    '--unit=dsh-lab-' + run_id, '--service-type=exec',
    '--property=RuntimeMaxSec=630', '--property=TimeoutStopSec=45',
    '--property=KillMode=control-group',
    '--property=ExecStopPost=/usr/bin/python3 ' + root + '/cleanup.py ' + run_id,
    '/usr/bin/python3', root + '/supervisor.py', run_id,
])
