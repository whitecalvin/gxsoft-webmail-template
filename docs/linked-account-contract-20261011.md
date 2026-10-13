# 연결 계정 확장 계약 연결 — 2026-10-11

## 확인한 서버 소스

- `tastedev-mail/crates/tastemail-api/src/linked_accounts.rs`: GET 목록의 `authenticationAvailable`은 `{ gmail, naver, tastemail: false }`이다. 등록과 연결 인증은 별도이다.
- `tastedev-mail/crates/tastemail-store/src/linked_accounts.rs`: `connected`는 로컬 캐시 읽기와 수신 동기화를, `temporaryError`와 `reauthRequired`는 로컬 캐시 읽기만 광고한다. 발송·원격 메일 변경은 지원하지 않는다.
- 서버 안내 `resources/guides/dev-01/tastemail-linked-accounts-20261011/API.md`에는 최신 확장 계약 뒤에 이전 등록 전용 설명이 함께 남아 있다. 충돌하는 부분은 현재 Rust 구현을 기준으로 확인했다. 서버 저장소 main에 관련 미커밋 변경이 있으므로 운영 배포 상태로 간주하지 않는다.

## 프런트엔드 변경

이전 등록 전용 서버의 `authenticationAvailable: false`와 새 서비스별 객체를 모두 처리한다. 허용된 필드만 반환하며 추가 토큰·암호·내부 필드를 전달하지 않는다. 실제 boolean만 수용하고, 인증 전 읽기·비연결 상태의 동기화·원격 발송/변경·모순된 상태와 기능 조합은 거부한다. 등록/연결 해제의 불확실한 결과 처리와 쓰기 재시도 차단은 유지한다.

설정의 연결 계정 목록은 `connected`/`temporaryError`를 10개 언어로 표시한다. 새 계약에서는 서버 기능 전체가 미지원이라고 단정하지 않고, 현재 프런트엔드 인증·동기화·메일 열기 UI가 아직 미연결임을 안내한다. 서버 기능 지원 광고는 사용자 인증 완료나 이 UI의 기능 구현 완료를 뜻하지 않는다.

## 검증과 남은 범위

- 합성 계약/BFF/등록·연결 해제 불확실 결과 처리 및 10개 언어 실제 컴포넌트 SSR 검사 통과.
- 새 상태의 모순된 기능 플래그와 비밀 필드 투영 검사 추가.
- 다국어 검사 3088개 키 및 변경 범위 ESLint 통과. npm 래퍼 실행 환경 오류 후 해당 실패 검사만 직접 Node로 재개했다. 합성 연결 계정 검사는 반복하지 않았다.
- 현재 로그인된 로컬 웹메일에서 목록 다시 확인(GET) 완료, 오류 안내 없음, 이전 등록 전용 안내 유지 및 콘솔 error 없음을 확인했다. 새 계약이 운영 서버에 배포되어 실제 반환된다는 근거는 아직 없다. 새 상태의 실제 브라우저·모바일 검수는 별도이다.
- `GXWEBMAIL_BUILD_DIR=.next-general-settings-webpack npm run build -- --webpack` 종료 0: 최적화 컴파일, TypeScript, 395개 정적 페이지와 build trace 완료. 개발 서버 출력은 변경하지 않았다. 이 결과는 운영 배포 검증이 아니다.
- 실제 계정 등록·자격 증명 입력·OAuth·동기화·메일 변경·DB 조회·배포·서버 재시작은 수행하지 않았다.
- 다음 구현: 네이버 자격 증명/검증, Gmail OAuth BFF 및 callback, 폴더/작업 상태, 캐시 읽기와 계정 전환 UI. 서버 기능을 기본 계정 메일로 대체하지 않는다.
- 전체 목표는 진행 중이다. mock/live 정책은 이후 사용자의 live-only 지시와 기존 목표 사이 차이를 별도로 정리해야 하며, 이 변경은 모드를 변경하지 않는다.
