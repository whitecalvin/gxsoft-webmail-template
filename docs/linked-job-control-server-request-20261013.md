# 서버 구현 요청 초안: 연결 계정 예약 제어·결과 복구

## 최신 검증 마감 — 2026-10-13

아래 진행 중 표현은 시간순 이력이다. 서버 채팅의 최종 보고와 실제 검증 산출물을 읽기 전용으로 확인했다. 사용자 승인한 새 격리 PostgreSQL에서 0068 포함 68개 마이그레이션, 관련 DB 회귀 Debug4/Release4가 통과했다. 시험 helper 정리 후 TestClippyFinal.json의 exitCode=0을 확인했다. DatabaseStop.json은 stopped=true, fixtureRetained=true, productionChanged=false이며 운영 DB·설정·배포·외부 메일 작업은 없었다. 서버 보고서는 `D:/works/projects/GXSOFT/TASTEDEV/resources/verification/dev-01/tastemail-linked-operation-control-20261013/DATABASE-RESULT.md`다. 기존 0.1.39 앱 빌드를 다른 세션에서 변경된 현재 0.1.40 전체 앱의 빌드 증거로 확대하지 않는다.

프런트 합성 production fixture의 저장된 checkpoint와 현재 BUILD_ID `oH1oNEwxh151IiOCfk5vF`가 일치한다. queueAll/resumePartial/pause/resume/recover 각각1회, operations4, userPaused=false, controlRevision3을 확인했다. 이는 격리 GUI 복구·부분 재개·중지/재개 증거이며 실제 공급자 인증·운영 worker 수용 증거가 아니다. stdout을 회수하지 못한 자동 종료 assertion은 통과로 주장하지 않는다. 최신 desktop GUI와 이전390px mobile 관측은 각 당시 빌드 범위에 한정한다.

운영 migration0068 적용·배포·실제 외부 계정 작업은 추가 승인 및 별도 수용 검증이 필요하다. 이 문서 갱신은 앱 입력을 바꾸지 않으므로 성공한 앱 빌드·회귀 검사를 반복하지 않는다.

현재 frontend chat은 서버 소스를 읽기만 했다. 아래는 아직 없는 계약의 요구사항이며 구현된 API/응답으로 간주하지 않는다. 사용자가 서버 구현 요청을 승인해 `tastedev-mail` chat에 전달했고 현재 해당 구현 turn은 active로 확인됐다. 배포·마이그레이션 적용·운영 설정 변경·실제 외부 인증/예약은 요청 범위에서 제외한다. 프런트는 확정된 계약과 검사 결과를 받은 뒤 연결한다.

진행 재개 기록: 서버 turn이 interrupted/notLoaded로 전환된 것을 확인해 최근2turn의 성공 단계와 변경 파일을 조회했다. 새로운 사용자 중지 지시는 없었고 기존 migration/store 부분 구현이 남아 있었다. 같은 승인 범위에서 미완료 API 연결·worker fencing·컴파일 게이트부터 재개를 요청했고 active 및 기존 패치 재사용 답변을 확인했다. 완료된 서버 계약/검사 결과로 판정하지 않는다.

## 확인한 공백

### 구현 중 체크포인트

서버 채팅은 API·worker 연결 및 첫 컴파일 통과를 보고했고 정적 검사 수정이 진행 중이다. 실제 DB 경쟁 검증은 migration 적용이 승인 범위 밖이므로 수행하지 않았다. 완료·배포된 계약으로 판정하지 않는다.

프런트엔드는 현재 서버 소스의 닫힌 operation 요청과 영속 receipt를 검증하는 순수 모듈 `lib/linked-operations.ts`를 추가했다. UUID 정규형/nil, 소유 계정 revision·credentialGeneration, 닫힌 action, 폴더 개수·UTF-8 합계, 상태/prefix, pause·resume의 다음 controlRevision과 캐시 보존을 확인한다. 원래 IMAP 폴더 식별자는 유지하며 표시명만 Modified UTF-7 복호화한다. 임의 result/detail/토큰은 투영하지 않는다. partial은 서버가 허용하고 남은 폴더가 있을 때만 재개 대상으로 판정하며 pending/unknown을 완료로 바꾸지 않는다.

