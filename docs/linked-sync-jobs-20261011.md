# 연결 계정 동기화 작업 조회

선택 폴더 주기 예약 POST는 후속으로 연결했다. [예약 계약/UI/한계](linked-sync-queue-20261011.md)를 참조한다. 아래 예약 미연결 기록은 작업 목록 조회만 구현했던 이전 체크포인트다. 전체 폴더 예약/중지/내구성 복구는 계속 미완료다.

## UI 후속

계정별 메일 보기의 ‘동기화 작업’ 버튼에서 읽기 전용 패널을 여닫는다. 열었을 때만 GET하며 첫 메일 보기/SSR에서 자동 조회하지 않는다. 목록은 modified UTF-7 표시명과 상태/실패 횟수/허용 오류를 10개 언어로 표시한다. 오류는 재확인 버튼으로 명시적으로 다시 조회한다. 패널 닫기/계정 변경은 요청을 취소하며 늦은 응답은 publish하지 않는다. 계정 ID/revision/credentialGeneration과 서버 표시명을 클라이언트에서도 검증하고 256 KiB 응답 제한을 적용한다. 이 패널은 Provider의 불확실 쓰기 잠금을 해제하거나 작업 예약/동기화를 호출하지 않는다. 메일 보기의 기존 계정 읽기 권한 조건은 유지한다.

`test-linked-sync-jobs-ui.mjs` 합성 SSR/effect/helper 회귀와 메일 보기 실제 버튼 이벤트 회귀, 변경 범위 ESLint 및 10개 언어 3152키 검사 통과. 실제 desktop/mobile 화면, hydration/콘솔, 운영 작업 데이터 수용은 아직 하지 않았다. 서버 예약 POST/내구성 복구는 계속 미완료다.

## 실제 계약과 연결 범위

서버의 `crates/tastemail-api/src/linked_accounts/operations.rs`는 `GET /api/user/linked-accounts/{id}/sync/jobs`로 `{jobs:[{folder,status,attempts,lastError}]}`를 반환한다. `crates/tastemail-store/src/linked_account_jobs.rs`는 인증된 사용자/인증 세대와 계정 소유권을 확인하고 폴더 순으로 DB 작업 목록을 조회한다. 조회 자체는 IMAP 동기화나 예약을 실행하지 않는다.

프런트 BFF `GET /api/mail/linked-accounts/{id}/sync/jobs`를 추가했다. 요청은 UUID만 받으며 query/POST/교차 사이트 요청을 거부한다. 기존 HttpOnly 세션과 서버 전용 HTTPS 또는 loopback 전송을 재사용한다. API 주소와 토큰을 브라우저에 노출하지 않는다.

서버 어댑터는 소유 계정 목록을 먼저 확인하고 고정된 작업 GET만 호출한다. 재인증 필요/일시 오류 계정의 중지된 작업도 조회할 수 있도록 sync capability를 조회 조건으로 요구하지 않는다. 응답은 256 KiB/100개 작업으로 제한하고 원래 폴더 식별자를 유지하며 표시명만 modified UTF-7에서 변환한다. 상태는 queued/syncing/synced/retrying/paused, 오류는 null/reauthRequired/remoteUnavailable/syncLimit만 통과한다. 임의 원격 오류/내부 필드는 전달하지 않는다. 조회 후 계정 ID/provider/email/revision/credentialGeneration을 재확인하고 변경되면 conflict로 거부한다.

UI 추가로 빌드 입력이 바뀌어 프로덕션 빌드를 다시 검증했다. 2026-10-11 UI 후속 빌드 exit 0, TypeScript/408개 페이지 생성 통과. 계약 회귀도 새 클라이언트 receipt 검증을 포함한 현재 소스에서 통과했다.

401/403/429의 빈 본문도 구분한다. 404는 계정 없음과 미배포를 구분한다. 응답 불량/네트워크 실패는 unavailable이며 시연 데이터를 만들지 않는다. 반환 wrapper의 revision/generation은 현재 계정 범위이고 개별 작업의 저장된 revision/generation이 아니다.

## 결과 불명 복구의 한계

현재 Provider 잠금은 컴포넌트 ref이며 설정 화면을 벗어나거나 새로고침하면 보존되지 않는다. 기존 작업 GET은 작업 ID/요청 ID/완료 영수증/저장된 계정 세대를 제공하지 않는다. synced는 worker의 한 차례 범위 완료 뒤 주기 예약 상태이며 특정 수동 요청의 완료 증거가 아니다. 따라서 이 GET으로 결과 불명 잠금을 자동 해제하거나 기존 요청을 자동 재전송하지 않는다.

내구성 복구를 완성하려면 서버의 소유자 범위 operation ID/idempotency 및 완료 결과 조회 계약이 필요하다. 이 작업에서 서버 소스/DB/배포/운영 설정을 변경하지 않았다. 예약 POST와 전체 폴더 예약은 후속 작업이다. 목록 GUI는 위 UI 후속에 연결했으며 사용자가 패널을 열 때만 조회한다.

## 검증

`node scripts/test-linked-sync-jobs.mjs`: 실제 순수 계약/어댑터/BFF를 실행하는 합성 테스트 통과. 표시명, 중복/과대/잘못된 작업, 비밀 필드 제거, 소유권 확인 전 요청 금지, paused 조회, 고정 GET/취소 signal, 조회 중 계정 변경, 빈 인증 오류, 크기 제한, query/교차 사이트/POST 거부, private/no-store/nosniff 검사 포함.

변경 범위 ESLint 통과. 새 UI 문자열이 없어 locale 게이트는 재실행하지 않았다. 운영 API/DB 조회와 브라우저 검수는 하지 않았다. 전체 실서버 연동 완료가 아니다.

프로덕션 `GXWEBMAIL_BUILD_DIR=.next-gmail-start-validation npm run build -- --webpack` exit 0. TypeScript/408개 페이지 생성과 새 `/api/mail/linked-accounts/[id]/sync/jobs` 동적 경로 출력 확인. 실행 중인 개발 서버/운영 배포를 변경하지 않았다. 이 합성 Node 검사에는 별도 Debug/Release 실행 모드가 없으며 동일 검사를 중복 실행하지 않았다.
