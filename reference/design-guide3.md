# 디자인 레퍼런스 분석 — 디자인스크린샷.png

> 행복공감 장애인보호작업장 스타일 — 한마음일터 적용 가이드

---

## 1. 전체 인상 & 브랜드 포지셔닝

### 1.1 핵심 인상
- **친근하고 따뜻한 공공 서비스 톤** (장애인복지/행정기관 분위기)
- **밝고 부드러운 파스텔 컬러** + **선명한 메인 컬러** 대비
- **일러스트 중심의 감정 전달** — 사진보다 일러스트가 더 친근함
- **가독성·접근성 우선** — 모든 정보가 명확히 구획돼 있음

### 1.2 적용 방향
한마음일터는 B2B 인쇄·홍보물 제작 + 장애인직업재활시설이라는 **두 정체성을 동시 전달**해야 합니다.
이 레퍼런스의 따뜻하고 친근한 톤은 후자(사회적 가치)에 적합하므로,
**기존 design-guide2의 비즈니스 톤** + **이 가이드의 감정·접근성 요소**를 혼합하면 좋습니다.

---

## 2. 컬러 시스템

### 2.1 메인 팔레트
```
Hero 배경 (Lavender):    #E5DFF7  →  #DCD3F0
Primary Blue (포인트):   #4A6FE3  →  #3D5DD0
Section Blue (공지):     #5B7FE8  →  #4A6FE3
Footer Navy:             #1B2845  →  #243155
순백 배경:               #FFFFFF
크림 배경 (선택):        #FAF9F6
```

### 2.2 강조/보조 컬러
```
보라 텍스트 헤드:        #6B5BC9
일러스트 그린 (옷):      #6B8C5C
일러스트 핑크 (얼굴):    #F4C8B5
구름/클라우드:            #FFFFFF (with shadow #E8E8F0)
```

### 2.3 한마음일터 적용 매핑
| 레퍼런스          | 한마음일터 적용              | HEX           |
| ----------------- | --------------------------- | ------------- |
| Lavender Hero     | Hero 배경 (밝은 옵션)       | `#E5DFF7`     |
| Primary Blue      | 강조 CTA, 링크              | `#4A6FE3`     |
| Section Blue      | 공지/소식 섹션              | `#5B7FE8`     |
| Footer Navy       | Footer (현재 다크 그린 대체) | `#1B2845`     |
| 그린 (현재 유지)  | 환경친화·작업장 정체성      | `#6E7D5B`     |

> **권장**: 다크 그린(현재 design-guide2)을 메인으로 유지하되, **공지·갤러리 섹션에서 블루 계열 도입**으로 따뜻함 추가.

---

## 3. 타이포그래피

### 3.1 폰트 패밀리 추정
- **헤드라인**: 한글 손글씨/캐주얼 sans (예: `EF손글씨`, `Cafe24 Ssurround`, `잘난체`)
  → 한마음일터 적용 시 `Pretendard Bold`로 대체 가능 (정중함 유지)
- **본문**: `Noto Sans KR` 계열 (둥근 sans)
- **영문 강조**: `Montserrat Bold` 또는 `Poppins`

### 3.2 사이즈 스케일
| 용도               | px         | 비고                            |
| ------------------ | ---------- | ------------------------------- |
| Hero Headline      | 38–46px    | 2줄, 손글씨 느낌                |
| Hero Sub           | 14–16px    | 일반 sans, 회색                  |
| Section Title      | 24–28px    | "공지 및 소식" 양옆 구분선과 함께 |
| Card Title         | 16–18px    | bold                             |
| Body               | 14–15px    | line-height 1.6                  |
| Small/Meta         | 12–13px    | 회색                             |

### 3.3 색상 운용
- 헤드라인: 보라/블루 (`#6B5BC9` 또는 `#4A6FE3`)
- 본문: `#333` ~ `#555`
- 메타: `#888`
- 다크 섹션 위: 흰색 + 일부 흐린 회색

---

## 4. 레이아웃 구조 (섹션별 분석)

### 4.1 Header (네비게이션)
- **배경**: 흰색
- **구성**: [로고+기관명 좌측] [중앙 메뉴 5–7개] [우측 로그인/연락처]
- **높이**: 약 64–72px
- **메뉴**: 한글 가로배치, 폰트 14–15px
- **하단**: 얇은 구분선 (`#EEE`)

### 4.2 Hero Section
- **배경**: 라벤더 그라데이션 + **점·구름 도트 패턴**
- **레이아웃**: 좌측 텍스트 (50%) + 우측 캐릭터 일러스트 (50%)
- **텍스트 배치**: 좌측 상단에서 시작
  - 1줄: 손글씨 헤드라인 (보라)
  - 2줄: 손글씨 헤드라인 계속
  - 3줄: 본문 설명 (회색 sans)
