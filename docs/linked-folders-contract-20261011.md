# 연결 계정 폴더 목록 계약

## 클라이언트 상태 관리 후속

`LinkedAccountsProvider.loadFolders(id)`를 추가했다. 사용자가 명시적으로 호출할 때만 고정 folders POST에 `{expectedRevision}`를 보내며, 연결 상태·sync capability를 사전 확인하고 인증/삭제/다른 조회와 같은 요청 잠금을 사용한다. 클라이언트 제한 시간은 BFF의 전후 계정 확인과 65초 외부 작업을 포함해 90초다. SSR, 마운트, 새로고침에서 자동 실행하지 않는다.

`linkedFoldersReceipt`는 BFF의 정확한 계정 ID/revision/인증 세대를 확인한다. 최대 100개 폴더의 원래 식별자를 검증하고 표시명을 다시 계산하여 불일치·중복·잘못된 인코딩을 거부한다. 다른 계정이나 이전 Provider 세대의 응답은 반환하지 않는다. 폴더 목록은 인증 상태 저장소에 영구 보관하지 않는다.

구조가 확인된 `uncertain:false` 오류만 확정 실패로 다룬다. 네트워크/파싱/잘못된 영수증/미확정 오류는 비밀이나 폴더 이름 없는 `{kind:"folders",before}` 메타데이터로 후속 요청을 잠근다. 현재 서버에는 LIST 작업 영수증이 없으므로 계정 목록이 그대로라는 이유로 잠금을 해제하거나 자동 재시도하지 않는다. 이 복구 계약은 아직 서버 후속 작업이 필요하다.

`scripts/test-linked-folder-client.mjs`에서 실제 Provider 함수의 성공·계정 경계·요청 직렬화·미확정 잠금·권한 실패·늦은 응답·새로고침 시 잠금 유지와 표시명 영수증을 합성 응답으로 검증했다. 기존 계정/authentication/OAuth start/folders 회귀 및 변경 범위 ESLint도 통과했다. 사용자 폴더 버튼과 연결 계정 메일 보기 화면은 아직 연결하지 않았으며 실제 외부 요청/계정 변경/배포는 하지 않았다.

이 후속 변경으로 Provider/타입 빌드 입력이 바뀌어 같은 검증용 출력 경로의 프로덕션 빌드를 다시 실행했다. 종료 0, 컴파일·TypeScript·408페이지·trace 확인. 번역과 GUI는 변경하지 않아 관련 전체 언어/브라우저 검사를 반복하지 않았다. 현재 사용자 페이지는 브라우저 보안 정책으로 접근이 차단되어 있고 우회 검수하지 않았다.

`tastedev-mail/crates/tastemail-api/src/linked_accounts/operations.rs`의 folders 처리와 transport LIST 구현을 읽기 전용으로 확인했다. 운영 배포나 외부 계정 인증을 실행하지 않았다.

## 서버와 BFF

- 같은 출처 `POST /api/mail/linked-accounts/{id}/folders`는 닫힌 `{expectedRevision}`만 받는다. 기존 HttpOnly 세션, same-origin Origin, HTTPS 또는 loopback 정책을 사용한다.
- 계정 목록에서 정확한 소유 계정의 연결 상태/동기화 capability/revision을 확인한 뒤 서버의 동일 POST를 고정 경로로 호출한다. 외부 IMAP 인증과 LIST가 발생할 수 있고 Gmail 토큰 갱신·계정 상태 갱신이 동반될 수 있다. 일반 GET이나 자동 SSR 조회로 호출하지 않는다.
- 서버 외부 작업 제한 60초에 맞춰 이 고정 전송만 65초를 준다. 다른 요청의 10/15초 제한, no-store, redirect 거부와 TLS 정책은 바꾸지 않는다.
- 최대 100개 폴더/각 이름 1024바이트 계약을 확인하고 스트림 전체에 1 MiB JSON 예산을 둔다. 초과·중복·잘못된 이름/인코딩 응답은 거부한다.
- 완료 후 소유 계정 목록을 다시 읽어 이메일·공급자·revision·인증 세대·연결 상태를 확인한다. 바뀌었거나 결과를 확인하지 못하면 미확정 실패로 반환한다. BFF는 계정 설정이나 임의 서버 주소를 받지 않는다.
- JSON은 `private, no-store`, `nosniff`, `no-referrer`다. 응답은 연결 계정 ID/revision/인증 세대, 인코딩, `{value,label}` 목록만 투영한다. 토큰/비밀/내부 응답을 전달하지 않는다.

## 폴더 이름

현재 Rust 응답의 `encoding`은 `imapModifiedUtf7`이다. [RFC 3501 §5.1.3](https://www.rfc-editor.org/rfc/rfc3501#section-5.1.3)을 기준으로 `&-`, 수정 Base64의 쉼표, UTF-16BE 및 shift 종료를 해석한다. UTF-7이 없는 IMAP4rev2 일반 규칙으로 바꾸지 않고 이 서버의 명시적 계약을 따른다.

`value`는 서버가 보낸 정확한 이름을 유지한다. `label`만 표시용 유니코드로 해석한다. 대소문자 변경, 기본 편지함 한글 번역, 임의 계층 구분자 추측, 서로 다른 계정의 폴더 병합을 하지 않는다. 잘못된 UTF-16, ASCII의 비정규 encoded 표현, 불필요한 연속 shift, 출력 제어 문자는 거부한다.

## 검증과 남은 작업

`scripts/test-linked-folders.mjs`는 합성 응답만 사용해 RFC 예제·한국어·일본어·중국어·이모지·잘못된 이름, 원래 이름 보존, 닫힌 입력, 지원 없는 계정/이전 revision 사전 차단, 완료 후 계정 변화, 응답 예산, known/unknown 오류, HTTP/Origin/세션 경계 및 실제 고정 전송 함수의 65초/no-store/redirect 정책을 검증했다. 공통 전송 변경에 관련된 server/authentication/OAuth/캐시 메일 검사도 통과했다. 변경 범위 ESLint 통과.

사용자 명시 동작 버튼, 폴더 선택 및 연결 계정 목록·상세·전환 화면 연결은 다음 단계다. 서버가 지원하지 않는 캐시 폴더 GET을 추측해 추가하지 않았다. 실제 폴더 LIST/동기화/계정 및 메일 변경은 실행하지 않았다. 전체 통합 수용 완료가 아니다.

프로덕션 게이트: `GXWEBMAIL_BUILD_DIR=.next-gmail-start-validation npm run build -- --webpack` 종료 0. 컴파일·TypeScript·408페이지·trace 및 새 folders POST 경로를 확인했다. 변경된 추적 파일의 diff 공백 검사도 통과했다. 화면/번역 입력은 바뀌지 않았으므로 이전 언어/브라우저 결과를 새 폴더 GUI 검증으로 주장하지 않는다.
