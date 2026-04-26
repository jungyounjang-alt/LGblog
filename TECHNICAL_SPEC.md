# LGblog 기술 명세서

LG전자서비스 블로그 콘텐츠 관리 시스템. 매일 LG "스스로 해결" 신규/수정 글을 자동 추적해서 협력업체와 공유하고, 중복 발행을 사전에 차단합니다. 과거 중복 게시로 영구 정지된 사고가 시스템의 첫 동기.

---

## 1. 핵심 가치 (왜 만들었나)

**문제**:
- 매일 수동으로 LG 스스로 해결 페이지를 카테고리별로 뒤지고 있음
- 협력업체에게 메신저로 링크 보내는 비효율
- 블로그에 무엇이 언제 올라갔는지 추적 안 됨 → 중복 게시로 네이버 영구 정지 사고

**시스템이 해결하는 것**:
1. **자동 수집**: LG 스스로 해결 글 4,200+개를 카테고리별로 자동 크롤
2. **중복 검증**: 네이버 블로그 발행 이력과 자동 비교 (제목 정규화 매칭)
3. **공유 워크플로우**: 협력업체와 동일 화면 공유 → 발행 후 클릭 한 번으로 처리
4. **시즌 추천**: 월별 가전 추천 + 발행 분포 분석

---

## 2. 기술 스택

| 레이어 | 선택 | 이유 |
|---|---|---|
| 프런트엔드 | React 18 + TypeScript + Vite 5 | GSIAgent와 톤 통일, i18n 한·영 |
| 백엔드 | Node.js + Express 4 + tsx | 단일 사용자 MVP, 서버리스 부담 X |
| 저장 (개발) | JSON 파일 (`data/*.json`) | DB 서버 불필요, 백업이 파일 복사 |
| 저장 (호스팅) | PostgreSQL via `pg` | `DATABASE_URL` 있으면 자동 전환 |
| 크롤링 | axios + cheerio | LG는 AJAX, Naver는 HTML — 둘 다 가벼움 |
| 인증 | 공유 토큰 (admin / partner) | 별도 사용자 DB 없이 권한 분리 |
| 배포 | Dockerfile + Railway | Express + 정적 한 번에 |

**의존성 핵심**:
- `axios`, `cheerio` — 크롤러
- `express`, `cors` — API
- `pg` — Postgres 어댑터
- `react`, `react-dom`, `vite` — UI
- `tsx` — TS 직접 실행 (런타임 deps)

---

## 3. 데이터 모델

### 3.1 카테고리 (`data/categories.json`)
```ts
interface Category {
  id: string;              // CT50019441
  nameKo: string;          // 냉장고/김치냉장고
  nameEn: string;
  subcategories: Subcategory[];
}
interface Subcategory {
  id: string;              // CT50019468
  productCode: string;     // SISBS (옵션, 빈 문자열 OK)
  nameKo: string;          // 양문형 냉장고
  nameEn: string;
}
```
- 14개 대분류 + 50개 서브카테고리 자동 발견됨 (`/api/sync-all` 시)
- 기타 카테고리(서브 0개)는 LG 사이트에 서브가 없는 것

### 3.2 LG 스스로 해결 글 (`data/source_articles.json`)
```ts
interface SourceArticle {
  seqId: string;           // URL의 solutions-{이것}, 고유 ID
  title: string;
  url: string;
  categoryId: string;
  subcategoryId: string;
  productCode: string;
  cateName: string;        // 응답 표시용 카테고리명
  topic: string;
  sympSubName: string;
  bodySummary: string;     // listData.content
  bodyText: string | null; // 상세 페이지에서 추출 (선택적, 미구현)
  publishedAt: string | null; // YYYY-MM-DD
  modifiedAt: string | null;
  view: string | null;     // 조회수 문자열 ("154,745")
  hasVideo: boolean;
  firstSeenAt: string;     // ISO
  lastCheckedAt: string;   // ISO
  workflow?: WorkflowState;
}

interface WorkflowState {
  status: 'pending' | 'requested' | 'in_progress' | 'review' | 'published';
  assignee: string | null;
  memo: string | null;
  requestedAt: string | null;
  updatedAt: string;
  acknowledged?: boolean;  // "확인" 체크박스 — 할 일 목록에서 제외
}
```

