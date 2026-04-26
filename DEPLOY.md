# 배포 가이드 — Railway + Postgres

협력업체와 공유할 수 있도록 호스팅하는 방법입니다. 약 30~60분 소요.

## 사전 준비

1. [Railway](https://railway.app) 계정 (GitHub로 가입 가능, 무료 티어로 시작)
2. 본 저장소를 GitHub에 push (private 권장)
3. 두 개의 비밀 토큰을 미리 정해두세요:
   - **ADMIN_TOKEN**: 본인용 (예: `admin-aB3xK9...`)
   - **PARTNER_TOKEN**: 협력업체용 (예: `partner-Qz7Mn...`)
   - 추천: `openssl rand -base64 24` 로 생성

## 1단계 — Railway 프로젝트 생성

1. Railway 대시보드 → **New Project** → **Deploy from GitHub repo** → 본 저장소 선택
2. Railway가 `Dockerfile`을 감지해서 자동으로 빌드 시작
3. 생성된 서비스에 들어가서 **Variables** 탭에서 다음 환경변수 추가:
   - `NODE_ENV=production`
   - `ADMIN_TOKEN=<위에서 정한 값>`
   - `PARTNER_TOKEN=<위에서 정한 값>`

## 2단계 — Postgres 추가

1. 프로젝트 안에서 **+ New** → **Database** → **PostgreSQL** 추가
2. Postgres 서비스가 생성되면 Express 서비스 → **Variables** → **Add Reference Variable** → `${{Postgres.DATABASE_URL}}` 추가
3. Express 서비스 자동 재배포됨

## 3단계 — 데이터 마이그레이션 (로컬 JSON → Postgres)

본인 PC에서:

```bash
# Railway 대시보드 Postgres 서비스 → Connect → DATABASE_URL 복사
export DATABASE_URL="postgresql://postgres:xxx@xxx.railway.app:1234/railway"

# 스키마 초기화 + 기존 JSON 데이터 이전
npm run db:init
npm run migrate:json-to-pg
```

(이미 Railway 배포된 인스턴스가 첫 요청 시 자동으로 schema는 init되지만, 미리 해두면 깔끔)

## 4단계 — 도메인 + 접속

1. Railway 서비스 → **Settings** → **Networking** → **Generate Domain** → `lgblog-production-xxxx.up.railway.app` 같은 URL 받음
2. 본인용 접속: `https://lgblog-xxxx.up.railway.app/?token=<ADMIN_TOKEN>`
3. 협력업체용: `https://lgblog-xxxx.up.railway.app/?token=<PARTNER_TOKEN>`
4. 한 번 들어가면 토큰이 브라우저 localStorage에 저장돼서 다음부터 `?token=` 없이도 됨 (북마크 가능)

## 5단계 — 권한 차이

| 기능 | 관리자 | 협력업체 |
|---|---|---|
| 대시보드 보기 | ✅ | ✅ |
| 발행 완료 체크 (☐ 체크) | ✅ | ✅ |
| 메모 작성 / 상태 변경 | ✅ | ✅ |
| 발행 요청 | ✅ | ✅ |
| 시즌 추천 보기 | ✅ | ✅ |
| 알림 인박스 보기 | ✅ | ❌ |
| 🔄 LG 전체 갱신 | ✅ | ❌ |
| 네이버 백필 | ✅ | ❌ |
| 카테고리 관리 | ✅ | ❌ |
| 알림 설정 | ✅ | ❌ |

## 운영 팁

### 매일 자동 갱신
Railway는 cron이 기본 제공되지 않습니다. 두 가지 옵션:
- **(A) 직접 클릭**: 매일 아침 본인이 🔄 갱신 버튼 한 번 누르기 (가장 간단)
- **(B) GitHub Actions cron**: `.github/workflows/daily-crawl.yml`을 만들어서 `curl -X POST https://lgblog-xxxx.up.railway.app/api/sync-all -H "X-Token: $ADMIN_TOKEN"` 매일 호출
- **(C) Railway Cron Job**: Railway에서 별도 cron 서비스 추가

### 비용
- Railway 무료 티어: $5 크레딧/월 (Express + Postgres 가벼운 트래픽이면 충분)
- 트래픽 늘면 Hobby 플랜 $5/월 정액

### 백업
Railway Postgres → Settings → **Backups** 활성화. 또는 주기적으로 `pg_dump` 받아두기.

### 로컬 개발 그대로
`DATABASE_URL`을 안 set하면 자동으로 JSON 파일 모드로 작동. 로컬 개발은 변화 없음.

### 토큰 변경
Railway Variables에서 토큰 값 바꾸고 저장 → 자동 재배포. 협력업체에 새 URL 다시 전달.

## 문제 해결

**Q. Railway 배포 후 "unauthorized" 에러**
→ ADMIN_TOKEN/PARTNER_TOKEN 환경변수가 설정됐는지 확인. 둘 다 비어있으면 'open' 모드(누구나 접근)로 폴백.

**Q. 데이터가 안 보임**
→ `migrate:json-to-pg` 실행 안 했을 수 있음. 또는 DATABASE_URL이 비어있으면 Postgres 대신 컨테이너 안의 JSON을 보고 있는데 컨테이너는 매 배포마다 초기화됨.

**Q. 서브카테고리 발견이 안 됨**
→ 🔄 갱신 버튼 한 번 더. LG 사이트 일시 장애일 수 있음.
