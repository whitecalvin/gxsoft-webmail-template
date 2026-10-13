# 일반 설정 읽기 전용 브라우저 검수 — 2026-10-10

## 범위와 결과

- 현재 로그인된 로컬 웹앱의 `/{locale}/settings/locale`을 임시 탭에서 조회했다. 계정 설정 저장, 메일 조회 선택/읽음 변경, 발송, DB/배포/재시작은 수행하지 않았다.
- 지원 언어는 i18n/routing.ts의 ko/en/de/es/fr/it/pt/ja/zh/zh-hant 10개다. 각 화면에서 해당 html lang, 일반 설정 API 미지원 안내와 재시도 버튼을 확인했다.
- 실제 viewport는1280×720. 10개 언어 모두 documentElement.scrollWidth가 innerWidth보다 크지 않았다. 언어별 오류 안내는 한국어/영어/독일어/스페인어/프랑스어/이탈리아어/포르투갈어/일본어/중국어 간체·번체로 표시됐다. 번역 문자열 raw key는 이 상태 영역에 표시되지 않았다.
- 검수 탭의 관측된 error/warn console 기록0개, hydration/did-not-match/server-rendered 진단0개. 이는 이번 API 미지원 상태의 탐색 기록이며 성공 snapshot이나 전체 제품의 hydration 증거가 아니다.

## 모바일 검수 제한

- 공식 browser viewport capability로390×844를 요청했지만 기존 탭과 이후 생성한 탭 모두 실제 innerWidth1280/innerHeight720이었다. screenshot도 desktop 크기였다.
- 따라서 이어서 관측한 ko/en/de/es/fr의 화면을 모바일 통과로 기록하지 않는다. 모바일 정상화된 설정/저장 바/오류 레이아웃은 실제 적용된 viewport에서 재검증해야 한다.
- viewport override는 reset했고 에이전트가 만든 두 임시 탭을 닫았다. 기존 사용자 탭은 변경하거나 닫지 않았다.

## 남아 있는 운영 증거

현재 화면은 계정별 일반 설정 API 미지원 안내다. 서버 소스·격리 DB 검증과 프런트엔드 SSR/저장 연결은 구현돼 있지만, 운영 API와 migration64가 적용된 성공 snapshot 조회·저장 왕복은 입증되지 않았다. 이를 API 응답 실패의 기본값/localStorage 대체로 우회하지 않는다.

문서/브라우저 검수만 수행했고 애플리케이션 입력은 변경하지 않았다. Provider/status의 해시 B58BA0EE459AD391508A2AC374C3B2B153718121BFC53FE6B149FFD811DE1EAA / 4AAC9081018F5F096EDFD0ABBF3870ACE5F72BDFF9EABECE7DB74D21BA9BAAFB가 앞선 성공 build9106 입력과 같음을 확인했으므로 빌드를 반복하지 않았다.