### 3.3 네이버 블로그 글 (`data/blog_posts.json`)
```ts
interface BlogPost {
  postId: string;          // blog.naver.com/lgeservice_kr/{이것}
  title: string;
  url: string;
  publishedAt: string | null;
  categoryNo: string | null;
  categoryNameKo: string | null;
  sourceSeqId: string | null;  // 매핑된 source article의 seqId
  assignedTo: string | null;
  addedAt: string;
  source: 'manual' | 'backfill_naver' | 'backfill_csv';
}
```

### 3.4 알림 (`data/notification_log.json`, `data/notification_settings.json`)
- 발행 요청 / 발행 완료 시점에 자동 기록
- Webhook URL 설정 시 외부로 푸시 (Slack/Discord/카톡 알림톡 호환)

---

## 4. 발견한 외부 API (재검증 필요 시 참조)

### 4.1 LG 스스로 해결 — 글 목록
```
POST https://www.lge.co.kr/support/solutions/searchSolutionsList.lgajax
Headers:
  X-Requested-With: XMLHttpRequest
  Content-Type: application/x-www-form-urlencoded
  Referer: https://www.lge.co.kr/support/solutions
Body: category=CT...&subCategory=CT...&pageCode=B00013&isMyProduct=N&preLoad=Y&sort=update&page=1
```
응답: `{ data: { listData: [...10건], listPage: { page, totalCount } } }`
- `productCode`는 빈 문자열 OK (구버전 코드는 명시했으나 불필요)
- `seqId`는 `listData[].url`의 `solutions-(\d+)` 정규식으로 추출

### 4.2 LG 스스로 해결 — 서브카테고리 발견
```
POST https://www.lge.co.kr/support/selectTwoCategoryList.lgajax
Body: cateSelect=CT50019441&menuCode=B00013
```
응답: `{ data: [{code, name}, ...], status: "success" }`
- 14개 대분류 각각에 호출 → 50개 서브 자동 발견됨

### 4.3 LG 스스로 해결 — 글 상세
```
GET https://www.lge.co.kr/support/solutions-{seqId}
```
- 서버 렌더링 HTML — cheerio로 본문/수정일 파싱 가능
- 현재는 listData의 summary로 충분해서 상세 fetch는 미사용

### 4.4 네이버 블로그 PostList
```
GET https://blog.naver.com/PostList.naver?blogId=lgeservice_kr&from=postList&currentPage=1&categoryNo=7
```
- `categoryNo` **필수** (없으면 환영 iframe만 옴)
- `li.item > a.link[href]` → `logNo=(\d+)` → postId
- `strong.title` → 제목, `span.date` → "YYYY. M. D." 포맷
- 페이지당 16건. categoryNo 1~50 순회로 전체 발견 (실제 활성: 1, 6, 7, 9 — 4개)

---

## 5. 현재 데이터 (마지막 작업 시점)

| 항목 | 수치 |
|---|---|
| 대분류 카테고리 | 14 |
| 서브카테고리 | 50 |
| 크롤된 LG 글 | 4,208 |
| 백필된 네이버 블로그 글 | 825 |
| 활성 네이버 categoryNo | 1, 6, 7, 9 |
| 자동 매칭된 글 (제목 동일) | 12 |

---

## 6. 핵심 모듈 지도

