# 보안 설정 서버 초기 조회 — 2026-10-13

보안 설정의 기존 첫 화면은 null 상태로 시작해 mount 후 `/api/mail/security`를 조회했다. 현재 서버 계약의 `loadLiveSecurity`를 재사용하는 서버 전용 `initialLiveSecurity`를 추가하고 `/settings/security`, `/security`, 설정 첫 페이지의 보안 아코디언에 전달했다. 설정 tab 리디렉션은 초기 조회 전에 유지한다.

- React cache는 같은 SSR 요청 안에서만 재사용한다. HttpOnly 세션 토큰은 서버 로더에서만 읽고 client props에는 기존 DTO의 MFA 요약·세션·활동 상태만 포함한다.
- 초기 성공과 실패 모두 즉시 해당 상태를 사용하며 mount의 중복 GET은 하지 않는다. 초깃값 없는 독립 호출은 기존 client GET 경로를 유지한다. 명시적 재시도, 세션 해제 후 재조회, MFA 완료 후 재조회는 기존 attempt/refreshRevision으로 작동한다.
- 인증 거부·권한·요청 제한·장애를 기본 MFA/빈 목록으로 대체하지 않는다. 예상하지 못한 서버 오류 내용은 보내지 않고 retryable 상태만 전달한다. 기존 공통 오류 toast·MFA/세션 해제 mutation 잠금/확인은 유지한다.
- SSR 날짜 포맷은 계정의 저장된 시간대를 명시해 호스트 기본 시간대와 브라우저 기본 시간대 차이로 인한 hydration 불일치를 피한다.

Next.js 스킬에 따라 서버 조회와 Client Component 인터랙션 경계를 유지했다. 보안 설정 자체를 변경하거나 테스트 만료 경로를 호출하지 않았다.

## 검증

신규 검사 3개: 초기 서버 로더의 무인증 skip/닫힌 오류/토큰 비노출, 10개 언어 실제 컴포넌트 SSR(성공·5종 실패·날짜·중복 mount GET 없음), 두 직접 경로와 설정 첫 페이지 초기 전달 및 tab 리디렉션. 기존 MFA 계약·콜백 검사 11개 통과. 전체 lint 종료0, 운영 CSS/타입·410페이지 빌드 종료0(BUILD_ID `qmFeJR3ohU39m0U5oAKv-`), 변경 diff 공백 검사 통과. 변경 함수 안의 기존 trailing whitespace 한 줄은 공백 검사 실패 후 제거했다. 의미 없는 빈 줄 정리로 앱 검사·빌드를 다시 실행하지 않았다. 번역 입력은 바뀌지 않아 앞선 catalog 검사를 반복하지 않았다.

실제 로그인 화면의 읽기 전용 검수:

- `/ko/settings/security` desktop1280px: MFA/세션/활동 세 구획과 날짜 표시, loading 상태 없음, document clientWidth=scrollWidth=1280, console warning/error 없음.
- `/ko/security` mobile390px: 세 구획 표시, document clientWidth=scrollWidth=390, 내부 가로 넘침0.
- `/ko/settings` mobile 보안 패널: 펼침=true, 세 구획 표시, document clientWidth=scrollWidth=380(390px viewport의 세로 scrollbar 제외), console warning/error 없음.

시간 초과한 탐색은 같은 살아 있는 탭의 완료 상태를 관찰한 뒤 다음 단계만 재개했다. 첫 패널 클릭의 collapsed 상태를 확인한 후 준비된 컨트롤을 다시 열었다. 서버 재시작이나 mutation 재전송은 없었다. MFA 설정·세션 해제·추가 메일 발송은 실행하지 않았다. 실제 세션/활동의 식별자·IP·원문은 검수 보고서나 스크린샷에 기록하지 않았다. temporary viewport와 검수 탭을 정리했다.

서버 SSR/합성 결과와 실제 데이터 표시 수용을 구분하며 최초 페인트 시간, 실제 MFA 인증·만료·해제/실패 조합의 완료를 주장하지 않는다. 당시 대기하던 추가 합성 첨부·초안·자기 발송은 후속 승인으로 검증했다([별도 실제 증거](draft-attachment-live-20261013.md)).
