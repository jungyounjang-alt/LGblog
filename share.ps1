# 협력업체와 공유 (가입 없는 모드 - 본인 PC를 통한 터널)
# 사용법: PowerShell에서 ".\share.ps1" 실행
# 종료: Ctrl+C
#
# 처음 실행 전: .env.local.example을 .env.local로 복사하고 토큰을 채워주세요.
# 본인 PC가 켜져 있는 동안만 협력업체가 접속할 수 있습니다.
# PC 슬립 방지: Windows → 설정 → 시스템 → 전원 → "절대 안 함"

$ErrorActionPreference = "Continue"

# .env.local에서 토큰 로드
$envFile = Join-Path $PSScriptRoot ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "❌ .env.local 파일이 없습니다." -ForegroundColor Red
    Write-Host ""
    Write-Host ".env.local.example을 .env.local로 복사한 뒤 토큰 값을 채우세요:" -ForegroundColor Yellow
    Write-Host "  Copy-Item .env.local.example .env.local" -ForegroundColor Cyan
    Write-Host "  notepad .env.local" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([A-Z_]+)\s*=\s*(.+)\s*$") {
        $name = $matches[1]
        $value = $matches[2].Trim('"').Trim("'")
        Set-Item -Path "env:$name" -Value $value
    }
}

if (-not $env:ADMIN_TOKEN -or -not $env:PARTNER_TOKEN) {
    Write-Host "❌ ADMIN_TOKEN / PARTNER_TOKEN이 .env.local에 설정되지 않았습니다." -ForegroundColor Red
    exit 1
}

$SUBDOMAIN = if ($env:SHARE_SUBDOMAIN) { $env:SHARE_SUBDOMAIN } else { "lgblog-yj" }
$env:NODE_ENV = "production"

Write-Host ""
Write-Host "=== 1/3  React 프로덕션 빌드 ===" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "빌드 실패. 중단." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== 2/3  서버 + 터널 동시 기동 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "터널이 'your url is: https://...' 줄을 출력하면 그 URL을 아래와 함께 공유:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  본인용:     <URL>/?token=$($env:ADMIN_TOKEN)" -ForegroundColor Green
Write-Host "  협력업체용: <URL>/?token=$($env:PARTNER_TOKEN)" -ForegroundColor Green
Write-Host ""
Write-Host "(처음 접속 시 localtunnel이 'Click to Continue' 안내 페이지를 보여줍니다." -ForegroundColor Yellow
Write-Host " 한 번 클릭이면 통과됩니다)" -ForegroundColor Yellow
Write-Host ""
Write-Host "종료하려면 Ctrl+C." -ForegroundColor Cyan
Write-Host ""

npx --yes concurrently -k -n "server,tunnel" -c "magenta,green" `
    "npm run start" `
    "npx --yes localtunnel --port 3001 --subdomain $SUBDOMAIN"
