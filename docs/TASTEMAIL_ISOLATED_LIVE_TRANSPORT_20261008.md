# 격리 실서버 연결 검증 — 2026-10-08

## 확보한 실제 런타임 증거

기존 앱·환경 파일·서버 설정을 변경하지 않고 기존 검증 빌드 `nsWEiG4jh3paIbhQV6YLQ`를 사용했다. 전송 경계 기록의 7개 입력/산출물 해시를 확인한 후 재컴파일하지 않았다.

임시 SSH 포워딩은 기존 키 및 StrictHostKeyChecking=yes로 `220.86.146.229:7522`에 연결했고, Windows `127.0.0.1:16711`만 바인딩하여 원격 loopback `6711`로 전달했다. 원격 API/방화벽/DB/환경 설정은 수정하지 않았다.

검증한 Next production 프로세스만 다음 임시 환경을 사용했다. 기존 7540 개발 서버나 환경 파일에는 적용하지 않았다.

```text
GXWEBMAIL_BUILD_DIR=.next-goal-transport-verify
TASTEMAIL_API_URL=http://127.0.0.1:16711
next start --hostname 127.0.0.1 --port 17540
```

| 요청 | 결과 |
| --- | --- |
| /api/mail/health | HTTP 200, status=ok, Cache-Control=no-store |
| /api/mail/session (쿠키 없음) | HTTP 401, authenticated=false, no-store |
| /api/mail/mailboxes (쿠키 없음) | HTTP 401, unauthorized, no-store |
| /api/mail/messages (쿠키 없음) | HTTP 401, unauthorized, no-store |
| /api/mail/search (쿠키 없음) | HTTP 401, unauthorized, no-store |
| /api/mail/session POST (교차 Origin, 빈 객체) | HTTP 403, forbidden; 로그인 인증정보 없음 |
| 터널 종료 후 /api/mail/health | HTTP 503, retryable, no-store; 정상 데이터/mock으로 대체하지 않음 |

SSH 세션 26153, Next 세션 46512를 각각 종료했다. 검사 요청은 세션·메일·설정 변경 API를 사용하지 않았고 인증정보·메일 본문·첨부를 수집하지 않았다.

## 기존 7540 오류와 구분

기존 7540 health는 HTTP 500, text/html이었다. 응답의 Next 오류 메타데이터는 `/_error`, Error 및 개발 Turbopack hot-reloader 스택을 포함했다. 서버 전용 요청 함수가 반환하는 정상 JSON 503 장애 응답과 구분되는 개발 실행 오류다. 민감한 응답 내용이나 전체 스택은 기록하지 않았다. 정확한 개발 실행 오류 원인과 복구는 아직 확정하지 않았다. 기존 개발 프로세스 재시작·캐시 삭제를 하지 않았다.

## 완료 범위 제한

이 검증은 GXWebMail → 검증된 SSH → 229의 API 경로와 무인증/연결 끊김 처리를 실제 실행한 증거다. 229는 원래 목표의 109 서버와 동일한 대상이라고 가정하지 않는다. 기존 DB/계정 일치, 실계정 로그인·MFA·만료·공유 권한·메일 목록/상세/검색 데이터 일치와 모바일·10개 언어 전체 수용 검증은 남는다. 현재 사용자 개발 서버의 연결이 복구됐다는 주장도 아니다.

소스·locale·컴파일 입력 변경이 없어 기존 관련 테스트, locale 검사, 앱 lint 및 빌드 검증은 재사용했다. 새 앱 구현·배포·커밋·푸시는 수행하지 않았다. 전체 목표는 진행 중이다.