첫 순수 검사4개 그룹·해당 파일 ESLint·의존 순수 모듈을 포함한 strict TypeScript noEmit 검사 통과. 이어 서버 전용 고정 POST/GET과 BFF를 연결했다. 브라우저에서 Rust 주소나 토큰을 받지 않으며, POST70초·조회10초 예산, redirect 거부/no-store, UUID/Origin/JSON16KiB/응답256KiB 한도, 현재 소유 계정의 revision·credentialGeneration 사전/사후 fencing을 적용한다. POST200/202/409 receipt의 확인된 prefix를 보존하고, GET은 서버200의 실제 phase를 유지한다. 조회404·410·세션/권한/장애로 불명 잠금을 해제하거나 POST를 재실행하지 않는다. 현재 body 한도는 부모 router까지 보수적으로 존중하며 서버의 실제 한도 시험 결과를 기다린다.

신규7개 그룹 통과: 순수 계약, 고정 전송/정확한 시간 예산, 사전·사후 소유권/세대, POST/GET별 상태, 불명/부분/폐기 결과, 조회가 예약을 호출하지 않음, BFF Origin·입력·세션 경계. 새 server import 때문에 기존 server 경계 시험의 단일-import assertion이 실패해 실제 순수 모듈을 로드하도록 시험 harness만 보완하고 해당 시험을 재개해 통과했다. 기존 단일/전체 queue 검사도 통과. 서버의 canResumePartial 조건 변경은 실제 소스를 읽고 남은 폴더가 있을 때만 true로 맞췄으며 해당 영향을 받는 검사만 재개했다. 전체 ESLint 통과 후 변경된 순수 모듈·시험 harness만 다시 검사했다.

production 빌드는 Turbopack CSS 처리용 Node 자식이 연결 전에 exit0으로 종료해 실패했다. 권한 밖 재시도에서도 같은 단계가 실패해 소스/설정을 고치지 않고 기존 별도 Webpack 검수 출력 경로에서 build 단계만 재개했다. `.next-admin-webpack-validation`의 production 컴파일·TypeScript·420페이지 생성·새 operations POST/GET route 포함·exit0 통과, BUILD_ID `o-8D5mVvSRMpUVJ47ZtjA`를 확인했다. Turbopack 실패를 해결했다고 주장하지 않는다. 아직 Provider·UI에 연결하거나 실제 운영 요청을 하지 않았다. 브라우저/10언어 UI 검사는 UI 변경이 없어 실행하지 않았다. 다음 단계는 서버 최종 계약 확인 후 Provider 내구성 복구·예약 제어 UI 연결이다. Next.js 스킬에 따라 route는 Promise params 라우팅만 처리하고 인증/검증/전송을 서버 모듈에 유지했다.

초기 확인 요청: 실제 operations body 한도, jobs GET의 제어 세대 필드, POST/GET 상태 구분, sync 결과 형태, prefix 전체 접수 후 partial 재개의 의미. 아래 후속에서 sync 결과 검증과 UI 연결을 추가했다.

### Provider·UI 연결 후속

현재 서버 sync 저장 코드의 실제 결과 필드를 확인해 동기화 receipt도 전용 검증층으로 투영한다. Provider의 LIST·단일/전체 예약·동기화를 모두 영속 operations 경로로 바꿨고, 기존 비영속 예약 경로로 fallback하지 않는다. 소유 기본 계정 UUID에 묶인 sessionStorage에는 연결 계정 UUID·operation UUID·revision·credentialGeneration 네 필드만 저장한다. 설정 저장소가 아니라 서버 receipt 조회 위치이며 토큰·비밀번호·OAuth·메일·폴더·요청 본문·실제 결과는 저장하지 않는다. 저장·검증이 실패하면 쓰기를 실행하지 않는다. 새로고침 후 조회 위치가 남으면 추가 쓰기를 잠그고 명시적인 결과 확인 GET만 허용한다. GET404/410·권한 거부·세대 불일치·장애는 잠금을 해제하지 않는다. confirmed/failed 영수증만 종료로 처리하며 pending/unknown/partial은 유지한다. partial 재개는 공통 확인 창을 거쳐 새 UUID와 원래 UUID 참조만 보낸다. 확인된 폴더 prefix를 다시 예약하지 않는다.

작업 목록의 실제 userPaused/controlRevision을 검증해 중지·재개 버튼과 공통 확인 창을 연결했다. 이전 서버가 제어 필드를 제공하지 않으면 읽기는 유지하고 버튼은 비활성화한다. 캐시/원격 메일 삭제가 아니라 다음 배치 저장 경계의 예약 제어라는 설명을10언어로 제공한다. 로컬 저장소 초기화는 hydration 이후 callback에서만 실행하고 폐기된 mount의 결과를 게시하지 않는다.