- **일러스트**: 두 명의 캐릭터(남/여)가 환호하는 모습 + 영문 "HAPPINESS SYMPATHY"
- **하단**: 흰 구름 illustration + 5–6개 마이크로 카드(아이콘 뱃지)
- **높이**: 화면의 약 60–70%

### 4.3 공지 및 소식 (Notice/News)
- **배경**: 진한 블루 (`#5B7FE8`)
- **섹션 타이틀**: 흰색 텍스트 + 양옆에 짧은 가로선 (─ 공지 및 소식 ─)
- **카드 그리드**: 3컬럼
  - [공지사항 리스트] [최신글] [지도/위치]
  - 각 카드: 흰 배경, 둥근 모서리(border-radius: 12–16px), 그림자
- **카드 내부**: 제목 → 짧은 본문 → 날짜
- **상단 곡선**: 위쪽이 살짝 곡선으로 잘림 (CSS clip-path 또는 SVG)

### 4.4 행복공감 프로그램 안내 (Program List)
- **배경**: 흰색
- **섹션 타이틀**: 검정 + 양옆 가로선 (─ 행복공감 프로그램 안내 ─)
- **부제**: 회색 본문 1–2줄
- **리스트**: 4개 항목, 가로 풀폭 카드
  - 각 카드: [좌측 아이콘 박스(블루)] + [중앙 제목+설명] + [우측 + 버튼]
  - 항목 사이 간격: 12–16px
  - 카드 높이: 약 80–100px
- **+ 버튼**: 원형/사각, 블루(`#4A6FE3`), 흰색 +

### 4.5 갤러리 (Gallery)
- **배경**: 흰색
- **섹션 타이틀**: ─ 갤러리 ─
- **그리드**: 4컬럼 × 2행 (총 8개 사진)
- **사진 비율**: 4:3 또는 1:1
- **카드**: 둥근 모서리, 호버 시 살짝 확대 또는 그림자

### 4.6 Footer
- **배경**: 진한 네이비 (`#1B2845`)
- **상단**: 5–6개 아이콘 링크 (관련 기관/SNS) — 가로 배치, 가운데 정렬
- **중앙**:
  - 좌측: 로고 + 한글 기관명
  - 우측: 주소·전화·이메일 텍스트
- **하단**: 얇은 구분선 + 카피라이트 (12px, 흐린 회색)
- **우측 하단**: 작은 보조 로고

---

## 5. 컴포넌트 라이브러리

### 5.1 섹션 타이틀 (Side-Line Title)
양옆에 가로선이 있는 중앙 정렬 타이틀.
```css
.sec-title-flank {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}
.sec-title-flank::before,
.sec-title-flank::after {
  content: '';
  width: 60px;
  height: 1px;
  background: currentColor;
  opacity: .3;
}
```
HTML:
```html
<h2 class="sec-title-flank">공지 및 소식</h2>
```

### 5.2 라운드 카드 (Soft Card)
```css
.soft-card {
  background: #fff;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0,0,0,.04);
  transition: transform .25s, box-shadow .25s;
}
.soft-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
}
```

### 5.3 프로그램 리스트 아이템
```css
.program-item {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
  background: #fff;
  border: 1px solid #EEF;
  border-radius: 12px;
}
.program-icon {
  width: 56px; height: 56px;
  border-radius: 12px;
  background: #EEF2FF;
  display: flex; align-items: center; justify-content: center;
}
.program-add {
  margin-left: auto;
  width: 40px; height: 40px;
  background: #4A6FE3;
  border-radius: 8px;
  color: #fff;
  font-size: 22px;
}
```

### 5.4 도트/구름 배경 패턴
Hero용 부드러운 패턴.
```css
.bg-dot-cloud {
  background-color: #E5DFF7;
  background-image:
    radial-gradient(circle at 20% 30%, #fff 8px, transparent 9px),
    radial-gradient(circle at 70% 60%, #fff 12px, transparent 13px),
    radial-gradient(circle, rgba(255,255,255,.4) 1.5px, transparent 2px);
  background-size: 200px 200px, 300px 300px, 30px 30px;
}
```

### 5.5 곡선 섹션 분리 (Curved Top)
Hero 다음 블루 섹션처럼 위쪽에 살짝 곡선:
```css
.curved-top {
  border-top-left-radius: 50% 24px;
  border-top-right-radius: 50% 24px;
}
```
또는 SVG wave divider 사용.

---

## 6. 여백 & 리듬

### 6.1 섹션 패딩
| 섹션          | 상하 패딩      | 좌우 (max-width) |
| ------------- | -------------- | ---------------- |
| Hero          | 80px / 60px    | 1200px           |
| 공지·프로그램  | 70px / 70px    | 1200px           |
| 갤러리        | 60px / 60px    | 1200px           |
| Footer        | 50px / 30px    | 1200px           |

