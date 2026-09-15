#!/bin/zsh
set -euo pipefail

EXPECTED_REMOTE="samvancook/poetryplease-org"
EXPECTED_PROJECT="poetry-please"
SCOPE="${1:-functions,hosting}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "Refusing deploy: not inside a git repository" >&2
  exit 1
}
[[ "$(git remote get-url origin 2>/dev/null)" == *"$EXPECTED_REMOTE"* ]] || {
  echo "Refusing deploy: origin remote does not point at $EXPECTED_REMOTE" >&2
  exit 1
}
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || {
  echo "Refusing deploy: not on main" >&2
  exit 1
}
[[ -z "$(git status --porcelain)" ]] || {
  echo "Refusing deploy: working tree is not clean" >&2
  exit 1
}
git fetch origin main --quiet
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || {
  echo "Refusing deploy: local main does not match origin/main -- pull or push first" >&2
  exit 1
}

case "$SCOPE" in
  functions|hosting|functions,hosting) ;;
  *)
    echo "Refusing deploy: scope must be functions, hosting, or functions,hosting" >&2
    exit 1
    ;;
esac

if ! grep -q '"default": "poetry-please"' .firebaserc; then
  echo "Refusing deploy: .firebaserc does not target $EXPECTED_PROJECT" >&2
  exit 1
fi

if [[ "$SCOPE" == *functions* ]]; then
  grep -q '"node": "22"' functions/package.json || {
    echo "Refusing deploy: unexpected Node runtime" >&2
    exit 1
  }
  grep -q 'memory: "1GiB"' functions/index.js || {
    echo "Refusing deploy: expected function memory 1GiB" >&2
    exit 1
  }
  grep -q 'minInstances: 1' functions/index.js || {
    echo "Refusing deploy: expected minInstances 1" >&2
    exit 1
  }
fi

echo "Deploying $SCOPE from canonical Poetry Please repo to $EXPECTED_PROJECT"
firebase deploy --only "$SCOPE" --project "$EXPECTED_PROJECT" --force

health="$(curl --max-time 30 -fsS https://poetryplease.org/api/healthz)"
[[ "$health" == *'"ok":true'* ]] || {
  echo "Deploy completed, but public health verification failed: $health" >&2
  exit 1
}

bootstrap="$(curl --max-time 30 -fsS \
  -H 'content-type: application/json' \
  --data '{"anonId":"deploy-verification","limit":10,"includeRatingsSummary":false}' \
  https://poetryplease.org/api/bootstrap)"
[[ "$bootstrap" == *'"newGraphics"'* ]] || {
  echo "Deploy completed, but anonymous bootstrap verification failed" >&2
  exit 1
}

echo "Production verification passed: public health and anonymous bootstrap are available."