합성 검사: 실제 Provider 함수의 사전 journal 저장·동기 직렬화·재마운트 GET 복구·404 잠금 유지·부분 재개 UUID·저장 실패 무전송·늦은 응답·세대 불일치4그룹, operations 계약/BFF7그룹, jobs GET 소유권/세대 검증 통과. 기존 단일/전체 예약 시험의 Provider 부분은 새 영속 엔진 위임 검사로 갱신했고 전체 예약·공통 확인·10언어 결과 검사 통과. 메일 보기 시험의 hook 상태 순서 불일치를 실제 UI 선언 순서 보존으로 수정해 해당 시험만 재개·통과했다. 이전 server adapter 시험이 현재 Provider 직렬화까지 증명한다고 주장하지 않는다.

전체 lint의 hydration 초기화 오류만 수정해 해당 파일과 변경 시험의 lint를 재개했다.10언어3401키·1571 literal사용 검사 통과. 검사 중 변경된 초기화·문구가 build 입력을 바꿔 Webpack production 빌드만 마지막 입력으로 재개했고 컴파일·TypeScript·420페이지·exit0 통과했다. BUILD_ID `yWiaolUeiNOh7U7mbnX-u` 확인. 실제 브라우저 검수·운영 배포·migration 적용·외부 예약/worker 실행은 아직 수행하지 않았다.

서버 turn의 마지막 답변이 별도 관리 구성 확인으로 끝나 해당 로컬 계약 구현의 RESULT/최종 보고가 없는 것을 확인했다. 기존 승인 범위로 미완료 로컬 게이트와 계약 보고만 요청했다. 서버의 현재 Clippy/StoreDebug/ApiLinkedDebug 기록은 exit0·migrationApplied=false지만 실제 DB 경쟁 검증·Release 완료로 확대하지 않는다.

추가 합성 게이트: journal의 비밀/폴더 추가 필드 거부와 기본 계정별 key 분리, 실제 jobs JSX의10언어 공통 확인·취소 무전송·정확한 folder/controlRevision·확인1회·제어 필드 부재/불명 상태 비활성화 통과. JSX 시험 harness의 exports 누락만 고쳐 실패한 그룹과 해당 시험 lint를 재개했으며 앱 입력은 변하지 않아 빌드를 반복하지 않았다. 브라우저 hydration/레이아웃/실제 새로고침 검수는 다음 게이트다.

### 실제 고립 브라우저 검수 및 계약 확정

Computer Use 스킬/CUA로 운영 서버와 분리된 loopback 합성 API 및 production 화면만 검사했다. 최초 fixture는 sandbox 시작 gate에서 준비되지 않아 종료됐고, 진단 출력을 추가한 승인 실행에서 시작했다. 일반 전체 예약 확인 창의 취소는 무전송이었고, 부분 접수 후 새로고침이 Provider 잠금을 보존하는 것을 확인했다. 그러나 메일 보기 진입 버튼도 uncertain으로 비활성화되어 복구 화면을 다시 열 수 없는 결함을 발견했다. 버튼만 busy/계정 조회/read capability 기준으로 바꾸고 실제 쓰기 잠금은 유지했다. 실제 JSX의 모든 busy/read/data 조합 및 unknown 상태 회귀·해당 lint·production 빌드 통과.

새 fixture는 변경된 production 입력으로 다시 시작했다. 전체 예약 후 응답 게시 중 새로고침→메일 보기 재진입→GET 결과 확인→partial receipt 복구→새 UUID로 남은 폴더만 접수→추가 쓰기 잠금 해제를 화면에서 확인했다. 이어 공통 확인 창으로 INBOX 예약 중지→중지/userPaused 안내 및 재개 버튼 표시→390px 모바일에서 재개→대기/중지 버튼 복원을 확인했다. 모바일 document width390/scroll390, warning/error 콘솔0. 배경의 미구현 합성 preferences 오류 toast는 검수 UI로 닫았고 해당 실제 운영 기능 오류로 확대하지 않았다. [중지 상태 모바일 증거](linked-operation-paused-mobile-20261013.png).

첫 fixture는 진입 결함으로 중단해 최종 카운터 assertion이 실패했고 queueAll1/pause0/resume0/resumePartial0을 출력했다. 두 번째 fixture의 관찰 핸들이 사라져 최종 카운터 stdout은 회수하지 못했다. 따라서 전체 요청 횟수 assertion 통과를 주장하지 않는다. 정확한 fixture/Next57715 commandline의 잔존 Node 프로세스가 없는 것을 권한 있는 CIM 조회로 확인했다. 모바일 viewport와 agent 탭을 정리했다. 최종 desktop screenshot 시도는 합성10분 세션이 만료돼 login으로 이동하여 저장하지 않았다. 이미 관찰한 흐름과 모바일 증거를 대신 확대하지 않고 desktop 캡처만 미완료로 남긴다.

