import unittest
from types import SimpleNamespace
from unittest.mock import patch
import json
import tempfile
from pathlib import Path
import os

import receipt
from supervisor import validate, execution_deadline
from files import relative, export

RUN = '12345678-1234-1234-1234-123456789abc'
IMAGE = 'sha256:' + 'a' * 64
IDENTITY = 'b' * 64


def result(stdout='', code=0):
    return SimpleNamespace(stdout=stdout, stderr='', returncode=code)


class SupervisorTests(unittest.TestCase):
    def test_absolute_deadline_never_grants_a_fresh_timeout(self):
        with patch('supervisor.time.monotonic', return_value=100), patch('supervisor.time.time', return_value=1000):
            self.assertEqual(execution_deadline(self.config(deadlineAt=1000500), 100), 100.5)
            self.assertEqual(execution_deadline(self.config(deadlineAt=999000), 100), 99)
            self.assertEqual(execution_deadline(self.config(deadlineAt=1009000), 100), 101)
        for value in [True, '1000500', -1, 1.5]:
            with self.assertRaises(ValueError):
                validate(self.config(deadlineAt=value))

    def test_file_exchange_rejects_paths_and_unconfirmed_cleanup(self):
        for path in ['/etc/passwd', 'workspace/../other', 'workspace//double', 'home/./dot', 'workspace\\other', 'supervisor.json']:
            with self.assertRaises(ValueError):
                relative(path)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'supervisor.json').write_text(json.dumps({'cleanupVerified': False}))
            with self.assertRaises(ValueError):
                export(root)

    def test_file_exchange_rejects_candidate_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'supervisor.json').write_text(json.dumps({'cleanupVerified': True, 'systemdCleanupCheckedAt': 1}))
            work = root / 'workspace'
            work.mkdir()
            target = root / 'outside'
            target.write_text('must not export')
            (work / 'link').symlink_to(target)
            with self.assertRaises(ValueError):
                export(root)
            (work / 'link').unlink()
            os.link(target, work / 'link')
            with self.assertRaises(ValueError):
                export(root)

    def config(self, **updates):
        return dict(runId=RUN, image=IMAGE, timeoutMs=1000, command=['node', '-e', '0'], **updates)

    def test_reject_credentials_and_unbounded_controls(self):
        for env in [{'DEEPSEEK_API_KEY': 'sk-provider-key'}, {'AWS_SECRET_ACCESS_KEY': 'x'}]:
            with self.assertRaises(ValueError):
                validate(self.config(env=env))
        for field, value in [('runId', '../' * 12), ('image', 'node:latest'), ('timeoutMs', 600001), ('timeoutMs', True), ('command', ['node', '\x00'])]:
            config = self.config()
            config[field] = value
            with self.assertRaises(ValueError):
                validate(config)

    def test_unreachable_daemon_retains_uncertainty(self):
        data = {'image': IMAGE, 'cleanupVerified': True}
        with patch('receipt.docker', side_effect=TimeoutError('daemon unreachable')):
            receipt.cleanup(RUN, data)
        self.assertFalse(data['cleanupVerified'])
        self.assertIn('daemon unreachable', data['cleanupError'])

    def test_reused_name_cannot_delete_different_container(self):
        item = {'Name': '/dsh-lab-' + RUN, 'Image': IMAGE, 'Config': {'Labels': {'dsh.architecture.run': RUN}}}
        data = {'image': IMAGE, 'containerId': 'c' * 64}
        with patch('receipt.docker', side_effect=[result(IDENTITY), result(json.dumps([item]))]) as docker:
            receipt.cleanup(RUN, data)
        self.assertFalse(data['cleanupVerified'])
        self.assertEqual(docker.call_count, 2)
        self.assertIn('identity mismatch', data['cleanupError'])

    def test_verified_absence_requires_working_daemon(self):
        data = {'image': IMAGE}
        with patch('receipt.docker', side_effect=[result(), result(code=1)]):
            receipt.cleanup(RUN, data)
        self.assertFalse(data['cleanupVerified'])
        with patch('receipt.docker', return_value=result()):
            receipt.cleanup(RUN, data)
        self.assertTrue(data['cleanupVerified'])

    def test_inflight_creation_cannot_be_cleared_by_empty_inventory(self):
        data = {'image': IMAGE, 'creationPending': True}
        with patch('receipt.docker', return_value=result()):
            receipt.cleanup(RUN, data)
        self.assertFalse(data['cleanupVerified'])
        self.assertIn('not acknowledged', data['cleanupError'])

    def test_normal_exit_and_removal_use_immutable_identity(self):
        item = {'Name': '/dsh-lab-' + RUN, 'Image': IMAGE, 'Config': {'Labels': {'dsh.architecture.run': RUN}}, 'State': {'Running': False, 'ExitCode': 7}}
        data = {'image': IMAGE, 'containerId': IDENTITY}
        with patch('receipt.docker', side_effect=[result(IDENTITY), result(json.dumps([item])), result(), result()]) as docker:
            receipt.cleanup(RUN, data)
        self.assertTrue(data['cleanupVerified'])
        self.assertEqual(data['exitCode'], 7)
        self.assertEqual(docker.call_args_list[2].args, ('rm', '--force', IDENTITY))


if __name__ == '__main__':
    unittest.main()
