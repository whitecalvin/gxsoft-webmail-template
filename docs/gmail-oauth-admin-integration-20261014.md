# Gmail OAuth 관리자 연동 — 2026-10-14

## 실제 계약 및 구현

- 서버 계약은 TASTEMAIL `crates/tastemail-api/src/linked_accounts/settings.rs`, `oauth.rs`와 `resources/guides/dev-01/tastemail-google-oauth-20261014/ADMIN.md`에서 확인했다. 다른 저장소는 수정하지 않았다.
- GXWebMail 관리자 → 메일 보안 → Gmail OAuth 설정: `/[locale]/admin/gmail-oauth`. 기존 AdminShell·공통 입력·버튼·스위치·Tooltip·ConfirmDialog·초안 이탈 보호 사용. 한국어/영어 본문, 다른 언어에서는 영어 본문을 사용하며 메뉴명은 10개 언어로 제공한다.
- BFF `/api/mail/admin/gmail-oauth` GET/PATCH → 실제 `/api/admin/linked-accounts/google-oauth`; `/check` POST → 실제 서버의 동일 suffix. 엔드포인트와 응답을 추측하지 않았다.
- 초기 설정은 서버 렌더링에서 읽는다. 관리자 layout와 실제 upstream `require_admin`/저장 트랜잭션의 관리자 권한 검사를 유지한다. BFF는 세션·same-origin·입력 길이·닫힌 저장 계약을 검사하고 저장은 브라우저 HTTPS에서만 받는다.
- 공개 응답에는 source/revision/enabled/clientId/redirectUri/secretConfigured/encryptionAvailable/available만 투영한다. 비밀키 조회·브라우저 영속 저장·로그 출력 없음. 빈 비밀키 입력은 PATCH에서 생략되어 서버가 기존 값을 유지한다. 저장 시작 시 입력을 비우며 미확정 상태는 다시 조회하기 전 재저장을 차단한다.
- DB 설정이 환경 변수보다 우선한다. DB 비활성 설정도 환경 변수로 우회하지 않는다. 기존 환경 변수·암호화 키는 변경하지 않았다. 서버는 기존 key protector의 별도 purpose로 암호화 저장한다.
- 공개 HTTPS origin에서 정확한 `/api/mail/linked-accounts/oauth/callback`을 안내·복사한다. 저장된 콜백과 현재 접속 origin 불일치 안내, Google Cloud 설정 순서, 전체 메일 권한과 앱의 읽기/미러 동기화 범위 안내 포함.
- 사용자 Gmail 연결은 기존 실제 등록/start/callback/complete/cancel/receipt 검증을 재사용한다. 인증 버튼을 텍스트 포함 버튼으로 바꾸고 관리자 설정 미지원 안내를 표시한다. 연결된 계정의 다시 인증도 기존 서버 흐름에 연결한다. 캐시 조회·배치 동기화·예약·중지/재개·연결 해제는 기존 실제 API 경로를 유지했다.
- OAuth fragment는 인증 코드의 짧은 전달용이며 화면 전환에 hash routing을 사용하지 않는다. 기존 callback의 Secure HttpOnly 암호화 proof·Strict 세션·state/PKCE·TTL·revision/generation fence·한 번 제출·즉시 fragment 제거 유지. OAuth 표준 callback의 code/state query는 불가피하므로 외부 프록시 access log에서 query 제거는 별도 운영 확인이 필요하다.

## 검증

- 새 `test-admin-gmail-oauth.mjs`: 실제 계약 파서/허용 필드 투영/빈 비밀키 유지/HTTPS callback/개정 영수증/고정 실제 upstream 경로/CSRF/세션/관리자 거부/저장 미확정 잠금/SSR/환경·DB 상태/재인증 버튼. 외부 네트워크를 차단한 합성 응답 검사이며 실제 서버 저장 증거는 아니다.
- 기존 `test-linked-oauth-start`, `test-linked-oauth-route`, `test-linked-oauth-return` 개발 및 production 환경 통과: 시작·코드/토큰 투영·원래 session/origin proof·변조/만료·취소/거부·중복 제출·네트워크 미확정·10언어 복귀 UI.
- 관리자 메뉴 회귀 `test-admin-shell`: 3/3 통과. 변경된 메뉴를 포함하도록 기대 목록 갱신.
- 10개 locale 3402키와 literal 호출 검사 통과. 전체 ESLint의 새 page JSX try/catch 오류를 수정한 뒤 해당 page 및 후속 변경 파일만 재검사해 통과했다. 통과한 다른 파일의 검사는 중복하지 않았다.
- 프로덕션 빌드는 격리 mkdir EPERM에서 중단 후 같은 빌드 게이트만 권한 조정하여 재개했다. `.next-gmail-admin-validation`, BUILD_ID `6i6wOeZVU0ASlrzHd9905`, 종료 0: 최적화 컴파일·TypeScript·432페이지·trace 통과. 새 관리자 page와 두 BFF route 포함. Next가 추가한 격리 빌드 타입 include를 유지한다. 이후 변경은 이 검증 기록만이므로 재컴파일하지 않는다.

## 실제 API/GUI 확인과 남은 조건

- 실행 중인 로컬 7540이 없어 기존 `npm run dev`를 시작했다. 새 서비스·운영 배포·운영 재시작·환경 파일 변경 없음.
- 로그인된 관리자 화면에서 실제 설정 GET과 실제 `/check` POST를 검수했다. source=environment, secretConfigured=false, encryptionAvailable=true, enabled=false, available=false. 검사는 configurationValid=false이므로 실패 안내를 정상 표시했다. Google 연결이 막힌 현재 조건은 사용할 OAuth 설정이 없다는 것이다.
- 공개 HTTPS 주소 `https://webmail-test.gxsoft.co.kr`를 **저장하지 않은 입력값**으로 넣어 정확한 callback 안내·복사를 검수했다. 저장된 서버 설정은 변경하지 않았다. 화면 증거: `admin-gmail-oauth-20261014.jpg`.
- 실제 Client ID/Client Secret 입력·저장·기존 실제 비밀키 유지와 Google 로그인·동의·IMAP 연결 수용 검증은 미실행이다. Google 프로젝트/클라이언트·redirect URI·테스트 사용자 준비 후 HTTPS 관리자 화면에서 사용자가 직접 비밀키를 입력해야 한다.
- 실제 Google 인증은 사용자가 직접 한다. 기존 메일 변경·외부 발송·계정 삭제·운영 배포는 실행하지 않았다. 이 기록은 전체 실수용/운영 완료 선언이 아니다.
