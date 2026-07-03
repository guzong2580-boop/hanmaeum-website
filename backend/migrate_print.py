#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
한마음일터 인쇄물 갤러리 전면 교체 마이그레이션.

- 폴더 스캔 → 썸네일/상세 페어링 → Apps Script로 Drive 업로드 → 시트 row 추가
- 두 가지 모드:
    --dry-run  (기본) 페어링 결과만 JSON으로 출력. 외부 호출 없음.
    --execute  실제 업로드 + 시트 row 추가. 사용자가 명시적으로 호출할 때만.
- 안전장치:
    * --execute 전에 시트 백업 (migrate_print_backup_YYYY-MM-DD.json)
    * 진행 로그 (migrate_print.log)
    * confirm prompt (--yes 로 우회)

CLI:
    python migrate_print.py --dry-run
    python migrate_print.py --execute
    python migrate_print.py --execute --yes
    python migrate_print.py --execute --category leaflet  (한 카테고리만)
"""

import argparse
import base64
import hashlib
import json
import logging
import mimetypes
import re
import sys
import time
import unicodedata
from datetime import datetime, date
from pathlib import Path
from urllib import request, error
from urllib.parse import urlencode

# ────────────────────────────────────────────────────────────
# 설정
# ────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
IMAGES_BASE = ROOT / "images" / "홈페이지 목업_2026년도 05월"

# 폴더명 → 카테고리 매핑
FOLDER_TO_CATEGORY = {
    "리플릿":       "leaflet",
    "책자":         "book",
    "포스터, 전단지": "poster",
    "쇼핑백":       "shoppingbag",
    "탁상용 달력":  "calendar",
}

# 카테고리별 기본 tag/color/bg (admin.html 옵션값 기반)
CATEGORY_DEFAULTS = {
    "leaflet":     {"tag": "LEAFLET",     "color": "c-cream",    "bg": "",     "design": "", "info": ""},
    "book":        {"tag": "BOOK",        "color": "c-blue",     "bg": "",     "design": "", "info": ""},
    "poster":      {"tag": "POSTER",      "color": "c-coral",    "bg": "",     "design": "", "info": ""},
    "shoppingbag": {"tag": "SHOPPING BAG","color": "c-mint",     "bg": "",     "design": "", "info": ""},
    "calendar":    {"tag": "CALENDAR",    "color": "c-lavender", "bg": "",     "design": "", "info": ""},
}

# 페어링 시 무시할 접미사 (이거 떼면 base name)
THUMB_SUFFIXES  = ["_썸네일", "-썸네일"]
DETAIL_SUFFIXES = ["_상세", "-상세"]
# multi-detail (상세1, 상세2 등) — base 동일 처리
DETAIL_NUM_RE   = re.compile(r"^(.*?)(?:[_-]?상세)?(\d+)$")
THUMB_NUM_RE    = re.compile(r"^(.*?)(?:[_-]?썸네일)?(\d+)$")

# Apps Script
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyajgu_KD48Ptqw3k0O0lRz6F_SDAsBh17aHRoJyFM-FNQyhXIAnMNKogZuRIX8Yij2PA/exec"

# 인증 — 토큰은 --execute 시 사용자가 제공 (admin.html 로그인 후 sessionStorage에서 복사)
TOKEN_FILE = ROOT / "backend" / ".admin_token"

OUT_PAIRS    = ROOT / "backend" / "migrate_print_pairs.json"
OUT_LOG      = ROOT / "backend" / "migrate_print.log"
OUT_BACKUP   = ROOT / "backend" / f"migrate_print_backup_{date.today().isoformat()}.json"

# ────────────────────────────────────────────────────────────
# 로깅
# ────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(OUT_LOG, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("migrate")


# ────────────────────────────────────────────────────────────
# 파일명 분석 & 페어링
# ────────────────────────────────────────────────────────────

def normalize(s: str) -> str:
    """unicode NFC 정규화 + 양끝 공백 제거. macOS 자모 분리 케이스 대응."""
    return unicodedata.normalize("NFC", s).strip()


def base_key(s: str) -> str:
    """페어링 키 정규화: 공백/언더스코어/하이픈 차이를 무시하고 trailing 숫자 묶음 처리."""
    k = normalize(s)
    # 모든 공백·구분자 제거 후 소문자화 — 페어링 키에만 사용 (원본 base는 따로 보존)
    k = re.sub(r"[\s_\-]+", "", k)
    # 시리즈 (어울림1, 어울림2 → 어울림) — 마지막 한자/한글 + 숫자 패턴이 흔함
    k = re.sub(r"(\D)\d+$", r"\1", k)
    return k.lower()


def classify(stem: str):
    """
    파일 stem(확장자 제외)을 받아 (base_display, key, role, ord) 반환.
        base_display: 원본 표기 (제목용)
        key: 페어링용 정규화 키
        role: 'thumb' | 'detail'
        ord:  multi-image 순번 (1, 2, 3 ...) — 없으면 0
    """
    s = normalize(stem)
    role = None
    ord_ = 0
    base = s

    # 1. 썸네일 + 숫자
    m = re.match(r"^(.*?)[_-]?썸네일(\d+)$", s)
    if m:
        base = m.group(1).rstrip("_-")
        role, ord_ = "thumb", int(m.group(2))
    else:
        # 2. 썸네일 (no num)
        for suf in THUMB_SUFFIXES:
            if s.endswith(suf):
                base = s[: -len(suf)].rstrip("_-")
                role = "thumb"
                break

    if role is None:
        # 3. 상세 + 숫자
        m = re.match(r"^(.*?)[_-]?상세(\d+)$", s)
        if m:
            base = m.group(1).rstrip("_-")
            role, ord_ = "detail", int(m.group(2))
        else:
            # 4. 상세 (no num)
            for suf in DETAIL_SUFFIXES:
                if s.endswith(suf):
                    base = s[: -len(suf)].rstrip("_-")
                    role = "detail"
                    break

    if role is None:
        # 5. 접미사 없음 = 본체 (detail)
        role = "detail"

    # series 번호가 base 끝에 그대로 붙어있는 케이스 (예: '어울림1') — base_display는 그대로 두고 key만 정규화
    return base, base_key(base), role, ord_


def derive_title(base: str) -> str:
    """base name에서 제목 추출 — 연도 prefix 떼고 정제."""
    s = base
    # 선행 연도(2018~2030) + 구분자 제거
    s = re.sub(r"^(19|20)\d{2}[_\-\s]+", "", s)
    # 기관 prefix 형태(이천시청-, 이천문화재단- 등) 그대로 유지 — 식별성
    # 끝 공백 정리
    s = re.sub(r"\s+", " ", s).strip()
    return s or base


def scan_folder(folder: Path):
    """폴더 안 파일들을 정규화 키로 그룹핑."""
    groups = {}  # key → {display: str, thumbs: [(Path,ord)], details: [(Path,ord)]}
    for f in folder.iterdir():
        if not f.is_file():
            continue
        if f.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        base_display, key, role, ord_ = classify(f.stem)
        g = groups.setdefault(key, {"display": base_display, "thumbs": [], "details": []})
        # 더 깔끔한 display 선호: 공백 포함된 게 보통 사람이 친 원본 — 첫 등록 것 유지
        if role == "thumb":
            g["thumbs"].append((f, ord_))
        else:
            g["details"].append((f, ord_))
    return groups


def build_pairs():
    """전체 폴더 스캔 → 페어 리스트 + unpaired 리스트."""
    pairs = []      # 매칭된 페어 (썸+상세 모두)
    unpaired = []   # 한 쪽만 있는 그룹
    sort_order = {}  # category → counter

    for folder in sorted(IMAGES_BASE.iterdir()):
        if not folder.is_dir():
            continue
        folder_name = normalize(folder.name)
        category = FOLDER_TO_CATEGORY.get(folder_name)
        if not category:
            log.warning("Unknown category folder: %s", folder.name)
            continue

        groups = scan_folder(folder)
        for key, g in sorted(groups.items()):
            display = g["display"]
            thumbs  = sorted(g["thumbs"],  key=lambda x: x[1])
            details = sorted(g["details"], key=lambda x: x[1])

            # 자동 보강: 한쪽만 있어도 같은 파일을 양쪽으로 사용
            #   - detail만 있는 경우: 첫 detail을 thumb로 재사용
            #   - thumb만 있는 경우: thumb를 detail로 재사용
            recovered = None
            if details and not thumbs:
                thumbs = [details[0]]
                recovered = "thumb=detail[0]"
            elif thumbs and not details:
                details = [thumbs[0]]
                recovered = "detail=thumb[0]"

            if thumbs and details:
                sort_order[category] = sort_order.get(category, 0) + 1
                pair = {
                    "category": category,
                    "key": key,
                    "base": display,
                    "title": derive_title(display),
                    "sortOrder": sort_order[category],
                    "thumb":  str(thumbs[0][0].relative_to(ROOT)),
                    "details": [str(p[0].relative_to(ROOT)) for p in details],
                    "thumb_extra": [str(p[0].relative_to(ROOT)) for p in thumbs[1:]],
                }
                if recovered:
                    pair["recovered"] = recovered
                pairs.append(pair)
            else:
                unpaired.append({
                    "category": category,
                    "folder": folder.name,
                    "key": key,
                    "base": display,
                    "thumbs":  [str(p[0].relative_to(ROOT)) for p in thumbs],
                    "details": [str(p[0].relative_to(ROOT)) for p in details],
                    "reason": "empty group",
                })
    return pairs, unpaired


# ────────────────────────────────────────────────────────────
# Apps Script 클라이언트
# ────────────────────────────────────────────────────────────

def get_token() -> str:
    if not TOKEN_FILE.exists():
        raise SystemExit(
            f"\n[ERR] admin token file missing.\n"
            f"  1) Open admin.html in browser → login (admin / [password]).\n"
            f"  2) DevTools console:  copy(sessionStorage.getItem('hm_token'))\n"
            f"  3) Save the token string (single line, no quotes) to:\n"
            f"     {TOKEN_FILE}\n"
        )
    return TOKEN_FILE.read_text(encoding="utf-8").strip()


def call_apps_script(action: str, body: dict, params: dict | None = None, timeout: int = 90):
    """Apps Script로 POST. body는 JSON 직렬화. CORS-friendly (no content-type)."""
    qs = {"action": action}
    if params:
        qs.update(params)
    url = APPS_SCRIPT_URL + "?" + urlencode(qs)
    data = json.dumps(body).encode("utf-8")
    req = request.Request(url, data=data, method="POST")
    # 일부러 Content-Type 안 붙임 (admin.html과 동일 — preflight 회피)
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _upload_original(path: Path) -> tuple[str, str]:
    """
    원본 파일을 그대로 base64 인코딩 (canvas 압축·리스케일·재인코딩 없음).

    admin.html은 브라우저 canvas로 maxSide·JPEG quality 압축 후 base64 전송하지만,
    이 함수는 디스크 파일 bytes를 그대로 사용한다. 결과: 원본 화질 보존.

    반환: (base64 문자열, mimeType)
    """
    mime, _ = mimetypes.guess_type(path.name)
    if not mime:
        # 확장자로 판별 실패 시 PNG 기본값 (홈페이지 목업 폴더는 PNG가 대다수)
        mime = "image/png"
    raw = path.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    log.debug("  _upload_original %s: %d bytes → base64 %d chars (mime=%s)",
              path.name, len(raw), len(b64), mime)
    return b64, mime


def upload_file(path: Path, token: str) -> dict:
    """
    파일 → base64 (원본 그대로, 무압축) → Apps Script upload.

    Apps Script handleImageUpload는 base64 디코드 → Drive 저장만 함 (변형 없음).
    Drive 서빙 시 lh3.googleusercontent.com의 =wNNN-rw 파라미터로만 다운스케일됨.
    print.html에서 sized(url, 2400) 호출하므로 원본이 2400px 이상이면 항상 풀해상도 활용.
    """
    b64, mime = _upload_original(path)
    res = call_apps_script("upload", {
        "base64": b64,
        "mimeType": mime,
        "filename": path.name,
        "token": token,
    })
    if not res.get("success"):
        raise RuntimeError(f"upload failed: {path.name} — {res}")
    return res


def fetch_existing_print(token: str) -> list:
    """현재 인쇄물 시트 전체 백업용 list 조회."""
    res = call_apps_script("list", {"token": token}, params={"type": "print"})
    if not res.get("success"):
        raise RuntimeError(f"list failed: {res}")
    return res.get("items", [])


def create_print_row(body: dict, token: str) -> dict:
    body = dict(body)
    body["token"] = token
    res = call_apps_script("create", body, params={"type": "print"})
    if not res.get("success"):
        raise RuntimeError(f"create failed: {res}")
    return res


# ────────────────────────────────────────────────────────────
# ID 생성 (admin.html과 동일 패턴은 Apps Script 서버측에서 부여하지만,
# 미리보기용으로도 보여주기 위해 timestamp+hash 만들어둠)
# ────────────────────────────────────────────────────────────

def preview_id(seed: str) -> str:
    t = int(time.time() * 1000)
    h = hashlib.md5(seed.encode("utf-8")).hexdigest()[:6]
    return f"{t}{h}"


# ────────────────────────────────────────────────────────────
# 메인
# ────────────────────────────────────────────────────────────

def cmd_dry_run(args):
    log.info("dry-run mode")
    pairs, unpaired = build_pairs()

    by_cat = {}
    for p in pairs:
        by_cat.setdefault(p["category"], []).append(p)
    recovered = [p for p in pairs if p.get("recovered")]

    log.info("==== pairing summary ====")
    for cat in sorted(by_cat):
        n_total = len(by_cat[cat])
        n_rec = sum(1 for p in by_cat[cat] if p.get("recovered"))
        log.info("  %-12s  pairs=%d  (recovered=%d)", cat, n_total, n_rec)
    log.info("  total pairs:    %d", len(pairs))
    log.info("  recovered:      %d (썸/상세 한쪽만 있어 동일 파일 재사용)", len(recovered))
    log.info("  unpaired:       %d", len(unpaired))

    # preview rows (앞 5개)
    preview_rows = []
    for p in pairs[:5]:
        d = CATEGORY_DEFAULTS[p["category"]]
        images_json_arr = [{"url": "<lh3-after-upload>", "name": Path(det).name} for det in p["details"]]
        preview_rows.append({
            "_id_preview": preview_id(p["base"]),
            "category": p["category"],
            "title": p["title"],
            "tag": d["tag"],
            "color": d["color"],
            "imageUrl": "<lh3-after-upload>",
            "imagesJson": json.dumps(images_json_arr, ensure_ascii=False),
            "bg": d["bg"],
            "design": d["design"],
            "info": d["info"],
            "sortOrder": p["sortOrder"],
            "_local_thumb": p["thumb"],
            "_local_details": p["details"],
        })

    out = {
        "generated_at": datetime.now().isoformat(),
        "mode": "dry-run",
        "summary": {
            "by_category": {c: len(v) for c, v in by_cat.items()},
            "total_pairs": len(pairs),
            "unpaired_groups": len(unpaired),
        },
        "preview_first_5": preview_rows,
        "pairs": pairs,
        "unpaired": unpaired,
    }
    OUT_PAIRS.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("wrote %s", OUT_PAIRS)

    print()
    print("=== unpaired (need manual review) ===")
    for u in unpaired:
        print(f"  [{u['category']}] base={u['base']!r}  reason={u['reason']}")
        for t in u["thumbs"]:
            print(f"     thumb : {t}")
        for d in u["details"]:
            print(f"     detail: {d}")

    print()
    print("=== preview (first 5 rows that would be created) ===")
    for r in preview_rows:
        print(f"  [{r['category']}] {r['title']!r}  sortOrder={r['sortOrder']}")


def cmd_execute(args):
    pairs, unpaired = build_pairs()
    if args.category:
        pairs = [p for p in pairs if p["category"] == args.category]
        log.info("filtered to category=%s → %d pairs", args.category, len(pairs))

    if not pairs:
        log.error("no pairs to upload")
        return 1

    token = get_token()

    # 1) 백업
    log.info("backing up current 인쇄물 sheet ...")
    existing = fetch_existing_print(token)
    OUT_BACKUP.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("backup saved: %s (%d rows)", OUT_BACKUP, len(existing))

    if existing:
        print()
        print(f"⚠ 인쇄물 sheet already has {len(existing)} rows. This script APPENDS new rows; it does NOT wipe.")
        print("  To replace fully: (a) delete rows in Google Sheets manually, OR")
        print("                    (b) use admin.html → 인쇄물 탭 → 각 항목 삭제, OR")
        print(f"                    (c) run again with --wipe-existing (deletes via Apps Script delete action)")
        if args.wipe_existing:
            if not args.yes:
                ans = input("really wipe existing rows first? [type 'wipe'] > ").strip().lower()
                if ans != "wipe":
                    log.info("aborted")
                    return 0
            log.info("deleting %d existing rows via Apps Script ...", len(existing))
            for it in existing:
                rid = it.get("id")
                if not rid:
                    continue
                res = call_apps_script("delete", {"token": token}, params={"type": "print", "id": rid})
                if not res.get("success"):
                    log.warning("delete failed for id=%s: %s", rid, res)
            log.info("wipe done")

    # 2) confirm
    if not args.yes:
        print()
        print(f"about to upload {len(pairs)} pairs and append {len(pairs)} rows.")
        print(f"backup: {OUT_BACKUP}")
        ans = input("proceed? [type 'yes'] > ").strip().lower()
        if ans != "yes":
            log.info("aborted by user")
            return 0

    # 3) 실행
    ok = 0
    fail = 0
    for i, p in enumerate(pairs, 1):
        d = CATEGORY_DEFAULTS[p["category"]]
        try:
            log.info("[%d/%d] %s | %s", i, len(pairs), p["category"], p["title"])
            # 썸네일 업로드
            thumb_path = ROOT / p["thumb"]
            up_thumb = upload_file(thumb_path, token)
            image_url = up_thumb["imageUrl"]
            log.info("  thumb fileId=%s", up_thumb.get("fileId"))

            # 상세들 업로드
            images_arr = []
            for det in p["details"]:
                det_path = ROOT / det
                up_det = upload_file(det_path, token)
                images_arr.append({"url": up_det["imageUrl"], "name": det_path.name})
                log.info("  detail fileId=%s (%s)", up_det.get("fileId"), det_path.name)

            # 시트 row 추가
            row = {
                "category":  p["category"],
                "title":     p["title"],
                "tag":       d["tag"],
                "color":     d["color"],
                "imageUrl":  image_url,
                "imagesJson": json.dumps(images_arr, ensure_ascii=False),
                "bg":        d["bg"],
                "design":    d["design"],
                "info":      d["info"],
                "sortOrder": p["sortOrder"],
            }
            res = create_print_row(row, token)
            log.info("  row created id=%s", res.get("id"))
            ok += 1
        except Exception as e:
            log.error("  FAILED: %s", e)
            fail += 1
            if args.stop_on_error:
                break

    log.info("==== done ====  ok=%d  fail=%d", ok, fail)
    return 0 if fail == 0 else 2


def main():
    ap = argparse.ArgumentParser(description="인쇄물 갤러리 마이그레이션")
    sub = ap.add_subparsers(dest="cmd")

    # 기본은 dry-run
    ap.add_argument("--dry-run", action="store_true", help="페어링 미리보기 (기본)")
    ap.add_argument("--execute", action="store_true", help="실제 업로드 + 시트 추가")
    ap.add_argument("--yes",     action="store_true", help="confirm prompt 건너뛰기")
    ap.add_argument("--category", choices=list(FOLDER_TO_CATEGORY.values()),
                    help="한 카테고리만 실행")
    ap.add_argument("--stop-on-error", action="store_true", help="첫 실패 시 중단")
    ap.add_argument("--wipe-existing", action="store_true", help="기존 인쇄물 시트 row 모두 삭제 후 재구성")

    args = ap.parse_args()

    if not IMAGES_BASE.exists():
        log.error("images base not found: %s", IMAGES_BASE)
        return 1

    if args.execute:
        return cmd_execute(args)
    # 기본 dry-run
    cmd_dry_run(args)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
