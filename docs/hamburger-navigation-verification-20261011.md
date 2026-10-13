# 햄버거 메뉴 실제 화면 검증

- 대상: 현재 사용자가 열어 둔 Codex In-app Browser, `http://127.0.0.1:7540/ko/settings`.
- 수정 전 재현: 업무 메뉴의 파일 링크 클릭 시 메뉴만 닫히고 설정 URL 유지.
- 원인: DrawerHistory의 popstate 콜백에서 동기 실행한 router.push가 Next.js의 같은 이벤트 기록 복원과 충돌.
- 수정: 기록 소비·닫기 후 다음 작업에서 이동. 이동 대기 중 재열기 방지, dispose 시 예약 이동 취소.
- 실제 확인: 설정 → 파일, 파일 → 검색, 검색에서 뒤로 가기 → 파일, 닫기 버튼으로 동일 페이지 유지, 열린 메뉴에서 뒤로 가기는 메뉴만 닫음, 파일 → 설정으로 원래 화면 복귀.
- 자동 회귀: `node scripts/test-drawer-history.mjs` 4개 통과. 관련 ESLint와 변경 파일 diff 검사 통과.
- 계정 설정 변경, 메일 발송·이동·삭제, 운영 서비스 재시작은 수행하지 않음.
- 완료 화면: `hamburger-navigation-verified-20261011.png`.
