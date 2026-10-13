# 연결 계정 캐시 메일 읽기 계약

## 현재 소스 근거와 범위

서버 main의 `crates/tastemail-api/src/linked_accounts/operations.rs`와 `crates/tastemail-store/src/linked_account_sync.rs`를 읽기 전용으로 확인했다. 관련 파일은 미커밋/추적되지 않은 상태다. 소스 계약이 운영에 배포됐다는 증거는 아니다. 서버·DB·환경·실제 계정·메일은 변경하지 않았다. 기존 폐기 포트는 사용하지 않았다.

- 서버 `GET /api/user/linked-accounts/{id}/messages?folder=...&beforeUid=...`: 등록 계정 소유자의 로컬 캐시만 조회하며 UID 내림차순 최대 50건을 반환한다. `linkedAccountId`, `folder`, 메시지의 `uid`, `uidValidity`, `flags`, `subject`, `sender`가 실제 필드다.
- 서버 `GET /api/user/linked-accounts/{id}/messages/{uid}?folder=...&uidValidity=...`: 계정·폴더·UIDVALIDITY·UID에 일치하는 캐시 원문에서 `MessageText`와 첨부 메타데이터를 추출한다. 읽음 변경이나 외부 IMAP 호출은 하지 않는다.
- `folders`는 GET이 아니라 revision을 받는 POST이다. 외부 IMAP 연결과 토큰 회전/계정 상태 변경이 발생할 수 있다. 단순 읽기 GET으로 바꾸거나 페이지 최초 SSR에서 자동 호출하지 않았다. 캐시 폴더만 열거하는 GET 계약은 현재 확인되지 않았다.
- 동기화는 `/sync`, `/sync/jobs`, `/sync/all` POST 계약이 있다. 이번 단계에서는 호출하지 않았다.

## 프런트엔드 구현

두 같은 출처 BFF GET 경로를 추가했다: `/api/mail/linked-accounts/{id}/messages`, `/api/mail/linked-accounts/{id}/messages/{uid}`. HttpOnly 원래 세션으로 서버 전용 클라이언트를 사용한다. CORS 허용을 추가하지 않고 교차 출처 Origin/Fetch Metadata 요청을 거부한다. JSON은 `private, no-store`, `nosniff`, `no-referrer`로 반환한다.

- UUID와 닫힌 query를 검증한다. 중복 query, 제어 문자 폴더, UTF-8 1024바이트 초과 폴더, 비정규 양의 십진수 UID를 거부한다. 폴더 문자열을 임의의 서버 경로로 결합하지 않고 URLSearchParams로 인코딩한다.
- 계정 목록의 실제 소유권·읽기 capability를 확인한다. 인증 전 계정이나 없는 계정으로 메일 GET을 호출하지 않는다.
- 목록의 계정/폴더와 상세의 네 가지 식별자를 모두 검증한다. 서버 정렬·중복·혼합 UIDVALIDITY·커서 범위가 잘못되면 성공 UI 데이터를 만들지 않는다. JMAP 기본 계정 ID나 개인 편지함 ID로 치환하지 않는다.
- 서버가 반환하지 않는 날짜·총 개수·임의 다음 페이지 토큰을 만들어내지 않는다. 정확히 50건이면 마지막 UID를 다음 요청의 배타적 beforeUid로 제공한다. 마지막 페이지가 정확히 50건이면 한 번의 빈 페이지가 올 수 있다.
- 읽음/발송/삭제/이동은 연결하지 않았다. 본문은 원문 데이터를 반환하며 기존 격리 HTML 렌더러에서만 표시해야 한다. 이번 단계는 화면 연결이 아니다.
- 응답 stream에 목록 1 MiB / 상세 32 MiB 예산을 두고 초과/잘못된 JSON은 실패로 처리한다. 이는 편지함 용량 제한이 아니며 큰 상세 응답의 지원 한계다. UI에 실패를 숨기거나 본문을 조용히 자르지 않는다.

## 검증 및 남은 작업

`node scripts/test-linked-mail.mjs`: 합성 계정·본문만 사용해 실제 변환 함수/서버 어댑터/BFF의 소유권, 안전한 GET, query/UID 경계, 응답 크기 제한, 추가 필드 제거, 401/403/429/404/409/5xx를 검증했다. 변경 범위 ESLint 통과. 문자열/GUI는 변경하지 않았으므로 이전 10개 언어 키 검사는 재실행하지 않았다.

첨부 disposition 배열을 문자열로 강제 변환해 수용하던 틈은 엄격한 문자열 비교로 수정하고 회귀 검사를 추가했다. 이 변경으로 첫 빌드의 컴파일 입력이 무효화되어 최종 빌드는 수정 이후 다시 실행했다. `GXWEBMAIL_BUILD_DIR=.next-gmail-start-validation npm run build -- --webpack` 최종 종료 0, 컴파일·TypeScript·408페이지·trace 및 두 GET 경로 출력을 확인했다. 사용자 dev 서버는 재시작하지 않았다. 이번 문서/README의 diff 공백 검사는 통과했다.

운영 GET, 실제 캐시 데이터 일치·페이지 이동, 연결 계정 목록/읽기 화면·전환, 폴더 조회·동기화 UI, 첨부 다운로드와 실제 OAuth 수용은 남아 있다. 전체 실서버 연동 완료가 아니다.
