# CSS 실행 오류 수정 및 원래 109 대상 재확인

## 소스 변경

기존 7540의 HTTP 500은 `app/globals.css` PostCSS 변환 결과의 잘못된 safe-area utility 값에서 발생했다. 오류 응답에 제어 문자·깨진 문자가 포함된 후보와 `Parsing CSS source code failed`가 있었다. 정확히 어느 자동 스캔 파일에서 후보가 유입됐는지는 단정하지 않는다.

Tailwind 스킬의 명시적 소스 등록 규칙에 따라 `source(none)`으로 자동 검색을 끄고 app/components/context/lib/i18n/types만 등록했다. 실제 설치된 Tailwind/PostCSS를 실행하는 `scripts/test-tailwind-source-boundary.mjs`를 추가해 제어 문자·깨진 후보 없음, 정상 safe-area 및 md/lg 유틸리티 유지를 검증했다. 색상·간격·레이아웃 디자인을 변경하지 않았다.

기존 개발 서버는 재시작하지 않았다. Fast Refresh 후 `/ko/login` HTTP 200, `/api/mail/health` JSON HTTP 503 configuration_error를 확인했다. CSS 파싱 실패 및 HTML 500은 사라졌다. 환경 파일은 원격 HTTP API 주소를 사용하는 상태여서 안전한 전송 계약에 차단된다. URL/인증정보 원문은 기록하지 않았고 환경 파일을 변경하지 않았다.

## 게이트

- 실제 PostCSS CSS 경계 검사 통과.
- npm run lint 통과.
- CSS 컴파일 입력 변경으로 새 격리 production build 실행 및 통과. `.next-goal-css-verify`, BUILD_ID `pxR6MTn19PEjhw2rb4PPk`.
- Next가 tsconfig에 해당 빌드 타입 경로를 추가했다. 사용자 실행 `.next` 빌드를 덮어쓰지 않았다.
- 10개 언어 로그인 SSR HTTP 200 및 html lang 일치 확인. 이는 HTML 초기 응답 검사이며 실제 모바일/데스크톱 렌더링·hydration·콘솔 회귀 검증은 아니다.
- 첫 SSR 요청 배치에서 임시 서버를 조기에 종료한 실행 실수로 3개 언어 완료 후 실패했다. 서버 실행 단계만 재개하고 나머지 7개 언어를 통과했다. 재빌드나 앞선 성공 검사는 반복하지 않았다.
- locale 카탈로그·인증/메일 로직이 변경되지 않아 해당 검사를 추가 실행하지 않았다.

## 실제 109 대상

무인증 LAN health는 109:6711 HTTP 200, 109:7531 HTTP/검증된 HTTPS는 제한 시간 내 HTTP 응답 없음(000)이었다. 인증서 검증을 끄지 않았고 실패 원인을 포트 폐쇄로 단정하지 않는다.

기존 계정의 SSH BatchMode + StrictHostKeyChecking=yes로 109 loopback6711 health 200, 무인증 JMAP 401을 확인했다. 이 서버가 원래 목표 대상이다. 229 검증을 대신 인용하지 않았다.

임시 SSH는 Windows loopback16711 → 109 loopback6711에만 포워딩했다. 새 빌드의 임시 production 서버를 loopback17540에서 실행해 프런트엔드 health HTTP 200/ok/no-store, 세션 HTTP 401/authenticated=false/no-store를 확인했다. 인증정보·메일을 전달/수집하지 않았다. 환경 변수는 해당 임시 프로세스에만 적용했다.

원격 API·방화벽·DB·사용자 개발 서버·환경 파일은 변경하지 않았다. SSH 세션65877 및 임시 Next 세션25138/6708은 종료했다. 현재 7540의 안전한 API 구성 전환·실계정 로그인 및 메일 데이터 수용·전체 화면 회귀는 남는다. 전체 목표는 진행 중이다.

## 검증 시점 SHA256

| 파일 | SHA256 |
| --- | --- |
| app/globals.css | A3191E8D304F097D6EA7DB44C706B0577F490CBDEE6203CD6DCE2D00897F1BAF |
| scripts/test-tailwind-source-boundary.mjs | BB8AA844F36FE6BE383F802CF391A112A2258F17B7DB94D78A64B3D504950066 |
| tsconfig.json | 807DCEEE3A4F5CF803E3BD9F4588945568D8B5DC6FBF51494115253FD5E98095 |
| .next-goal-css-verify/BUILD_ID | 873BB178D5DDDA9444E940D287588BC6EAAC46264DBBA5E2A3E1BE2CB1F586E1 |
