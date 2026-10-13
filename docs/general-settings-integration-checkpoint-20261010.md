# 일반 설정 연결 체크포인트 — 2026-10-10

## 최초 계약 모듈 단계의 증거 — 이후 단계는 아래 재개 기록을 따른다

- 사용자 승인 후 `tastedev-mail` 세션에 서버 구현 요청을 전달했다. 서버 소스의 `crates/tastemail-api/src/general_settings.rs`에서 `/api/user/general-settings` GET/PATCH를 확인했고, store 모듈에서 `{version, accountId, revision, settings}` 및 `{expectedRevision, changes}` 계약을 확인했다. 배포 API에서 제공되는지는 아직 검증하지 않았다.
- 프런트엔드 `lib/general-settings.ts`에 닫힌 설정 snapshot 검사, 계정 ID/revision 검사, 현재 계정 이미지 허용 목록 투영, 기존 UI 타입 변환을 추가했다. 서명·identity·보안·라벨·규칙은 일반 설정 payload에 포함하지 않는다.
- `scripts/test-general-settings-contract.mjs` 합성 검사 통과: 기본값, 잘못된 계정/revision/type/enum, 단축키 충돌, 허용하지 않는 필드, 계정별 이미지 허용 목록 투영.
- 두 변경 파일 ESLint 및 범위 `git diff --check` 통과. 이 모듈은 아직 runtime provider에 연결하지 않았다. 기존 localStorage 저장·SSR 미연결 상태는 해소되지 않았다.

## 재개 기준

### 승인된 글자 크기 저장 검증 — 최신 결과

- 사용자 `글자 크기 저장 검증 승인` 후 인증된 임시 탭6에서 기존 100%/저장됨/저장 비활성을 확인했다. 글자 크기만 110%로 변경하고 저장 성공 메시지와 저장됨 상태를 확인했다.
- 새로고침 후 110% 선택 및 HTML `--user-font-scale: 1.1` 유지 확인. 원래 100%로 복원·저장한 뒤 다시 새로고침하여 100% 선택/scale1/저장됨/저장 비활성을 확인했다.
- 증거 화면: `font-size-save-restored-20261010.png`. 다른 설정이나 메일은 변경하지 않았다. 이는 해당 계정의 글자 크기 저장·재조회·복원 검증이며 전체 설정, 계정 격리 또는 DB 직접 회귀 검증 완료를 뜻하지 않는다. 애플리케이션 코드 변경이 없어 빌드/테스트를 반복하지 않는다.

### 배포 API 연결 후 실제 다국어 설정 조회

- 모바일 후속: 도구 복구 후 viewport390×844가 실제 innerWidth/innerHeight에 적용됐다. 임시 탭5에서 동일10개 언어의 접근성 설정은 lang 일치/글자크기 버튼4개/scale1/문서 가로 overflow없음, warn/error0이다. 한국어 화면에서 모바일 상단 메뉴와 하단 내비게이션 및 저장 비활성도 관찰했다. 설정 변경/저장은 하지 않았다. 임시 탭5를 닫고 viewport override를 reset했다. 이는 이전 override 미적용 제한을 해당 페이지/크기의 새 관측에 한해 해소하며 전체 제품 모바일 QA를 증명하지 않는다.
- 기존 인증을 공유하는 임시 탭4에서 접근성 설정의 en/ko/de/es/fr/it/pt/ja/zh/zh-hant를 읽기 전용으로 확인했다. 각 locale의 html lang 일치, 접근성 제목/글자 크기 버튼4개 표시, scale1, viewport1280px에서 문서 가로 overflow 없음, 탭의 warn/error 로그0을 확인했다. 최초 영어 화면의 Saved/저장 비활성도 관찰했다.
- 이것은 해당 실제 계정의 접근성 페이지 desktop 조회/렌더링 증거다. 최초 HTML 전체 SSR·모바일·모든 설정 섹션·운영 PATCH 영속성·계정 전환 검증으로 확대하지 않는다. 설정 변경/저장/메일 열기/생성 요청을 하지 않았다. 임시 탭4를 닫고 사용자 탭은 유지했다.

### 새 편지함 생성 진입 수정 — 검증 재개

