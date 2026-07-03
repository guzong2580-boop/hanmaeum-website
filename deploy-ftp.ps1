# 한마음일터 deploy/ → daprint.kr FTP 업로드 + Cloudflare Purge 자동화
# 사용:
#   대화형  → ./deploy-ftp.ps1 실행 후 프롬프트에 비번 입력
#   비대화형 (전체 자동화):
#     $env:HM_FTP_PW     = '...'   # FTP 비번
#     $env:CF_PURGE_TOKEN = '...'  # Cloudflare API Token (Cache Purge 권한)
#     $env:CF_ZONE_ID    = '...'   # daprint.kr Zone ID
#     ./deploy-ftp.ps1
#     # 업로드 성공 시 자동으로 Cloudflare Purge Everything 호출
# 비번/토큰은 메모리·디스크 저장 안 함 (env var는 세션 종료 시 소멸)

$ErrorActionPreference = 'Stop'

$ftpHost = '220.73.160.36'
$ftpUser = 'guzong2'
$ftpRoot = '/'  # 로그인이 /www/에 떨어짐. /www/ prefix 쓰면 550
$localDir = "$PSScriptRoot\deploy"

if (-not (Test-Path $localDir)) {
    Write-Error "deploy/ 폴더 없음: $localDir"
    exit 1
}

# 1) 환경변수 우선 (비대화형 모드 지원)
if ($env:HM_FTP_PW) {
    $ftpPw = $env:HM_FTP_PW
    Write-Host "[INFO] `$env:HM_FTP_PW 사용" -ForegroundColor DarkGray
}
# 2) 대화형이면 Read-Host
elseif ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    $securePw = Read-Host "FTP 비밀번호 ($ftpUser@$ftpHost)" -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePw)
    $ftpPw = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
else {
    Write-Error "비대화형 모드: `$env:HM_FTP_PW='xxx' 설정 후 다시 실행"
    exit 2
}

# 업로드할 파일 목록 (admin.html은 사이트 운영에 매번 필요 — 영구 포함)
$files = @(
    'index.html',
    'about.html',
    'quote.html',
    'print.html',
    'community.html',
    'processing.html',
    'admin.html',
    'pay.html',
    'success.html',
    'fail.html',
    'privacy.html',
    'terms.html',
    'common.css',
    'common.js',
    'tailwind-built.css',
    'robots.txt',
    'sitemap.xml',
    # 페이지가 참조하는 webp 아닌 이미지 (webp만 자동 수집되므로 명시 필요)
    'logo.png',
    'map.png',
    '한마음로고 하단위치로고.png',
    'images/인쇄카테고리배경대체.jpg',
    'images/partners/lel_emblem.png',
    'images/partners/hosea_logo.png',
    'images/partners/shma_logo.jpg',
    'images/partners/gg.jpg',
    'images/partners/icheon_fav.ico',
    'images/partners/kead.svg',
    'images/partners/koddi_h1_logo2.png',
    'images/partners/ssis_logo.png'
)

# WebP 파일 자동 수집 (deploy/ 하위의 모든 .webp)
$webpFiles = Get-ChildItem -Path $localDir -Filter '*.webp' -Recurse -File
foreach ($w in $webpFiles) {
    $rel = $w.FullName.Substring($localDir.Length + 1) -replace '\\', '/'
    $files += $rel
}

# 히어로 슬라이드1 fallback JPG (preload/srcset에 참조됨)
$heroJpgs = @('한마음일터전경.jpg', '한마음일터전경-m.jpg')
foreach ($j in $heroJpgs) {
    if (Test-Path (Join-Path $localDir $j)) { $files += $j }
}

