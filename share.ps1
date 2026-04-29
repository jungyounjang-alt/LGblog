# 본인 PC를 통한 공유 (가입 없는 모드 - 로컬 터널)
# 사용법: PowerShell에서 ".\share.ps1" 실행
# 종료: Ctrl+C
#
# 본인 PC가 켜져 있는 동안만 외부에서 접속 가능합니다.
# PC 슬립 방지: Windows → 설정 → 시스템 → 전원 → "절대 안 함"

$ErrorActionPreference = "Continue"

$SUBDOMAIN = if ($env:SHARE_SUBDOMAIN) { $env:SHARE_SUBDOMAIN } else { "lgblog-yj" }
$env:NODE_ENV = "production"

Write-Host ""
Write-Host "=== 1/2  React 프로덕션 빌드 ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "빌드 실패. 중단." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== 2/2  서버 + 터널 동시 기동 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "터널이 'your url is: https://...' 줄을 출력하면 그 URL을 그대로 공유:" -ForegroundColor Yellow
Write-Host ""
Write-Host "(처음 접속 시 localtunnel이 'Click to Continue' 안내 페이지 나옴 — 한 번 클릭이면 통과)" -ForegroundColor Yellow
Write-Host ""
Write-Host "종료하려면 Ctrl+C." -ForegroundColor Cyan
Write-Host ""

npx --yes concurrently -k -n "server,tunnel" -c "magenta,green" `
    "npm run start" `
    "npx --yes localtunnel --port 3001 --subdomain $SUBDOMAIN"