- 후속 실제 브라우저: 도구가 복구돼 임시 탭3의 `/ko/settings/accessibility`에서 인증된 설정100%/저장됨/저장 비활성, HTML fontScale1/reduceMotionfalse 및 warn/error0을 확인했다. 이전 API 미지원 안내 없이 설정 화면이 표시된다. 이 DOM 관측만으로 최초 응답 HTML/운영 PATCH 영속성 전체를 증명하지 않는다.
- `새 편지함 생성` 버튼 클릭 후 중간 메뉴 없이 같은 이름의 dialog와 상위 편지함/최상위/편지함 이름/생성/취소를 확인했다. screenshot `mailbox-create-direct-browser-20261010.png` 저장. 폼의 취소를 눌러 dialog 닫힘을 확인하고 임시 탭3를 닫았다. 실제 편지함 생성/설정 저장 요청은 하지 않았고 기존 사용자 탭은 유지했다.
- 사용자 요청으로 PersonalFolderManager의 최상위 추가 트리거를 `새 편지함 생성` 접근성 이름/공통 Tooltip의 직접 버튼으로 변경했다. 클릭하면 메뉴 없이 기존 공통 Modal 생성 폼이 열린다. 기존 항목의 context 요청/이름 변경/삭제와 저장 계약은 유지한다. 실제 계정에 편지함 생성 요청을 보내지 않았다.
- 클릭 callback의 mailbox 상태 초기화·busy 차단을 포함한 관련 UI 검사12개와 두 변경 파일 ESLint 통과. 변경 범위 diff 검사 통과. UI10개 locale 렌더링 검사이며 실제 브라우저 검수는 아니다.
- runtime 변경으로 이전 production build는 이 수정의 증거로 재사용하지 않는다. Webpack build session58509는 컴파일 통과 후 TypeScript 단계 실행 중이다. 완료 여부는 이 handle에서 재개하고 빌드를 중복 실행하지 않는다.
- 후속 확인: session58509 exit0. 컴파일·TypeScript·393개 페이지 생성·최종 정리까지 production build 통과했다. 브라우저 클릭/실제 계정 생성 검증은 수행하지 않았으며 기존 운영 데이터를 변경하지 않았다. 마지막 기록 변경은 문서뿐이므로 빌드를 반복하지 않는다.
- 입력 SHA256: PersonalFolderManager `2F9FED1ECE8371556ECE5DD40026ACDD055414C8B3329FED851CD52B2DDAB93F`, UI test `16705F880E2AC251C5AB5438D020DA72A5A64D0E67C2308333B310A7E03219E9`.

### 운영 반영 결과 및 로컬 종료 — 최신 상태

- 이후 읽기 전용 재확인에서 새 SSH187804/Next172208의16711/7540 리스너를 발견했다. 앞서 종료한 프로세스와 다르며 이 대화에서 재시작하지 않았다. SSH 명령행은 검증된 host-key/BatchMode와109 loopback6711 포워딩을 유지하고 웹메일 health는200 `{status:ok}`이다. 새 프로세스는 변경/종료하지 않았다. 브라우저 도구는 여전히 kernel assets 경로 오류여서 인증된 설정 화면 검증은 수행하지 못했다.
- 서버 세션 cursor `ee1908ff-1dea-40ac-9b4c-f4b8c4714b92:7`의 완료 보고: 109 API0.1.31, DB0064 적용, 준비 상태200, 일반 설정 API404→401 인증 요구, 실행 파일/DB 백업 완료. 기존 환경 변수·통합 모드·메일 데이터 유지. 이는 서버 세션 보고이며 프런트엔드의 인증된 GET/SSR 또는 실제 설정 저장 검증으로 확대하지 않는다.
- 서버 세션의 운영 PATCH 검증은 자동 승인 검사에서 차단되어 실행하지 않았다. 실제 계정 설정 저장/영속성 검증에는 별도 승인이 필요하다. 아래 이전 배포 대기 기록은 이력이다.
- 사용자 `서버 종료해` 요청으로 로컬 실행기145304를 명령행 재확인 후 해당 SSH/Next 자식 트리만 종료했다. 7540/16711 리스너 없음 확인. 109 운영 서버는 변경하지 않았다. 사용자 요청을 뒤집어 로컬 서버를 자동 재시작하지 않는다.
- 후속 검증은 사용자 재시작 요청 후 안전한 연결을 실행하고 인증된 설정 조회부터 재개한다. 전체 연동/운영 저장 완료로 판정하지 않는다.

### 로컬 안전 연결 복구 — 2026-10-10

