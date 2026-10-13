# 외부 계정 전체 폴더 주기 예약 — 2026-10-13

## 확인한 서버 계약

읽기 전용으로 현재 Rust `crates/tastemail-api/src/linked_accounts/operations.rs`의 `queue_all`과 등록 경로를 확인했다. POST `/api/user/linked-accounts/{id}/sync/all`은 닫힌 `{expectedRevision}`을 받고 소유권/인증 세대를 확인해 외부 LIST(60초 제한)를 수행한다. 성공은202 `{status:"queued",mode:"receiveMirror",folders:[...]}`이다. 중간 예약 실패는409 `partialQueue`와 이미 확인된 `queuedFolders`를 반환한다. 접수는 실제 동기화 완료가 아니다.

기존 폴더별 작업은 주기적으로 계속되며 재예약은 기존 claim/대기 상태를 초기화할 수 있다. 개별 작업 중지·삭제 API는 현재 등록된 계약에 없다. 연결 계정 삭제는 캐시까지 제거하므로 예약 중지 대안으로 사용하지 않는다.

## 구현

- 서버 전용 고정 all 경로에만65초 전송 예산. 일반 요청의 기존 제한·no-store·redirect 거부를 유지했다.
- POST BFF는 HttpOnly 인증, HTTPS/loopback Origin,4KiB JSON/닫힌 expectedRevision, query 거부와 소유권/정확한 revision/connected/sync 확인을 사용한다.1MiB 응답 예산과100개 폴더·식별자 길이/Modified UTF-7/중복 검증을 적용한다.
- 접수 후에도 계정 provider/email/revision/credentialGeneration을 재확인한다. 응답 상세·retryable·내부 필드는 버리고 확인된 폴더 값과 재계산한 표시명만 보낸다. 빈401/403/429는 JSON 오류로 숨기지 않는다.
- BFF의202 queued와409 partial을 구분한다. Provider는 다른 계정 작업과 동기 잠금을 공유하고 늦은 응답/계정 세대 변경을 버린다. 부분 접수와 불명 결과는 추가 쓰기를 잠그며 전체 요청이나 확인된 폴더를 자동 재예약하지 않는다.
- 계정 메일 보기의 전체 폴더 예약 버튼은 기존 공통 ConfirmDialog를 쓴다.10언어로 외부 폴더 조회·지속 예약·기존 예약 재시작 가능성·로그아웃 후 유지·개별 중지 미지원 범위를 고지한다. 부분 접수는 확인된 목록과 경고로 표시하고 작업 상태를 읽기 조회한다. 작업 목록 조회는 불명 잠금을 해제하거나 예약을 재실행하지 않는다.
- Next.js 스킬에 따라 route는 라우팅만 담당하고 인증/전송은 서버 계층, 인터랙션은 기존 Client Provider에 유지했다.

## 검증

`test-linked-sync-all.mjs` 신규5개 그룹 통과: 닫힌/scoped 접수·부분 prefix·Modified UTF-7·중복/크기/잘못된 label 차단, 고정65초 POST, 소유권 및 사후 세대 fencing,401/403/429/불명 전송 구분, BFF Origin/입력/토큰 경계, 실제 Provider 동기 잠금·부분/불명 재전송 금지·늦은 응답, 실제 공통 확인 handler 취소/닫힘 및10언어 결과 UI. 기존 단일 폴더 queue와 mail viewer 검사, 공통 server 전송 경계도 통과했다. 추가된5번째 그룹만 따로 실행하고 이미 통과한4개를 반복하지 않았다.

10언어3388키·1563 literal사용 검사 통과. 전체 lint의 신규 스크립트 unused import 경고를 제거하고 변경 스크립트/추가 fixture만 scope lint로 재개했다. 최종 lint 경고 없음. 운영420페이지/TypeScript/새 all route 빌드 통과, BUILD_ID `2p5Gjt8Bpa-5a45xiwZay`. 변경 diff 공백 검사 통과. Node 검사에는 별도 optimized 모드가 없어 운영 빌드/실제 Next start를 별도 게이트로 사용했다.

