# 네이버 연결 계정 인증 UI/BFF — 2026-10-11

## 구현 범위

설정 → 계정 및 발신 주소 → 연결 계정의 네이버 행에 앱 비밀번호 설정(열쇠)과 연결 확인(방패) 아이콘을 연결했다. 서버의 `authenticationAvailable.naver=true`일 때만 활성화한다. 앱 비밀번호 설정은 공통 Modal/Input/DialogActions/Tooltip, 인증 확인은 공통 ConfirmDialog를 사용한다. 이전 등록 전용 서버에서는 인증 조작을 제공하지 않는다.

- 같은 로그인 계정의 목록에서 UUID·provider·revision·인증 지원을 먼저 확인한 뒤 서버 전용 BFF가 요청한다.
- POST `/api/mail/linked-accounts/{id}/credentials` → POST `/api/user/linked-accounts/{id}/credentials`: `expectedRevision`, 고정 `provider=naver`, `appPassword`만 받는다. 저장 receipt는 동일 계정/주소, revision와 credentialGeneration 각각 +1, pendingVerification이어야 한다.
- POST `/api/mail/linked-accounts/{id}/verify` → POST `/api/user/linked-accounts/{id}/verify`: `expectedRevision`만 받는다. 인증 성공 receipt는 동일 계정/주소/개정/세대와 connected 상태여야 한다. 확인은 pendingVerification/temporaryError/reauthRequired에서만 가능하다.
- 서버의 `finish_linked_auth`는 상태만 바꾸며 revision와 credentialGeneration을 증가시키지 않는다. 문서 추측 대신 현재 Rust 구현을 기준으로 검사한다.
- 네이버 앱 비밀번호 저장은 인증 완료가 아니다. 별도의 실제 TLS IMAP 인증 성공 후 연결 상태가 된다. 발송·원격 변경·메일 동기화·연결 계정 메일 읽기 UI는 이번 범위에 포함하지 않는다. Gmail 비밀번호와 임의 host/token은 받지 않는다.

## 보안·불확실 결과

BFF는 same-origin, HttpOnly 기본 세션, private/no-store 및 HTTPS/loopback 전송 경계를 유지한다. 비밀번호는 사용자 입력란에서 제출 직전에 지우고, 서버 receipt와 응답에서 비밀·내부 필드를 제외한다. 브라우저 localStorage/sessionStorage 또는 React 공유 상태에 저장하지 않는다. JavaScript 문자열의 메모리 완전 소거를 보장한다는 뜻은 아니다.

비밀번호 저장과 인증을 자동으로 재시도하지 않는다. 불확실한 결과 후 공유 Provider는 다른 변경을 차단하고, 비밀 없는 `{kind,before}` 메타데이터만 보관한다. 목록 다시 확인(GET)에서 credential revision/generation의 정확한 증가 또는 동일 credential generation의 인증 상태 전환을 확인해야 잠금을 해제한다. 이 재확인은 특정 비밀번호 값이 저장됐다는 증명이 아니므로 저장 성공 알림이나 인증 자동 실행은 하지 않는다.

인증 요청이 불확실하고 목록의 상태가 이전과 같으면 완료 증거가 없어 잠금이 유지된다. 서버에 실행 영수증/멱등 키가 없으므로 같은 상태로 끝난 실패와 아직 진행 중인 요청을 완전히 구분할 수 없다. 시간 경과만으로 성공·실패를 추측하거나 쓰기를 재전송하지 않는다. 이 한계는 후속 서버 계약 개선과 수용 검증 대상으로 남는다.

서버 인증 작업은 최대 60초이므로 고정 UUID 인증 경로에만 65초 upstream 제한을 적용했다. 다른 API의 10/15초 제한과 caller cancellation은 유지한다. 클라이언트 인증 요청은 목록 preflight와 인증 시간을 고려해 90초이며, credential 저장은 25초이다. LAN 평문 API는 기존 전송 정책대로 차단한다.

## 검증

- `node scripts/test-linked-authentication.mjs`: 닫힌 입력 계약·길이/제어문자·계정 scope·safe BFF·비밀 필드 제외·알려진 실패/불확실 응답 구분·불확실 재전송/다른 변경 차단·목록 재확인·제출 전 입력란 비우기·10개 언어 실제 컴포넌트 버튼 상태 검사 통과. 합성 응답만 사용.
- `node scripts/test-linked-accounts.mjs`: 기존 등록/연결 해제/SSR/불확실 결과 회귀 검사 통과.
- `node scripts/test-tastemail-server.mjs`: 기존 전송/취소/timeout 및 고정 인증 경로 65초 제한 검사 통과.
- 변경 범위 ESLint와 다국어 3102개 키 검사 통과.
- 프로덕션 `GXWEBMAIL_BUILD_DIR=.next-general-settings-webpack npm run build -- --webpack` 종료 0: 최적화 컴파일·TypeScript·395개 페이지·build trace 완료. 첫 TypeScript 검사에서 공통 ConfirmDialog의 필수 tone 누락을 수정한 뒤 변경된 UI 검사와 캐시를 유지한 빌드를 재개했다. 관련 없는 앱/서버 검사를 반복하지 않았다.
- 현재 로그인한 로컬 웹메일에서 기존 계정 추가 모달 열기·이메일 자동 포커스·취소·원래 버튼 포커스 복원·콘솔 error 없음을 확인. 등록 버튼은 누르지 않았다.
- 실제 네이버 앱 비밀번호 입력·저장·외부 IMAP 인증·계정 생성/해제·메일/DB/운영 설정 변경은 하지 않았다. 현재 관측된 서버는 등록 전용 응답이므로 새 인증 모달의 실제 계정·모바일 브라우저 수용 검증은 미완료다.

다음 구현은 Gmail OAuth BFF/callback, 계정별 폴더·수신 작업/캐시 조회 및 계정 전환이다. 전체 연동 목표는 진행 중이다.
