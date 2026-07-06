// ════════════════════════════════════════════════════════════
// 한마음일터 — 콘텐츠 관리 백엔드 (Google Apps Script)
// ════════════════════════════════════════════════════════════
// 이 코드는 사용자가 만든 setup 프로젝트(같은 시트의 Apps Script)에
// 기존 setupSheets 함수 아래에 붙여넣기 → 저장 → 웹앱 배포
// ════════════════════════════════════════════════════════════

const TYPE_CONFIG = {
  notices: {
    sheet: '공지사항',
    headers: ['id', 'title', 'type', 'date', 'body', 'imageUrls', 'fileUrls', 'createdAt']
  },
  archive: {
    sheet: '자료실',
    headers: ['id', 'title', 'description', 'type', 'size', 'date', 'fileUrl', 'body', 'imageUrls', 'fileUrls', 'createdAt']
  },
  gallery: {
    sheet: '갤러리',
    headers: ['id', 'title', 'date', 'imageUrl', 'color', 'emoji', 'body', 'imageUrls', 'fileUrls', 'createdAt']
  },
  disclosure: {
    sheet: '정보공개',
    headers: ['id', 'category', 'title', 'date', 'body', 'fileUrl', 'imageUrls', 'fileUrls', 'createdAt']
  },
  print: {
    sheet: '인쇄물',
    headers: ['id', 'category', 'title', 'tag', 'color', 'imageUrl', 'imagesJson', 'bg', 'design', 'info', 'sortOrder', 'createdAt']
  }
};

const USER_SHEET = '사용자';
const TOKEN_TTL_HOURS = 24;

// 견적요청 — 인증 불필요 (방문자 폼)
const QUOTE_SHEET = '견적요청';
const QUOTE_HEADERS = ['id','company','dept','position','name','phone','email','product','title','qty','due','detail','memo','createdAt'];

// 알림 수신 이메일 (시설장)
const NOTIFY_EMAIL = 'onemind6680@daum.net';

// Drive 업로드 폴더 이름 (없으면 자동 생성)
const UPLOAD_FOLDER_NAME = '한마음일터-업로드';

// 인쇄물 시트 1회 초기화용 시크릿 — 스크립트 속성 SETUP_PRINT_SECRET에 설정.
// 속성이 없으면 setup-print 엔드포인트는 비활성 상태로 동작한다.
function getSetupPrintSecret() {
  return PropertiesService.getScriptProperties().getProperty('SETUP_PRINT_SECRET');
}

// 로그인 실패 잠금
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_SECONDS = 600;

// 견적 폼 남용 방지
const QUOTE_GLOBAL_LIMIT = 10;        // 10분당 전체 제출 상한
const QUOTE_GLOBAL_WINDOW_SEC = 600;
const QUOTE_FIELD_MAX = {
  company: 100, dept: 100, position: 100, name: 100,
  phone: 40, email: 100, product: 100, title: 200,
  qty: 100, due: 100, detail: 5000, memo: 3000
};


// ════════════════════════════════════════════════════════════
// 라우터 (모든 요청의 진입점)
// ════════════════════════════════════════════════════════════

function doGet(e) {
  return route(e, 'GET');
}

function doPost(e) {
  return route(e, 'POST');
}

function route(e, method) {
  try {
    const action = (e.parameter.action || '').toLowerCase();
    let body = {};
    if (method === 'POST' && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
    }

    switch (action) {
      case 'login':       return jsonResp(handleLogin(body));
      case 'list':        return jsonResp(handleList(e.parameter.type, body.token || e.parameter.token));
      case 'create':      return jsonResp(handleCreate(e.parameter.type, body));
      case 'update':      return jsonResp(handleUpdate(e.parameter.type, e.parameter.id, body));
      case 'delete':      return jsonResp(handleDelete(e.parameter.type, e.parameter.id, body));
      case 'verify':      return jsonResp(handleVerifyToken(body.token));
      case 'quote':           return jsonResp(handleQuoteSubmit(body));
      case 'quote-list':      return jsonResp(handleQuoteList(body));
      case 'quote-response':  return jsonResp(handleQuoteResponse(body));
      case 'payment-confirm': return jsonResp(handlePaymentConfirm(body));
      case 'upload':          return jsonResp(handleImageUpload(body));
      case 'setup-print':     return jsonResp(handleSetupPrintEndpoint(e.parameter.secret));
      default: return jsonResp({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResp({ success: false, error: String(err) });
  }
}

function jsonResp(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ════════════════════════════════════════════════════════════
// 인증
// ════════════════════════════════════════════════════════════

// 비밀번호는 시트에 salted SHA-256 hex로 저장.
// 평문으로 저장돼 있던 기존 행은 로그인 성공 시 자동으로 해시로 교체된다.
function hashPassword(pw) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'hm-pw-v1:' + String(pw),
    Utilities.Charset.UTF_8
  );
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function handleLogin(body) {
  const { id, password } = body;
  if (!id || !password) {
    return { success: false, error: 'ID와 비밀번호를 입력해주세요.' };
  }

  // 계정별 실패 잠금 (무차별 대입 방지)
  const cache = CacheService.getScriptCache();
  const failKey = 'loginfail_' + String(id);
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_FAILS) {
    return { success: false, error: '로그인 시도가 너무 많습니다. 10분 후 다시 시도해주세요.' };
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(USER_SHEET);
  if (!sheet) return { success: false, error: '사용자 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();
  const hashed = hashPassword(password);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]) !== String(id)) continue;

    const stored = String(row[1]);
    const isHashMatch = stored === hashed;
    const isLegacyPlainMatch = stored === String(password);
    if (!isHashMatch && !isLegacyPlainMatch) continue;

    if (isLegacyPlainMatch && !isHashMatch) {
      sheet.getRange(i + 1, 2).setValue(hashed);
    }

    cache.remove(failKey);
    const token = Utilities.getUuid();
    const tokenData = {
      userId: id,
      userName: row[2] || '',
      expiresAt: Date.now() + TOKEN_TTL_HOURS * 3600 * 1000
    };
    PropertiesService.getScriptProperties().setProperty('tk_' + token, JSON.stringify(tokenData));
    return { success: true, token, name: row[2] || '', id };
  }

  cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
  return { success: false, error: 'ID 또는 비밀번호가 잘못되었습니다.' };
}