- 사용자 `안전한 연결 방식으로 복구해` 요청에 따라 현재 7540 리스너의 Next worker140264 및 부모60892가 이 프로젝트의 `next dev --port 7540`임을 확인했다. SSH host-key 검증/BatchMode를 유지한 109의 loopback6711 health는 정상이다.
- 확인된 로컬 Next 부모60892의 자식 트리만 종료했다. 운영 서비스, DB, 브릿지 모드, 환경 파일, 실제 계정 설정은 변경하지 않았다. 기존 `scripts/dev-secure.mjs`를 숨김 백그라운드 프로세스145304로 시작해 loopback16711 SSH 터널과 loopback7540 웹메일을 함께 실행했다.
- 시작 로그의 verified tunnel/Next ready를 확인했고, 실제 리스너16711(SSH192980)/7540(Next108688)를 확인했다. 웹메일 `/api/mail/health`는 기존503 configuration_error에서 HTTP200 `{status:ok}`로 복구됐다. 인증 로그인/메일 조회 및 브라우저 UI 검수는 이번 복구의 검증 범위 밖이다.
- 재시작할 때는 `npm run dev:secure`를 사용한다. 일반 `npm run dev`는 기존 원격 HTTP 환경 파일을 다시 읽어 설정 오류가 재발할 수 있다. 새 코드 입력이 없어 앱 빌드/기존 합성 검사를 반복하지 않았다.

### 운영 반영 승인 후 확인 — 진행 중

- 최신 서버 세션은 조회를 종료했다(cursor `ee1908ff-1dea-40ac-9b4c-f4b8c4714b92:6`, idle). 109 버전0.1.30/스키마63/API404, 102의0.1.31 Linux 실행 파일 존재를 보고했지만 운영은 변경하지 않았다. 해당 세션은 전달된 승인을 직접 승인으로 취급하지 않고, 사용자에게 그 채팅에서 `109 일반 설정 API 배포와 0064 적용 승인`을 요청했다. 운영 반영은 이 직접 승인 경계에서 미완료다.
- 로컬 웹메일의 무인증 `/api/mail/health`를 읽기 전용으로 조회해 HTTP503 `configuration_error`를 확인했다. `.env.development.local`의 API 주소는 원격 HTTP이며 현재 URL 검사는 원격 평문 인증을 거부한다. 상태 API는 이 경우 upstream 요청 전 종료하므로 해당 응답 자체는 운영 서버 장애나 migration 실패를 의미하지 않는다. `dev`와 `dev:secure`의 실행 환경 차이는 확인했으나 실제 프로세스 시작 이력의 간헐 원인은 미확정이다. 환경 파일/실행 프로세스는 변경하지 않았다.
- 사용자가 운영 API 배포와 마이그레이션 `0064` 적용을 승인했다. 앞서 직접 배포했다는 보고도 있어, 서버 세션에 현재 배포/마이그레이션 이력을 먼저 확인하고 미적용 단계만 진행하도록 요청했다. 중복 배포·재적용 및 기존 서버/브릿지 모드 변경은 하지 않는다.
- 서버 세션의 첫 응답은 다른 출시 테스트 실패 안내였으므로 일반 설정 API 운영 상태와 구분해 다시 요청했다. 후속 세션은 현재 109 서버의 API 경로와 스키마 적용 여부 조회를 시작했다고 보고했다. 아직 운영 반영 완료 증거는 아니다.
- 후속 cursor `ee1908ff-1dea-40ac-9b4c-f4b8c4714b92:4`에서 서버 세션은 109 정상 가동, 버전 `0.1.30`, DB 스키마 `63`, 일반 설정 API `404`를 보고했다. 세션은 계속 실행 중이며 새 Linux 실행 파일 확인 단계다. 이 보고는 서버 세션의 운영 조회 결과이며 웹메일 인증 조회/배포 성공의 증거가 아니다.
- 브라우저 도구는 `failed to write kernel assets` 오류로 초기화하지 못했다. 런타임 초기화 재시도도 같은 오류여서 실제 인증 설정 화면 검증은 수행하지 못했다. 사용자 탭과 실제 계정 설정은 변경하지 않았다.
- 앱 코드 변경이 없어 기존 빌드/검사를 반복하지 않는다. 다음 단계는 서버 세션의 실제 확인 결과 수신과 브라우저 도구 복구 후 읽기 전용 설정 조회다.

### 일반 설정 정상 응답의 실제 브라우저 검수 — 최신 결과

