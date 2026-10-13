# 연결 계정 첨부 다운로드

후속: 캐시 HTML에서 참조하는 지원 raster CID의 사전 로딩을 연결했다. 아래 인라인 미지원 기록보다 최신이며 실제 이미지/GUI 수용은 미완료다. [범위](linked-inline-images-20261011.md).

## 확인한 서버 계약

읽기 전용으로 확인한 `tastedev-mail/crates/tastemail-api/src/linked_accounts/operations.rs`는 `GET /api/user/linked-accounts/{id}/messages/{uid}/attachments/{index}?folder=…&uidValidity=…`를 제공한다. 인증 사용자/세션 세대와 정확한 캐시 키를 검사한 뒤 첨부를 추출한다. 응답은 `application/octet-stream`, `nosniff`, `Content-Disposition: attachment`다. message 크레이트의 metadata.size와 다운로드 데이터 모두 같은 part.contents()의 바이트 길이를 사용한다. 확인되지 않은 blob ID나 원격 IMAP fetch 계약은 추가하지 않았다.

## BFF와 UI

새 같은 출처 GET BFF는 기존 HttpOnly 세션과 고정 서버 경로만 사용한다. 계정/폴더/UIDVALIDITY/UID와 0~1023의 정규 첨부 번호를 검사하며 중복·미지원 query를 거부한다. 소유 계정의 read capability와 실제 캐시 상세 metadata를 먼저 확인한다. 첨부 인덱스가 상세에 없으면 다운로드 요청을 보내지 않는다.

데이터는 상세 metadata.size 이하로만 읽고 완료 바이트 수가 정확히 일치해야 반환한다. 상세 계약의 최대 25 MiB 제한을 유지한다. 200/octet-stream이 아니거나 content-length가 불일치하면 거부한다. 오류 본문도 16 KiB 이하로 제한하고 내부 오류/메일 데이터를 브라우저에 전달하지 않는다. 전체 요청에 25초, 기존 개별 서버 GET에는 기존 15초 제한을 사용한다. 취소 시 reader를 해제한다.

다운로드 응답은 private/no-store, nosniff, no-referrer, default-src none/sandbox, 강제 attachment/octet-stream으로 재구성한다. 공급자 응답 헤더나 임의 MIME을 그대로 전달하지 않는다. 파일명은 경로·제어 문자·헤더 위험 문자를 제거하고 UTF-8 확장 파일명과 고정 ASCII fallback을 사용한다.

메일 보기의 첨부 행은 공통 아이콘 버튼과 사용자 정의 Tooltip을 제공한다. 클릭한 첨부만 같은 출처로 읽고 MIME·길이·스트림 크기를 재검사한 뒤 octet-stream Blob으로 다운로드한다. 클라이언트 제한은 35초다. 요청 중 중복 클릭은 차단하며 메일/계정 전환으로 컴포넌트가 사라지면 취소한다. 늦은 완료는 다운로드나 상태 갱신을 실행하지 않는다. Object URL은 해제한다. 에러는 행 내부의 기존 서비스/권한 번역으로 표시한다. 마운트/SSR 자동 다운로드, 기본 JMAP 첨부 요청, 외부 발송/변경은 없다.

## 검증 및 남은 작업

`test-linked-attachment.mjs`는 합성 바이너리/서버 응답만 사용했다. 닫힌 입력과 정확한 요청 키/인덱스, metadata 바이트 예산·과대/불완전/잘못된 MIME/길이·상태 코드·실제 stream 취소, BFF 세션/출처/헤더·Unicode 파일명, 클라이언트 Blob 검증, 10개 언어 초기 SSR을 검사했다. 실제 다운로드 클릭 함수의 중복 클릭 차단과 unmount 후 늦은 상태 갱신 없음도 검사했다. OS의 파일 저장 동작이나 실제 브라우저 검수를 증명하지 않는다.

관련 메일 보기 회귀, 변경 범위 ESLint 및 10개 언어/3134키 검사 통과. Rust/DB/환경/배포/실제 계정과 메일은 변경하지 않았고 실제 첨부는 다운로드하지 않았다. 현 브라우저 정책 차단은 우회하지 않았다. 인라인 CID 이미지, 동기화 UI와 실제 계정·화면·다운로드 수용은 남아 있다. 전체 연동 완료가 아니다.

새 BFF/UI/번역 입력을 대상으로 `GXWEBMAIL_BUILD_DIR=.next-gmail-start-validation npm run build -- --webpack`을 실행했다. 종료 0, TypeScript/408페이지/trace 및 첨부 GET 경로 확인. BUILD_ID 파일 생성 시각 2026-10-11 05:40:50 KST 확인. 실제 운영 배포나 브라우저 수용 증거는 아니다.
