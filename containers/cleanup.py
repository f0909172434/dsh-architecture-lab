#!/usr/bin/env python3
"""systemd ExecStopPost: cleanup survives abrupt supervisor termination."""
import json
import sys
import time
from receipt import ROOT, cleanup, save, validate_id

run_id = validate_id(sys.argv[1])
directory = ROOT / run_id
path = directory / 'supervisor.json'
# A supervisor killed before creating evidence has not called Docker yet.
if not path.exists():
    sys.exit(0)
receipt = json.loads(path.read_text())
if receipt['runId'] != run_id:
    raise ValueError('receipt identity mismatch')
if 'finishedAt' not in receipt:
    receipt.update(reason='supervisor_lost', finishedAt=time.time())
cleanup(run_id, receipt)
receipt['systemdCleanupCheckedAt'] = time.time()
save(directory, receipt)
sys.exit(0 if receipt['cleanupVerified'] else 1)
