# TASTEMAIL 원격 설치·업데이트 관리 API 구현 요청

상태: 2026-10-12 사용자 승인 후 `tastedev-mail` 채팅에 구현 요청을 전송했다. 서버 계약·구현 결과 대기 중이며 배포·운영 설정 변경은 승인 범위에 포함하지 않는다.

2026-10-13 확인: 서버 소스 `remote_management.rs`에 GET `/api/admin/management`, POST `/api/admin/management/operations`, GET `/api/admin/management/operations/{id}`가 추가되었다. 실제 DTO와 인증·private no-store 경계를 대조했다. 서버 채팅의 가장 최근 최종 응답은 다른 테스트 수 설명이므로 원격 관리 완료 보고로 간주하지 않는다. 다만 비운영 결과 파일 `BuildCorrelation.json`, `HttpReleaseCorrelation.json`, `HttpReleaseFinal.json`, `WorkerPersistenceFinal.json`, `ClippyFinal.json`의 exitCode 0을 확인했다. 운영 배포·설정·worker 활성화는 확인하지 않았다.

2026-10-13 프런트엔드 연동: 상태 GET·SSR에 이어 작업 POST와 작업 ID별 GET BFF, 개정/UUID/확인 검증, 공통 확인 창, 네트워크·노드 역할·업데이트 check/install/rollback/policy 폼과 진행 상태 조회를 구현했다. 접수를 완료로 표시하지 않으며 불확실한 쓰기는 자동 재전송하지 않는다. 합성 루프백의 컴파일된 BFF와 브라우저 검수는 통과했다. 운영 worker 설정·활성화 및 실제 적용 검증은 별도이며 수행하지 않았다.

## 목적과 확인된 경계

GXWebMail은 TASTEMAIL 관리자 기능을 이식하지만 서버와 다른 호스트에서 실행될 수 있다. 서버 webmail의 파일 기반 관리 코드를 프런트엔드 호스트에 복사해서 원격 관리가 구현됐다고 간주하지 않는다.

현재 확인한 원본:

- `apps/webmail/src/lib/local-service-ports.ts`: 서비스 포트/리스닝 호스트 조회 및 `TASTEMAIL_NETWORK_REQUEST`에 배타적 변경 요청 발행.
- `apps/webmail/src/lib/local-node-role.ts`: integrated/bridge 역할, worker 상태, primary API 조회 및 같은 서버 요청 파일에 역할 변경 발행.
- `apps/webmail/src/lib/automatic-updates.ts`: `TASTEMAIL_UPDATE_STATUS`의 상태·정책·이력 조회, `TASTEMAIL_UPDATE_REQUEST`의 단일 요청 파일로 check/install/rollback/policy 발행.
- `apps/webmail/src/app/admin/setup/page.tsx`: 위 로컬 설정과 기존 도메인·DKIM·사용자·운영 조회 계약을 함께 사용하는 실제 설치 화면.
- Rust API 라우터와 관리 모듈에서 위 로컬 작업의 원격 HTTP 계약은 확인되지 않았다. 이 문서는 존재하는 API 경로를 주장하지 않는다.

프런트엔드의 `/admin/onboarding`은 현재 도메인 페이지로, `/admin/system`은 브랜드 설정으로 이동한다. 이 redirect는 원본 설치·업데이트 기능의 동등 구현이 아니다.

## 서버에 요청할 기능

### 1. 설치/네트워크 설정 조회·변경 예약

실제 서버의 webmailPort/webmailListenHost/apiPort/apiListenHost, managed 여부, 변경 작업 상태를 인증된 관리자에게 반환한다. 변경은 서버의 기존 배타적 요청 발행/worker 계약으로 예약한다.

원본 불변 조건을 유지한다:

- 포트는 정수 1024~65535이고 서로 달라야 한다.
- 리스닝 호스트는 원본의 명시적인 허용 값만 수용한다.
- bridge 노드에서 지원하지 않는 로컬 서비스 포트 변경을 허용하지 않는다.
- API 리스너 변경은 현재 연결을 끊을 수 있다. 예약 접수와 적용 성공을 구분하고, 적용 확인·실패·복구를 조회할 수 있어야 한다.
- 공개 리스너로의 변경은 접근 범위 확대이므로 명시적인 위험 확인과 적절한 관리 권한 검증을 요구한다.

