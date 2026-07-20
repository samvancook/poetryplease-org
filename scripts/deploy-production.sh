#!/bin/zsh
set -euo pipefail

EXPECTED_REPO="/Users/buttonpublishingone/Desktop/CODEX/Poetry Please/poetry-please"
EXPECTED_PROJECT="poetry-please"
SCOPE="${1:-functions,hosting}"

if [[ "$(pwd -P)" != "$EXPECTED_REPO" ]]; then
  echo "Refusing deploy: run this script from $EXPECTED_REPO" >&2
  exit 1
fi

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
  grep -q '"node": "20"' functions/package.json || {
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