function verifyToken(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('tk_' + token);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (Date.now() > data.expiresAt) {
      PropertiesService.getScriptProperties().deleteProperty('tk_' + token);
      return null;
    }
    return data;
  } catch (e) { return null; }
}

function handleVerifyToken(token) {
  const auth = verifyToken(token);
  if (!auth) return { success: false, error: '세션이 만료되었습니다. 다시 로그인해주세요.' };
  return { success: true, name: auth.userName, id: auth.userId };
}


// ════════════════════════════════════════════════════════════
// 콘텐츠 CRUD
// ════════════════════════════════════════════════════════════

// 시트가 없으면 헤더와 함께 자동 생성 (신규 타입 최초 접근 시)
function getOrCreateSheet(cfg) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(cfg.sheet);
  if (!sheet) {
    sheet = ss.insertSheet(cfg.sheet);
    sheet.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleList(type, token) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return { success: false, error: 'Unknown type: ' + type };

  const sheet = getOrCreateSheet(cfg);
  if (!sheet) return { success: false, error: '시트를 찾을 수 없습니다: ' + cfg.sheet };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, items: [] };

  const headers = data[0];
  let items = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => {
      let val = data[i][idx];
      if (val instanceof Date) {
        val = (h === 'createdAt')
          ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
          : Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[h] = val;
    });
    items.push(obj);
  }

  const authed = !!verifyToken(token);

  // 자료실(archive)은 직원(관리자) 로그인 시에만 열람 가능 — 비로그인 시 목록·파일 URL 미노출
  if (type === 'archive' && !authed) {
    return { success: false, error: 'AUTH_REQUIRED', authRequired: true };
  }

  // 비공개 글은 관리자 토큰이 있을 때만 내려준다
  if (!authed) {
    items = items.filter(it => String(it.type) !== '비공개');
  }

  // 공지사항: 비로그인 방문자에겐 최근 5년(롤링)만 반환 — 오래된 글은 시트에 보관하되 JSON 자체를 미전송.
  // 직원 로그인(authed) 시 전체 반환. 정보공개·갤러리는 전체 공개, 자료실은 위에서 로그인 잠금.
  if (type === 'notices' && !authed) {
    const cut = new Date();
    cut.setFullYear(cut.getFullYear() - 5);
    const cutStr = Utilities.formatDate(cut, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    items = items.filter(it => {
      const d = String(it.date || '').substring(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true; // 날짜 형식 불명 → 노출 유지
      return d >= cutStr;
    });
  }

  // 최신순 정렬 (배열 뒤집기 — appendRow는 항상 끝에 추가하므로)
  items.reverse();
  return { success: true, items };
}

function handleCreate(type, body) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return { success: false, error: 'Unknown type: ' + type };

  const auth = verifyToken(body.token);
  if (!auth) return { success: false, error: '로그인이 필요합니다.' };

  const sheet = getOrCreateSheet(cfg);
  const id = Utilities.getUuid().substring(0, 8);
  const createdAt = new Date();

  const row = cfg.headers.map(h => {
    if (h === 'id') return id;
    if (h === 'createdAt') return createdAt;
    return body[h] !== undefined ? sanitizeCell(body[h]) : '';
  });
  sheet.appendRow(row);
  return { success: true, id };
}

function handleUpdate(type, id, body) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return { success: false, error: 'Unknown type: ' + type };

  const auth = verifyToken(body.token);
  if (!auth) return { success: false, error: '로그인이 필요합니다.' };

  const sheet = SpreadsheetApp.getActive().getSheetByName(cfg.sheet);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      cfg.headers.forEach((h, idx) => {
        if (h === 'id' || h === 'createdAt') return;
        if (body[h] !== undefined) {
          sheet.getRange(i + 1, idx + 1).setValue(sanitizeCell(body[h]));
        }
      });
      return { success: true };
    }
  }
  return { success: false, error: 'ID를 찾을 수 없습니다: ' + id };
}

function handleDelete(type, id, body) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return { success: false, error: 'Unknown type: ' + type };

  const auth = verifyToken(body.token);
  if (!auth) return { success: false, error: '로그인이 필요합니다.' };

  const sheet = SpreadsheetApp.getActive().getSheetByName(cfg.sheet);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'ID를 찾을 수 없습니다: ' + id };
}


// ════════════════════════════════════════════════════════════
// 견적요청 폼 (방문자 제출, 인증 불필요)
// ════════════════════════════════════════════════════════════