- `--browser-fixture`는 별도 loopback 합성 로그인/메모리 설정 API를 제공한다. 기존 production build32637을 그대로 사용하며 실제 서버, 실제 계정/메일, PostgreSQL은 접근하지 않는다.
- 컴퓨터 사용 스킬의 전용 브라우저 도구로 새 임시 탭에서 synthetic-a 계정 로그인 후 접근성 화면을 검수했다. 초기125%/모션 줄이기 켜짐, 110% 선택 후 '저장하지 않은 변경 사항', 저장 후 성공/저장됨, 새로고침 후110% 유지와 실제 CSS scale1.1을 확인했다.
- ko/en/de/es/fr/it/pt/ja/zh/zh-hant의 접근성 화면에서 lang 일치,110% 선택/scale1.1 유지, 가로 overflow 없음, tab console warn/error0을 확인했다. 실제 viewport는 모두1280×720이다. 모바일 QA 통과로 해석하지 않는다.
- 초기 fixture는 홈 메일/다른 설정 계약 전체를 제공하지 않아 '서버 응답을 처리할 수 없습니다' 알림이 있었다. 이것은 실제 서버 오류로 판정하지 않았다. 설정 저장/재조회는 성공했고 screenshot을 찍기 전에 fixture 알림을 닫았다. 전체 메일 UI 무오류 검증이 아니다.
- 스크린샷 `general-settings-synthetic-browser-20261010.png`, SHA256 `B261BD064B2B623E03B42A6067B440979F0DD609D0C52AF71CD9E69795928313`. 현재 test SHA256 `C1258C4C08E2E3BA006FB8401F92FCF3B2C40215B0596A8579A13F2BC25826C4`. test ESLint 통과. 앱 source가 변경되지 않아 재빌드하지 않았다.
- 임시 탭9를 닫았다. 이후 terminal handle66455가 존재하지 않았고 Get-NetTCPConnection의56954 listening 조회도 결과가 없어 테스트 Next 서버 종료를 확인했다. 기존 사용자 탭/운영 프로세스를 종료하지 않았다.
- 운영 일반 설정 API/migration 적용, 실제 DB 영속성, 실제 계정 서버 저장과 모바일 QA는 여전히 미완료다. 이 합성 브라우저 결과로 전체 연동 완료를 주장하지 않는다.

### 일반 설정 정상 응답의 production SSR/HTTP — 최신 합성 검증

- `node scripts/test-page-session-ssr.mjs --general-settings` 통과. 기존 production 빌드를 실제 별도 Next 프로세스로 구동하고, 전용 loopback API의 서로 다른 두 합성 계정만 사용했다. 운영 API, 실제 계정 및 DB에 요청하지 않았다.
- 정상 snapshot을 공급한 10개 locale에서 account별 fontScale/reduceMotion이 최초 html style/data 속성에 반영된다. 세션 조회 1회, 계정/emoji 분리, API 독립 인증 검증도 정상 설정 응답 환경에서 통과했다.
- 실제 BFF HTTP GET/PATCH를 검증했다. account A revision3→4, fontScale125→110 저장 응답과 새 SSR의1.1 배율, account B90 유지. 오래된 revision은409 conflict이며 upstream PATCH 횟수 증가 없음, accountId 입력은400, 다른 Origin은403이고 쓰기 없음. GET 응답은private/no-store, 비인증401이다.
- upstream401/403/429/503/404는 각각unauthorized/forbidden/rateLimited/retryable/not_deployed로 분리된다. 합성 fixture의 메모리 저장을 확인한 것이므로 실제 PostgreSQL 영속성/동시 트랜잭션/운영 배포 성공을 의미하지 않는다. 실제 browser hydration와 device QA도 이 HTTP 검사 범위 밖이다.
- 변경은 test/doc뿐이다. 기존build32637을 재사용했고 재컴파일하지 않았다. 실제 읽힌 BUILD_ID SHA256 `E95A2B07AED481F40E20B28F11CB5E06CBA1087F90884F384ED8470181ABE698`, test SHA256 `F535020EA2540DDFA856B86F18C1F4C82E72EAF7FCEE60C9F3D245A9266D249C`. 수정된 test ESLint 통과.

### SSR 아이콘 초기화의 인증 공유 — 최신 후속 검증

