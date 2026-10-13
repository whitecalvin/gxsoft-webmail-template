# 세션 경계 추가 검증 — 2026-10-08

## 이번에 확보한 증거

`node scripts/test-session-route-boundary.mjs`가 실제 `app/api/mail/session/route.ts`와 실제 NextResponse 쿠키 구현을 실행한다. 서버 전용 요청·쿠키 입력만 격리해 합성 응답을 사용하며 네트워크·실계정 인증·DB 접근은 하지 않는다.

- Origin 누락·불일치 및 원격 평문 로그인 거부. 거부 시 upstream 호출 없음.
- 구성 오류·잘못된 입력 및 과도한 본문 거부.
- 서버 소스의 401 `mfaRequired` / `invalidMfaCode` 계약 매핑. 403·429는 MFA로 오분류하지 않음.
- 인증 성공 응답에는 토큰을 포함하지 않고 쿠키에 HttpOnly·Secure·SameSite=strict·Path·만료를 적용.
- 유효하지 않거나 만료된 인증 응답은 쿠키를 설정하지 않음.
- GET은 JMAP identity를 검증하고 401에만 기존 쿠키 삭제. 403·429·장애 시 기존 쿠키 유지.
- 로그아웃은 로컬 쿠키를 제거하되 원격 취소 미확인 시 `signout_unconfirmed` / 503 구분.
- 임의 upstream 비공개 필드는 브라우저 응답으로 전달하지 않음.

새 검사와 해당 파일 ESLint 통과. 최초 lint 실패는 검사 로더의 변수명 `module` 금지 규칙으로, 변수명 수정 후 해당 lint 및 영향받은 새 검사만 재개했다. 앱 코드·locale·빌드 입력은 변경하지 않았고 이전 전송 경계 기록의 7개 해시가 일치함을 확인했다. 따라서 관련 기존 검증을 재사용하고 앱 전체 빌드를 반복하지 않았다.

## 현재 실서버 관찰

검증된 기존 SSH 연결을 통해 229 서버 loopback 6711 `/health` HTTP 200, 무인증 `/.well-known/jmap` HTTP 401을 확인했다. 원격 상태·설정·메일을 변경하지 않았다. 최초 제한 환경의 SSH 권한 거부 후 동일한 읽기 전용 요청을 승인된 환경에서 수행했다.

Windows에서 109:7531 health HTTP 000, 프런트엔드 7540 health HTTP 500을 관찰했다. 이 관찰로 장애 원인을 단정하지 않는다. 프런트엔드에서 안전한 API 경로를 확보하지 않은 상태이므로 실계정 인증정보를 보내지 않았다.

## 미완료

실계정 MFA, 인증된 세션 만료, 실제 공유 권한 부족, 프런트엔드↔API 메일 데이터 일치 및 전체 회귀 수용 검증은 이 검사로 완료되지 않는다. 설치 마법사·서버 모드 설정 배포도 수행하지 않았다. 전체 연동 목표는 진행 중이며, 이후 사용자의 mock 제거 지시를 유지한다.

검사 시점 SHA256:

| 입력 | SHA256 |
| --- | --- |
| app/api/mail/session/route.ts | ECD030F38A0E322A83FE59E0149D9461FB122E5E15478EE893C16B4CDFDF4BEC |
| lib/tastemail/session-contract.ts | 1149197753D864D3D87D48662920D8E73B03BE2A7F60496122678F243AF22F30 |
| lib/tastemail/session.ts | 60A132E8AFDA4D6BCB26EE1D35D1F6BA9BD62AECBDBE82FE34DED17987D71B34 |
| scripts/test-session-route-boundary.mjs | 897F91A50C53E289B87E6F656E30D0A5731DAAE752931A67C5E4332987719FE8 |