function handleQuoteSubmit(body) {
  // Honeypot — 봇이 채우면 silent success (시트·메일 둘 다 건너뜀)
  if (body.website && String(body.website).trim() !== '') {
    console.log('Bot blocked (honeypot filled):', body.company, body.phone);
    return { success: true, id: 'bot-blocked' };
  }

  // 메인 인라인 폼은 2026-05-14 비활성화됨. [메인] prefix는 봇만 사용.
  if (body.title && String(body.title).startsWith('[메인]')) {
    console.log('Bot blocked (deprecated [메인] path):', body.company, body.phone, body.title);
    return { success: true, id: 'bot-blocked' };
  }

  // 필수 필드 검증
  const required = ['company','name','phone','email','product','title','qty','detail'];
  for (const f of required) {
    if (!body[f] || String(body[f]).trim() === '') {
      return { success: false, error: '필수 항목이 누락되었습니다: ' + f };
    }
  }

  // 필드 길이 상한 (시트·메일 폭탄 방지)
  for (const f in QUOTE_FIELD_MAX) {
    if (body[f] !== undefined && String(body[f]).length > QUOTE_FIELD_MAX[f]) {
      return { success: false, error: '입력이 너무 깁니다: ' + f + ' (최대 ' + QUOTE_FIELD_MAX[f] + '자)' };
    }
  }

  // 전체 제출 빈도 제한 — Apps Script는 클라이언트 IP를 알 수 없어 전역 상한으로 방어
  const cache = CacheService.getScriptCache();
  const rateCount = Number(cache.get('quote_rate') || 0);
  if (rateCount >= QUOTE_GLOBAL_LIMIT) {
    return { success: false, error: '요청이 많아 잠시 접수가 제한되었습니다. 10분 후 다시 시도하시거나 031-631-6680으로 연락주세요.' };
  }
  cache.put('quote_rate', String(rateCount + 1), QUOTE_GLOBAL_WINDOW_SEC);

  const sheet = SpreadsheetApp.getActive().getSheetByName(QUOTE_SHEET);
  if (!sheet) {
    return { success: false, error: '견적요청 시트가 없습니다. setupQuoteSheet 함수를 먼저 실행해주세요.' };
  }

  const id = Utilities.getUuid().substring(0, 8);
  const createdAt = new Date();

  const row = QUOTE_HEADERS.map(h => {
    if (h === 'id') return id;
    if (h === 'createdAt') return createdAt;
    return body[h] !== undefined ? sanitizeCell(body[h]) : '';
  });
  sheet.appendRow(row);

  // 이메일 알림 발송
  try {
    sendQuoteNotificationEmail(body, id);
  } catch (err) {
    // 이메일 발송 실패는 무시 (시트 저장은 이미 성공)
    console.warn('이메일 발송 실패:', err);
  }

  return { success: true, id };
}

// 관리자 견적 목록 조회 (admin.html 견적요청 탭)
function handleQuoteList(body) {
  const auth = verifyToken(body.token);
  if (!auth) return { success: false, error: '로그인이 필요합니다.' };

  const sheet = SpreadsheetApp.getActive().getSheetByName(QUOTE_SHEET);
  if (!sheet) return { success: false, error: '견적요청 시트가 없습니다.' };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, items: [] };

  const headers = data[0];
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    headers.forEach((h, idx) => {
      let val = data[i][idx];
      if (val instanceof Date) {
        val = (h === 'createdAt')
          ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
          : Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[h] = val;
    });
    items.push(obj);
  }
  items.reverse();
  return { success: true, items };
}

