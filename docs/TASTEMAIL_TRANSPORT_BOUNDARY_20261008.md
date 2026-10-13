# 전송 경계 검증 — 2026-10-08

설치·서버 역할 설정의 로컬 검증 기록은 [설치 설정 기록](D:/works/projects/GITHUB/resources/operations/tastemail-229-20261007/NODE-ROLE-MANAGEMENT.md) 및 같은 폴더의 `node-role-management-checkpoint.json`을 참조한다. 설치 마법사·관리자 설정의 운영 배포 및 권한 상승 설치 실검증은 완료하지 않았다.

## 이번 변경과 검증

- 서버 전용 API 요청에서 역슬래시·제어 문자·공백 경로를 인증 헤더 전달 전에 거부한다.
- 호출자의 취소 신호와 최대 15초 제한을 함께 적용한다. 기본 제한은 10초다.
- 격리 Next 빌드 생성물을 lint/Git에서 제외했다. 소스 lint 규칙은 유지했다.
- 경로·시간 제한 검사, live 세션 계약 검사, locale 키 검사, lint, production build 통과.
- 최초 lint 실패는 `.next-*` 생성 코드 검사 때문이었다. 이미 성공한 검사는 반복하지 않고 실패 단계부터 재개했다.
- 빌드 디렉터리: `.next-goal-transport-verify`, BUILD_ID: `nsWEiG4jh3paIbhQV6YLQ`. Next가 tsconfig에 해당 생성 타입 경로를 추가했다.

## 현재 연결 증거

229 서버의 서비스는 active이며, 검증된 SSH로 원격 loopback 6711 health HTTP 200을 확인했다. 원격 7531은 연결 거부였다. Windows loopback 6711은 연결 거부, 109:7531의 HTTP·HTTPS는 시간 초과, 프런트엔드 7540 health는 HTTP 500이었다. 이는 시점별 연결 관찰이며 장애 원인이나 인증된 API 계약의 정상 동작을 증명하지 않는다.

인증정보를 전송하거나 서버·DNS·DB·환경 파일을 변경하지 않았다. 안전한 프런트엔드 접근 경로 및 실제 MFA·만료·권한·메일 데이터 일치 검증이 남는다. 전체 연동 완료가 아니다. 과거 mock 유지 문구보다 이후 사용자의 live-only 지시를 우선한다.

세부 게이트와 입력 해시는 `TASTEMAIL_TRANSPORT_BOUNDARY_20261008.json`에 기록했다.
