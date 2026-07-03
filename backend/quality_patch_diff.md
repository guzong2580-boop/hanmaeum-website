# 인쇄물 갤러리 화질 개선 패치 — 2026-05-19

## 목적
3중 다운스케일 (admin 1800/q85 → Drive lh3 → print 모달 1600) 완화.
원본 PNG (2500–3500 × 5000–6000) 화질을 모달까지 가능한 한 보존.

## 변경 요약

| # | 파일 | 라인 | Before | After |
|---|------|------|--------|-------|
| A | `print.html` | 885 | `el.src = sized(raw, 1600);` | `el.src = sized(raw, 2400);` |
| B1 | `admin.html` | 1214 | `compressImageIfNeeded(file, 1800, 0.85)` | `compressImageIfNeeded(file, 3000, 0.92)` |
| B2 | `admin.html` | 1288 | `compressImageIfNeeded(file, 1800, 0.85)` | `compressImageIfNeeded(file, 3000, 0.92)` |
| C | `backend/migrate_print.py` | 279–293 | `upload_file()` 단일 함수 | `_upload_original()` helper 분리 + 무압축 보장 docstring |

### 그대로 둔 항목
- `print.html` L798 `sized(img, 600)` — 카드 그리드 썸네일. 그대로 작게 유지.
- `print.html` L771 `sized()` 함수 정의 — 그대로.
- `admin.html` L1347 `compressImageIfNeeded` 함수 정의 (기본값 1800/0.85) — 호출부에서 명시적으로 3000/0.92 전달하므로 정의 기본값은 의미 없음. 다른 곳에서 인자 없이 호출하는 케이스 없음 확인.
- `backend/apps-script.js` `handleImageUpload` — 서버 변형 없음 확인 (base64 디코드 → Drive 저장만). 변경 불필요.

## 백업 파일
- `print.html.bak.2026-05-19`
- `admin.html.bak.2026-05-19`
- `backend/migrate_print.py.bak.2026-05-19`

## 검증 결과
1. `python migrate_print.py --dry-run` → total_pairs=83, by_category={leaflet:27, shoppingbag:9, book:17, calendar:2, poster:28}, unpaired=0. 패치 전과 동일.
2. `python -m py_compile backend/migrate_print.py` → SYNTAX_OK.
3. `python -m http.server` 로컬 서빙 → `print.html` HTTP 200, `admin.html` HTTP 200. 서빙된 print.html에 `sized(raw, 2400)` 포함 확인.
4. grep 검증: admin.html 압축 호출 두 군데 모두 `3000, 0.92` 적용됨.

## 데이터 흐름 (변경 후)

```
관리자가 admin.html에서 업로드:
  파일 → canvas 압축 (긴변 3000px, JPEG q92) → base64 → Apps Script → Drive

migrate_print.py로 일괄 업로드 (원본 화질):
  파일 → _upload_original() 무압축 base64 → Apps Script → Drive (PNG 그대로)

모달 표시 (print.html):
  Drive 원본 URL → sized(url, 2400) → lh3.googleusercontent.com/d/<id>=w2400-rw
```

## Apps Script 측 분석 (변경 안 함)
- `handleImageUpload(body)` 함수가 받는 데이터는 `body.base64`, `body.mimeType`, `body.filename` 3개.
- `Utilities.base64Decode` → `Utilities.newBlob` → `folder.createFile(blob)` — 변형 0.
- 따라서 클라이언트가 보내는 base64가 그대로 Drive에 저장됨.
- `imageUrl`은 `https://lh3.googleusercontent.com/d/<fileId>` 형태로 반환. 모달은 `=w2400-rw` 파라미터 부착.

## 라이브 반영 절차 (사용자가 직접 결정 후 실행)

### Step 1. 새 업로드만 개선 (즉시)
- `deploy/` 폴더 sync 후 FTP 업로드 — `print.html`, `admin.html` 갱신.
- 기존 시트 row의 imageUrl은 그대로지만, print.html이 `=w2400-rw`로 요청하므로 lh3가 더 큰 사이즈로 서빙.
- 향후 admin.html에서 업로드되는 새 파일들도 3000px 보존.

### Step 2. 기존 row 전면 재구성 (선택)
- `migrate_print.py --execute --wipe-existing` — 시트 전체 삭제 후 원본 PNG로 재업로드.
- 이 경우 모든 인쇄물이 풀해상도(2500–3500px)로 Drive 저장됨.
- 백업: `migrate_print_backup_YYYY-MM-DD.json`이 자동 저장됨.
- **자동 실행 금지** — 사용자 명시 승인 후에만.

## 불확실 / 사용자 결정 필요 항목

1. **Step 2 실행 여부**: 기존 row를 갈아엎고 풀해상도로 재업로드할지. 시간(83건 × 평균 5–10MB) 및 Drive 용량 부담 고려.
2. **deploy/ 폴더 동기화**: `deploy/print.html`, `deploy/admin.html` 갱신 필요. 사용자 워크플로상 명시 "배포" 요청 전까지는 안 건드림.
3. **3000px / q92가 과한지**: q92 JPEG는 q85 대비 파일 크기 30–50% 증가. 업로드 속도·Apps Script POST 50MB 한계 영향 검토. 큰 PNG 원본은 압축 후에도 5–8MB 정도. 한 번에 여러 장 업로드시 시간 길어질 수 있음.
4. **WebP 우선 강제**: `sized()` 함수가 `-rw` 파라미터 부착 — lh3가 WebP 지원 클라이언트에는 자동으로 WebP 서빙. 별도 작업 불필요.
