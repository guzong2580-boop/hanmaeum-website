# 세션 일회성 업로드 — 5개 파일만 (caveman mode)
# 사용: $env:HM_FTP_PW='xxx'; ./deploy-ftp-session.ps1
# 비번 echo/log 금지

$ErrorActionPreference = 'Stop'

$ftpHost = '220.73.160.36'
$ftpUser = 'guzong2'
$localDir = "$PSScriptRoot\deploy"
$srcRoot  = "$PSScriptRoot"

if (-not $env:HM_FTP_PW) {
    Write-Error '비대화형 모드: $env:HM_FTP_PW 미설정'
    exit 2
}
$ftpPw = $env:HM_FTP_PW

# 업로드 매핑: 로컬경로 → 원격경로(루트=/www/, prefix 없이 ftp://host/...)
$jobs = @(
    @{ Local = (Join-Path $localDir 'index.html');                              Remote = 'index.html' },
    @{ Local = (Join-Path $localDir 'print.html');                              Remote = 'print.html' },
    @{ Local = (Join-Path $localDir '한마음일터전경.jpg');                       Remote = '한마음일터전경.jpg' },
    @{ Local = (Join-Path $localDir '한마음일터전경-m.jpg');                     Remote = '한마음일터전경-m.jpg' },
    @{ Local = (Join-Path $localDir 'images\인쇄카테고리배경대체.jpg');           Remote = 'images/인쇄카테고리배경대체.jpg' }
)

$ok = 0; $fail = 0; $failNames = @()
foreach ($j in $jobs) {
    $local  = $j.Local
    $remote = $j.Remote
    if (-not (Test-Path $local)) {
        Write-Host "[SKIP] $remote (로컬 없음: $local)" -ForegroundColor Yellow
        $fail++; $failNames += $remote
        continue
    }
    # 한글 경로 → URI 인코딩
    $remoteEnc = ($remote -split '/' | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/'
    $uri = "ftp://$ftpHost/$remoteEnc"

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
        Write-Host "[OK]   $remote  ($size bytes, $($resp.StatusDescription.Trim()))" -ForegroundColor Green
        $resp.Close()
        $ok++
    } catch {
        Write-Host "[FAIL] $remote  $($_.Exception.Message)" -ForegroundColor Red
        $fail++; $failNames += $remote
    }
}

$ftpPw = $null
[System.GC]::Collect()

Write-Host ""
Write-Host "완료: 성공 $ok / 실패 $fail" -ForegroundColor Cyan
if ($fail -gt 0) {
    Write-Host "실패 파일:" -ForegroundColor Red
    $failNames | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
