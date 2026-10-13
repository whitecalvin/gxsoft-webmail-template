# Gmail 연결 OAuth 계약 계층 체크포인트

## 후속 체크포인트: 계정 목록 인증 시작 버튼

서버가 Gmail 인증 지원을 알린 계정에 공통 아이콘 버튼·Tooltip·ConfirmDialog를 연결했다. 이 절은 아래 시작 버튼 미연결 기록보다 최신이다. 실제 Google 인증은 실행하지 않았다.

- HTTPS origin 및 계정 revision을 검사한 뒤 닫힌 `{expectedRevision, locale}` 요청만 제출한다.
- 검증된 Google URL/PKCE/정확한 callback만 최상위 화면으로 이동하며 이동 대기 중 중복 요청을 차단한다.
- 인증 확인 창은 Google의 전체 메일 권한(읽기·발송·삭제) 요청을 명시한다. 이는 구현된 앱 기능보다 넓은 Google IMAP OAuth 범위이며, 앱의 외부 발송·메일 변경 기능은 계속 비활성이다.
- 네트워크/receipt/이동 실패 시 계정 메타데이터만 보관하고 인증 URL/state를 저장하지 않는다. 미확정 상태는 목록에서 정확한 revision/generation 증가와 연결 상태가 확인되어야 해제된다. 그대로인 목록으로는 해제하지 않는다. 서버 작업 receipt가 없어 시작 실패의 자동 복구는 미완료다.
- `scripts/test-linked-oauth-start.mjs`는 실제 Provider 함수의 HTTPS·지원 여부·중복·미확정·세대 경계를 합성 응답으로 검사하며 공통 버튼을 10개 언어로 서버 렌더링한다. 실제 OAuth 및 사용자 브라우저 수용 검증을 대체하지 않는다.
- 브라우저 정책이 현재 설정 화면 접근을 차단했다. 우회하지 않았으며 실제 설정/Gmail 버튼 GUI 재검수는 남는다.

동기화·연결 계정 폴더·메일 조회/전환 및 실제 Google 서비스 설정은 다음 작업이다. 서버/DB/배포/계정 변경은 수행하지 않았다.

현재 작업 단위 검증: OAuth 시작/계정/네이버 인증 합성 검사, 10개 언어 3114키, 변경 범위 ESLint 통과. 출력 폴더 mkdir EPERM으로 빌드가 두 번 중단되었고 격리 제한 밖의 동일 빌드 게이트에서 `.next-gmail-start-validation` 출력으로 종료 0, TypeScript·408페이지·trace를 확인했다. Next.js가 tsconfig의 생성 타입 include 두 줄을 추가했다. 이번 변경 파일의 diff 공백 검사는 통과했지만 전체 작업 트리의 기존 다른 파일 공백 오류는 남겨 두었다. 전체 회귀/실제 OAuth/GUI 검수 완료 주장이 아니다.

## 후속 체크포인트: Google 복귀 경로 및 화면

이 절은 아래의 "HTTP route 미노출/복귀 화면 미완료" 기록보다 최신이다. 시작 POST, Google 복귀 GET, 같은 origin 완료/취소 POST 및 `/[locale]/oauth-return` 화면을 연결했다. **계정 목록의 Gmail 인증 시작 버튼은 아직 연결하지 않았다.** 실제 Google 서비스 설정/계정 연결/IMAP 인증은 수행하지 않았다.

