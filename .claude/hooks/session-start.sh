#!/bin/bash
# SessionStart: クラウド環境（Claude Code on the web）で依存をインストールする
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR"
pnpm install --frozen-lockfile