```
LGblog/
├── server/
│   ├── index.ts                   # Express 라우터 + 백그라운드 잡 (sync-all, backfill-all)
│   ├── auth.ts                    # 토큰 미들웨어 (admin/partner)
│   ├── store.ts                   # JSON ↔ Postgres 어댑터 (DATABASE_URL 분기)
│   ├── dedup.ts                   # 중복 검증 엔진 (3단계: seqId → 제목 정규화 → 코사인)
│   ├── seasonal.ts                # 월별 추천 로직
│   ├── notifications.ts           # webhook 어댑터 + 인박스
│   ├── types.ts                   # 공유 타입
│   ├── crawlers/
│   │   ├── lge.ts                 # 스스로 해결 크롤러 + 서브 발견
│   │   └── naverBlog.ts           # 네이버 블로그 PostList 파서
│   └── db/
│       ├── schema.sql             # Postgres 스키마
│       └── pg.ts                  # pgStore 구현
├── src/
│   ├── App.tsx                    # 대시보드 (오늘의 할 일, 필터, 행 렌더)
│   ├── PostLinkCell.tsx           # 포스팅 링크 셀 (확정/자동매칭/직접입력 3상태)
│   ├── CategoryManager.tsx        # 카테고리 관리 모달 (지금은 거의 안 씀)
│   ├── NotificationsPanel.tsx     # 알림 설정 + 인박스 모달
│   ├── SeasonalPanel.tsx          # 이번 달 추천 패널
│   ├── WorkflowModal.tsx          # 발행 요청/완료 등록/메모 (현재 트리거 없음)
│   ├── authClient.ts              # 토큰 fetch 가로채기 + URL ?token= 처리
│   ├── i18n.ts                    # 한·영 STRINGS 객체
│   └── styles.css                 # 단일 CSS 파일
├── scripts/
│   ├── db-init.ts                 # Postgres 스키마 생성
│   └── migrate-json-to-pg.ts      # JSON → Postgres 일회성 이전
├── data/
│   ├── categories.json            # 시드 (Git에 포함)
│   ├── source_articles.json       # 4,208건 (gitignored)
│   ├── blog_posts.json            # 825건 (gitignored)
│   ├── settings.json              # 마지막 크롤/백필 시각
│   ├── notification_log.json      # (gitignored)
│   └── notification_settings.json # (gitignored)
├── share.ps1                       # 가입 없이 공유 (localtunnel)
├── Dockerfile / railway.json       # 호스팅 배포
├── DEPLOY.md                       # Railway + Postgres 가이드
└── SHARE.md                        # 가입 없는 공유 가이드
```

---

## 7. 빌드된 기능 (모듈별)

### 7.1 크롤러
- ✅ **🔄 LG 전체 갱신** 버튼: 14개 대분류 안 모든 서브카테고리 자동 발견 → 크롤 → progressive save
- ✅ **네이버 블로그 백필**: 단일 `categoryNo` 또는 1..50 자동 순회 (background job + 진행률)
- ✅ 재시작 안전: 한 카테고리 끝날 때마다 저장
- ✅ 정중한 요청 간격 (LG 700ms, Naver 2.5s)

### 7.2 중복 검증
- ✅ Stage 1: `sourceSeqId` 매핑 (확정)
- ✅ Stage 2: 제목 정규화 (공백·조사 제거 후 비교) — 자동 매칭 표시
- ⚙️ Stage 3: 본문 코사인 유사도 (default off, 노이즈 많음)
- ✅ 인덱스 기반 lookup으로 O(n+m)으로 가속됨

### 7.3 위험도 평가
- 🔴 30일 이내 동일 글 → 발행 금지
- 🟡 31~180일 → 신중 검토
- 🟢 180일+ → 재발행 검토 가능
- ✨ 신규 (매칭 없음)

### 7.4 협업 워크플로우
- 상태: pending → requested → in_progress → review → published
- 자동 published 전환: blog_post에 sourceSeqId 매핑되면 자동
- 인라인 [+ URL] 셀: URL 붙여넣고 Enter → blog_post 생성 + sourceSeqId 매핑
- [✓ 매칭] 버튼: 자동 매칭된 거 한 번 클릭으로 확정
- ☐ 확인 체크박스: 발행 안 하기로 한 행 정리

### 7.5 시즌 추천
- 월별 카테고리 (1~12월) + 명절·장마·김장철 마커
- 이번 달 권장 vs 실제 발행 비교 → ✅ ok / 🟡 low / 🔴 critical
- 데이터: [server/seasonal.ts](server/seasonal.ts)의 MONTHLY 테이블

### 7.6 알림
- Webhook URL 1개로 Slack/Discord/Teams/카톡 알림톡 호환
- 트리거: workflow status='requested' 진입, blog_post 등록 시
- 인박스에 항상 기록 (webhook 미설정이어도)

### 7.7 권한
- ADMIN_TOKEN: 모든 액션
- PARTNER_TOKEN: 보기 + 워크플로우 + 발행 등록 / 크롤·설정·알림 액션 자동 숨김
- 토큰 미설정 시 인증 우회 (로컬 개발 모드)
- URL `?token=xxx` 첫 방문 시 localStorage 저장 → 이후 토큰 없이 접속 가능

---

## 8. 운영