서버 최종 RESULT/API 계약을 읽었다. 소스/native Debug 및 Release API109+store76=185 검사, Clippy, 서버 Release build, body merge/layer 합성 게이트는 보고서에서 확인했으며 실제 DB 통합은 아직 수행하지 않았다. 운영 배포·외부 예약/메일 전송 증거가 아니다. 확정 body 한도49,152를 BFF에 반영하고49,152 허용/49,153 차단의 정확한 경계 시험을 실행했다. limitReached는 계정10개 문구를 전달하지 않고 rateLimited로 변환해 새 키24시간 quota 거부를 불명 작업으로 오인하지 않는다. 관련 adapter/BFF·quota 회귀 및 scope lint 통과. 최종 변경 production build 컴파일·TypeScript·420페이지·exit0, BUILD_ID `rHHqfEfySEiSH5XxNwozp`.

사용자가 빈 격리 DB 생성·0068 포함 schema 적용·DB 경쟁 회귀 검증을 추가 승인했다. 서버 채팅에 합성 데이터만 사용하는 별도 DB와 직접 관련 Debug/Release DB 시험을 요청했다. 이 승인은 운영 DB·환경/서비스 설정·배포·실제 외부 작업을 포함하지 않으며 frontend가 DB를 직접 조회하거나 변경하지 않는다.

### 완료 결과 복구·검증 후속

confirmed phase만으로 LIST/예약 완료를 받아들이지 않도록 실제 action별 result를 검증한다. LIST는 prefix0·결과 폴더 계획/encoding 일치, queue는 reservationAccepted·remoteMutation=false가 필요하며 BFF는 닫힌 boolean으로만 투영한다. 클라이언트는 잘못된 marker/결과를 거부한다. 잘못된 resumedBy/action/phase 조합도 차단했다.

결과 확인 GET과 명시 partial 자식 receipt를 현재 viewer의 상태로 반영한다. LIST는 복구된 폴더 선택 목록, sync는 해당 폴더·batch 개수·주기 상태, queue는 확인된 prefix만 표시한다. 다시 LIST·sync POST를 보내지 않으며 닫힌 viewer 또는 계정 세대 불일치는 게시하지 않는다. 실제 helper의 no-fetch·inactive/stale·LIST/sync/partial 표시 회귀와 action 결과 회귀2그룹을 추가했다. 변경된 소스 기준 기존16그룹 및 신규2그룹, 전체 lint 통과. Webpack production 컴파일·TypeScript·420페이지·exit0 및 BUILD_ID `oH1oNEwxh151IiOCfk5vF` 확인. 번역 입력은 그대로라 성공했던 locale 게이트를 반복하지 않았다. 마지막 helper 표시 변경의 GUI gate는 아직 남아 있다.

검수 fixture는 확정 queue 결과를 내보내도록 맞추고 합성 counters/현재 상태/buildId만 로컬 checkpoint에 기록하게 했다. 관찰 핸들이 사라져도 조회 위치·비밀·메일 내용을 저장하지 않고 결과 범위를 구분할 수 있다. 별도 script 변경이므로 해당 lint만 실행했으며 앱 빌드를 다시 실행하지 않았다. 새 checkpoint producer의 자동 종료·브라우저 gate가 실제 실행됐다고 주장하지 않는다. 격리 DB 검증은 서버 채팅에서 새 빈 클러스터 및 loopback 분리를 확인한 후 관련4개 회귀 실행 중이다.

격리 DB 후속: 서버 보고에서0068까지68개 migration 적용 성공, restart fixture의 기본 설정 hostname 누락 실패와 합성 설정 수정 확인. DB 회귀 통과는 아직 아니다. 해당 turn의 실제 terminal error는 selected model capacity였으므로 동일 승인·동일 model에서 남은 실제 프로세스 관찰/첫 실패·무효화 gate만 재개하도록 요청했다. 운영 대상이나 DB에 frontend가 접근하지 않았다.

### 최종 고립 GUI·DB 시험 기록 대조

현재 BUILD_ID `oH1oNEwxh151IiOCfk5vF`의 고립 production GUI에서 새로고침 후 GET 복구가 confirmed prefix INBOX만 표시하고, partial 자식 접수 후 남은 A&B만 예약 접수로 표시됨을 확인했다. 이어 중지·재개 및 원상 대기 표시, warning/error 콘솔0. [현재 desktop 증거](linked-operation-resumed-desktop-20261013.png). 사용자 탭은 유지하고 검수 탭을 닫았다.

