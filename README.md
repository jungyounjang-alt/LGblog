# LG전자서비스 블로그 콘텐츠 관리 시스템

LG전자 "스스로 해결" 페이지 신규/수정 글을 자동 추적하고, 네이버 블로그(`lgeservice_kr`) 발행 이력과 비교해 중복 발행을 사전에 차단합니다.

## 빠른 시작

```bash
npm install
npm run dev
```

- 프런트: http://localhost:5173
- API: http://localhost:3001

## 아키텍처

- **프런트**: React + TypeScript + Vite
- **백엔드**: Node.js + Express (`tsx`로 dev 실행)
- **저장**: `data/` 폴더의 JSON 파일 (DB 없음)
- **크롤러**:
  - LG: `searchSolutionsList.lgajax` 엔드포인트 직접 호출 (Playwright 불필요)
  - 네이버 블로그: `PostList.naver` HTML 파싱 (백필용 일회성)
- **중복 검증**: seqId 매칭 → 제목 정규화 비교 → 코사인 유사도

## 데이터 파일

```
data/
├── categories.json      ← LG 카테고리 시드 (수동 확장)
├── source_articles.json ← 스스로 해결 글 (크롤러가 갱신)
├── blog_posts.json      ← 네이버 블로그 발행 이력
└── settings.json        ← 마지막 크롤/백필 시각
```

## API 요약

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |
| GET | `/api/categories` | 카테고리 시드 조회 |
| GET | `/api/dashboard` | 통합 대시보드 (위험도 포함) |
| POST | `/api/crawl/lge` | 스스로 해결 크롤 (단일 또는 전체) |
| POST | `/api/backfill/naver` | 네이버 블로그 백필 |
| POST | `/api/blog-posts/manual` | 발행 글 URL 수동 등록 |

## 개발 주의

- 크롤러는 요청 간격 1.2~2.5초로 정중하게 실행
- 네이버 백필은 **수동 트리거만** (자동 반복 X) — 봇 감지 회피
- JSON 파일 동시 쓰기 방지: 단일 사용자 MVP 전제. 멀티 사용자 단계에서 SQLite/Postgres로 마이그레이션
