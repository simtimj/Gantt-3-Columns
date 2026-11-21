#!/usr/bin/env bash
# Gantt API router deploy (2026-11-21, docs/NOTES.md H). Run by deploy.yaml after the main clasp push.
# First run creates the standalone "Gantt API" project + web app deployment and saves the ids in project.json
# (committed back). Later runs redeploy only when Router.gs.txt / appsscript.json.txt change: the router runs
# this project's code as a library in development mode, so ordinary pushes need no new router version.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
P=tools/pwa-api/project.json
get() { node -e 'let p={};try{p=require("./tools/pwa-api/project.json")}catch(e){};process.stdout.write(String(p[process.argv[1]]||""))' "$1"; }
SCRIPT_ID=$(get scriptId); DEP_ID=$(get deploymentId); OLD_HASH=$(get hash)

# The library needs an existing version number (development mode ignores it and runs the latest code).
LIB_V=$(get libVersion)
if [ -z "$LIB_V" ]; then
  LIB_V=$(clasp list-versions 2>/dev/null | grep -oE '^[^0-9]*[0-9]+' | grep -oE '[0-9]+' | sort -n | head -1 || true)
  LIB_V=${LIB_V:-1}
fi
W=$(mktemp -d)
sed "s/\"version\": \"1\"/\"version\": \"$LIB_V\"/" tools/pwa-api/appsscript.json.txt > "$W/manifest.json"
SRC_HASH=$(cat tools/pwa-api/Router.gs.txt "$W/manifest.json" | sha1sum | cut -c1-12)

if [ -z "$SCRIPT_ID" ]; then
  mkdir "$W/new" && (cd "$W/new" && clasp create-script --type standalone --title "Gantt API" --rootDir .)
  SCRIPT_ID=$(node -e 'process.stdout.write(require(process.argv[1]).scriptId)' "$W/new/.clasp.json")
  echo "Created Gantt API project $SCRIPT_ID"
fi
mkdir -p "$W/p"
printf '{"scriptId":"%s","rootDir":"."}' "$SCRIPT_ID" > "$W/p/.clasp.json"

if [ "$SRC_HASH" = "$OLD_HASH" ] && [ -n "$DEP_ID" ]; then
  echo "Router unchanged — no redeploy."
else
  cp tools/pwa-api/Router.gs.txt "$W/p/Router.gs"
  cp "$W/manifest.json" "$W/p/appsscript.json"
  (cd "$W/p" && clasp push --force)
  if [ -z "$DEP_ID" ]; then
    OUT=$(cd "$W/p" && clasp create-deployment --description "Gantt PWA API")
  else
    OUT=$(cd "$W/p" && clasp create-deployment -i "$DEP_ID" --description "Gantt PWA API")
  fi
  echo "$OUT"
  [ -n "$DEP_ID" ] || DEP_ID=$(echo "$OUT" | grep -oE 'AKfy[A-Za-z0-9_-]+' | head -1)
  [ -n "$DEP_ID" ] || { echo "Could not read the deployment id"; exit 1; }
fi

URL="https://script.google.com/macros/s/$DEP_ID/exec"
node -e 'const [s,d,u,h,v]=process.argv.slice(1);require("fs").writeFileSync("tools/pwa-api/project.json",JSON.stringify({scriptId:s,deploymentId:d,url:u,hash:h,libVersion:v,editor:"https://script.google.com/d/"+s+"/edit"},null,2)+"\n")' \
  "$SCRIPT_ID" "$DEP_ID" "$URL" "$SRC_HASH" "$LIB_V"
[ -n "${GITHUB_OUTPUT:-}" ] && echo "url=$URL" >> "$GITHUB_OUTPUT"

if ! git diff --quiet -- "$P"; then
  git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -m "Gantt API router ids (automatic)" -- "$P"
  for i in 1 2 3; do git pull --rebase -q origin main && git push -q origin HEAD:main && break; sleep 3; done
fi
