# 관리자 Gmail OAuth 상세 안내

기존 4개 문장 대신 관리자 페이지 안에 6단계 펼침 안내를 추가했다. 프로젝트 선택, 브랜딩·대상·테스트 사용자, 메일 권한, 웹 클라이언트·주소, GXWebMail 저장·검사, 실제 사용자 연결을 구분한다. 오류별 해결 안내와 Google 공식 문서 링크를 함께 제공한다.

- 위쪽 공개 HTTPS 주소 입력에서 원본 및 필수 callback 값을 계산한다. 설정 페이지를 callback으로 등록하지 않도록 안내한다. 잘못되거나 비어 있는 주소는 등록 값을 만들어 내지 않고 입력 필요 안내를 표시한다.
- 순수 서버 OAuth에서 필수가 아닌 JavaScript 원본과 필수인 리디렉션 URI를 구분한다.
- 전체 메일 권한과 앱의 현재 읽기·미러 범위, 외부 Testing의 7일 갱신 토큰, 일반 운영 공개의 Google 검증을 구분한다.
- 안내 컴포넌트 자체는 API 요청·설정 저장·인증 시작을 하지 않는다. 비밀키·환경 변수·서버 계약·운영 배포는 변경하지 않았다.
- 한국어/영어 안내와 나머지 locale의 기존 영어 fallback 정책을 유지한다.

확인한 공식 문서: [동의 화면](https://developers.google.com/workspace/guides/configure-oauth-consent), [클라이언트 생성](https://developers.google.com/workspace/guides/create-credentials), [서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail IMAP](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol), [제한 범위 검증](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [토큰 만료](https://developers.google.com/identity/protocols/oauth2/).

검증: 새 안내 SSR 회귀(개발/production)·변경 파일 ESLint 통과. 여섯 단계/열한 펼침 영역·정확한 URL 매핑·빈 주소·공식 링크·API 부작용 없음 검사. 기존 관리자 테스트의 import 의존성만 새 안내에 맞게 유지했으며, 변경 없는 저장/인증 서버 테스트는 반복하지 않았다.

변경된 안내 컴포넌트로 프로덕션 빌드를 한 번 수행했다. 최적화 컴파일·TypeScript·432페이지·trace 종료 0, BUILD_ID `Q1Pq7zivm6xYxDKP-jchx`. 이후 문서·스크린샷 기록만 변경했으므로 빌드를 반복하지 않았다.

실제 관리자 화면에서 4단계 펼침과 `https://webmail-test.gxsoft.co.kr/api/mail/linked-accounts/oauth/callback` 표시를 확인했다. 입력한 주소는 저장하지 않은 초안이며 설정 저장·Google 로그인·동의·운영 변경은 실행하지 않았다. 화면 증거: `admin-gmail-oauth-guide-20261014.jpg`.
