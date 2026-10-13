# 계정별 아이콘 API 런타임 확인 — 2026-10-08

## 2026-10-09 재확인

인증정보 없는 GET만 사용하고 응답 본문은 수집하지 않았다. 아래 세 경로가 모두 HTTP 401을 반환했다.

- `192.168.0.109:6711/api/user/icon-preferences`
- `127.0.0.1:16711/api/user/icon-preferences`
- `127.0.0.1:7540/api/mail/icon-preferences`

기존 루프백의 404 관측은 더 이상 현재 상태가 아니다. 현재 무인증 요청이 인증 거부 경계에 도달함을 확인했지만, 401만으로 인증된 조회 성공·응답 계약·계정별 저장 왕복을 증명하지 않는다. 이전의 광범위한 실계정 GUI 조회 승인 차단을 우회하지 않았으며 실제 아이콘 설정·메일·세션을 변경하지 않았다.

모든 요청은 쿠키·Authorization·비밀번호 없이 수행했다. 응답의 경로, HTTP 상태, 알려진 공개 상태 필드만 기록했으며 메일·계정 설정·인증정보는 조회하거나 저장하지 않았다.

| 대상 | 경로 | 결과 |
| --- | --- | --- |
| 웹앱 127.0.0.1:7540 | /api/mail/health | 200, status=ok, Cache-Control=no-store |
| 웹앱 127.0.0.1:7540 | /api/mail/icon-preferences | 401, status=unauthorized, Cache-Control=no-store, private |
| 웹앱 127.0.0.1:7540 | /api/mail/session | 401, Cache-Control=no-store |
| 기존 개발 루프백 연결 127.0.0.1:16711 | /health | 200, status=ok, service=tastedev-mail |
| 기존 개발 루프백 연결 127.0.0.1:16711 | /api/user/icon-preferences | 404, 본문 상태 필드 없음 |
| 기존 개발 루프백 연결 127.0.0.1:16711 | GET /api/auth/session | 405; 인증 실패나 아이콘 API 지원의 증거로 해석하지 않음 |

192.168.0.109:6711의 공개 경로 확인은 이 실행 환경에서 요청 실패로 끝났다. HTTP 응답을 받지 못했으므로 서버 전체 장애로 판단하지 않는다. 인증정보는 전송하지 않았다.

## 소스와 실행 상태의 차이

현재 Rust 소스 `crates/tastemail-api/src/icon_preferences.rs`는 GET/PATCH `/api/user/icon-preferences` 및 POST reset 경로를 정의하며, `lib.rs`의 personal_mail_routes에서 병합한다. 하지만 기존 개발 연결에서 해당 GET은 404였다. 현재 실행 중인 서버의 아이콘 API 가용성이 입증되지 않았으며 로그인 사용자 설정 저장 왕복도 미검증이다. 프런트엔드 합성 검증을 실행 서버 기능 적용으로 확대하지 않는다.

환경 파일의 TASTEMAIL_API_URL은 LAN HTTP이며, 현재 코드의 URL 검증은 LAN HTTP 인증을 거부한다. secureNextEnvironment는 기존 파일을 수정하지 않고 루프백 주소를 프로세스 환경에 적용한다. 웹앱 health 성공만으로 현재 프로세스 환경이나 SSH 대상 서버 신원을 직접 증명하지 않는다. 16711은 secure-dev 소스의 기본 개발 연결 포트와 일치하지만 해당 프로세스의 실제 인수는 이번에 확인하지 않았다.

## 다음 단계와 권한

기존 사용자 승인에 따라 `tastedev-mail` 세션에 위 공개 응답과 account-icons 체크포인트의 미완료 로컬 게이트를 전달했다. 로컬 API/store 개발·운영 검사 및 운영 라이브러리 빌드만 재개 요청했다. 운영 배포·DB 실행·서버 구성 변경·재시작·git 작업은 승인하거나 수행하지 않았다.

실계정 브라우저 UI 검사는 광범위한 메일 내용 노출 위험으로 차단되어 별도 승인 대기다. 실제 아이콘 저장·폴더 이동·메일 변경·발송은 수행하지 않았다. 전체 연동 목표는 진행 중이다.
