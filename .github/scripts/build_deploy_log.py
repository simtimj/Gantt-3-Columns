"""Create Apps Script's deployment ledger without credentials or API calls.

Read first-parent main history so merged PRs produce one entry, not duplicate
branch/merge entries. Keep every entry since enablement: changes made while the
app is closed still reach Done Log on its next load. Output is deployed, not
committed. No historical task states are inferred from commit text.
"""
import datetime
import json
import pathlib
import subprocess
from zoneinfo import ZoneInfo

BASELINE = "cf417e158509f1ce5942ec01c25155a31bed6962"


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def build_entries():
    entries = []
    commits = git("rev-list", "--first-parent", "--reverse", BASELINE + "..HEAD").splitlines()
    for sha in commits:
        files = git("diff-tree", "--no-commit-id", "--name-only", "-r", sha + "^", sha).splitlines()
        code = [name for name in files if name.endswith((".gs", ".js", ".html"))]
        if not code:
            continue
        title = git("show", "-s", "--format=%s", sha)
        body = git("show", "-s", "--format=%B", sha).lower()
        by = "ChatGPT" if any(word in body for word in ("chatgpt", "codex", "co-authored-by: openai")) else "Claude" if "co-authored-by: claude" in body else "Julius"
        timestamp = int(git("show", "-s", "--format=%ct", sha))
        date = datetime.datetime.fromtimestamp(timestamp, ZoneInfo("America/Los_Angeles")).date().isoformat()
        entries.append({"sha": sha, "date": date, "title": title[:300], "by": by,
                        "details": "Files: " + ", ".join(code)[:3000] + "\nhttps://github.com/simtimj/Gantt-3-Columns/commit/" + sha})
    return entries


if __name__ == "__main__":
    pathlib.Path("DeployLog.gs").write_text("// Generated during deployment; do not edit.\nconst FW_DEPLOY_LOG = " + json.dumps(build_entries(), ensure_ascii=True) + ";\n")