function sendQuoteNotificationEmail(body, id) {
  const subject = '[한마음일터] 새 견적 요청 — ' + (body.title || '(제목 없음)');

  const dueText = body.due ? ` (희망 납기: ${body.due})` : '';
  const memoText = body.memo ? `\n\n📝 참고사항\n${body.memo}` : '';

  const htmlBody = `
    <div style="font-family:'Pretendard','맑은 고딕',sans-serif;max-width:640px;padding:24px;background:#FAF9F6;color:#1F2027">
      <div style="background:#fff;border:1px solid #E0E0E5;border-radius:14px;padding:28px">
        <p style="font-size:11px;font-weight:800;letter-spacing:2px;color:#5849B8;margin:0 0 8px">QUOTE REQUEST · ID ${id}</p>
        <h2 style="font-size:22px;font-weight:900;letter-spacing:-.5px;color:#1F2027;margin:0 0 6px">${escapeHtml(body.title || '')}</h2>
        <p style="font-size:13px;color:#8B8B95;margin:0 0 22px">한마음일터 홈페이지에서 새 견적 요청이 접수되었습니다.</p>

        <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6">
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;color:#8B8B95;width:120px">의뢰기관</td><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;font-weight:600">${escapeHtml(body.company || '')}</td></tr>
          ${body.dept ? `<tr><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;color:#8B8B95">부서</td><td style="padding:10px 0;border-bottom:1px solid #F0F0F2">${escapeHtml(body.dept)}${body.position ? ' · ' + escapeHtml(body.position) : ''}</td></tr>` : ''}
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;color:#8B8B95">담당자</td><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;font-weight:600">${escapeHtml(body.name || '')}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;color:#8B8B95">연락처</td><td style="padding:10px 0;border-bottom:1px solid #F0F0F2"><a href="tel:${escapeHtml(body.phone || '')}" style="color:#4A6FE3;text-decoration:none">${escapeHtml(body.phone || '')}</a></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;color:#8B8B95">이메일</td><td style="padding:10px 0;border-bottom:1px solid #F0F0F2"><a href="mailto:${escapeHtml(body.email || '')}" style="color:#4A6FE3;text-decoration:none">${escapeHtml(body.email || '')}</a></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;color:#8B8B95">상품 구분</td><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;font-weight:600">${escapeHtml(body.product || '')}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #F0F0F2;color:#8B8B95">수량</td><td style="padding:10px 0;border-bottom:1px solid #F0F0F2">${escapeHtml(body.qty || '')}${dueText}</td></tr>
        </table>

        <div style="margin-top:20px;padding:16px 18px;background:#FAF9F6;border-radius:10px;border-left:3px solid #4A6FE3">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5849B8;letter-spacing:1px">제작 요청 내용</p>
          <p style="margin:0;font-size:14px;line-height:1.7;white-space:pre-wrap">${escapeHtml(body.detail || '')}</p>
        </div>

        ${body.memo ? `
        <div style="margin-top:12px;padding:16px 18px;background:#FAF9F6;border-radius:10px">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#8B8B95;letter-spacing:1px">참고 사항</p>
          <p style="margin:0;font-size:14px;line-height:1.7;white-space:pre-wrap">${escapeHtml(body.memo)}</p>
        </div>` : ''}

        <p style="margin:24px 0 0;font-size:11px;color:#A8B0C0;text-align:center">접수 시각 · ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')}</p>
      </div>
      <p style="font-size:11px;color:#A8B0C0;text-align:center;margin:14px 0 0">한마음일터 홈페이지 · 자동 발송 메일</p>
    </div>`;

  const plainBody = [
    '[한마음일터] 새 견적 요청',
    '─────────────────────',
    '의뢰기관: ' + (body.company || ''),
    body.dept ? '부서: ' + body.dept + (body.position ? ' · ' + body.position : '') : '',
    '담당자: ' + (body.name || ''),
    '연락처: ' + (body.phone || ''),
    '이메일: ' + (body.email || ''),
    '상품: ' + (body.product || ''),
    '제목: ' + (body.title || ''),
    '수량: ' + (body.qty || ''),
    body.due ? '희망 납기: ' + body.due : '',
    '',
    '제작 요청 내용:',
    body.detail || '',
    memoText,
    '',
    '─────────────────────',
    '접수 ID: ' + id,
    '접수 시각: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
  ].filter(Boolean).join('\n');

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: subject,
    body: plainBody,
    htmlBody: htmlBody,
    replyTo: body.email || undefined,
    name: '한마음일터 홈페이지'
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// 시트 수식 인젝션 방어 — =, +, -, @ 로 시작하는 문자열은
// 앞에 ' 를 붙여 텍스트로 저장 (Sheets가 수식으로 해석·실행하지 못하게)
function sanitizeCell(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}


// ════════════════════════════════════════════════════════════
// 결제 (토스페이먼츠)
// ════════════════════════════════════════════════════════════
//
// 흐름:
//   1) 시설장이 admin.html 견적요청 탭에서 견적 응답 (금액 입력)
//   2) 시스템이 orderId 생성 + 고객에게 결제 링크 메일 발송
//   3) 고객이 pay.html 접속 → 토스페이먼츠 결제창 → 결제
//   4) 토스가 success.html로 redirect → handlePaymentConfirm 호출
//   5) Apps Script가 토스 승인 API로 검증 → 시트 업데이트 + 시설장 알림
//
// 토스페이먼츠 Secret Key 설정:
//   Apps Script → 프로젝트 설정 → 스크립트 속성에서
//   TOSS_SECRET_KEY = test_sk_... (테스트) 또는 live_sk_... (본 환경)
// ════════════════════════════════════════════════════════════

function getTossSecretKey() {
  const key = PropertiesService.getScriptProperties().getProperty('TOSS_SECRET_KEY');
  if (!key) {
    throw new Error('TOSS_SECRET_KEY가 설정되지 않음. 스크립트 속성에 추가해주세요.');
  }
  return key;
}

// 견적 시트에 결제 컬럼 추가 (한 번만 실행)
function migrateQuoteAddPaymentColumns() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(QUOTE_SHEET);
  if (!sheet) {
    safeAlert('❌ 견적요청 시트를 찾을 수 없습니다.');
    return;
  }
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const newCols = ['status', 'amount', 'orderId', 'paymentKey', 'paidAt'];
  const toAdd = newCols.filter(c => !headers.includes(c));
  if (toAdd.length === 0) {
    safeAlert('ℹ️ 결제 컬럼이 이미 있습니다.');
    return;
  }
  const startCol = lastCol + 1;
  sheet.getRange(1, startCol, 1, toAdd.length)
    .setValues([toAdd])
    .setFontWeight('bold')
    .setBackground('#FFF4E0');
  sheet.autoResizeColumns(startCol, toAdd.length);
  safeAlert(`✅ 결제 컬럼 ${toAdd.length}개 추가됨: ${toAdd.join(', ')}`);
}

// 관리자가 견적에 응답 → 결제 링크 생성 + 메일 발송
// body: { id, amount, memo, token }
function handleQuoteResponse(body) {
  const auth = verifyToken(body.token);
  if (!auth) return { success: false, error: '로그인이 필요합니다.' };
  if (!body.id || !body.amount) return { success: false, error: '견적 ID와 금액이 필요합니다.' };

  const sheet = SpreadsheetApp.getActive().getSheetByName(QUOTE_SHEET);
  if (!sheet) return { success: false, error: '견적요청 시트가 없습니다.' };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol      = headers.indexOf('id');
  const statusCol  = headers.indexOf('status');
  const amountCol  = headers.indexOf('amount');
  const orderIdCol = headers.indexOf('orderId');
  const memoCol    = headers.indexOf('memo');
  if (statusCol < 0 || amountCol < 0 || orderIdCol < 0) {
    return { success: false, error: '결제 컬럼이 없습니다. migrateQuoteAddPaymentColumns 먼저 실행.' };
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(body.id)) {
      const orderId = 'HM-' + Date.now() + '-' + Utilities.getUuid().substring(0, 6);
      const amount = Number(body.amount);

      // A. setValue 4번 → setValues 1번 (row 통째로 덮어쓰기, I/O round-trip 절감)
      const rowVals = data[i].slice();
      rowVals[statusCol]  = '견적 회신';
      rowVals[amountCol]  = amount;
      rowVals[orderIdCol] = orderId;
      if (body.memo && memoCol >= 0) rowVals[memoCol] = sanitizeCell(body.memo);
      sheet.getRange(i + 1, 1, 1, rowVals.length).setValues([rowVals]);

      const row = data[i];
      const customer = {
        name:    row[headers.indexOf('name')],
        company: row[headers.indexOf('company')],
        email:   row[headers.indexOf('email')],
        title:   row[headers.indexOf('title')]
      };

      const payUrl = 'https://daprint.kr/pay.html?orderId=' + encodeURIComponent(orderId)
                   + '&amount=' + amount
                   + '&name=' + encodeURIComponent(customer.title || '한마음일터');

      // 고객 이메일이 유효하면 결제 안내 메일 발송
      if (customer.email && /@/.test(customer.email) && !/미입력/.test(customer.email)) {
        try {
          sendPaymentLinkEmail(customer, amount, payUrl, body.memo);
        } catch (err) {
          console.warn('결제 링크 메일 실패:', err);
        }
      }

      return { success: true, orderId, payUrl, emailSent: !!customer.email };
    }
  }
  return { success: false, error: '견적 ID를 찾을 수 없음: ' + body.id };
}

function sendPaymentLinkEmail(customer, amount, payUrl, memo) {
  const formatted = Number(amount).toLocaleString('ko-KR') + '원';
  const subject = '[한마음일터] 견적 회신 — ' + (customer.title || '');

  const htmlBody = `
    <div style="font-family:'Pretendard','맑은 고딕',sans-serif;max-width:560px;padding:24px;color:#1F2027;background:#FAF9F6">
      <div style="background:#fff;border-radius:14px;padding:32px 28px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
        <p style="font-size:11px;font-weight:800;letter-spacing:2px;color:#5849B8;margin:0 0 8px">QUOTE RESPONSE</p>
        <h2 style="font-size:22px;font-weight:900;margin:0 0 4px">${escapeHtml(customer.title || '한마음일터 견적')}</h2>
        <p style="font-size:13px;color:#666;margin:0 0 24px">${escapeHtml(customer.company || '')} · ${escapeHtml(customer.name || '')} 님</p>

        <div style="padding:24px;background:#F4F6FB;border-radius:12px;text-align:center;margin-bottom:24px">
          <p style="font-size:12px;color:#666;margin:0 0 6px">결제 금액</p>
          <div style="font-size:34px;font-weight:900;color:#4A6FE3;letter-spacing:-1px">${formatted}</div>
        </div>

        ${memo ? `<div style="padding:16px;background:#FAF9F6;border-left:3px solid #4A6FE3;border-radius:8px;margin-bottom:24px;font-size:14px;line-height:1.65;white-space:pre-wrap">${escapeHtml(memo)}</div>` : ''}

        <a href="${payUrl}" style="display:block;text-align:center;padding:16px;background:#4A6FE3;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:-.01em">
          결제하러 가기 →
        </a>

        <p style="font-size:12px;color:#999;text-align:center;margin:28px 0 0;line-height:1.6">
          문의 · 한마음일터 <b>031-631-6680</b><br>
          이 메일은 한마음일터 홈페이지에서 자동 발송되었습니다.
        </p>
      </div>
    </div>`;

  MailApp.sendEmail({
    to: customer.email,
    subject: subject,
    htmlBody: htmlBody,
    body: '한마음일터 견적 안내\n금액: ' + formatted + '\n결제: ' + payUrl,
    name: '한마음일터 홈페이지'
  });
}

// 결제 완료 후 토스 승인 API 호출 + 시트 업데이트
// body: { paymentKey, orderId, amount }
function handlePaymentConfirm(body) {
  if (!body.paymentKey || !body.orderId || body.amount == null) {
    return { success: false, error: '필수 정보가 누락되었습니다.' };
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(QUOTE_SHEET);
  if (!sheet) return { success: false, error: '시트 없음' };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const orderIdCol    = headers.indexOf('orderId');
  const amountCol     = headers.indexOf('amount');
  const statusCol     = headers.indexOf('status');
  const paymentKeyCol = headers.indexOf('paymentKey');
  const paidAtCol     = headers.indexOf('paidAt');

  // orderId 매칭 + 금액 검증 (위변조 방지)
  let targetRow = -1;
  let customer = {};
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][orderIdCol]) === String(body.orderId)) {
      if (Number(data[i][amountCol]) !== Number(body.amount)) {
        return { success: false, error: '결제 금액이 일치하지 않습니다.' };
      }
      targetRow = i;
      customer = {
        name:    data[i][headers.indexOf('name')],
        company: data[i][headers.indexOf('company')],
        phone:   data[i][headers.indexOf('phone')],
        title:   data[i][headers.indexOf('title')]
      };
      break;
    }
  }
  if (targetRow < 0) return { success: false, error: 'orderId를 찾을 수 없습니다.' };

  // 토스페이먼츠 결제 승인
  try {
    const secretKey = getTossSecretKey();
    const auth = Utilities.base64Encode(secretKey + ':');
    const resp = UrlFetchApp.fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Basic ' + auth },
      payload: JSON.stringify({
        paymentKey: body.paymentKey,
        orderId: body.orderId,
        amount: Number(body.amount)
      }),
      muteHttpExceptions: true
    });
    const respCode = resp.getResponseCode();
    const respData = JSON.parse(resp.getContentText());
    if (respCode !== 200) {
      console.error('Toss 승인 실패:', respData);
      return { success: false, error: '결제 승인 실패: ' + (respData.message || '알 수 없음') };
    }

    // 승인 성공 → 시트 업데이트 + 시설장 알림
    sheet.getRange(targetRow + 1, statusCol + 1).setValue('결제완료');
    sheet.getRange(targetRow + 1, paymentKeyCol + 1).setValue(body.paymentKey);
    sheet.getRange(targetRow + 1, paidAtCol + 1).setValue(new Date());

    try {
      sendPaymentSuccessEmail(customer, body.amount, body.orderId);
    } catch (err) {
      console.warn('결제 완료 알림 실패:', err);
    }

    return { success: true, orderId: body.orderId };

  } catch (err) {
    return { success: false, error: '서버 오류: ' + err.message };
  }
}

function sendPaymentSuccessEmail(customer, amount, orderId) {
  const formatted = Number(amount).toLocaleString('ko-KR') + '원';
  const body = [
    '[한마음일터] 결제 완료 알림',
    '─────────────────────',
    '의뢰: ' + (customer.company || '') + ' / ' + (customer.name || ''),
    '연락처: ' + (customer.phone || ''),
    '제품: ' + (customer.title || ''),
    '─────────────────────',
    '결제 금액: ' + formatted,
    '주문 번호: ' + orderId,
    '결제 시각: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    '─────────────────────',
    'admin: https://daprint.kr/admin.html'
  ].join('\n');

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '[한마음일터] 결제 완료 — ' + (customer.title || ''),
    body: body,
    name: '한마음일터 홈페이지'
  });
}


// ════════════════════════════════════════════════════════════
// 시트 초기 셋업 (새 계정으로 처음 만들 때 한 번만 실행)
// ════════════════════════════════════════════════════════════
// 4개 탭(사용자/공지사항/자료실/갤러리) + 헤더 자동 생성
// 함수 선택에서 setupSheets → ▶ 실행
// ════════════════════════════════════════════════════════════

function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) {
    Logger.log('❌ 활성 시트를 찾을 수 없습니다. 시트를 먼저 열고 확장 프로그램 → Apps Script로 들어가서 실행해주세요.');
    return;
  }

  const tabs = [
    { name: '사용자',   headers: ['id','password','name'],                                   bg: '#EFE9FA' },
    { name: '공지사항', headers: ['id','title','type','date','body','imageUrls','fileUrls','createdAt'], bg: '#DAE7F5' },
    { name: '자료실',   headers: ['id','title','description','type','size','date','fileUrl','body','imageUrls','fileUrls','createdAt'], bg: '#FCE5E5' },
    { name: '갤러리',   headers: ['id','title','date','imageUrl','color','emoji','body','imageUrls','fileUrls','createdAt'], bg: '#E8F4ED' }
  ];

  tabs.forEach(t => {
    let sheet = ss.getSheetByName(t.name);
    if (!sheet) sheet = ss.insertSheet(t.name);
    sheet.clear();
    sheet.getRange(1, 1, 1, t.headers.length)
         .setValues([t.headers])
         .setFontWeight('bold')
         .setBackground(t.bg);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, t.headers.length);
  });

  // 기본 '시트1' 삭제 (있다면)
  const defaultSheet = ss.getSheetByName('시트1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  const msg = '✅ 4개 탭(사용자·공지사항·자료실·갤러리)이 생성되었습니다.\n다음 단계: setupQuoteSheet 실행';
  Logger.log(msg);
  safeAlert(msg);
}


// ════════════════════════════════════════════════════════════
// HTTP 엔드포인트로 setupPrintSheet 실행 (시크릿 보호)
// 외부에서 ?action=setup-print&secret=... 호출 시 동작
// ════════════════════════════════════════════════════════════
function handleSetupPrintEndpoint(secret) {
  const expected = getSetupPrintSecret();
  if (!expected || !secret || secret !== expected) {
    return { success: false, error: 'forbidden' };
  }
  try {
    const result = doSetupPrintSheet();
    return { success: true, ...result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}


// ════════════════════════════════════════════════════════════
// 인쇄물 시트 초기 셋업 + 30건 시드 (한 번만 실행)
// ════════════════════════════════════════════════════════════
// Apps Script 편집기 함수 선택에서 setupPrintSheet → ▶ 실행
// 또는 HTTP: ?action=setup-print&secret=SETUP_PRINT_SECRET
// 인쇄물 시트가 없으면 새로 만들고, 있으면 그대로 두고 시드만 추가
// ════════════════════════════════════════════════════════════
function setupPrintSheet() {
  const r = doSetupPrintSheet();
  Logger.log(r.message);
  safeAlert(r.message);
}

function doSetupPrintSheet() {
  const ss = SpreadsheetApp.getActive();
  const NAME = '인쇄물';
  const headers = ['id','category','title','tag','color','imageUrl','imagesJson','bg','design','info','sortOrder','createdAt'];

  let sheet = ss.getSheetByName(NAME);
  if (!sheet) {
    sheet = ss.insertSheet(NAME);
    sheet.getRange(1, 1, 1, headers.length)
         .setValues([headers])
         .setFontWeight('bold')
         .setBackground('#F5E6CF');
    sheet.setFrozenRows(1);
  } else {
    // 시트 있지만 헤더 비었으면 채우기
    if (sheet.getRange(1, 1).getValue() === '') {
      sheet.getRange(1, 1, 1, headers.length)
           .setValues([headers])
           .setFontWeight('bold')
           .setBackground('#F5E6CF');
      sheet.setFrozenRows(1);
    }
  }

  // 데이터 행 개수 (헤더 제외)
  const existingRows = sheet.getLastRow() - 1;
  if (existingRows > 0) {
    sheet.autoResizeColumns(1, headers.length);
    return { message: `ℹ️ 인쇄물 시트 이미 ${existingRows}건 존재. 시드 추가 생략.`, existingRows, seeded: 0 };
  }

  // 30건 시드 (이미지는 기존 파일 순환, 컬러칩 다양화)
  const leafletImgs = [
    'images/print/leaflet-01-samniwoot.jpg','images/print/leaflet-02-hanul.jpg',
    'images/print/leaflet-03-yicheon-disabled.jpg','images/print/leaflet-04-parking.jpg',
    'images/print/leaflet-05-together-yicheon.jpg','images/print/leaflet-06-school-violence.jpg',
    'images/print/leaflet-07-mental-health.jpg','images/print/leaflet-08-counseling.jpg',
    'images/print/leaflet-09-majang-health.jpg','images/print/leaflet-10-yicheon-map.jpg',
    'images/print/leaflet-11-365-shelter.jpg','images/print/leaflet-12-hope-love.jpg',
    'images/print/leaflet-13-suicide-prevention.jpg','images/print/leaflet-14-happy-workplace.jpg'
  ];
  const catalogImgs = ['images/print/catalog-01-bitnuri.jpg','images/print/catalog-02-naralove.jpg'];
  const posterImgs  = ['images/print/poster-01-children-dream.jpg','images/print/poster-02-mind-solution.jpg'];
  const colors = ['c-cream','c-coral','c-yellow','c-blue','c-sky','c-pink','c-lavender','c-mint','c-teal','c-grey','c-olive','c-sand'];

  const now = new Date();
  const rows = [];
  let order = 1;

  function uid() { return Utilities.getUuid().substring(0, 8); }

  for (let i = 0; i < 18; i++) {
    rows.push([uid(), 'leaflet', `리플렛 작업 #${String(i+1).padStart(2,'0')}`, 'LEAFLET · 3단 접지',
               colors[i % colors.length], leafletImgs[i % leafletImgs.length],
               '','','','', order++, now]);
  }
  for (let i = 0; i < 6; i++) {
    rows.push([uid(), 'catalog', `카탈로그 작업 #${String(i+1).padStart(2,'0')}`, 'CATALOG · BOOKLET',
               colors[(i+3) % colors.length], catalogImgs[i % catalogImgs.length],
               '','','','', order++, now]);
  }
  for (let i = 0; i < 6; i++) {
    rows.push([uid(), 'poster', `포스터 작업 #${String(i+1).padStart(2,'0')}`, 'POSTER · CAMPAIGN',
               colors[(i+6) % colors.length], posterImgs[i % posterImgs.length],
               '','','','', order++, now]);
  }

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.autoResizeColumns(1, headers.length);

  return {
    message: `✅ '인쇄물' 시트에 헤더 + ${rows.length}건 시드 데이터 입력 완료.`,
    existingRows: 0,
    seeded: rows.length
  };
}