# 루트 → deploy/ 자동 동기화 (deploy/가 옛 버전으로 남아 옛 파일이 업로드되는 사고 방지)
$syncCount = 0
foreach ($f in $files) {
    $srcRoot   = Join-Path $PSScriptRoot ($f -replace '/', '\')
    $dstDeploy = Join-Path $localDir     ($f -replace '/', '\')
    if (-not (Test-Path $srcRoot)) { continue }
    $dstDir = Split-Path $dstDeploy -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
    $copy = $true
    if (Test-Path $dstDeploy) {
        $a = Get-Item $srcRoot; $b = Get-Item $dstDeploy
        if ($a.Length -eq $b.Length -and $a.LastWriteTimeUtc -le $b.LastWriteTimeUtc) { $copy = $false }
    }
    if ($copy) { Copy-Item -Force -Path $srcRoot -Destination $dstDeploy; $syncCount++ }
}
Write-Host "[SYNC] 루트 → deploy/ 동기화: $syncCount 개 파일" -ForegroundColor DarkGray

# 디렉토리 생성 함수 (중첩 폴더용)
function Ensure-FtpDir($remotePath) {
    $uri = "ftp://$ftpHost$ftpRoot$remotePath"
    try {
        $req = [System.Net.FtpWebRequest]::Create($uri)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
        $req.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPw)
        $req.UsePassive = $true
        $req.KeepAlive = $false
        $resp = $req.GetResponse()
        $resp.Close()
    } catch {
        # 이미 존재해도 무시 (550)
    }
}

# 필요한 디렉토리 사전 생성
$dirs = @{}
foreach ($f in $files) {
    if ($f -match '/') {
        $parts = $f -split '/'
        $cur = ''
        for ($i = 0; $i -lt $parts.Length - 1; $i++) {
            $cur = if ($cur) { "$cur/$($parts[$i])" } else { $parts[$i] }
            $dirs[$cur] = $true
        }
    }
}
foreach ($d in ($dirs.Keys | Sort-Object)) {
    Ensure-FtpDir $d
}

$ok = 0; $fail = 0
foreach ($f in $files) {
    $local = Join-Path $localDir ($f -replace '/', '\')
    if (-not (Test-Path $local)) {
        Write-Host "[SKIP] $f (로컬 없음)" -ForegroundColor Yellow
        continue
    }
    $uri = "ftp://$ftpHost$ftpRoot$f"
    # $ftpRoot='/' 이면 ftp://host/file 형태 (로그인 = /www/)
    try {
        $req = [System.Net.FtpWebRequest]::Create($uri)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $req.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPw)
        $req.UseBinary = $true
        $req.UsePassive = $true
        $req.KeepAlive = $false

        $bytes = [System.IO.File]::ReadAllBytes($local)
        $req.ContentLength = $bytes.Length
        $stream = $req.GetRequestStream()
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Close()
        $resp = $req.GetResponse()
        $size = "{0:N0}" -f $bytes.Length
        Write-Host "[OK]   $f  ($size bytes, $($resp.StatusDescription.Trim()))" -ForegroundColor Green
        $resp.Close()
        $ok++
    } catch {
        Write-Host "[FAIL] $f  $($_.Exception.Message)" -ForegroundColor Red
        $fail++
    }
}

# 비번 메모리에서 제거
$ftpPw = $null
[System.GC]::Collect()

Write-Host ""
Write-Host "완료: 성공 $ok / 실패 $fail" -ForegroundColor Cyan

# Cloudflare Purge Everything 자동 호출
if ($fail -eq 0) {
    if ($env:CF_PURGE_TOKEN -and $env:CF_ZONE_ID) {
        Write-Host "[CF] Cloudflare Purge Everything 호출 중..." -ForegroundColor DarkGray
        try {
            $resp = Invoke-RestMethod -Method Post `
                -Uri "https://api.cloudflare.com/client/v4/zones/$($env:CF_ZONE_ID)/purge_cache" `
                -Headers @{ Authorization = "Bearer $($env:CF_PURGE_TOKEN)"; "Content-Type" = "application/json" } `
                -Body '{"purge_everything":true}'
            if ($resp.success) {
                Write-Host "[OK] Cloudflare Purge Everything 완료 (id: $($resp.result.id))" -ForegroundColor Green
            } else {
                Write-Warning "Purge 실패: $($resp.errors | ConvertTo-Json -Compress)"
            }
        } catch {
            Write-Warning "Purge 호출 예외: $_"
        }
    } else {
        Write-Host "[SKIP] CF_PURGE_TOKEN/CF_ZONE_ID 미설정. 수동 Purge 필요 (dash.cloudflare.com → daprint.kr → Caching → Purge Everything)" -ForegroundColor Yellow
    }
}
