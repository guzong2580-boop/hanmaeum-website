# 한마음일터 — 관리자 시스템 배포 가이드

이 문서는 로컬에 만들어둔 Decap CMS 관리자 시스템을 실제로 작동시키기 위한 단계별 가이드입니다.

전체 소요 시간: **약 30~60분** (한 번만 하면 됩니다)

---

## 사전 준비

- ✅ GitHub 계정 (이미 보유)
- ✅ Netlify 계정 (이미 보유, 사이트 배포 중)
- ✅ 관리자가 사용할 이메일 주소 (예: hjz7930@naver.com)

---

## Step 1 — GitHub 저장소 만들기 (5분)

1. https://github.com/new 접속
2. 다음과 같이 입력:
   - **Repository name**: `hanmaeum-website`
   - **Description**: 한마음일터 홈페이지 (선택)
   - **Public** ✅ 선택
   - "Initialize this repository with..." 체크박스는 **모두 해제**
3. 초록색 `Create repository` 버튼 클릭
4. 생성 후 표시되는 URL 복사 (예: `https://github.com/guzong2580-boop/hanmaeum-website.git`)

---

## Step 2 — 로컬 폴더를 GitHub에 푸시 (3분)

PowerShell에서 한마음일터재업 폴더로 이동 후:

```powershell
cd "c:\Users\adimin\Desktop\한마음일터재업"
git remote add origin https://github.com/<사용자명>/hanmaeum-website.git
git branch -M main
git push -u origin main
```

처음 푸시할 때 GitHub 로그인 창이 뜨면 계정으로 인증.

---

## Step 3 — Netlify를 GitHub 저장소에 연결 (5분)

1. https://app.netlify.com/projects/iridescent-kataifi-a2538c 접속
2. 좌측 메뉴 → **Site configuration** → **Build & deploy** → **Continuous deployment**
3. **Link repository** 또는 **Link to Git** 클릭
4. **GitHub** 선택 → 권한 승인
5. `hanmaeum-website` 저장소 선택
6. Build 설정:
   - **Branch**: `main`
   - **Build command**: 비워두기 (또는 `echo "no build"`)
   - **Publish directory**: `.` (점 하나)
7. **Save**

이후 GitHub에 푸시할 때마다 Netlify가 자동 배포합니다.

---

## Step 4 — Netlify Identity 활성화 (5분)

관리자 로그인 기능을 켭니다.

1. Netlify 대시보드 → **Site configuration** → **Identity**
2. **Enable Identity** 클릭
3. 아래 설정으로:
   - **Registration**: **Invite only** ✅ (아무나 가입 못 하게)
   - **External providers**: 선택사항 (필요하면 Google/GitHub 로그인 추가)

---

## Step 5 — Git Gateway 활성화 (3분)

CMS가 GitHub 저장소에 글을 쓸 수 있게 합니다.

1. **Identity** 페이지에서 아래로 스크롤 → **Services** 섹션
2. **Git Gateway** → **Enable Git Gateway** 클릭
3. (필요 시) Roles 설정 — 일단 비워두면 모든 로그인 사용자가 편집 가능

---

## Step 6 — 관리자 초대 메일 보내기 (2분)

1. **Identity** → 상단 **Invite users** 버튼
2. 관리자 이메일 입력 (예: `hjz7930@naver.com`)
3. **Send** 클릭
4. 관리자 이메일함에서 초대 메일 확인 → **Accept the invite** 링크 클릭
5. 비밀번호 설정 후 가입 완료

---

## Step 7 — 사용 시작 🎉

관리자가 다음 주소로 접속:

**https://iridescent-kataifi-a2538c.netlify.app/admin/**

→ 이메일·비밀번호 입력 → 로그인
→ 좌측 메뉴에서 **공지사항 / 자료실 / 갤러리** 선택
→ 글 추가/수정/삭제
→ **Publish** 버튼 클릭

저장하면 자동으로 GitHub에 커밋되고, Netlify가 1~2분 안에 사이트를 자동 갱신합니다.

---

## 폴더 구조 참고

```
hanmaeum-website/
├── admin/
│   ├── index.html        ← Decap CMS 로딩 페이지
│   └── config.yml        ← 콘텐츠 컬렉션 정의 (편집 X)
├── content/
│   ├── notices.json      ← 공지사항 데이터 (CMS가 관리)
│   ├── archive.json      ← 자료실 데이터 (CMS가 관리)
│   └── gallery.json      ← 갤러리 데이터 (CMS가 관리)
├── uploads/              ← CMS가 업로드한 파일·이미지 저장 (자동 생성)
├── community.html        ← JSON을 fetch해서 동적 렌더링
└── (그 외 페이지·자산들)
```

---

## 트러블슈팅

### Q. /admin/ 접속 시 "접근 거부" 또는 빈 화면
- Netlify Identity가 활성화되어 있는지 확인
- Git Gateway가 활성화되어 있는지 확인
- 브라우저 캐시 삭제 후 재시도 (Ctrl+Shift+R)

### Q. 저장은 됐는데 사이트에 반영 안 됨
- Netlify 대시보드 → Deploys 에서 빌드 상태 확인
- 1~2분 대기 후 강력 새로고침

### Q. CMS 로그인이 안 됨
- 초대 메일의 "Accept the invite" 링크를 1번만 클릭했는지 확인
- 만료됐으면 Netlify Identity → 해당 사용자 → Resend invitation

### Q. 로컬에서 미리 테스트하고 싶음
- `admin/config.yml`에서 `local_backend: true` 주석 해제
- 터미널에서 `npx decap-server` 실행 (포트 8081)
- 다른 터미널에서 사이트 정적 서버 실행 (예: `npx serve .`)
- http://localhost:5000/admin/ 접속

---

## 향후 확장 아이디어

- **소개 페이지의 인사말·연혁도 CMS로 관리** → `admin/config.yml`에 새 collection 추가
- **자원봉사·후원 신청 폼** → Netlify Forms 연동 (서버 코드 없이 이메일 알림)
- **관리자 권한 분리** → Identity Roles 사용 (관리자/작성자 분리)