- Google cross-site callback GET은 인증·코드 교환·쿠키 변경을 하지 않는다. 원래 Strict 세션/암호화 proof를 약화하지 않고 언어만 Secure/HttpOnly/Lax 쿠키에서 읽는다.
- 검증한 code/state는 새 요청에 포함되지 않는 fragment로 복귀 페이지에 전달한다. Google error_description 등 임의 필드는 제외한다. Client effect는 주소와 history에서 fragment를 즉시 제거하고 JS ref에만 잠시 보관한다. 서버 HTML/React 렌더링/로그/localStorage에 인증 코드를 넣지 않는다.
- Google이 호출하는 최초 callback URL에는 표준 OAuth code/state query가 필요하다. Next 개발 access log에서는 그 경로를 제외했다. **외부 운영 프록시/접근 로그의 query 삭제 또는 해당 경로 제외는 별도 운영 확인이 필요하며 완료를 주장하지 않는다.** redirect URL/header 최대 길이와 실제 브라우저 cross-site cookie 동작도 실수용 검증 대상이다.
- 화면은 공통 Button·기존 테마 토큰을 사용한다. 자동 코드 교환/재시도하지 않고 사용자가 완료 버튼을 눌러 한 번 제출한다. Strict Mode effect replay에서도 초기 fragment를 다시 읽거나 코드를 잃지 않도록 했다. busy/성공/실패/결과 미확정 후에는 같은 코드 제출 버튼을 다시 제공하지 않는다.
- 취소 POST는 원래 세션/proof/state를 확인한 뒤 웹 proof/언어 쿠키만 지우고 설정으로 복귀한다. Google/메일 API에 쓰지 않는다. 원래 서버 state는 서버 TTL 또는 다음 시작에 의해 정리된다.
- 완료 BFF는 암호화 증명의 계정 정보를 사용하며 서버의 일회용 state와 개정/generation fence가 최종 중복 실행 방어다. 미확정 시 쿠키를 지우고 재전송하지 않는다. UI는 계정 설정에서 상태를 확인하도록 안내한다. 운영 실행 영수증 기반 재확인/새 페이지로 이동한 뒤의 전체 계정 변경 잠금은 아직 미완료다.
- 취소 후 설정 이동은 의도적으로 새 document를 로드한다. cross-site 복귀 시 익명으로 SSR됐을 수 있는 root 설정/계정 상태를 새 세션으로 다시 읽기 위해 단일 내부 hard-navigation lint 예외를 설명했다.

검증: 실제 코드 기반 합성 BFF/GET/취소 검사, 10개 언어 실제 복귀 컴포넌트의 8개 상태 SSR, fragment 정리/Strict Mode/제출 전 code ref 제거/중복 제출 차단/성공·실패·미확정·취소 handler 검사 통과. locale 3112개 키 통과. 로컬 기본 오류 화면 desktop1280px 및 mobile390×844px 표시/콘솔 error 없음을 확인했다. 모바일 scrollWidth=clientWidth=390, 본문 section358px, 설정 링크 touch 높이44px. 임시 검수 탭/viewport는 정리했고 실제 완료 버튼을 누르지 않았다.

다음은 계정별 Gmail 인증 시작 컨트롤과 Provider의 중복/미확정 상태 잠금, 실제 운영 로그/HTTPS callback 등록 및 명시 승인 범위의 OAuth 수용 검증이다. 전체 연동 목표는 진행 중이다.

현재 복귀 단계의 변경 범위 ESLint와 프로덕션 빌드 종료 0을 확인했다. TypeScript·최적화 컴파일·408페이지·새 OAuth HTTP route 및 build trace 통과. 빌드 이후 추가된 내부 hard-navigation 설명/단일 lint 예외는 주석만 변경하므로 앱 재컴파일 없이 해당 UI 파일 lint만 재확인했다. 운영 배포는 하지 않았다.

## 후속 체크포인트: 세션 증명 및 BFF 핸들러

서버 전용 `linked-oauth-proof.ts`와 `linked-oauth-route.ts`에 인증 시작/완료 핸들러를 추가했다. 아직 `app/api` route 파일로 노출하지 않았다. Google 복귀 GET/화면과 함께 연결해야 하며 아래 인증 UI 미완료 상태는 유지된다.

