# 오프라인 프런트 회귀 — 2026-10-13

## 현재 빌드의 설정 화면 브라우저 검수

컴퓨터 사용 스킬과 CUA로 자기 합성 fixture의 `settings/locale` 화면을 확인했다. 사용자127.0.0.1 로그인과 쿠키를 섞지 않도록 로그인·브라우저 검수는 별도 `localhost` 출처에서 수행했다. 합성 계정A로 로그인 후 10언어 각각 desktop1280×900/mobile390×844에서 제목 번역·프로필 emoji·fontScale1.25가 유지됐고 문서 scrollWidth와 clientWidth가 각각1280/390으로 같았다. warn/error 로그0, hydration 오류 없음. 계정B/A 왕복 및 최초 HTML·실제 합성 저장 왕복은 앞의 HTTP 검수와 구분한다.

기존 fixture의 고정 JMAP response tag/빈 mailbox가 새 client 요청에 맞지 않아 빈 받은편지함과 요청 tag/accountId에 맞는 응답으로 보완했다. 합성 API의 다른 미지원 조회로 나타나는 오류 안내는 여전히 시험 한계이며 운영 결함으로 판정하지 않는다. 캡처 전 안내를 닫았고 검수 완료 후 합성 계정 로그아웃→로그인 화면을 확인했다. [모바일](settings-hydration-mobile-20261013.jpg), [데스크톱](settings-hydration-desktop-20261013.jpg). 전체 제품·실메일·모든 설정 화면 검수가 아니다.

viewport override를 reset하고 자기 탭만 닫았다. PTY fixture는 종료 입력 후 Next child가 사라졌지만 helper node가 남아 자동 종료 성공으로 기록하지 않았다. 신원을 재확인한 자기 helper1개만 중지했으며 해당 fixture/Next 프로세스 없음까지 확인했다. 사용자 서버·탭·계정은 변경하지 않았다. 보완된 fixture의 별도 non-PTY production HTTP/일반 설정 검사와 ESLint는 exit0으로 통과했다. fixture/문서/이미지 변경만 있어 앱 재컴파일은 반복하지 않았다.

## 현재 빌드의 별도 production HTTP 검증

아래 오프라인 실행에서 제외한 HTTP fixture2개도 후속 검증했다. 당시 hard-coded 과거 buildDir 대신 명시한 `.next-*` 격리 빌드를 사용하고 BUILD_ID 존재·경로를 검증하도록 시험을 갱신했다. Next와 합성 API는 임시 포트/127.0.0.1에만 bind한다. 현재 BUILD_ID `oGdNRb0Hj_TnKPlnX9UpN`에서 다음 두 명령이 exit0으로 통과했다.

- `node scripts/test-login-notice-production.mjs`: 10언어 최초 HTML의 세션 만료 안내, 일반 익명 로그인과의 구별, 합성 invalid-cookie401 안내.
- `node scripts/test-page-session-ssr.mjs --general-settings`: 10언어 실제 SSR 요청에서 공유된 인증 조회1회, 계정 A/B/A 격리, 프로필 emoji 최초 HTML, 계정별 글자 크기·motion 최초 HTML, 독립 BFF 인증. 합성 PATCH1회 후 새로운 SSR 요청에서 글자 크기 유지·다른 계정 불변, stale revision/CSRF/임의 accountId 거부, 401/403/429/503/404 오류 구별 및 익명 redirect.

첫 격리 실행은 Next Ready 이후에도 fixture 요청에 연결하지 못해 readiness 단계에서 실패했다. 기존 서버를 변경하지 않고 fixture 자체를 제한 밖에서 재개해 통과했으며 앱을 재컴파일하지 않았다. 완료 후 finally에서 자기 Next child의 exit와 합성 API close를 기다리고 전체 스크립트 exit0을 확인했다. 두 시험 ESLint도 통과했다. 실제 운영 세션·DB·외부 계정·메일에 접근하지 않았다.

Next.js 스킬의 서버·클라이언트 경계 및 기존 production 빌드 검증 절차를 적용했다. HTML 응답 검증은 브라우저 hydration·페인트·모바일 동작 검수와 별개다. 아래 fixture 제외 문구는 오프라인189개 실행 범위만 설명한다.

## 범위와 안전 경계

`scripts/test-*.mjs` 212개 중 이미 검증한 연결 계정20개와 아래 별도 게이트3개를 제외한189개 파일을 검사했다. `offline-test-guard.mjs` preload로 기본 fetch 및 HTTP/HTTPS/net/TLS 연결 API를 차단하고 시험이 주입한 합성 transport만 사용한다. native I/O 함수5개가 실제 dispatch 전에 예외를 내는 것도 확인했다. 실제 서버·메일·DB·운영 설정·브라우저 세션은 변경하지 않았다.

별도 게이트:

- `test-login-notice-production.mjs`, `test-page-session-ssr.mjs`: 고립된 HTTP/Next 프로세스를 필요로 하므로 이번 native I/O 차단 실행에서 제외. 이전 관측은 당시 빌드에 한정하며 현재 입력의 HTTP 수용으로 확대하지 않는다.
- `test-tastemail-server.mjs`: 이전 성공한 고정 전송 경계 시험은 입력 불변 범위에서 재사용. 이번189개 실행 결과에 포함하지 않는다.
- 연결 계정20개 파일: 직전 별도 개발/production 회귀 결과를 재사용한다. [검사와 재개 기록](linked-job-control-server-request-20261013.md).

## 결과 및 재개

개발 환경 첫 실행:437개 검사 중431개 통과·6개 실패, skip0. 실패는 관리자 초기 조회에 추가된 도메인 인자를 반영하지 않은 source assertion, Dropdown 공통 Tooltip/Context mock 누락, 개인 편지함 표시 필터 mock 누락2개, 서버 전송 모듈의 새 순수 import loader 누락, 사이드바 BrandMark/hiddenSystemMailboxes mock 누락이었다. 애플리케이션 기능을 바꾸거나 assertion을 없애지 않고 현재 의존성과 정확한 source 계약으로 시험만 갱신했다. 실패 항목만 재개해6개 모두 통과했고 성공431개는 다시 실행하지 않았다.

production 환경 실행: 동일189개 파일·437개 검사·437개 통과·실패0·skip0·exit0. React production 환경을 별도로 검사했으며 개발 결과만으로 대체하지 않았다. 실행은 `NODE_ENV=production node --import ./scripts/offline-test-guard.mjs --test --test-concurrency=2 <선택된189개 파일>`이다.

변경된 시험6개와 preload의 ESLint exit0, diff 공백 검사 exit0. 시험/문서 수정만 했으므로 직전 소유자 UUID 경계 수정의 성공한 production 앱 빌드를 반복하지 않았다. 패키지 type 관련 Node 경고는 남아 있으며 경고를 지우려고 제품 module 계약을 변경하지 않았다.

이 기록은 합성 로컬 회귀 범위다. 실제 외부 공급자 인증·worker·공용 편지함 권한·운영 관리자 변경·현재 빌드의 전체 HTTP/브라우저/모바일 수용 및 운영 배포 완료를 입증하지 않는다. 사용자가 직접 진행하기로 한 서버 배포·migration0068 적용 결과 확인은 별도로 남아 있다.
