#!/usr/bin/env bash
# 플랫폼트리 AI 애니메이션 릴스 스킬 설치 (Mac)
# 사용법: 터미널(또는 Claude에게 부탁)에 아래 한 줄 붙여넣기
#   curl -fsSL https://raw.githubusercontent.com/codmsdncodusdn-web/platformtree-claude-skills/main/install-anim-reel.sh | bash
#
# 하는 일 (관리자 비밀번호 필요 없음)
#   1) Node.js 22 이상이 없으면 내 폴더(~/.platformtree-skills/node)에 받아서 PATH에 추가
#   2) 스킬을 ~/.claude/skills/anim-reel 에 복사
#   3) 영상 렌더링 도구 · FFmpeg · 렌더용 Chrome · AI 목소리 도구를 스킬 폴더와 내 폴더에 설치

set -euo pipefail
REPO="codmsdncodusdn-web/platformtree-claude-skills"
SKILL="anim-reel"
STATE="$HOME/.platformtree-skills"
mkdir -p "$STATE"

node_major() { command -v node >/dev/null 2>&1 && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

echo
echo "=== AI 애니메이션 릴스 스킬 설치 ==="

# 1) Node.js
NODE_DIR="$STATE/node"
[ -x "$NODE_DIR/bin/node" ] && export PATH="$NODE_DIR/bin:$PATH"
if [ "$(node_major)" -lt 22 ]; then
  echo "[1/3] Node.js 22 받는 중..."
  case "$(uname -m)" in arm64|aarch64) ARCH=arm64 ;; *) ARCH=x64 ;; esac
  case "$(uname -s)" in Darwin) OS=darwin ;; *) OS=linux ;; esac
  FILE="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -oE "node-v22\.[0-9.]+-$OS-$ARCH\.tar\.gz" | head -1)"
  [ -n "$FILE" ] || { echo "Node.js 다운로드 주소를 찾지 못했어요."; exit 1; }
  TMPN="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$FILE" | tar -xz -C "$TMPN"
  rm -rf "$NODE_DIR"
  mv "$TMPN/${FILE%.tar.gz}" "$NODE_DIR"
  rm -rf "$TMPN"
  export PATH="$NODE_DIR/bin:$PATH"
  LINE='export PATH="$HOME/.platformtree-skills/node/bin:$PATH"'
  for RC in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile"; do
    if [ -f "$RC" ] || [ "$RC" = "$HOME/.zprofile" ]; then
      grep -qF '.platformtree-skills/node/bin' "$RC" 2>/dev/null || printf '\n# 플랫폼트리 스킬용 Node.js\n%s\n' "$LINE" >> "$RC"
    fi
  done
  echo "      Node.js $(node -v) -> $NODE_DIR"
else
  echo "[1/3] Node.js $(node -v) 있음"
fi

# 2) 스킬 복사 (업데이트 때는 이미 설치된 도구 node_modules를 살려 둠)
echo "[2/3] 스킬 내려받는 중..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/$REPO/archive/refs/heads/main.tar.gz" | tar -xz -C "$TMP"
ROOT="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
DEST="$HOME/.claude/skills/$SKILL"
mkdir -p "$(dirname "$DEST")"
[ -d "$DEST/node_modules" ] && mv "$DEST/node_modules" "$TMP/node_modules_keep"
rm -rf "$DEST"
cp -R "$ROOT/plugins/$SKILL/skills/$SKILL" "$DEST"
[ -d "$TMP/node_modules_keep" ] && mv "$TMP/node_modules_keep" "$DEST/node_modules"
echo "      -> $DEST"

# 3) 도구 설치 + 점검
echo "[3/3] 영상 렌더링 도구 · 음성 생성 도구 · 자막/애니메이션 도구 설치 중... (처음엔 3~5분)"
if node "$DEST/tools/reel.mjs" doctor --fix; then
  echo
  echo "설치 완료! Claude 앱을 껐다 켠 뒤, 작업 폴더를 연결하고 이렇게 말해 보세요:"
  echo '  "인스타그램 꿀팁 3가지 애니메이션 릴스로 만들어줘"'
else
  echo
  echo "일부 설치가 끝나지 않았어요. 인터넷 연결을 확인하고 이 명령을 다시 실행하거나,"
  echo 'Claude에게 "애니메이션 릴스 환경 점검해줘"라고 말해 주세요.'
fi
