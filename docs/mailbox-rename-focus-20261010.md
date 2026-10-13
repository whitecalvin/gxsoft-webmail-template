# 편지함 이름 변경 포커스 — 2026-10-10

## 대화상자 열기·닫기 시 사이드바 위치 안정화

- 원인: context 요청으로 트리 안에 마운트된 manager가 portal 대화상자 외에도 `min-w-0 pt-2` 빈 div를 생성하여 8px 상단 여백을 추가했다. 최상위 생성 버튼이 있는 경우에만 이 wrapper를 유지하고 context 대화상자는 fragment/portal만 반환하도록 수정했다.
- 관련 검사14개 및 변경 파일 ESLint 통과. 실제 인증된 접근성 페이지에서 Github 관리→이름 변경→취소→재열기 시 Github 관리 버튼 y377.34375, 아래 ChatGPT 관리 버튼 y445.2395935058594, 추가 버튼 y502.1875가 모두 동일했다. 최초 off-screen 메뉴 클릭의 자동 스크롤은 상대 간격 변화와 구분했다. 이름 저장 및 메일 변경 없이 취소·임시 탭 닫기 완료.
- 증거: `mailbox-rename-no-shift-20261010.png`. 이번 수정의 production build session64587 exit0, 컴파일·TypeScript·393페이지 생성·최종 정리 통과. 이전 빌드는 이번 소스 변경으로 무효화되므로 재사용하지 않았다.

- 편지함·폴더 트리의 이름 변경 메뉴는 `PersonalFolderTree`에서 모두 `PersonalFolderManager`를 호출한다. 별도의 이름 변경 대화상자는 소스 검색에서 발견하지 않았다. 라벨·주소록·규칙의 일반 편집 폼은 이 편지함 이름 변경 경로와 구분한다.
- 이름 변경 입력에 공통 Modal의 `data-modal-autofocus` 우선 포커스를 지정하고, 포커스 시 기존 이름 전체를 선택한다. 생성 입력에는 전체 선택을 적용하지 않는다. 공통 Input/Modal과 기존 서버 저장 계약은 유지한다.
- 관련 검사13개와 변경 파일 ESLint·diff 공백 검사 통과. 실제 브라우저에서 Github 관리 메뉴→이름 변경 후 입력 포커스 및 selectionStart0/selectionEnd6/valueGithub 확인. 저장 없이 취소하고 임시 탭을 닫았다.
- 화면 증거: `mailbox-rename-focus-20261010.png`. 실제 이름 변경 요청이나 메일 변경은 하지 않았다. 프로덕션 빌드는 출력 types 폴더 EPERM 이후 같은 입력으로 권한을 확보해 재개했으며 session83688 exit0, 컴파일·TypeScript·393페이지 생성·최종 정리까지 통과했다.
