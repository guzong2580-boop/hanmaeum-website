# 한마음일터 deploy/ → daprint.kr FTP 업로드
# 사용:
#   대화형  → ./deploy-ftp.ps1 실행 후 프롬프트에 비번 입력
#   비대화형 → $env:HM_FTP_PW='xxx'; ./deploy-ftp.ps1
# 비번은 메모리·디스크 저장 안 함 (env var는 세션 종료 시 소멸)

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
    'common.css'
)

$ok = 0; $fail = 0
foreach ($f in $files) {
    $local = Join-Path $localDir $f
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
if ($fail -eq 0) {
    Write-Host "다음: Cloudflare 캐시 Purge (dash.cloudflare.com → daprint.kr → Caching → Purge Everything)" -ForegroundColor Cyan
}
