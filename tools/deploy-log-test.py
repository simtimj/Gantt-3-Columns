"""Check release identity generation without git credentials or any live deploy."""
import contextlib
import json
import pathlib
import runpy
import tempfile
from unittest.mock import patch

script = pathlib.Path('.github/scripts/build_deploy_log.py').resolve()
release = '1234567890abcdef1234567890abcdef12345678'

def fake_git(command, **kwargs):
    if command == ['git', 'rev-parse', 'HEAD']:
        return release + '\n'
    if command[:2] == ['git', 'rev-list']:
        return ''  # Identity still exists when there are no automatic Done Log entries.
    raise AssertionError(command)

with tempfile.TemporaryDirectory() as directory, contextlib.chdir(directory):
    with patch('subprocess.check_output', side_effect=fake_git):
        runpy.run_path(str(script), run_name='__main__')
    lines = pathlib.Path('DeployLog.gs').read_text().splitlines()
    assert json.loads(lines[1].removeprefix('const FW_DEPLOY_BUILD = ').removesuffix(';')) == release
    assert json.loads(lines[2].removeprefix('const FW_DEPLOY_LOG = ').removesuffix(';')) == []
print('✓ deployment manifest: exact HEAD release independent of Done Log history')