### 8.1 로컬 개발
```bash
npm install
npm run dev   # Vite (5173) + Express (3001) 동시
```
브라우저: http://localhost:5173

### 8.2 가입 없는 협력업체 공유
```powershell
.\share.ps1   # build + start + localtunnel
```
URL: `https://lgblog-yj.loca.lt/?token=...`
**제약**: 본인 PC가 켜져 있어야 협력업체 접속 가능. 슬립 방지 필수.

### 8.3 호스팅 (24/7)
[DEPLOY.md](DEPLOY.md) — Railway + Postgres + 토큰. GitHub 로그인 1회만 필요. 30~60분.

### 8.4 데이터 마이그레이션
JSON → Postgres:
```bash
DATABASE_URL=postgresql://... npm run migrate:json-to-pg
```

---

## 9. 알려진 한계

1. **로컬 모드는 단일 사용자 가정**: JSON 파일 동시 쓰기 보호 X. 호스팅 + Postgres로 가야 멀티 사용자.
2. **본문 코사인 default off**: 4,000+ × 800+ = O(3.2M) 비교가 무거움. 명시적 "중복 찾기" 액션에서만 켜는 식으로 분리 권장.
3. **네이버 봇 감지**: 백필은 수동 트리거만. 자동 cron 돌리면 차단 위험.
4. **HMR과 useState**: 초기값 변경 시 하드 새로고침 필요 (Vite 한계, 운영 무관).
5. **크롤러 장애 회복**: 개별 카테고리 실패는 console.warn만, 재시도 로직 없음.

---

## 10. 다음 작업 후보 (우선순위 순)

### 즉시 가능
- [ ] **24/7 호스팅 전환**: GitHub 로그인 → Railway 배포 → URL 영구화. [DEPLOY.md](DEPLOY.md) 준비됨.
- [ ] **자동 일일 크롤**: GitHub Actions cron으로 매일 아침 `/api/sync-all` 호출 (호스팅 후)
- [ ] **연관 글 묶기**: 시리즈물(예: "냉장고 자가진단 1~5편") 그룹핑

### 중기
- [ ] **블로그 통계 연동**: 네이버 블로그 통계 API로 조회수/체류시간 → 인기글 분석
- [ ] **재발행 추천**: 1년 이상 지난 인기글 + 중복 검증 통과한 것 자동 표시
- [ ] **SEO 트래킹**: 네이버 검색 노출 순위 주기적 체크
- [ ] **CSV 백필 import**: 협력업체에서 받은 엑셀 → blog_posts로 일괄 import

### 장기
- [ ] **이미지 매칭**: 본문 이미지 hash 비교로 중복 감지 강화
- [ ] **트렌드 외부 신호**: 네이버 데이터랩 / 기상청 API → 검색량 급등 키워드 연동

---

## 11. 디버깅 노트

### LG 사이트 변경 감지
- 만약 크롤이 0건 반환하면 LG가 엔드포인트를 바꿨을 가능성. 다음 순서로 점검:
  1. `https://www.lge.co.kr/support/solutions?category=CT50019441&subCategory=CT50019468` 접속해서 글 보이는지
  2. DevTools Network 탭에서 새 엔드포인트 URL/payload 확인
  3. [server/crawlers/lge.ts](server/crawlers/lge.ts)의 `LIST_ENDPOINT` / `SUBCAT_ENDPOINT` 갱신

### Naver PostList 변경 감지
- 셀렉터(`li.item > a.link`, `strong.title`, `span.date`)가 깨졌으면 마찬가지로 Network 탭에서 raw HTML 확인 후 [server/crawlers/naverBlog.ts](server/crawlers/naverBlog.ts) 갱신

### 인증 우회 (로컬 디버깅)
- ADMIN_TOKEN/PARTNER_TOKEN 환경변수 둘 다 비우면 모든 요청이 admin으로 통과 (로컬 개발 편의)

---

## 12. 변경 이력 (Git)

이 저장소의 첫 커밋은 본 작업 세션 끝에 단일 commit으로 만들어졌습니다. 향후 변경은 git log를 참조.

```bash
git log --oneline
```

작업 진행하다 막히는 부분 있으면 [CLAUDE memory](C:\Users\user\.claude\projects\)의 LGblog 컨텍스트도 참고됨.
