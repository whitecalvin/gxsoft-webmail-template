# 일반 설정 계정별 저장·SSR 서버 계약 요청안

상태: 2026-10-10 사용자 승인 후 tastedev-mail 세션에 요청했고 서버 소스 구현·격리 검증이 완료됐다. 확정 계약은 GET/PATCH `/api/user/general-settings`이며 원문은 TASTEDEV resources/guides/dev-01/tastemail-general-settings-20261010/API.md다. 프런트엔드 Provider/SSR/저장 UI도 연결했다. 운영 DB·배포·재시작·커밋·푸시는 하지 않았다. 브라우저에서 현재 서버의 API 미지원 안내를 확인했으므로 운영 저장 완료는 아니다.

## 확인된 현재 상태

- `context/settings-context.tsx`는 서버 snapshot으로 동기 초기화하며, root layout이 인증 계정의 설정과 접근성 HTML 초기값을 전달한다. localStorage 읽기·쓰기는 제거했고 기존 로컬 데이터를 삭제/자동 이전하지 않는다. 저장은 BFF의 확인된 receipt 이후에만 성공으로 표시한다. GET 실패는 편집 차단/명시적 오류로 표시한다. 실제 배포 서버 저장·성공 snapshot hydration 검증은 남아 있다.
- 현재 Rust `/api/user/preferences`의 GET/PATCH는 서명, identities 및 onboarding 필드를 제공한다. 일반 설정 전체를 저장하는 계약으로 사용하지 않는다.
- 아이콘, 라벨, 메일 규칙, 서명, 보안·계정 정보는 각 전용 서버 API의 책임이다. 일반 설정 JSON을 이들 기능의 대체 저장소로 만들지 않는다.

## 서버에 필요한 범위

아래는 서버에 전달한 요청 범위다. 현재는 인증 principal에서 계정과 auth generation을 결정하는 전용 일반 설정 GET/PATCH 계약이 확정됐으며, 최종 제한·오류 형식은 위 API.md를 기준으로 한다.

- 날짜·시간: timezone, dateFormat, timeFormat, weekStart.
- 접근성: fontScale, highContrast, reduceMotion, enhancedFocus, screenReaderDetails, keyboardNavigation.
- 작성 UI: font, defaultSignatureId, signatureOnNew, signatureOnReply, undoSeconds. 발신 주소·표시명·서명 원문은 identity API에 남긴다.
- 받은편지함 UI: showMailboxCounts, showMailboxStorage, showDeliveryDetails, density, previewPane, conversationView, markRead, pageSize, dateFormat, unreadStyle.
- 외부 이미지 정책: remoteImages와 해당 인증 계정의 발신자 허용 목록만 저장한다. 다른 계정의 허용 목록을 payload로 저장하지 않는다. 서버 정책 저장과 브라우저의 외부 이미지 로딩 권한을 구분한다.
- 보내기 UI: defaultReply, quoteStyle, requestReceipt, scheduleDefault, autosaveSeconds, defaultCc, defaultBcc, composeMode. 실제 발송·예약·수신확인은 각각의 메일 계약에 따른다.
- 알림 UI: browser, email, sound, weekends, quietStart, quietEnd, modes. browser 값은 OS/브라우저 Notification permission을 부여하지 않으며 email 값은 서버 알림 발송 지원을 의미하지 않는다. 지원되지 않는 실행 기능은 UI에서 계속 구분한다.
- 단축키: enabled, 지원되는 action별 bindings.

## 저장 및 오류 경계

- 버전, 계정 식별자, revision, 정상화된 설정 snapshot을 GET 및 성공한 PATCH에서 반환한다. PATCH에는 expectedRevision과 닫힌 부분 변경 schema를 사용해 기기 간 오래된 덮어쓰기를 409로 거부한다.
- 서버가 각 enum·타입·IANA timezone·시간 형식·단축키 충돌·문자열/배열/본문 크기를 검증한다. 임의 JSON·추가 계정 ID·알 수 없는 필드·보안 설정·비밀번호/토큰은 거부한다.
- GET 실패를 정상 기본값으로 표시하지 않는다. 첫 사용 계정에 설정 row가 없을 때의 서버 기본값과 실제 조회 실패를 구분한다.
- 현재 계정만 조회·변경하고 다른 계정의 설정 접근을 거부한다. 인증 세대·계정 활성 상태를 트랜잭션에서 검사한다. 인증된 응답은 no-store/private다.
- 401/403/409/413/429/5xx 및 검증 오류의 상태를 확정한다. 응답 유실·commit 불확실성 때 자동 재저장하지 않으며 GET으로 저장 결과를 확인할 수 있도록 한다.
- 기존 preferences/identity/icon/label/rule 계약과 초기화 범위를 변경하지 않는다. 운영 DB/설정/배포/재시작은 별도 승인 없이 수행하지 않는다.

## 프런트엔드 후속 연결

확정된 서버 계약 후 서버 전용 어댑터와 동일 출처 BFF를 구현한다. authenticated locale layout에서 계정별 settings snapshot을 요청 범위 내에서 읽어 SettingsProvider 초기 상태로 전달한다. 첫 SSR HTML과 hydration에서 같은 값을 사용해 기본값→저장값 깜빡임을 제거한다.

계정 변경·늦게 도착한 응답·다른 revision·저장 중의 새 SSR snapshot은 기존 draft를 무조건 덮어쓰지 않는다. 성공한 서버 receipt 후에만 저장 상태를 표시한다. 실패는 기존 draft와 이전 확인 snapshot을 유지한다. localStorage는 서버 설정의 성공 대체 경로가 아니다.

기존 브라우저 설정은 현재 계정으로 자동 이전하지 않는다. 계정 귀속을 확인하고 충돌/기존 서버 값을 보여주는 명시적 이전 동의가 필요하다. 브라우저 설정 삭제도 자동으로 하지 않는다.

## 검증 요구

격리 DB와 합성 계정에서 계정 분리, 부분 변경 보존, revision 충돌, 원자성, 결과 유실 복구, 크기/타입 제한을 검사한다. SSR/hydration, 계정 전환, 저장 실패·다중 제출·늦은 응답, 다국어/반응형 화면은 프런트엔드에서 검증한다. 운영 계정 설정의 실제 변경은 별도 범위를 확인한다.
