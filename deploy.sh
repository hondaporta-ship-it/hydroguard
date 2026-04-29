#!/usr/bin/env bash
set -e
REPO_OWNER="hondaporta-ship-it"
REPO_NAME="hydroguard"
BRANCH="main"
cd "$(dirname "$0")"
command -v git >/dev/null 2>&1 || { echo "git が必要です"; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "gh CLI が必要です: brew install gh && gh auth login"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh auth login を実行してください"; exit 1; }
for f in index.html bundle.js styles.css manifest.json icon-192.png icon-512.png; do
  [ -f "$f" ] || { echo "$f が見つかりません"; exit 1; }
done
if [ -d ".git" ]; then
  git add -A
  git diff --cached --quiet || git commit -m "Update $(date '+%Y-%m-%d %H:%M')"
  git push -u origin ${BRANCH}
else
  gh repo view "${REPO_OWNER}/${REPO_NAME}" >/dev/null 2>&1 || \
    gh repo create "${REPO_OWNER}/${REPO_NAME}" --public --description "ATS 屋外警備 熱中症予防アプリ - HydroGuard" >/dev/null
  git init -b ${BRANCH} >/dev/null 2>&1 || git init >/dev/null 2>&1
  git checkout -B ${BRANCH} >/dev/null 2>&1
  git add -A
  git commit -m "Initial deploy: HydroGuard v0.2" >/dev/null
  git remote add origin "https://github.com/${REPO_OWNER}/${REPO_NAME}.git" 2>/dev/null || true
  git push -u origin ${BRANCH}
fi
gh api "repos/${REPO_OWNER}/${REPO_NAME}/pages" >/dev/null 2>&1 || \
  gh api "repos/${REPO_OWNER}/${REPO_NAME}/pages" --method POST -f "source[branch]=${BRANCH}" -f "source[path]=/" >/dev/null 2>&1 || true
URL="https://${REPO_OWNER}.github.io/${REPO_NAME}/"
echo ""
echo "✅ デプロイ完了"
echo "公開URL: ${URL}"
echo ""
echo "隊員別URL:"
echo "  01 川村蓮（隊長）: ${URL}?id=01"
echo "  02 大田学: ${URL}?id=02"
echo "  03 木村勇輝: ${URL}?id=03"
echo "  04 許斐亮太郎: ${URL}?id=04"
echo "  05 小林拓光: ${URL}?id=05"