### 2. 노드 역할 조회·변경 예약

integrated/bridge, workerEnabled, 안전한 primaryApi 표시, managed 여부와 작업 상태를 조회한다. 서버가 실제 shared database 전제와 배치 조건을 검증한 뒤 역할 변경을 예약한다.

- bridge는 worker 활성화와 안전한 primary API가 필요하다.
- integrated는 primaryApi가 비어 있어야 한다.
- primary API는 사용자명/비밀번호/query/hash/임의 경로를 포함하지 않는다.
- 원본의 HTTPS 또는 명시적 loopback HTTP 조건을 유지한다. 원격 HTTP로 자격 증명을 전송하지 않는다.
- URL의 문법 검증만으로 SSRF가 예방된 것으로 주장하지 않는다. 실제 접속이 필요한 서버 구현은 승인된 목적지/리다이렉트 정책을 별도로 적용한다.
- 서버 전용 환경값·DB 자격 증명·요청 파일 경로는 브라우저에 반환하지 않는다.

### 3. 업데이트 상태·정책·작업 예약

원본 UpdateStatus의 managed/stale/phase, installedVersion/availableVersion, rollbackVersion/rollbackSafe, lastCheckedAt/lastRequestId, automatic/hourUtc 정책, 제한된 오류·이력을 조회한다.

- 지원 동작은 원본의 check/install/rollback/policy를 유지한다.
- install/rollback은 명시적인 확인과 대상 버전 검증이 필요하다. rollbackSafe와 stale 상태를 서버에서 재검증한다.
- policy의 automatic은 boolean, hourUtc는 정수 0~23으로 검증한다.
- 단일 진행 요청/중복 예약 방지를 유지한다. 실패한 요청을 모호한 응답 때문에 자동 재발행하지 않는다.
- worker가 읽는 파일은 서버의 고정된 승인 위치에만 발행한다. API 입력으로 파일 경로·셸 명령·임의 실행 파일을 받지 않는다.
- 현재 조회 실패를 가짜 not_configured/성공 상태로 대체하지 않는다. 실제 미설정, 미지원, 상태 만료, 권한 거부, 서버 장애를 구분한다.

## 공통 API 계약·검증 요구

HTTP 경로와 응답 필드명은 서버 구현 측에서 확정하고 실제 타입/테스트와 함께 전달한다. 프런트엔드는 확정된 계약만 연결한다.

- 기존 HttpOnly 세션/BFF 경계를 유지하고 서버는 모든 요청의 관리자 권한을 검증한다.
- 조회는 private no-store이며 읽기 전용이어야 한다.
- 변경은 확인·최신 상태 또는 개정·동일 요청 식별자를 검증한다. 작업 ID, 접수 상태, 상태 조회 계약을 제공한다.
- 세션 만료/권한 거부/경합·이미 진행 중/속도 제한/미지원/서버 장애를 구분한다.
- 접수 응답은 적용 완료가 아니다. UI가 실제 작업 상태를 확인할 수 있어야 한다.
- 민감 정보가 없는 감사 이벤트를 기록한다. 응답과 로그에 인증값·DB 연결 문자열·원본 파일 내용을 출력하지 않는다.
- 프런트엔드 호스트 파일 변경이나 프런트엔드의 직접 DB 접근으로 대체하지 않는다.

서버 검증은 권한 거부, 잘못된 값, 중복 요청, worker 미설정, stale 상태, 재시작 전후 작업 상태, 적용 실패·복구를 포함한다. 운영 리스너/역할/업데이트의 실제 적용은 사용자와 대상·범위·복구 방법을 확인한 별도 단계로 남긴다.

## 프런트엔드 후속 작업

확정 API를 받은 후 서버 전용 BFF와 닫힌 DTO, 공통 확인 창, 관리자 미저장 보호, 다국어·데스크톱·모바일 화면을 연결한다. 기존 도메인/DKIM/사용자/운영 계약을 재사용해 설치 마법사를 구성한다. API 미지원 상태를 원본 기능 완료로 표시하지 않는다.
