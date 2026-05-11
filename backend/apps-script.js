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