고립된 loopback API와 실제 운영 Next build의 브라우저에서 합성 Gmail 계정만 사용했다. 실제 Google/Naver·운영 서버·DB에 요청하지 않았다. 공통 확인 창 취소 후 다시 열고 딱1회 합성 POST,409 부분 접수2개/INBOX·A&B 표시, 예약 버튼 disabled와 작업 목록 조회를 확인했다. fixture 카운터가 전체 POST1회를 확인했다. desktop 및390px 모바일 화면에서 문서 가로 넘침/console warning/error 없음. 내부 넘침의 최초 전역 aggregate는 숨김 접근성/배경 영역을 섞으므로 수용 근거로 쓰지 않았다. 후속 모달 템플릿 조회에서는 해당 모달의 넘침을 찾지 않았으며 부분 상태의 모든 내부 요소를0으로 판정하지 않는다.

[desktop 부분 접수](linked-all-partial-desktop-20261013.jpg), [mobile 부분 접수](linked-all-partial-mobile-20261013.jpg). fixture의 지원하지 않은 기본 계정 preferences 응답 안내는 배경 합성 오류이며 운영 장애 증거가 아니다. viewport·임시 탭·fixture Node/HTTP 프로세스는 정리했다.

fixture는1회 POST 카운터 확인 뒤 종료 대기가 남았다. 테스트 Next 자식/리스너 부재를 확인하고 정확한 commandline/PID의 fixture 부모만 종료했다. 종료 이벤트 구독을 kill보다 먼저 설치하고 own HTTP 연결을 닫도록 시험 스크립트를 보완해 해당 파일 lint/공백 게이트만 재개했다. 앱 입력/성공했던 UI·계약·빌드는 같아 반복하지 않았다. 수정된 자동 종료 경로를 재실행한 증거로 확대하지 않는다.

후속 종료 게이트: 같은 BUILD_ID를 확인하고 `--cleanup-check`로 새 고립 fixture의 시작·자동 종료만 실행했다. 예약 POST0회 assertion과 `Fixture cleanup complete`/프로세스 exit0을 확인했다. Browser TTY/운영 UI·원격 서비스·앱 빌드·기존 수용 검사는 반복하지 않았다. 변경된 제어 스크립트만 lint/공백 검사했다.

## 남은 경계

### 모달 닫기 정렬 후속

헤더 flex의 실제 자식은 Tooltip 래퍼인데 auto margin이 안쪽 Button에 있어 닫기 아이콘이 제목 바로 뒤에 붙었다. 래퍼에 `ml-auto shrink-0`을 옮겨 공통 Tooltip·aria-label·onClose를 유지했다. 실제 JSX와 공통 Tooltip/Button을 사용한10언어 SSR/콜백 검사, lint(테스트의 unused import만 제거 후 scope 재개), 운영 빌드420페이지(BUILD_ID `bkiSnouxZ0J_CyMHZus6X`), 변경 공백 검사 통과. 번역/예약/전송 입력은 그대로라 해당 성공 검사를 반복하지 않았다.

고립된 운영 fixture의 view-only 화면에서390px document 폭390/scroll390, 헤더 오른쪽374px·닫기 버튼 오른쪽358px(기존 padding16px)을 확인하고 모달의 닫기 클릭 후 해당 dialog0개·console warning/error0개를 확인했다. 전역 닫기 locator는 배경 합성 오류 toast도 포함해 거부됐고, 최신 상태에서 해당 dialog로 한정해 다음 단계만 재개했다. 예약·동기화 요청은 실행하지 않았다. [헤더 정렬 증거](linked-viewer-close-aligned-20261013.jpg). viewport와 탭을 원복했다. 이후 프로세스 관찰 핸들이 없어져 실제 Node/검수 Next commandline을 조회했고 잔존 프로세스가 없음을 확인했다. view-only 종료 카운터의 출력을 새로 수집했다고 주장하지 않는다.

실제 외부 인증/전체 예약/worker·캐시 정합성/운영 배포와 개별 중지·작업별 내구성 영수증은 미검증 또는 미지원이다. partial 상태는 확인된 prefix만 보존하며 실패한 나머지 폴더를 자동 재시도하거나 완료로 추측하지 않는다. 현재 잠금은 Provider 수명에 한정되므로 새로고침 후 결과 불명 복구를 완료했다고 주장하지 않는다. 운영 외부 예약을 수행하려면 계정과 범위의 별도 승인이 필요하다. 서버 소스·설정은 변경하지 않았다.