- `icon-preferences-initial.ts`는 SSR 전용으로 pageSessionForToken과 아이콘 설정 조회를 같은 토큰으로 수행한다. root layout이 이 로더를 사용하며, API의 loadLiveIconAccount는 기존 독립 인증을 유지한다. 사용자 입력 세션을 받는 우회 매개변수나 영속 인증 캐시는 만들지 않았다.
- 공통 account projection은 기존 session/username 길이/control character 검사를 그대로 적용한다. 초기 로더, icon server/client, icon BFF 합성 검증과 변경 범위 ESLint 통과. 초기 로더 테스트의 API wiring 문자열 검사는 실제 session.token 호출과 맞게 정정했다.
- root runtime 변경 때문에 이전 build92671은 무효화했다. 새 Webpack build32637 exit0: 컴파일, TypeScript, 393개 페이지 생성 통과. 이후 fixture/test만 변경하여 빌드를 반복하지 않았다.
- 실제 production SSR loopback 검증 통과: 10개 locale, A/B/A 계정 요청, 각 SSR JMAP 세션 조회 **1회**, 계정별 프로필 emoji 최초 HTML 렌더링, 다른 계정 주소/emoji 미포함, 비인증 redirect. 아래 단계의 2회 측정은 변경 전 기록이다.
- 아이콘 BFF GET도 두 합성 계정에서 검증했다. 각각 새 JMAP 인증 조회 1회, 해당 계정 아이콘 반환, private/no-store 응답이다. SSR 캐시가 API 인증을 대체하지 않는다는 HTTP 증거를 추가했다.
- 최초 emoji 검사는 합성 fixture가 mailbox summary를 404로 반환하여 실패했다. summary를 정상 빈 목록으로 보완한 뒤 동일 빌드에서 해당 검증을 재개했다. 본 검사는 합성 데이터의 서버 HTML/HTTP 검증이며, 실제 브라우저 hydration/모바일 QA나 운영 저장·DB 변경 증거는 아니다.

### SSR 세션 조회 공유 — 2026-10-10 후속 검증

- `pageSessionForToken`은 React 요청 범위 cache를 사용한다. 설정 초기화와 workspace 인증 guard가 같은 토큰의 응답을 공유한다. 요청 간 영속 캐시나 API 인증 생략은 추가하지 않았다.
- 초기 설정 로더 테스트와 세션 하네스 통과: 토큰별 분리, 요청 범위 재조회, HTTP/network/잘못된 응답 처리, 비인증 redirect. 하네스는 실제 React cache의 증거가 아니므로 production SSR 합성 검증을 별도로 실행했다.
- Webpack build92671 exit0: 컴파일, TypeScript, 393개 페이지 생성 통과. 최초 sandbox 빌드는 출력 디렉터리 EPERM으로 실패하여 같은 빌드 단계만 권한 조정 후 재실행했다.
- loopback 합성 API와 별도 production Next 프로세스에서 A/B/A 계정 요청을 검증했다. 각 SSR의 실제 JMAP 조회는 2회다. 설정 초기화/workspace guard의 공유 조회 1회와 기존 아이콘의 독립 인증 조회 1회이며, 최초 기대값 1회는 이 독립 조회를 누락했으므로 소스 확인 후 정정했다. 다른 계정 주소가 HTML에 포함되지 않고 후속 요청은 새로 조회한다. 비인증 요청은 login으로 redirect한다.
- 합성 SSR 검증은 설정 API 미배포 응답을 사용했다. 실제 설정 저장, 운영 API/migration 배포, 메일/DB 변경은 검증하거나 실행하지 않았다. 테스트 프로세스만 종료했다.

### 초기 계정 조회 실패 복구 — 최신 후속 수정

- 배포 승인은 아직 없어 서버 세션에 운영 API/migration64 적용 요청을 새로 보내지 않았다. 앞선 턴은 Provider/SSR 구현과 미지원 API 화면 확인이라는 진척이 있었다. 이번에는 남아 있는 프런트엔드 복구 경로를 조사했다.
- 초기 JMAP 조회가 실패해 accountId가 없으면 GeneralSettingsState.reload()가 false만 반환하므로 기존 재시도 버튼이 무동작했다. Provider는 accountAvailable을 노출하고, 상태 컴포넌트는 이 경우 Next router.refresh()로 서버 초기화를 다시 실행한다. 계정이 알려진 경우에는 기존 BFF GET만 사용한다. 불확실한 저장은 GET으로만 복구한다.
- route refresh는 transition 진행 표시/버튼 잠금을 사용한다. 기존 draft가 있는 정상 계정에 router refresh를 실행하지 않아 서버 props로 draft를 덮어쓰지 않는다.
- recovery UI 합성 검사 및 수정된 Provider의 실제 React SSR/콜백 검사 통과. 계정 유무별 분기, 불확실성 GET-only, busy/transition 중 중복 동작 차단 검증. 변경 4개 파일 ESLint 및 범위 diff 검사 통과. locale catalog는 변경하지 않았으므로 앞선 성공 검사를 반복하지 않았다.
- SHA256: Provider `B58BA0EE459AD391508A2AC374C3B2B153718121BFC53FE6B149FFD811DE1EAA`, status `4AAC9081018F5F096EDFD0ABBF3870ACE5F72BDFF9EABECE7DB74D21BA9BAAFB`, provider test `6A56FAA9D9FBA53FE046FC82EAA76B7C30C6E4F25FDAD2160D521E4E9EE0ED0D`, recovery UI test `105216B8DB6AB36A467D3E08AF54A767B2088FC9A1B17B819883168B65FC6588`.
- 코드 입력 변경으로 앞선 build46423은 무효화되어 Webpack 프로덕션 build9106으로 검증한다. 컴파일·TypeScript·393개 페이지 생성 통과; terminal 확인은 후속 기록한다. 실제 세션 실패 주입/성공 API 저장·hydration 검증은 수행하지 않았다.
- 후속 확인: build9106 exit0, 변경 후 프로덕션 빌드 전체 통과. 마지막 기록 추가는 문서 변경뿐이므로 성공한 빌드를 반복하지 않는다.