- 인증 증명은 로그인 세션에서 목적별로 파생한 키로 AES-256-GCM 암호화한다. fresh 12-byte IV, origin/고정 callback AAD를 사용한다. 원래 계정 receipt·state·locale·발급/만료 시각만 저장하며 bearer token, Google code/access/refresh token은 넣지 않는다.
- `__Host-gxwebmail_linked_oauth` 쿠키는 Secure/HttpOnly/SameSite=Strict/Path=/, 600초이다. 기존 로그인 세션 쿠키를 변경하지 않는다. 원래 session/origin과 다르거나 변조·미래 발급·만료된 증명은 거부한다. 10개 locale을 허용한다.
- 시작 핸들러는 HTTPS same-origin POST, 원래 HttpOnly 세션, 닫힌 `{expectedRevision,locale}`만 받는다. 유효한 진행 중 증명이 있으면 새 시작 요청을 차단하고 계정 목록 확인/인증 시작 전에 CSRF·입력·세션을 검사한다. 공개 응답에는 검증된 Google URL과 만료 초만 포함한다.
- 완료 핸들러는 닫힌 `{state,code}`만 받으며 계정과 개정 번호는 암호화 증명에서 복원한다. 증명 state를 constant-time 비교한다. 실제 upstream 호출 뒤 성공·실패·미확정 응답 모두 증명 쿠키를 지운다. upstream을 보내지 않은 잘못된 state 요청은 증명을 지우지 않는다.
- 쿠키 삭제 자체가 서버의 일회용 실행 증명은 아니다. 원래 쿠키를 재전송하거나 동시 요청하는 경우 Rust의 원래 세션/계정에 묶인 state 소비가 최종 재사용 방어다. 이 서버 DB 동작의 실수용 검증은 하지 않았다.
- JavaScript/Node 문자열 전체의 메모리 소거를 보장하지 않는다. 파생 키/복호화 byte buffer는 작업 뒤 지우고, 평문 proof나 인증 코드는 로그·localStorage에 기록하지 않는다.
- `node scripts/test-linked-oauth-route.mjs`에서 실제 proof 암호화/복호화, 다른 세션/origin/변조/만료 거부, 10 locale, 핸들러 closed input/CSRF/세션/진행 중 시작 차단, secret projection, cookie flags와 미확정 후 cookie 제거가 통과했다. 합성 객체/응답만 사용했다. 변경 세 파일 ESLint 통과. 이전 OAuth 계약/전송 테스트는 입력이 변하지 않아 재사용했다.

Google 복귀 GET 이후 SameSite=Strict 세션을 유지하는 same-origin 완료 화면, HTTP route 노출, 공통 인증 컨트롤, 미확정 결과 재확인 UI는 다음 구현 단계다. 아직 실제 Gmail 연결 기능은 화면에서 사용할 수 없다.

후속 프로덕션 빌드도 종료 0으로 완료했다: 새 proof/BFF 모듈의 TypeScript, 최적화 컴파일, 395페이지 및 build trace 통과. `.next-general-settings-webpack/BUILD_ID` 생성 시각은 2026-10-11 04:50:11 KST이다. 운영 배포는 하지 않았다.

## 구현 범위

`lib/linked-oauth.ts`와 서버 전용 `lib/tastemail/linked-oauth.ts`에 실제 Rust 계약을 기준으로 인증 시작/완료 검증을 추가했다. HTTP BFF route와 브라우저 인증 버튼은 아직 연결하지 않았다. 실제 Google 인증을 사용할 수 있다는 완료 주장이 아니다.

근거 소스: tastedev-mail의 `linked_accounts/oauth.rs`, `linked_accounts/operations.rs`, store의 `linked_account_sync.rs`, auth의 `SessionToken::generate`. 두 저장소 main과 기존 변경 상태를 확인하고 보존했다. 서버 소스·운영 환경·DB는 수정하지 않았다.

## 계약 및 경계