`linked-operation-fixture-checkpoint-20261013.json`의 저장된 실행 상태를 확인했다: queueAll1/resumePartial1/pause1/resume1/recover1, userPaused=false, controlRevision3, operations4이며 syntheticOnly=true와 해당 BUILD_ID가 일치한다. phase는 operationAccepted이다. 관찰 핸들이 또 사라져 최종 종료 stdout/assertionsPassed를 수집하지 못했으므로 cleanupComplete라고 기록하지 않는다. 대신 정확한 fixture/Next56793 commandline의 프로세스 잔존0을 CIM으로 대조했다. 이전 횟수 미회수 한계는 이 저장된 실제 카운터 범위에서만 보완됐고 자동 종료 assertion 수용으로 확대하지 않는다.

서버의 DatabaseDebug/DatabaseRelease JSON4개씩 exit0 및 실제8개 로그의 test passed1/failed0을 대조했다. 대상은 durable replay/partial/restart/scope, pause/late batch/explicit resume, sync checkpoint/restart, expired lease/revoked owner/stale job이며 빈 격리 DB에 한정된다. source가 아닌 tests의 합성 설정/claim 기대 수정으로 재개됐고 운영 DB 검증으로 확대하지 않는다. 별도 TestClippy.json exit101이 남아 있어 서버에 그 첫 실패 게이트와 최종 문서·입력 해시/종료 증거만 마무리하도록 요청했다. 성공 DB/native 시험의 자동 반복은 요청하지 않았다.

요청 당시 `crates/tastemail-api/src/linked_accounts/operations.rs`는 폴더별 및 전체 예약 POST와 작업 GET을 등록하지만 pause/resume/delete 제어를 등록하지 않았다. `crates/tastemail-store/src/linked_account_jobs.rs`의 자동 paused는 인증/한도/실패 처리이며 사용자 예약 중지와 달랐다. 기존 재예약 upsert는 claim·attempts·next_attempt_at을 초기화하므로 요청 재전송을 조회나 무해한 retry로 사용할 수 없다. 새 영속 operations 경로가 운영에 배포됐다는 뜻은 아니다.

현재 jobs GET은 폴더 상태만 보여 주고 특정 예약 요청의 UUID/완료·부분 접수 결과를 영속 조회하는 계약이 없다. frontend의 partial/unknown 쓰기 잠금은 Provider 수명에 한정되므로 새로고침 후 안전한 결과 복구는 완료되지 않았다.

## 필요한 계약과 검증

1. 소유자·기본 인증 세대·연결 계정 revision/credentialGeneration에 묶인 폴더별 pause/resume. 캐시나 계정 등록 삭제 없이 예약만 제어한다. 명시적 resume만 재개한다. 실행 중 worker의 claim을 fencing하고 중지 이후 늦은 완료가 재예약 상태를 되살리지 못하도록 한다. 중지가 어느 batch 경계에서 효력을 갖는지 명시한다.
2. LIST·선택 폴더/전체 예약·동기화 요청에 서버가 검증하는 operation UUID/idempotency key와 영속 결과 조회. 같은 사용자/계정/세대/입력의 동일 key 재사용은 원래 결과만 반환하고 재예약·OAuth 변경·동기화를 다시 실행하지 않는다. 같은 key의 다른 입력, 다른 소유자/세대는 거부한다.
3. pending/confirmed/partial/failed/unknown의 닫힌 상태와 확인된 폴더 prefix, 현재 실행/종료 상태를 구분한다. partial 완료 폴더를 다시 접수하지 않고 안전하게 남은 작업을 재개하는 계약이 있다면 정확한 허용 조건/receipt를 제공한다. job 목록의 synced를 operation 완료로 대신하지 않는다.
4. 응답 필드·원래 IMAP 식별자·표시 encoding·개수/바이트 제한·상태 코드·권한/충돌·폐기/보존 기간을 문서화한다. 비밀번호/OAuth 토큰/세션 bearer/MIME 원문은 결과 DTO나 로그로 노출하지 않는다.
5. 로컬 테스트에서 중복·동시 제출, partial 이후 동일 key, commit 후 응답 유실, restart 복구, 다른 계정/세대 거부, 중지와 worker 완료 경쟁·명시적 재개를 검증한다. 필요한 migration의 소스만 작성하며 실제 적용은 하지 않는다.

기존 all/폴더 예약과 캐시 읽기 계약을 보존하고 확인된 설계/검사 증거를 frontend chat에 제공하면 BFF·Provider·공통 확인 창·10언어 UI를 연결한다. frontend는 확정 전 새 endpoint나 결과 형식을 추측하지 않는다.