### Provider·SSR 화면 연결 — 최신 단계

- root layout은 server-only initial loader로 JMAP 인증 계정과 일반 설정 snapshot을 읽고, 계정 key/주소/snapshot/error를 SettingsProvider에 전달한다. 접근성 scale/data 속성도 최초 HTML에 포함한다. Provider의 localStorage 읽기/쓰기를 제거했다. 기존 로컬 데이터를 삭제하거나 자동 이전하지 않는다.
- Provider는 GeneralSettingsState의 confirmed snapshot과 draft를 구분하며 useSyncExternalStore로 초기값을 동기 전달한다. 계정 key가 바뀌면 새 controller, 같은 계정 재렌더링은 draft 보존. StrictMode setup-cleanup-setup은 controller를 폐기하지 않고 실제 unmount 후 늦은 쓰기는 막는다.
- 일반 설정 GET 실패 시 6개 설정 편집 화면을 표시하지 않고 명시적 상태/재조회 버튼을 표시한다. 저장 바는 receipt 확인 후에만 성공 toast; 저장/불확실 상태에서는 재저장·폐기를 막는다. 언어 이동과 이미지 정책 버튼은 저장 결과를 기다린다. 이미지 정책의 즉시 저장은 unrelated draft가 있으면 실행하지 않는다. 이미지 설정 조회 실패에도 CSP로 외부 이미지를 막은 본문은 읽을 수 있다.
- 실제 React renderToStaticMarkup 합성 검사, Provider callback/StrictMode harness, 초기 loader 실패/계정 검사, 이미지 발신자 저장 검사, 메일 iframe 정책4개 통과. 검사 harness는 실제 브라우저 hydration/HTTP 응답 유실 주입 증거가 아니다. 10개 언어 오류 안내 추가 및 check:locales 통과. 범위 ESLint의 lifecycle ref 경고를 수정했고 해당 Provider 검사·ESLint 재실행 통과. 변경 파일 범위 diff 검사 통과; 넓은 settings 디렉터리 검사에서 기존 SettingsLanding.tsx의 unrelated 공백을 발견했지만 수정하지 않았다.
- 임시 브라우저 탭에서 /ko/settings/locale을 열어 현재 서버의 일반 설정 API 미지원 안내 및 저장/편집 차단을 확인했다. 실제 계정 설정을 변경하지 않았다. 임시 탭은 닫고 기존 사용자 탭은 유지했다. 성공 snapshot의 실제 운영 SSR/hydration·저장은 미검증이다.
- Webpack 프로덕션 build session46423에서 컴파일·TypeScript·393개 페이지 생성 통과; terminal 상태는 후속 확인한다. 이전 성공 빌드는 runtime Provider/root/UI 입력 변경으로 재사용하지 않는다. 운영 DB/migration64/API 배포·재시작은 수행하지 않았다.
- 후속 확인: session46423 exit0, 프로덕션 빌드 전체 통과. check:locale-usages도 1264개 literal 호출/10개 catalog 통과. 이 마지막 추가는 문서 변경뿐이라 성공한 앱 빌드를 다시 실행하지 않는다.

### 최종 서버 제한 일치 — 후속 검증