// ════════════════════════════════════════════════════════════
// 공지사항 컬럼 확장 마이그레이션 (한 번만 실행)
// ════════════════════════════════════════════════════════════
//
// 기존 공지사항 시트(id,title,type,date,body,createdAt)에
// imageUrls·fileUrls 컬럼 2개를 createdAt 앞에 삽입합니다.
// 기존 데이터(306개 행)는 그대로 보존됩니다.
//
// 사용 방법:
//   1) Apps Script 편집기 상단 함수 선택에서 migrateNoticesAddColumns 선택
//   2) ▶ 실행
//   3) "마이그레이션 완료" 알림 뜨면 끝
// ════════════════════════════════════════════════════════════
function migrateNoticesAddColumns() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('공지사항');
  if (!sheet) {
    safeAlert('❌ 공지사항 시트를 찾을 수 없습니다.');
    return;
  }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.includes('imageUrls') && headers.includes('fileUrls')) {
    safeAlert('ℹ️ 이미 imageUrls·fileUrls 컬럼이 있습니다. 작업 불필요.');
    return;
  }

  const createdAtIdx = headers.indexOf('createdAt');
  if (createdAtIdx === -1) {
    safeAlert('❌ createdAt 컬럼을 찾을 수 없습니다. 시트 구조를 확인해주세요.');
    return;
  }

  // createdAt 앞에 2개 컬럼 삽입 (1-based)
  sheet.insertColumnsBefore(createdAtIdx + 1, 2);
  sheet.getRange(1, createdAtIdx + 1).setValue('imageUrls');
  sheet.getRange(1, createdAtIdx + 2).setValue('fileUrls');

  // 헤더 행 스타일 (다른 컬럼과 동일하게)
  sheet.getRange(1, createdAtIdx + 1, 1, 2)
       .setFontWeight('bold')
       .setBackground('#DAE7F5');

  sheet.autoResizeColumns(createdAtIdx + 1, 2);

  const dataRows = sheet.getLastRow() - 1;
  const msg = '✅ 마이그레이션 완료!\n' +
              '・imageUrls·fileUrls 컬럼이 추가되었습니다.\n' +
              `・기존 ${dataRows}개 데이터는 그대로 보존되었습니다.\n` +
              '・새 컬럼은 빈 값입니다.\n\n' +
              '다음: 배포 → 새 버전 관리 → 같은 URL로 업데이트';
  Logger.log(msg);
  safeAlert(msg);
}


