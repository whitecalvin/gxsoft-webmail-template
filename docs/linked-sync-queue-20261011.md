# 연결 계정 주기 동기화 예약

## 실제 계약

읽기 전용으로 확인한 Rust `crates/tastemail-api/src/linked_accounts/operations.rs`의 `queue_sync`는 POST `/api/user/linked-accounts/{id}/sync/jobs`와 닫힌 `{expectedRevision,folder}`를 받는다. 성공은 202 `{status:"queued",mode:"receiveMirror"}`이며 완료 영수증이 아니다. `linked_account_jobs.rs`는 소유자/기본 계정 인증 세대/계정 revision/sync capability를 확인하고 폴더별 예약을 upsert한다. 기존 예약을 다시 보내면 claim/실패 횟수/대기 시간을 초기화한다. 같은 폴더의 중복 행은 생기지 않지만 재전송을 부작용 없는 조회로 취급할 수 없다.

worker는 수신 미러 배치를 실행하고 남은 구간은 재예약한다. 한 주기가 끝나면 다음 실행을 5분 뒤로 예약하므로 일회성 작업이 아니다. 창을 닫거나 세션에서 로그아웃하는 것이 예약 취소 계약은 아니다. 소스에는 개별 작업 pause/delete API가 없다. 계정 연결 삭제는 FK cascade로 작업뿐 아니라 캐시도 지우므로 개별 예약 중지 대안으로 안내하지 않는다.

## 프런트 연결

같은 출처의 POST `/api/mail/linked-accounts/{id}/sync/queue`를 추가했다. HttpOnly 세션, HTTPS/loopback Origin, JSON 4 KiB/닫힌 입력, 서버 전용 고정 경로와 일반 10초 전송 제한을 재사용한다. 계정 소유권/정확한 revision/connected/sync 조건은 요청 전에 확인한다. 응답은 16 KiB 이내로 검증한다. 확정 오류와 응답 불명 상태를 나누고 예약 접수 전후 계정 provider/email/revision/credentialGeneration을 확인한다. worker가 이미 실행되어 상태만 바뀐 경우 접수 영수증 자체를 완료로 바꾸지 않는다.

Provider는 다른 계정 등록/인증/조회/동기화와 요청 잠금을 공유한다. 202 및 계정/폴더/세대 영수증이 정확할 때만 접수 성공을 반환한다. 네트워크/잘못된 상태/잘못된 영수증/불명 오류는 자동 재전송하지 않는다. 불명 메타데이터에는 비밀번호나 폴더 요청 본문을 보관하지 않는다. 계정 목록 재조회만으로 queue 불명 잠금을 해제하지 않는다.

계정별 메일 보기에서 선택된 폴더에 ‘주기 동기화 예약’ 버튼을 추가했다. 공통 ConfirmDialog는 해당 계정과 sidebar 표시명이 아닌 외부 IMAP 폴더의 디코딩 표시명을 안내한다. 계속되는 예약/로그아웃 후 유지 가능성/기존 예약 재시작/개별 중지 미지원까지 10개 언어로 고지한다. 확인 전 POST하지 않는다. 접수 뒤에만 작업 목록을 열어 새로 조회하며 본문을 동기화 완료로 표시하지 않는다. 닫힌 보기에는 늦은 접수 결과를 publish하지 않는다.

## 검증 및 남은 범위

`test-linked-sync-queue.mjs`: 합성 순수 receipt/고정 POST 어댑터/BFF/실제 Provider 함수 실행 통과. 소유권·역량 확인 전 쓰기 금지, 202/계정·폴더·세대 검증, 내부 필드 제거, 빈 401/403/429, 제한/충돌과 resultUnknown 구분, 크기 제한, 요청 직렬화/세대 경계, 불명 자동 재시도 금지, Origin/평문 원격 거부를 확인했다.

`test-linked-mail-viewer.mjs`: 10개 언어 초기 SSR와 실제 예약 버튼/확인 이벤트를 합성으로 실행했다. 정확한 계정·폴더 표시명/원래 값, warning 확인 창, 확인 전 쓰기 없음, 접수 후 작업 목록 갱신 검사를 포함한다. 변경 범위 ESLint와 10개 언어 3155키 검사 통과. Node 합성 검사에는 별도 Debug/Release 모드가 없으며 프로덕션 빌드는 별도 게이트다.

실제 서버 예약/DB/API 요청·설정·배포·메일 변경은 실행하지 않았다. 실제 worker 실행/desktop-mobile GUI/운영 데이터 수용, 전체 폴더 예약 및 partialQueue 처리, 개별 예약 중지 API, 새로고침 후 결과 불명 복구는 미완료다. 기존 Provider 잠금은 화면 수명에 한정된다. 작업 목록의 synced는 특정 요청 완료 영수증이 아니며 이를 근거로 불명 잠금을 풀지 않는다. 전체 실서버 연동 완료가 아니다.

프로덕션 `GXWEBMAIL_BUILD_DIR=.next-gmail-start-validation npm run build -- --webpack` exit 0. TypeScript/408개 페이지 생성 및 새 `/api/mail/linked-accounts/[id]/sync/queue` 동적 경로 출력과 BUILD_ID 산출물을 확인했다. 실행 중인 개발 서버와 운영 서버는 재시작하지 않았다.