- `lib/general-settings.ts`의 normalized settings 상한을 31744bytes로, PATCH body 상한을32768bytes로 구분했다. GET snapshot은 최대 safe revision을 읽을 수 있지만 PATCH expectedRevision은9007199254740990까지만 허용한다. timezone 길이도 문자 수가 아니라 UTF-8 bytes로 검사한다.
- 계약 검사는 settings31744/31745bytes, PATCH32768/32769bytes, GET/PATCH terminal revision 차이를 합성 데이터로 검증했다. 최초 fixture는 comma separator 계산이2bytes 부족해 실패했고, fixture만 수정한 뒤 계약 검사 통과. 저장 상태·서비스 검사도 변경된 공통 validator로 각각 한 번 통과했다. 두 변경 파일 ESLint 및 범위 diff 검사 통과.
- 이전 성공 build는 공통 validator 입력 변경으로 무효다. build session28996은 생성 타입 디렉터리 EPERM으로 exit1; 실패한 build 단계만 권한 확보 후 session37339에서 재개했다. 컴파일·TypeScript 통과, 전체 종료는 후속 확인 필요.
- 후속 확인: session37339 exit0. 변경된 validator를 포함한 Webpack 프로덕션 빌드 전체 통과. 마지막 체크포인트 추가는 문서 변경뿐이므로 애플리케이션 빌드를 다시 실행하지 않는다. JavaScript 프로젝트에 별도 Debug/Release 테스트 구성이 없어 합성 Node 검사와 프로덕션 빌드를 구분해 기록한다.
- 변경 파일 SHA256: contract `E2D73607BBC885C723FEE4959F4B34AF0260DF54954D1075C74285AABE8BB694`, test `9DDA89BFDAF5985CDA915CEEE3634F1EEBE07DB5C83A7B4E6C7C0D772E7A68C1`.
- runtime SettingsProvider와 root/workspace layout을 다시 확인했다. Provider는 여전히 localStorage 저장이므로 서버 설정 저장·SSR 완료로 간주하지 않는다. 다음 연결 때 root의 접근성 HTML 초기값과 계정별 Provider 초기 snapshot을 함께 적용하고, 저장 바·언어 이동·이미지 정책 액션은 서버 receipt를 기다리도록 변경한다. 운영 DB/배포/실제 계정 설정 변경은 하지 않았다.

### 저장 상태 관리 및 확정 계약 확인

- `lib/general-settings-state.ts`에 계정별 초기 snapshot, partial diff 저장, 중복 저장 잠금, 요청 이후 leaf 편집 보존, 정규화 값/revision receipt 검사, GET 전용 불확실성 복구, dispose 후 늦은 응답 무시를 구현했다. 초기 snapshot 없는 경우 저장하지 않고, 조회 실패를 정상 기본값으로 채택하지 않는다.
- `scripts/test-general-settings-state.mjs` 및 두 파일 ESLint/diff 검사 통과. 저장 후 새 편집 보존, 다른 계정 receipt 거절, 유효한 모양/revision이지만 실제 요청 값 미적용된 응답 거절, 동일 revision의 내용 변경 거절, GET 복구 실패 시 잠금 유지 검증.
- 이 상태 관리는 아직 SettingsProvider/화면에 연결하지 않았다. 기존 localStorage 저장은 다음 단계에서 서버 저장으로 대체해야 한다.
- 상태 모듈 SHA256 `BED9C53D75A8E3A65B47D4B47A61C2A71124D7D5310C78750368AAF3AB674AA1`, 검사 SHA256 `3A3714DF7AE327DF80A8DB33E5F12B933E8E167A230178ABC673FAE516B826A9`.
- 상태 모듈 추가 후 Webpack 빌드는 session `11394`에서 진행 중. 컴파일·TypeScript·393개 페이지 생성 통과, 마지막 확인에서는 build trace 단계. 이전 `66405`는 변경 전 통과 기록이다.
- 후속 terminal 확인: `11394` exit code 0, 변경 후 Webpack 프로덕션 빌드 전체 통과. 위 진행 중 기록은 이력이다.
- 서버 세션은 완료/idle로 확인했다. 확정 계약 `D:/works/projects/GXSOFT/TASTEDEV/resources/guides/dev-01/tastemail-general-settings-20261010/API.md`와 검증 보고서 `resources/verification/dev-01/tastemail-general-settings-20261010/RESULT.md`를 실제로 읽었다. 새 설치/업그레이드 migration64는 운영에 적용되지 않았다. HTTP 응답 유실 주입/브라우저/SSR 검증은 서버 검증 범위가 아니다.
- 최종 서버 계약의 정상화된 compact settings JSON 상한은 31744bytes이고 PATCH body 상한은32768bytes다. 프런트엔드 validator의 상한을 다음 연결 단계에서 최종 계약과 맞춘다. 운영 DB/배포/재시작은 기존 승인 범위에 포함하지 않는다.

### 후속 어댑터 연결