// ════════════════════════════════════════════════════════════
// 자료실·갤러리 컬럼 확장 마이그레이션 (한 번만 실행)
// ════════════════════════════════════════════════════════════
//
// 기존 자료실/갤러리 시트에 body·imageUrls·fileUrls 3개 컬럼을
// createdAt 앞에 삽입합니다. 기존 데이터는 보존됩니다.
//
// 사용 방법:
//   1) Apps Script 편집기 함수 선택 → migrateArchiveAddColumns 또는
//      migrateGalleryAddColumns → ▶ 실행
//   2) "마이그레이션 완료" 알림 뜨면 끝
// ════════════════════════════════════════════════════════════
function migrateArchiveAddColumns() {
  migrateEntrySheetAddColumns_('자료실', '#FCE5E5');
}

function migrateGalleryAddColumns() {
  migrateEntrySheetAddColumns_('갤러리', '#E8F4ED');
}

function migrateEntrySheetAddColumns_(sheetName, bg) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) {
    safeAlert('❌ ' + sheetName + ' 시트를 찾을 수 없습니다.');
    return;
  }
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const need = ['body', 'imageUrls', 'fileUrls'];
  const toAdd = need.filter(h => !headers.includes(h));
  if (toAdd.length === 0) {
    safeAlert('ℹ️ ' + sheetName + ' 시트에 이미 body·imageUrls·fileUrls 컬럼이 있습니다.');
    return;
  }

  const createdAtIdx = headers.indexOf('createdAt');
  if (createdAtIdx === -1) {
    safeAlert('❌ ' + sheetName + ' 시트에서 createdAt 컬럼을 찾을 수 없습니다.');
    return;
  }

  sheet.insertColumnsBefore(createdAtIdx + 1, toAdd.length);
  sheet.getRange(1, createdAtIdx + 1, 1, toAdd.length)
       .setValues([toAdd])
       .setFontWeight('bold')
       .setBackground(bg);
  sheet.autoResizeColumns(createdAtIdx + 1, toAdd.length);

  const dataRows = sheet.getLastRow() - 1;
  const msg = '✅ ' + sheetName + ' 마이그레이션 완료!\n' +
              '・추가된 컬럼: ' + toAdd.join(', ') + '\n' +
              '・기존 ' + dataRows + '개 데이터는 보존되었습니다.\n\n' +
              '다음: 배포 → 새 버전 관리 → 같은 URL로 업데이트';
  Logger.log(msg);
  safeAlert(msg);
}