### 6.2 컴포넌트 간격
- 카드 그리드 gap: 16–20px
- 리스트 아이템 gap: 12px
- 섹션 타이틀 → 콘텐츠: 36–48px
- 카드 내부 padding: 20–28px

### 6.3 라인 두께
- 구분선: `1px solid #EEE` (라이트) / `1px solid rgba(255,255,255,.15)` (다크)
- 카드 보더: `1px solid #EEF` (있어도/없어도 ok)

---

## 7. 강조 방식

### 7.1 일러스트 활용
- **사진 대신 일러스트**: 친근감, 접근성, 비용 효율
- **캐릭터 표정**: 환호·웃음 → 긍정 메시지
- **영문 강조 텍스트**: "HAPPINESS SYMPATHY"처럼 영문은 일러스트와 결합

### 7.2 색상 대비
- **흰 카드 위 컬러 배경** (공지 섹션처럼)으로 시선 집중
- **+ 아이콘 버튼** (블루)으로 인터랙션 유도
- **다크 푸터**로 정보 영역 명확히 구분

### 7.3 마이크로 디테일
- 헤드라인 끝의 작은 별표(✦)나 점 장식
- 카드 모서리 둥글게(`12–16px`)
- 그림자는 매우 약하게(`rgba(0,0,0,.04)` 수준)

---

## 8. 반응형 가이드

### 8.1 데스크톱 (1280px+)
- 4컬럼 갤러리, 3컬럼 카드, 좌우 분할 hero

### 8.2 태블릿 (768px–1279px)
- 2컬럼 카드, 2컬럼 갤러리, hero는 텍스트 위 / 일러스트 아래

### 8.3 모바일 (<768px)
- 1컬럼, 모든 카드 풀폭
- 섹션 타이틀 양옆 선은 짧게(30px) 또는 제거
- 일러스트 축소(<60vh)

---

## 9. 한마음일터 통합 적용 전략

### 9.1 두 가이드의 역할 분담
| 영역           | design-guide2 (Sunnyisland) | design-guide3 (이 가이드) |
| -------------- | --------------------------- | ------------------------- |
| 비즈니스 섹션  | ✅ Hero, Process, Works     |                           |
| 사회적 가치    |                              | ✅ About, Notice, Gallery |
| 컬러 톤        | 다크 그린 (메인)            | 라벤더·블루 (보조)        |
| 타이포         | Noto Serif (강조)           | Pretendard Bold (친근)    |
| 카드 스타일    | 직각·라인                   | 둥글·소프트              |

### 9.2 권장 섹션 구성 (혼합)
1. Header (흰색, 둘 다 동일)
2. Hero (다크 그린 — design-guide2 유지)
3. 공지/소식 섹션 (블루 — guide3 새로 추가)
4. Problem (라이트 베이지 — guide2)
5. Solution (흰색 — guide2)
6. Process (라이트 — guide2)
7. **시설 소개·작업장 갤러리 (흰색 8그리드 — guide3 추가)**
8. Social Proof (다크 — guide2)
9. FAQ (흰색 — guide2)
10. CTA (다크 그린 — guide2)
11. Footer (네이비 — guide3 색상으로 변경)

### 9.3 추가 권장 컴포넌트
- **시설 소식 카드** (3컬럼, blue 배경 섹션) — 신뢰도 + 활동성 표현
- **갤러리 그리드** (8장, 4×2) — 작업 환경·완성품 사진
- **Side-Line Title** — 한국 공공기관 톤 강조

---

## 10. 즉시 적용 가능한 변경 (Quick Wins)

기존 `index.html`에 다음을 추가하면 이 가이드의 톤이 빠르게 반영됩니다:

1. **Footer 배경**: `var(--bg-footer)` → `#1B2845` (네이비)로 변경
2. **섹션 타이틀**: 일부를 양옆 가로선 스타일로 변경
3. **신규 갤러리 섹션 추가**: Works 섹션 바로 위에 4×2 그리드 갤러리
4. **공지/소식 섹션 추가**: Hero 직후 블루 배경 카드 3개
5. **Hero 배경 옵션**: 현재 다크 그린 + 라벤더 토널 옵션 준비 (시즌별 교체 가능)

---

## 11. 메모

- 이 레퍼런스는 **B2C/공공기관** 톤이라 B2B 느낌의 design-guide2와는 다른 청자.
- 한마음일터의 **이중 정체성**(B2B 인쇄소 + 사회복지시설)을 살리는 데 적합한 보조 가이드.
- 컬러는 **블루 → 그린 토널**로 치환하면 통일감 유지 가능.
- 일러스트가 없을 경우 **사진 그라데이션 오버레이**로 대체.