- `lib/tastemail/general-settings.ts` 및 `general-settings-route.ts`, `/api/mail/general-settings` GET/PATCH를 추가했다. 동일 출처 PATCH·HttpOnly 세션 토큰·private/no-store를 사용하며 서버 주소/토큰은 응답에 포함하지 않는다.
- PATCH 전 인증 계정 snapshot/revision을 확인한다. 충돌 시 PATCH를 보내지 않고, 성공 receipt는 같은 계정 및 정확히 expectedRevision+1인지 확인한다. 409 resultUnknown, 네트워크·5xx·잘못된 저장 receipt는 mutation_uncertain으로 구분하며 자동 재저장하지 않는다.
- `scripts/test-general-settings-service.mjs` 합성 검사와 새 4개 파일 ESLint, 범위 diff 검사 통과. 실제 서버 설정 읽기·변경은 수행하지 않았다. Provider/SSR/저장 UI는 다음 구현 대상이다.
- 기존 session `64063` 빌드는 종료 코드 1: Turbopack CSS 처리용 node 자식 프로세스 연결 실패. 일반 권한 재개에서도 같은 오류가 재현됐다. 성공 빌드로 기록하지 않는다.
- 공식 Webpack 대안 빌드 `GXWEBMAIL_BUILD_DIR=.next-general-settings-webpack npm run build -- --webpack`를 session `66405`에서 실행 중이다. 다음 턴에서는 이 handle부터 확인한다. 개발 서버의 출력 디렉터리/프로세스는 변경하지 않았다.
- Webpack 컴파일 42초·TypeScript 21.3초·393개 페이지 생성은 통과했다. 최종 build trace 단계가 아직 실행 중이므로 빌드 전체 성공은 terminal exit code 확인 후 기록한다. Next.js가 tsconfig.json include에 이 검증 디렉터리의 types/dev types 두 항목을 자동 추가했다.
- 후속 terminal 확인: session `66405` exit code 0. Webpack 프로덕션 빌드 전체 통과, 생성 경로에 `/api/mail/general-settings` 포함. Turbopack 빌드 실패를 해소한 것으로 간주하지 않는다. 위 실행 중 기록은 진행 이력이다.
- 새 파일 SHA256: adapter `033080BD6A76D9D9B03CE2CBB074A5CE47EE0AF7B80A7B9DF2605EB2A6C9FAF5`, route helper `61D8232B727422B5C9A20A03303D38546334125A06844A26814F1F810BEEB542`, route `E5570E1C5E96EF3DAD212023B7C0CDEC0BA84FB0460C2F4C87E75C69D3C34DB6`, service test `CD9F494E67EB19DD1D0B098F67F87377DD94D40DA8789880731B85B4B3837BD6`.
- 서버 세션 최신 cursor는 `069fc9eb-8ebf-4eaf-ade9-cfae05705487:20`. 격리 DB Debug에서 계정 분리·동시 저장 충돌·SQL 롤백·GET 확인·폐기 계정 거부 통과를 보고했으며 계약 문서를 정리 중이다. 아직 운영 배포 증거는 아니다.

- 아래는 초기 계약 단계의 이력이다. 최신 빌드 handle과 서버 cursor는 위 후속 기록을 사용한다.
- 검사 입력 SHA256: `lib/general-settings.ts` = `1820E31604D7344791EBDC27B99F08C15E6CB925985F6E6762AC425BC101A478`, `scripts/test-general-settings-contract.mjs` = `D87D9D2A70F2AAE3D669D173E6B628BD8AA0E85F5A7D02BF9D7EB63ECDC1C048`.
- 서버 세션 `01a05970-0b3b-7660-9d27-35e25476f5e8` / local은 작업 중. 최신 wait cursor `069fc9eb-8ebf-4eaf-ade9-cfae05705487:17`; 서버 세션은 Debug 157개 통과를 보고했고 격리 DB·정적 검사를 진행 중이다. 이 보고를 운영 DB·배포 증거로 사용하지 않는다.
- 다음 구현: 확정 서버 계약 재확인 → 서버 전용 어댑터/BFF → authenticated account별 SSR snapshot → provider의 서버 receipt 기반 저장과 GET 복구 → 저장 UI/이미지 정책 액션/언어 전환 비동기 처리 → 합성 SSR·저장 실패·계정 전환 검사.
- 운영 DB·배포·재시작·실제 계정 설정 변경·커밋/푸시는 수행하지 않았다. 기존 브라우저 설정 자동 이전/삭제도 하지 않는다.