// ════════════════════════════════════════════════════════════
// 견적요청 시트 일회성 셋업 (한 번만 실행)
// ════════════════════════════════════════════════════════════
//
// 사용 방법:
//   1) Apps Script 편집기 상단 함수 선택에서 setupQuoteSheet 선택
//   2) ▶ 실행
//   3) 권한 승인 (이미 했으면 바로 실행됨)
//   4) "견적요청 시트가 생성되었습니다" 알림 뜨면 끝
// ════════════════════════════════════════════════════════════

function setupQuoteSheet() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) {
    const msg = '❌ 활성 시트를 찾을 수 없습니다. 시트(한마음일터-콘텐츠)를 먼저 열고 확장 프로그램 → Apps Script로 들어가서 실행해주세요.';
    Logger.log(msg);
    return msg;
  }

  let sheet = ss.getSheetByName(QUOTE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(QUOTE_SHEET);
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, QUOTE_HEADERS.length)
       .setValues([QUOTE_HEADERS])
       .setFontWeight('bold')
       .setBackground('#FFF4E0');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, QUOTE_HEADERS.length);

  const msg = '✅ 견적요청 시트가 생성되었습니다.\n방문자가 폼을 제출하면 이 시트에 저장되고 ' + NOTIFY_EMAIL + ' 으로 이메일이 발송됩니다.';
  Logger.log(msg);
  safeAlert(msg);
  return msg;
}


