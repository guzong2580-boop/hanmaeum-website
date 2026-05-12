// ════════════════════════════════════════════════════════════
// 한마음일터 — 콘텐츠 관리 백엔드 (Google Apps Script)
// ════════════════════════════════════════════════════════════
// 이 코드는 사용자가 만든 setup 프로젝트(같은 시트의 Apps Script)에
// 기존 setupSheets 함수 아래에 붙여넣기 → 저장 → 웹앱 배포
// ════════════════════════════════════════════════════════════

const TYPE_CONFIG = {
  notices: {
    sheet: '공지사항',
    headers: ['id', 'title', 'type', 'date', 'body', 'createdAt']
  },
  archive: {
    sheet: '자료실',
    headers: ['id', 'title', 'description', 'type', 'size', 'date', 'fileUrl', 'createdAt']
  },
  gallery: {
    sheet: '갤러리',
    headers: ['id', 'title', 'date', 'imageUrl', 'color', 'emoji', 'createdAt']
  }
};

const USER_SHEET = '사용자';
const TOKEN_TTL_HOURS = 24;

// 견적요청 — 인증 불필요 (방문자 폼)
const QUOTE_SHEET = '견적요청';
const QUOTE_HEADERS = ['id','company','dept','position','name','phone','email','product','title','qty','due','detail','memo','createdAt'];

// 알림 수신 이메일 (시설장)
const NOTIFY_EMAIL = 'onemind6680@daum.net';


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
      case 'login':  return jsonResp(handleLogin(body));
      case 'list':   return jsonResp(handleList(e.parameter.type));
      case 'create': return jsonResp(handleCreate(e.parameter.type, body));
      case 'update': return jsonResp(handleUpdate(e.parameter.type, e.parameter.id, body));
      case 'delete': return jsonResp(handleDelete(e.parameter.type, e.parameter.id, body));
      case 'verify': return jsonResp(handleVerifyToken(body.token));
      case 'quote':  return jsonResp(handleQuoteSubmit(body));
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

function handleLogin(body) {
  const { id, password } = body;
  if (!id || !password) {
    return { success: false, error: 'ID와 비밀번호를 입력해주세요.' };
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(USER_SHEET);
  if (!sheet) return { success: false, error: '사용자 시트를 찾을 수 없습니다.' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]) === String(id) && String(row[1]) === String(password)) {
      const token = Utilities.getUuid();
      const tokenData = {
        userId: id,
        userName: row[2] || '',
        expiresAt: Date.now() + TOKEN_TTL_HOURS * 3600 * 1000
      };
      PropertiesService.getScriptProperties().setProperty('tk_' + token, JSON.stringify(tokenData));
      return { success: true, token, name: row[2] || '', id };
    }
  }
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

function handleList(type) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return { success: false, error: 'Unknown type: ' + type };

  const sheet = SpreadsheetApp.getActive().getSheetByName(cfg.sheet);
  if (!sheet) return { success: false, error: '시트를 찾을 수 없습니다: ' + cfg.sheet };

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
  // 최신순 정렬 (배열 뒤집기 — appendRow는 항상 끝에 추가하므로)
  items.reverse();
  return { success: true, items };
}

function handleCreate(type, body) {
  const cfg = TYPE_CONFIG[type];
  if (!cfg) return { success: false, error: 'Unknown type: ' + type };

  const auth = verifyToken(body.token);
  if (!auth) return { success: false, error: '로그인이 필요합니다.' };

  const sheet = SpreadsheetApp.getActive().getSheetByName(cfg.sheet);
  const id = Utilities.getUuid().substring(0, 8);
  const createdAt = new Date();

  const row = cfg.headers.map(h => {
    if (h === 'id') return id;
    if (h === 'createdAt') return createdAt;
    return body[h] !== undefined ? body[h] : '';
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
          sheet.getRange(i + 1, idx + 1).setValue(body[h]);
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
  // 필수 필드 검증
  const required = ['company','name','phone','email','product','title','qty','detail'];
  for (const f of required) {
    if (!body[f] || String(body[f]).trim() === '') {
      return { success: false, error: '필수 항목이 누락되었습니다: ' + f };
    }
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(QUOTE_SHEET);
  if (!sheet) {
    return { success: false, error: '견적요청 시트가 없습니다. setupQuoteSheet 함수를 먼저 실행해주세요.' };
  }

  const id = Utilities.getUuid().substring(0, 8);
  const createdAt = new Date();

  const row = QUOTE_HEADERS.map(h => {
    if (h === 'id') return id;
    if (h === 'createdAt') return createdAt;
    return body[h] !== undefined ? body[h] : '';
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
