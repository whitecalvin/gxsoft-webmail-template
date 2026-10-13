# 연결 계정 폴더 동기화

## 소스에서 확인한 계약

`tastedev-mail/crates/tastemail-api/src/linked_accounts/operations.rs`의 sync/sync_batch/collect_messages와 transport.rs의 EXAMINE/BODY.PEEK 구현을 읽기 전용으로 확인했다.

`POST /api/user/linked-accounts/{id}/sync`는 닫힌 `{expectedRevision,folder}`를 받는다. 소유 사용자/세션 세대/계정 revision의 lease를 검사하고 최대 60초 동안 선택 폴더의 한 배치를 가져온다. 최대 50 UID 범위 및 50 MiB 배치 예산을 사용하며 개별 캐시 메일 제한은 기존 서버 계약을 유지한다. UID가 연속으로 존재한다는 가정은 하지 않는다. 커서와 캐시 반영은 서버가 처리한다. 원격 메일을 이동·삭제·발송하거나 읽음 상태로 변경하는 요청은 아니다.

응답은 `mode:receiveMirror`, 원래 folder, UIDVALIDITY, scannedThrough, nextCursor, cycleComplete, messages, remoteMutation:false다. messages는 이번 배치에 반영한 기록 수이며 새 메일 개수·폴더 전체 개수가 아니다. cycleComplete는 서버 커서가 범위 끝에서 1로 돌아왔다는 뜻이며 모든 폴더를 동기화했다는 뜻이 아니다. 큐/jobs/sync-all 계약은 이 한 배치 UI로 대체하거나 숨기지 않았으며 별도 후속 범위다.

## BFF/Provider/UI

- 같은 출처 sync POST BFF는 HTTPS/loopback 및 기존 HttpOnly 세션을 사용한다. 본문은 스트림으로 4096바이트까지 읽고 알 수 없는 필드를 거부한다. 임의 URL·토큰·기본 JMAP ID는 받지 않는다.
- 실제 계정의 연결 상태/sync capability/revision을 전후로 검사한다. 응답 JSON은 32 KiB 이하이며 정확한 폴더·UID·커서 규칙·0~50 기록·remoteMutation:false를 검사한다. 서버 응답에 없는 계정 ID/revision/인증 세대를 전후 검사 결과에 묶어 BFF 영수증으로 제공한다.
- 이 고정 외부 작업 전송만 65초 제한을 사용한다. 일반 요청의 제한·TLS·no-store·redirect 정책은 그대로다. 클라이언트는 전후 계정 조회까지 포함해 90초 제한을 사용한다.
- 계정/폴더 선택 후 명시적 `폴더 동기화` 버튼과 공통 확인 창을 거쳐 한 배치를 실행한다. 외부 인증 토큰/연결 상태 변경 가능성을 고지한다. SSR/마운트/조회 실패 시 자동 동기화·자동 재시도를 하지 않는다.
- Provider의 동일 잠금으로 인증/삭제/폴더 조회와 동기화를 직렬화한다. 확정 실패는 기존 번역을 표시하며 빈 401도 세션 만료로 구분한다. 결과를 확인하지 못하면 `{kind:"sync",before}`만 남기고 해당 Provider 수명 동안 후속 요청을 잠근다. 폴더·본문·인증 비밀을 미확정 메타데이터에 저장하지 않는다.
- 현재 서버는 작업별 영수증 조회를 제공하지 않는다. 단순 계정 목록 새로고침으로 미확정 sync를 해제하지 않는다. 페이지 전체 재로딩을 통한 결과 복구까지 보장하는 내구성/작업 식별 계약은 미완료이며, 자동 재전송으로 이를 보완하지 않았다.
- 완료된 응답만 받은 뒤 결과 수/범위 끝 여부를 표시하고 첫 캐시 페이지를 다시 읽는다. 화면이 닫히거나 계정 세대가 바뀌면 늦은 UI 갱신을 무시한다. 남은 범위는 사용자 동작으로 다음 배치를 요청한다.

## 검증

`test-linked-sync.mjs`: 실제 순수 계약과 고정 전송 함수의 65초/TLS 경로/no-store/redirect/닫힌 요청, BFF 세션/출처/본문 예산·전후 계정 검사, 확정/미확정 실패·빈 401·잘못된 영수증, 실제 Provider의 중복 방지/미확정 잠금/세대 경계 검사. 모두 합성 응답만 사용했다.

`test-linked-mail-viewer.mjs`: 실제 동기화 버튼 클릭과 확인 이벤트를 실행해 확인 전 요청 없음, 정확한 선택 계정/폴더, 결과 반영·첫 페이지 복귀, unmount 후 늦은 UI 갱신 없음 검사. 최초 렌더링의 10개 언어 검사도 유지했다. 실제 브라우저 layout/hydration/콘솔 수용 검수는 아니다.

관련 공통 전송/authentication/OAuth/folders 회귀, 변경 범위 ESLint, 10개 언어/3139키 검사 통과. 실제 외부 계정 동기화, 운영 설정/배포/DB/실제 메일 변경은 실행하지 않았다. 현재 브라우저 정책 차단은 우회하지 않았다. 큐·전체 폴더, 인라인 CID, 작업 영수증 기반 복구와 실제 데이터/GUI 수용은 남는다. 전체 연동 완료가 아니다.

sync BFF/Provider/UI/번역 입력 변경으로 프로덕션 빌드를 다시 실행했다. `GXWEBMAIL_BUILD_DIR=.next-gmail-start-validation npm run build -- --webpack` 종료 0, TypeScript/408페이지/trace 및 새 sync POST 경로 확인. BUILD_ID 생성 시각 2026-10-11 05:47:47 KST. 실제 운영 배포나 서비스 수용을 의미하지 않는다.