// ════════════════════════════════════════════════════════════
// 이메일 테스트 (수동 실행용)
// ════════════════════════════════════════════════════════════
// setupQuoteSheet 실행 후, 이 함수를 한 번 실행하면 샘플 견적 요청이
// onemind6680@daum.net 으로 발송됩니다. 메일이 잘 오는지 확인용.
// ════════════════════════════════════════════════════════════

function testQuoteEmail() {
  const sample = {
    company: '테스트 기관',
    dept: '홍보팀',
    position: '팀장',
    name: '테스터',
    phone: '010-1234-5678',
    email: 'test@example.com',
    product: '리플렛',
    title: '테스트 제목 — 견적 메일 형식 확인',
    qty: '500부',
    due: '2026-02-01',
    detail: '이 메일이 보이면 알림 시스템이 잘 작동하는 것입니다.\n\n색상·서식·줄바꿈이 모두 정상으로 표시되는지 확인해주세요.',
    memo: '참고 사항도 잘 들어가는지 테스트'
  };
  sendQuoteNotificationEmail(sample, 'TEST0001');
  const msg = '✅ 테스트 이메일 발송 완료. ' + NOTIFY_EMAIL + ' 메일함을 확인해주세요.';
  Logger.log(msg);
  safeAlert(msg);
  return msg;
}

// UI 컨텍스트가 있으면 alert, 없으면 무시 (Logger.log는 호출한 쪽에서)
function safeAlert(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // 시트가 안 열려있는 컨텍스트(예: 직접 script.google.com에서 실행)에서는 alert 불가
    // Logger.log로 대체 (호출한 쪽에서 이미 Logger.log 했으므로 여기선 무시)
  }
}


// ════════════════════════════════════════════════════════════
// 이미지·파일 업로드 (관리자 인증 필요)
// ════════════════════════════════════════════════════════════
// admin.html에서 파일 선택 → base64 변환 → POST 전송 →
// 이 함수가 Drive에 저장 + 공개 URL 반환 → 시트에 자동 입력
// ════════════════════════════════════════════════════════════

function handleImageUpload(body) {
  const auth = verifyToken(body.token);
  if (!auth) return { success: false, error: '로그인이 필요합니다.' };

  if (!body.base64 || !body.mimeType || !body.filename) {
    return { success: false, error: '파일 정보가 누락되었습니다.' };
  }

  try {
    // 업로드 폴더 가져오기 (없으면 생성)
    const folder = getOrCreateUploadFolder();

    // base64 → Blob
    const bytes = Utilities.base64Decode(body.base64);
    const blob = Utilities.newBlob(bytes, body.mimeType, body.filename);

    // Drive에 파일 생성
    const file = folder.createFile(blob);

    // 공개 읽기 권한 부여 (링크가 있는 모든 사람)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();

    return {
      success: true,
      fileId: fileId,
      // 이미지 표시용 직접 URL (img src에 바로 사용 가능)
      imageUrl: `https://lh3.googleusercontent.com/d/${fileId}`,
      // 일반 다운로드 URL (PDF·HWP 등 자료실용)
      downloadUrl: `https://drive.google.com/uc?id=${fileId}&export=download`,
      // Drive 공유 링크 (참고용)
      driveUrl: file.getUrl(),
      filename: body.filename,
      size: file.getSize()
    };
  } catch (err) {
    return { success: false, error: '업로드 실패: ' + String(err) };
  }
}

function getOrCreateUploadFolder() {
  const folders = DriveApp.getFoldersByName(UPLOAD_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(UPLOAD_FOLDER_NAME);
}
