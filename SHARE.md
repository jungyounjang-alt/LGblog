# 가입 없이 협력업체와 공유하기

본인 PC를 통한 터널 방식. 가입·비용 0이지만 본인 PC가 켜져 있는 동안만 접속 가능합니다.

## 사용 흐름

### 0. 처음 한 번만: 토큰 파일 만들기

```powershell
Copy-Item .env.local.example .env.local
notepad .env.local
```

`.env.local`을 열어서 `ADMIN_TOKEN` / `PARTNER_TOKEN` 값을 채워주세요. 새 토큰은:

```powershell
node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"
```

이 명령으로 만들 수 있어요. 한 번 결정하면 협력업체에게 그 토큰이 들어간 URL을 계속 사용. `.env.local`은 git에 안 올라가니 안전합니다.

### 1. 현재 `npm run dev`가 떠있다면 종료
그 터미널에서 **Ctrl+C** 한 번.

### 2. 공유 스크립트 실행

PowerShell을 LGblog 폴더에서 열고:
```powershell
.\share.ps1
```

처음 실행 시 PowerShell 보안 정책 때문에 막히면 한 줄 더:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
.\share.ps1
```

### 3. URL 확인

스크립트 출력에서 이런 줄이 나와요:
```
your url is: https://lgblog-yj.loca.lt
```

(`lgblog-yj`가 이미 누가 쓰고 있으면 다른 임의 이름이 됨)

### 4. 협력업체에 전달
스크립트가 출력하는 메시지에 본인용·협력업체용 URL이 모두 표시됩니다 (예시):
```
본인용:     https://lgblog-yj.loca.lt/?token=<ADMIN_TOKEN>
협력업체용: https://lgblog-yj.loca.lt/?token=<PARTNER_TOKEN>
```

협력업체에는 그 협력업체용 URL을 메신저 등으로 보내세요. 처음 한 번 접속하면 localtunnel이 "Click to Continue" 안내 페이지를 보여주는데, 클릭만 하면 통과됩니다 (이후 같은 PC에선 다시 안 뜸).

## PC 슬립 방지

PC가 슬립 모드 들어가면 협력업체 접속이 끊깁니다. 슬립 방지:

**Windows 설정**
- 설정 → 시스템 → 전원 → 화면 끄기 / 절전 모드 → **절대 안 함**으로 변경

**또는 임시 슬립 방지 도구**
- `caffeine` 같은 작은 도구를 백그라운드로 켜둠

## 코드 변경 후 다시 공유

코드 수정했으면 share.ps1을 다시 실행. 빌드부터 새로 합니다.

## URL 깔끔하게 (선택, 5분 추가)

`*.loca.lt` 대신 `*.trycloudflare.com`이 좋으면:

1. Cloudflare 터널 단일 바이너리 다운로드: <https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe>
2. 받은 파일을 LGblog 폴더에 `cloudflared.exe`로 저장
3. share.ps1의 마지막 명령에서 `localtunnel` 줄을 다음으로 교체:
   ```powershell
   ".\cloudflared.exe tunnel --url http://localhost:3001"
   ```
4. 다시 `.\share.ps1` 실행 → 깔끔한 `https://random-words.trycloudflare.com` URL이 나옴
   - 처음 접속 시 안내 페이지 없음
   - 단점: 매번 URL이 무작위로 바뀜 (북마크 갱신 필요)

## 한계 정리

| 항목 | 상태 |
|---|---|
| 비용 | 0원 |
| 가입 | 없음 |
| 본인 PC 켜져있어야 함 | ⚠️ |
| 24/7 안정성 | ⚠️ (PC 의존) |
| URL 영구성 | localtunnel: subdomain 지정 시 안정 / cloudflared: 매번 바뀜 |

24/7 안정성이 필요하면 결국 Railway/Render 같은 호스팅을 써야 하고, 그건 GitHub 로그인 1번이 최소 가입입니다.
