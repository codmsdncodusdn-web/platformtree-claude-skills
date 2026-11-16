# 플랫폼트리 AI 애니메이션 릴스 스킬 설치 (Windows)
# 사용법: PowerShell(또는 Claude에게 부탁)에 아래 한 줄 붙여넣기
#   irm https://raw.githubusercontent.com/codmsdncodusdn-web/platformtree-claude-skills/main/install-anim-reel.ps1 | iex
#
# 하는 일 (관리자 권한 필요 없음)
#   1) Node.js 22 이상이 없으면 내 폴더(~/.platformtree-skills/node)에 받아서 PATH에 추가
#   2) 스킬을 ~/.claude/skills/anim-reel 에 복사
#   3) 영상 렌더링 도구 · FFmpeg · 렌더용 Chrome · AI 목소리 도구를 스킬 폴더와 내 폴더에 설치

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$repo = 'codmsdncodusdn-web/platformtree-claude-skills'
$skill = 'anim-reel'
$state = Join-Path $HOME '.platformtree-skills'
New-Item -ItemType Directory -Force -Path $state | Out-Null

function Get-NodeMajor {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if (-not $n) { return 0 }
  # node -v 출력(v24.1.0)에서 주 버전만 (PowerShell 5.1은 인자 속 큰따옴표를 지워서 node -p 식을 못 씀)
  try { $v = (& node -v) 2>$null; if ($v -match '^v(\d+)') { return [int]$Matches[1] } else { return 0 } } catch { return 0 }
}

Write-Host ''
Write-Host '=== AI 애니메이션 릴스 스킬 설치 ===' -ForegroundColor Cyan

# 1) Node.js
$nodeDir = Join-Path $state 'node'
if (Test-Path (Join-Path $nodeDir 'node.exe')) { $env:Path = "$nodeDir;$env:Path" }
if ((Get-NodeMajor) -lt 22) {
  Write-Host '[1/3] Node.js 22 받는 중...'
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $sums = (Invoke-WebRequest 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt' -UseBasicParsing).Content
  $file = ([regex]::Match($sums, "node-v22\.[0-9.]+-win-$arch\.zip")).Value
  if (-not $file) { throw 'Node.js 다운로드 주소를 찾지 못했어요.' }
  $tmpN = Join-Path $env:TEMP ('node-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmpN | Out-Null
  $zipN = Join-Path $tmpN $file
  Invoke-WebRequest "https://nodejs.org/dist/latest-v22.x/$file" -OutFile $zipN -UseBasicParsing
  Expand-Archive -Path $zipN -DestinationPath $tmpN -Force
  if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
  Move-Item (Join-Path $tmpN ($file -replace '\.zip$', '')) $nodeDir
  Remove-Item -Recurse -Force $tmpN -ErrorAction SilentlyContinue
  $env:Path = "$nodeDir;$env:Path"
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $userPath) { $userPath = '' }
  if ($userPath -notlike "*$nodeDir*") { [Environment]::SetEnvironmentVariable('Path', "$nodeDir;$userPath", 'User') }
  Write-Host "      Node.js $(& node -v) -> $nodeDir"
} else {
  Write-Host "[1/3] Node.js $(& node -v) 있음"
}

# 2) 스킬 복사 (업데이트 때는 이미 설치된 도구 node_modules를 살려 둠)
Write-Host '[2/3] 스킬 내려받는 중...'
$tmp = Join-Path $env:TEMP ('platformtree-skills-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'repo.zip'
  Invoke-WebRequest "https://github.com/$repo/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $root = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  $dest = Join-Path $HOME ".claude\skills\$skill"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  $keep = Join-Path $tmp 'node_modules_keep'
  if (Test-Path (Join-Path $dest 'node_modules')) { Move-Item (Join-Path $dest 'node_modules') $keep }
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Copy-Item -Recurse -Path (Join-Path $root.FullName "plugins\$skill\skills\$skill") -Destination $dest
  if (Test-Path $keep) { Move-Item $keep (Join-Path $dest 'node_modules') }
  Write-Host "      -> $dest"
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# 3) 도구 설치 + 점검
Write-Host '[3/3] 영상 렌더링 도구 · 음성 생성 도구 · 자막/애니메이션 도구 설치 중... (처음엔 3~5분)'
& node (Join-Path $dest 'tools\reel.mjs') doctor --fix
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '일부 설치가 끝나지 않았어요. 인터넷 연결을 확인하고 이 명령을 다시 실행하거나,' -ForegroundColor Yellow
  Write-Host 'Claude에게 "애니메이션 릴스 환경 점검해줘"라고 말해 주세요.' -ForegroundColor Yellow
} else {
  Write-Host ''
  Write-Host '설치 완료! Claude 앱을 껐다 켠 뒤, 작업 폴더를 연결하고 이렇게 말해 보세요:' -ForegroundColor Green
  Write-Host '  "인스타그램 꿀팁 3가지 애니메이션 릴스로 만들어줘"' -ForegroundColor Green
}
