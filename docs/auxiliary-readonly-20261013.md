# 주소록·캘린더·공용 편지함 읽기 검수 — 2026-10-13

현재 로그인된 실계정의 정상 UI만 조회했다. API 직접 탐색·fetch 우회·토큰 추출·DB 조회·데이터 변경은 하지 않았다.

- 주소록: 내 연락처1명과 실제 목록1행 일치. 합성 무일치 검색어 입력 시0행과 검색 결과 없음 표시. 새로고침 후1행으로 복귀하고 표시 내용/순서의 메모리 내 fingerprint 일치. 개인정보·fingerprint는 산출물에 저장하지 않았다. 최초의 일반 section 선택은 sidebar 행까지 포함하므로 폐기하고 `section[aria-label="내 주소록"]`로 한정해 다시 검증했다.
- 캘린더: 기본 주간과 월간 조회에서 일정0건, 선택 기간에 일정 없음 표시. 모바일390px document clientWidth=scrollWidth, 오류 안내/console warning/error 없음. 일정 생성·수정·초대·RSVP는 실행하지 않았다. 빈 기간의 조회 성공은 실제 일정 필드·시간대·반복/초대 데이터 정합성 완료 증거가 아니다.
- 공용 편지함: 목록0건과 공용 편지함 없음 표시, 새로고침 후 동일. desktop1280px 넘침·오류 안내 없음. 공용 계정이 없어 실제 공유 폴더·메일 내용·권한별 쓰기 검수는 아직 불가능하며 빈 목록을 공용 메일 전체 수용으로 판정하지 않는다.

## 발견한 UI 결함 수정

캘린더 만들기 버튼의 native title을 공통 Tooltip으로 교체했다. aria-label·disabled 조건·openCreate·flex shrink 크기와 작은 화면의 글자 숨김을 유지했다. 하단 portal tooltip을 키보드 focus로 실제 표시했고 Escape로 닫았다. 생성 editor는 열지 않았으며 화면의 기존 hidden theme customizer dialog와 구분했다. native title은 없다. 변경 후 모바일390px 넘침 없음. [툴팁 실제 증거](calendar-create-tooltip-20261013.jpg).

기존 캘린더 모바일 검사에 실제 추가 버튼 JSX의 공통 tooltip/번역 키/방향/크기/native title 부재와5가지 disabled 조합을 추가했다. 관련 검사, 전체 lint, 운영420페이지 빌드(BUILD_ID `v_GeUEy5jsZmP3-mp6Jfc`)와 변경 diff 공백 검사 통과. 번역/catalog·캘린더 데이터 처리 입력은 바뀌지 않아 관련 전체 검사를 반복하지 않았다. 임시 viewport를 원복하고 검수 탭은 닫았다.