- 시작 POST `/api/user/linked-accounts/{id}/oauth/start`: 닫힌 `{expectedRevision}`. 원래 로그인 계정에서 읽은 추가 계정 목록에 같은 UUID, Gmail provider, revision, `authenticationAvailable.gmail=true`가 있어야 요청한다.
- 응답 `{authorizationUrl,expiresIn:600}`: Google HTTPS 고정 origin/path, 중복 없는 허용 쿼리 키, 정확한 등록 이메일 login_hint, mail.google.com scope, offline/consent, PKCE S256 및 43자 base64url state/challenge를 검사한다. 임의 host·token·fragment·추가 query는 거부한다.
- 콜백 주소는 웹메일 HTTPS origin의 `/api/mail/linked-accounts/oauth/callback`과 정확히 같아야 한다. 이 BFF는 아직 미구현이므로 실제 인증 시작을 노출하지 않는다. Google 설정은 변경하지 않았다.
- 완료 POST `/api/user/linked-accounts/{id}/oauth/callback`: 닫힌 `{state,code}`, UTF-8 길이/제어문자 제한 및 UUID 검증. 캡처 계정과 현재 email/revision/credentialGeneration이 같아야 요청한다.
- Rust 서버는 state를 원래 session hash, owner, auth generation, account UUID/revision, Google config fingerprint에 묶어 한 번 소비한다. Google 코드 교환 후 등록 주소의 IMAP 인증에 성공해야 token을 암호화 저장한다.
- 완료 receipt는 같은 id/provider/email, revision+1, credentialGeneration+1, connected여야 인정한다. access/refresh token 등 임의 필드는 제외한다.
- 완료 작업만 고정 경로의 65초 upstream timeout을 사용한다. 일반 요청 10/15초, no-store, redirect:error, HTTPS/loopback 정책은 유지한다.
- 알려진 typed 실패와 통신/receipt 미확정 실패를 구분하며 자동 재시도하지 않는다. 함수는 서버 전용이며 브라우저에서 호출하지 않는다.

## 다음 단계

1. HttpOnly 증명을 원래 로그인 세션에 묶어 account/state/locale/expiry를 복원한다. 브라우저 제출 계정이나 revision을 그대로 신뢰하지 않는다.
2. 기존 session cookie SameSite=Strict를 약화시키지 않고 Google cross-site GET 이후 원래 세션으로 완료하는 same-origin 단계가 필요하다. code/state를 로그, localStorage, 분석 요청에 전달하지 않는다.
3. 실패/거절 후 깨끗한 계정 설정 URL로 복귀하고 일회용 콜백 재전송/중복 시작을 차단한다. 결과 미확정 복구는 별도 수용 검증한다.
4. BFF/callback 완성 후 공통 UI와 10개 언어 컨트롤을 연결한다. 실제 서비스 설정·계정 연결·외부 인증은 별도 승인 범위다.

## 검증 완료

- `node scripts/test-linked-oauth.mjs`: 입력, Google URL/PKCE/redirect 정책, 계정별 receipt, 사전 scope 차단, typed 실패/미확정 구분, 고정 callback 전송/65초 검사 통과. 합성 응답만 사용하고 실제 네트워크 요청은 하지 않았다.
- `node scripts/test-tastemail-server.mjs`: 변경된 전송 파일의 기존 origin/path/deadline/cancellation 회귀 통과.
- `node scripts/test-linked-authentication.mjs`: 같은 전송 파일을 사용하는 네이버 인증 경계/컨트롤 회귀 통과.
- 변경된 네 파일 ESLint, `git diff --check` 통과.
- 프로덕션 `GXWEBMAIL_BUILD_DIR=.next-general-settings-webpack npm run build -- --webpack` 종료 0: 컴파일, TypeScript, 395페이지, build trace 통과. UI/다국어 입력은 변경하지 않아 locale/브라우저 검사를 중복하지 않았다.

전체 목표는 진행 중이다. Gmail BFF/콜백/UI, 실제 인증, 추가 계정 폴더/동기화/메일 조회/전환 및 전체 통합 수용 검증은 남아 있다.
