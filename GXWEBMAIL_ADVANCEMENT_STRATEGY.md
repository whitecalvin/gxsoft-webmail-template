# GXWebMail 고도화 단계별 목표 프롬프트

## 문서 목적

### 7단계 진행 상태 (2026-09-28)

사용자가 TASTEMAIL 연동을 별도로 지시하여 7단계 구현을 시작했다. 아래의 1~6단계 완료 조건은 원래 계획의 목표이며, 모두 통과했다고 간주하지 않는다. 기존 mock 템플릿은 유지하며 `GXWEBMAIL_DATA_MODE=live`일 때만 서버 전용 API 계층을 사용한다. 로그인·개인 메일 읽기/검색/상태 변경, 일반 텍스트 작성·임시저장·첨부 업로드·발송 큐 제출, 일부 업무 화면의 조회·변경 경로가 코드에 연결되었다. 배포와 운영 환경 확인은 사용자가 담당하며 이 작업에서는 서버 소스 계약에 맞춘 로컬 구현을 진행한다. 실제 계정 로그인·읽기·발송은 아직 검증하지 않았다. 기능별 상세 현황과 미연동 항목은 `docs/TASTEMAIL_INTEGRATION_GAPS.md`를 기준으로 한다.

GXWebMail 공개 템플릿을 제품 수준으로 고도화하기 위한 작업을 일곱 단계로 분리한다. 1~6단계에서는 서버 없이도 완성도 높은 프런트엔드 템플릿을 구축하고, 실제 서버 연동은 템플릿 고도화가 끝난 뒤 마지막 7단계에서만 진행한다. 각 단계는 독립적으로 실행하고 검증할 수 있으며, 이전 단계의 완료 결과를 다음 단계의 기준 상태로 사용한다.

## 공통 작업 기준

- 작업 디렉터리: `D:\works\projects\GITHUB\sources\v1.0\gxsoft-webmail-template`
- 시작 기준 커밋: `da301fc`
- 기존 작업 트리의 미커밋 변경을 덮어쓰거나 폐기하지 않는다.
- 로그인, 회원가입, 설치, 관리자 전용 레이아웃을 업무 화면 레이아웃에 통합하지 않는다.
- 1~6단계에서는 공개 템플릿의 mock 데이터 범위를 유지하며 실제 서버 API, 데이터베이스, 인증 서버와 비즈니스 모델은 구현하지 않는다.
- 실서버 연동은 템플릿의 UI·상태·다국어·테스트·접근성 구조가 안정된 이후 7단계에서만 시작한다.
- 1~6단계가 모두 완료되어도 실서버 연동에 대한 사용자 동의로 간주하지 않는다.
- 7단계의 조사, 자격증명 설정, 외부 네트워크 연결, live 코드 작성 또는 mock 교체를 시작하기 전에 반드시 사용자에게 실서버 연동 범위와 대상을 설명하고 별도의 명시적 동의를 받아야 한다.
- 사용자의 명시적 동의가 없으면 7단계는 계획 문서 상태로만 유지하고 mock 기반 템플릿을 변경하지 않는다.
- 커밋과 GitHub Push는 별도 요청이 있을 때만 수행한다.
- 입력이 변경되지 않았다면 동일한 검증을 불필요하게 반복하지 않는다.

## 현재 기능·레이아웃·GUI 전략 기준선

현재 제품 방향은 **실서버 없이도 완성도 높은 기업용 웹메일을 체험할 수 있는 프런트엔드 템플릿**이다. 기능, 레이아웃과 GUI를 먼저 제품 수준으로 완성하고 실서버 연동은 마지막 단계에서 별도의 사용자 동의를 받은 뒤 진행한다.

### 기능 전략

현재 템플릿은 다음 사용자 흐름을 제공한다.

- 메일함
  - 받은편지함, 임시보관함, 보낸편지함, 보관함, 스팸, 휴지통
  - 목록, 읽기, 중요 표시와 이동 등 mock 상호작용
- 메일 작성
  - 작성 Modal
  - 일반 텍스트와 서식 편집
  - 임시보관 및 발송 UI
- 업무 도구
  - 캘린더
  - 주소록과 조직도
  - 전자결재
  - 공용 편지함
  - 메일 규칙
  - 파일
  - 격리
  - 검색
- 사용자 설정
  - 일반, 메일, 메일 관리, 계정의 4개 그룹과 15개 상세 route
  - 저장, 취소, 기본값 복원
  - 라벨, 필터, 차단 발신자 CRUD
  - 보안 session과 연동 서비스 mock 동작
  - 단축키 사용자 정의
  - 테마, 접근성, 언어 설정
- 공통 기능
  - 알림 Popover
  - 프로필과 언어 변경
  - 테마 커스터마이저
  - Toast와 ConfirmDialog
  - 미저장 변경 이탈 경고

기능은 다음 성숙도 순서로 고도화한다.

```text
UI만 존재하는 기능
    ↓
mock 상태가 실제로 변경되는 기능
    ↓
설정과 업무 화면이 연결된 기능
    ↓
repository/service contract로 분리된 기능
    ↓
자동화 테스트로 검증되는 기능
    ↓
사용자 승인 후 실서버에 연결된 기능
```

템플릿 단계의 우선 연결 대상은 다음과 같다.

- 목록 밀도 → 메일 목록
- 기본 서명 → 작성창
- 읽음 처리 시점 → 메일 읽기 동작
- 알림 정책 → 알림센터
- 필터와 차단 발신자 → mock 메일 처리
- 페이지당 메일 수 → pagination
- 접근성 설정 → 전체 업무 화면

### 데스크톱 레이아웃 전략

```text
┌────────────────┬────────────────────────────────────┐
│ Sidebar        │ Header                             │
│                ├────────────────────────────────────┤
│ Brand          │ Page title / Search / Actions      │
│ Compose        ├────────────────────────────────────┤
│ Mailboxes      │                                    │
│ Workspace      │ Main content                       │
│ Tools          │                                    │
│ Settings       │                                    │
│ Logout         │                                    │
└────────────────┴────────────────────────────────────┘
```

- Sidebar 기준 너비는 약 250px로 유지한다.
- Sidebar와 MainContent를 명확하게 분리한다.
- 브랜드와 주요 메뉴는 Sidebar에 항상 표시한다.
- Header에는 현재 페이지 문맥과 공통 사용자 동작을 배치한다.
- 메일 화면은 목록과 읽기 화면을 추가 분할한다.
- 설정은 설정 메뉴와 상세 화면을 좌우 배치한다.
- 업무 화면은 `WorkspaceLayout`을 공통 셸로 사용한다.

### Header 전략

Header는 페이지 제목, 화면별 핵심 작업 또는 검색, 알림, 테마 아이콘, 사용자 Avatar 순서를 기본으로 한다.

- 메일함과 검색 화면에는 검색을 제공한다.
- 캘린더와 주소록처럼 목적이 다른 화면에서는 불필요한 메일 검색을 제거한다.
- 모바일 검색은 Header 내부 두 번째 행으로 확장한다.
- 검색 입력과 페이지 제목이 경쟁하지 않게 시각적 우선순위를 분리한다.

### Sidebar 정보 구조

Sidebar는 작성, 메일함, 협업 또는 업무 공간, 도구, 환경설정, 로그아웃 그룹을 기준으로 한다. 공용 편지함은 일반 도구보다 메일함 또는 업무 공간 그룹에 배치한다. 메뉴 그룹은 기능 분류를 위한 것이며 단순히 링크 개수를 분산하는 용도로 사용하지 않는다.

### 모바일 레이아웃 전략

- Sidebar를 햄버거 버튼으로 여는 drawer로 전환한다.
- backdrop과 slide animation을 적용한다.
- Escape, 포커스 트랩과 닫은 뒤 포커스 복원을 지원한다.
- 브랜드는 모바일에서도 숨기지 않는다.
- 화면 제목은 Header 두 번째 행에 표시한다.
- 설정 첫 화면에는 그룹별 목록을 표시한다.
- 설정 상세 화면에는 설정 목록으로 돌아가는 동작을 제공한다.
- 고정 작업 버튼과 저장 표시줄은 safe area를 침범하지 않는다.
- 360px에서도 가로 스크롤이 발생하지 않게 한다.

### 공통 레이아웃 원칙

- 앱 전체 높이는 `100dvh`를 기준으로 한다.
- Sidebar, Header와 Content의 스크롤 책임을 분리한다.
- MainContent 내부에서 필요한 영역만 스크롤한다.
- overlay가 Header나 Sidebar 뒤로 들어가지 않게 z-index를 토큰화한다.
- 데스크톱 화면을 단순 축소하지 않고 태블릿과 모바일에서는 구조를 전환한다.

### GUI 기본 방향

기업용 업무 도구에 맞는 정보 밀도와 명확한 상태 표현을 우선한다.

- 장식보다 정보 구조를 우선한다.
- 과도한 그림자와 그라데이션을 제한한다.
- 버튼과 입력의 역할이 즉시 구분되어야 한다.
- 카드 남용을 피한다.
- 핵심 작업에만 primary 색상을 사용한다.
- 위험 작업은 danger 색상과 확인 Dialog를 함께 사용한다.
- hover뿐 아니라 focus, active, disabled와 loading 상태를 제공한다.

### 테마 전략

| 프리셋 | GUI 방향 |
| --- | --- |
| Broadsheet | 신문 조판, 세리프, 시안·마젠타 |
| Classical | 고전적 세리프, 브론즈 |
| Industry | 절제된 스틸 블루 유틸리티 |
| Modernist | 바우하우스 그리드, 레드 오렌지 |
| Nocturne | 다크 앱, 블루퍼플 |
| Organic | 테라코타·세이지, 부드러운 곡선 |

테마는 Primary와 Accent 색상, 폰트, 목록 밀도, 모서리, 레이아웃 스타일, Sidebar 위치와 라이트·다크·시스템 모드를 제어한다.

### 디자인 토큰 전략

Surface, Foreground, Muted text, Border, Primary, Accent, Success, Warning, Danger, Radius, Density, Shadow, Focus ring, Animation duration와 z-index를 개별 화면 class에 분산하지 않고 공통 토큰으로 관리한다.

z-index는 다음 계층을 기준으로 한다.

```text
Content
Header
Sidebar toggle
Dropdown
Popover
Drawer
Modal
Toast
Tooltip
```

### 공통 컴포넌트 전략

새 화면이나 기능은 다음 공통 컴포넌트를 우선 사용한다.

- Button과 IconButton
- Input과 Textarea
- Switch, Checkbox와 Radio
- Dropdown, Tabs와 SegmentedControl
- Avatar, Badge와 Progress
- Panel과 EmptyState
- Modal, Popover, Toast와 Tooltip
- Skeleton과 Spinner

후속 디자인 시스템 단계에서는 FormField, Select, Combobox, DatePicker, TimePicker, DataTable, Pagination, Menu, Drawer와 CommandPalette를 추가한다.

### 화면 상태 전략

모든 주요 화면과 데이터 영역은 Initial, Loading, Empty, Populated, Dirty, Saving, Saved, Validation error, Mock 또는 network error, Disabled, Permission restricted 상태를 명시적으로 처리한다. 빈 배열은 단순한 흰 카드로 표시하지 않고 `EmptyState`와 사용자가 수행할 수 있는 다음 행동을 함께 제공한다.

### 접근성 전략

- `main`, `nav`, `section`, `header`, `fieldset` 등 의미에 맞는 태그를 사용한다.
- 모든 입력에 label, hint와 error를 연결한다.
- Modal과 Drawer에 포커스 트랩을 적용한다.
- Escape 닫기와 트리거 포커스 복원을 지원한다.
- 복합 컨트롤의 키보드 방향키 탐색을 지원한다.
- `focus-visible` 상태를 제공한다.
- 색상 외 아이콘과 텍스트로 상태를 전달한다.
- `prefers-reduced-motion`과 사용자 모션 감소 설정을 반영한다.
- Toast와 검증 오류를 live region으로 알린다.
- 브라우저 200% 확대와 360px 화면에서도 핵심 기능을 사용할 수 있어야 한다.

### 현재 남은 핵심 과제

1. DOM 후처리 번역을 제거하고 SSR `next-intl`로 전환
2. 설정값을 실제 업무 화면과 연결
3. mock 데이터 접근을 repository/service 계층으로 분리
4. 공통 UI API와 디자인 토큰 정리
5. Playwright 회귀 테스트 구축
6. 성능·접근성·반응형 최종 감사
7. 사용자 명시적 동의 후 실서버 연동

## 권장 실행 순서

1. 완전한 SSR 다국어 전환
2. 설정값과 업무 화면 연결
3. 설정 저장소 서비스 계층화
4. 공통 UI 디자인 시스템 확장
5. Playwright 회귀 테스트 구축
6. 성능·접근성·품질 최종 감사
7. 실서버 연동

---

## 1단계 — 완전한 SSR 다국어 전환

### 목표 프롬프트

```text
# GXWebMail SSR 다국어 구조 전환

## 작업 디렉터리

D:\works\projects\GITHUB\sources\v1.0\gxsoft-webmail-template

## 기준 상태

- main 브랜치
- 기준 커밋: da301fc
- 현재 10개 locale을 지원한다.
- next-intl과 UI 문자열 카탈로그가 존재한다.
- UiTextLocalizer가 MutationObserver로 DOM 텍스트를 후처리하고 있다.

## 목표

GXWebMail의 모든 사용자 노출 문자열을 명시적인 next-intl 메시지로 전환한다.

런타임에 DOM을 탐색해 텍스트를 치환하는 UiTextLocalizer와 UI 문자열 후처리 구조를 제거하고, 서버 렌더링 결과부터 올바른 언어가 출력되도록 한다.

페이지 로딩 중 한국어가 다른 언어로 바뀌는 현상, hydration 불일치, 번역되지 않은 aria-label 문제를 제거한다.

## 구현 요구사항

- UiTextLocalizer와 MutationObserver 기반 번역을 완전히 제거한다.
- UiMessagesProvider가 더 이상 필요하지 않으면 함께 제거한다.
- 모든 사용자 노출 문자열을 의미 기반 next-intl 키로 변경한다.
- 컴포넌트에서 한국어 문장을 번역 키로 사용하지 않는다.
- 다음 영역을 모두 조사한다.
  - 공통 헤더
  - 프로필 메뉴
  - 테마 커스터마이저
  - 사이드바
  - 메일 목록과 읽기 화면
  - 작성 화면
  - 캘린더
  - 주소록
  - 결재
  - 공용 편지함
  - 파일
  - 격리
  - 검색
  - 설정
  - 로그인과 회원가입
  - 설치 화면
  - 관리자 화면
  - Modal, Toast, Popover, EmptyState
  - mock 데이터
- mock 데이터에는 번역된 문자열 대신 locale-neutral ID를 저장한다.
- UI에 표시할 때 ID를 next-intl 메시지로 변환한다.
- 문자열 값으로 상태나 조건을 판별하지 않는다.
- 동적으로 생성되는 toast, 검증 오류, 확인 문구도 번역한다.
- placeholder, title, aria-label, alt 문자열도 번역한다.
- 날짜, 시간, 숫자, 용량, 상대 날짜 formatter를 공통화한다.
- 선택한 locale과 설정된 timezone을 formatter에 반영한다.
- 언어 변경 시 pathname, query, hash를 유지한다.
- 첫 서버 응답부터 올바른 locale이 표시되어야 한다.
- 번역 생성 스크립트에 의존하지 않고 사람이 관리할 수 있는 의미 기반 메시지 구조로 정리한다.
- 10개 locale의 메시지 키와 ICU placeholder 구조를 동일하게 유지한다.

## 보존 범위

- 기존 설정 시스템과 versioned localStorage를 유지한다.
- ThemeContext와 테마 프리셋을 유지한다.
- workspace_sidebar_collapsed 쿠키 기반 SSR 동작을 유지한다.
- 로그인, 회원가입, 설치, 관리자 전용 레이아웃을 변경하지 않는다.
- 화면 디자인과 기능 동작을 불필요하게 변경하지 않는다.
- 기존 미커밋 작업이 있다면 덮어쓰지 않는다.
- 비즈니스 모델과 실제 서버 API는 구현하지 않는다.
- 커밋과 GitHub Push는 수행하지 않는다.

## 검증

- 한국어 문자열 검색 결과를 사용자 노출 문자열과 개발용 데이터로 구분한다.
- 10개 locale의 모든 주요 route를 직접 렌더링한다.
- 초기 HTML과 hydration 이후 텍스트가 동일한지 확인한다.
- 비한국어 locale에서 한국어가 노출되지 않는지 확인한다.
- aria-label과 placeholder도 번역됐는지 확인한다.
- 언어 변경 후 pathname, query, hash 보존을 확인한다.
- 브라우저 콘솔의 hydration 오류를 확인한다.
- npm run check:locales
- npm run lint
- npm run build

## 완료 기준

- UiTextLocalizer와 DOM 후처리 번역이 제거되어 있다.
- 모든 UI 문자열이 명시적인 next-intl 키를 사용한다.
- 10개 locale의 키와 ICU 구조가 일치한다.
- 첫 화면부터 선택 언어가 표시된다.
- locale 검사, lint, production build가 통과한다.
- 변경된 다국어 구조와 번역 관리 방법이 README에 기록되어 있다.
```

---

## 2단계 — 설정값과 업무 화면 연결

### 목표 프롬프트

```text
# GXWebMail 설정값 실제 화면 연결

## 작업 디렉터리

D:\works\projects\GITHUB\sources\v1.0\gxsoft-webmail-template

## 목표

설정 페이지에서 저장한 값이 단순히 localStorage에 남는 수준을 넘어 메일, 작성, 알림, 레이아웃 등 실제 업무 화면의 동작과 표시 방식에 적용되도록 구현한다.

공개 템플릿이므로 서버 API 대신 현재 mock 데이터와 클라이언트 상태를 사용하되, 사용자가 설정 변경 결과를 실제 화면에서 확인할 수 있어야 한다.

## 연결 대상

### 받은편지함 및 읽기

- 목록 밀도를 메일 목록에 적용한다.
- 미리보기 창의 오른쪽, 아래, 숨김 배치를 적용한다.
- 대화형 보기를 메일 스레드 그룹화에 적용한다.
- 읽음 처리 시점을 즉시, 지연, 직접 처리 방식으로 연결한다.
- 외부 이미지 표시 정책을 메일 본문에 적용한다.
- 페이지당 메일 수를 목록 pagination에 적용한다.
- 날짜 표시 형식을 메일 목록에 적용한다.
- 읽지 않은 메일 강조 방식을 실제 목록에 적용한다.

### 작성 및 서명

- 보내는 이름과 기본 발신 주소를 작성 화면에 적용한다.
- 기본 글꼴과 HTML/일반 텍스트 모드를 작성기에 적용한다.
- 선택한 기본 서명을 새 메일에 자동 삽입한다.
- 답장과 전달의 서명 사용 여부를 적용한다.
- 기본 참조와 숨은 참조를 적용한다.
- 자동 저장 주기를 임시보관함 mock 저장과 연결한다.
- 전송 취소 시간을 발송 대기 toast와 연결한다.

### 보내기 및 답장

- 기본 답장 방식을 답장 버튼 동작에 적용한다.
- 원문 포함 방식을 답장 본문에 적용한다.
- 수신 확인 요청 설정을 작성 옵션에 적용한다.
- 예약 발송 기본값을 작성 화면에 적용한다.

### 알림

- 메일 유형별 즉시, 요약, 사용 안 함 설정을 적용한다.
- 브라우저, 이메일, 소리 채널 설정을 적용한다.
- 방해 금지 시간과 주말 정책을 적용한다.
- 알림센터 목록과 unread badge에 반영한다.
- 테스트 알림과 실제 mock 알림이 동일한 처리 계층을 사용하게 한다.

### 필터와 차단 발신자

- 저장된 필터를 mock 메일에 실제로 실행한다.
- 폴더 이동, 라벨, 중요 표시, 읽음, 전달, 삭제 동작을 구현한다.
- 필터 우선순위 순서대로 처리한다.
- 차단된 이메일과 도메인을 수신 메일 분류에 적용한다.
- 필터 테스트 결과에 적용 대상과 실행 동작을 표시한다.

### 테마와 접근성

- 글자 크기, 대비, 모션 감소, 포커스 표시를 모든 업무 화면에 적용한다.
- 목록 밀도와 모서리 스타일을 공통 UI에 적용한다.
- 사이드바 기본 접힘 상태는 기존 SSR 쿠키 동작과 충돌하지 않게 연결한다.

## 상태 설계

- 설정값은 locale-neutral enum과 타입을 사용한다.
- 화면별로 설정 해석 로직을 중복 작성하지 않는다.
- 공통 selector 또는 hook을 만든다.
- 지연 실행 timer는 컴포넌트 해제 시 정리한다.
- 저장 전 draft는 설정 미리보기 범위에서만 적용한다.
- 취소하면 실제 업무 화면도 저장된 상태로 복구한다.
- 테스트 후 mock 데이터가 영구적으로 손상되지 않게 한다.

## 보존 범위

- 현재 설정 정보 구조와 route를 유지한다.
- 기존 메일, 캘린더, 주소록, 결재 레이아웃을 보존한다.
- 실제 메일 서버, SMTP, IMAP, JMAP API는 구현하지 않는다.
- 실제 브라우저 Notification 권한 요청은 하지 않는다.
- 비즈니스 모델은 구현하지 않는다.
- 커밋과 Push는 수행하지 않는다.

## 검증

- 설정 변경 → 미리보기 → 저장 → 업무 화면 반영을 검증한다.
- 취소와 기본값 복원 후 업무 화면이 복구되는지 확인한다.
- 새로고침 후 저장된 동작이 유지되는지 확인한다.
- 메일 읽음 지연 timer와 자동 저장 timer를 점검한다.
- 필터 우선순위와 차단 도메인 처리를 테스트한다.
- 라이트, 다크 및 모든 테마 프리셋에서 확인한다.
- 1440, 1024, 768, 390, 360px에서 확인한다.
- npm run check:locales
- npm run lint
- npm run build

## 완료 기준

- 각 설정값이 실제 업무 화면의 표시 또는 동작을 변경한다.
- 저장, 취소, 초기화 결과가 모든 연결 화면에서 일관된다.
- 설정 해석 로직이 공통화되어 있다.
- 회귀 검증과 README 문서가 완료되어 있다.
```

---

## 3단계 — 설정 저장소 서비스 계층화

### 목표 프롬프트

```text
# GXWebMail 사용자 설정 저장소 서비스 계층 구축

## 작업 디렉터리

D:\works\projects\GITHUB\sources\v1.0\gxsoft-webmail-template

## 목표

현재 SettingsProvider가 직접 사용하는 localStorage 저장 로직을 저장소 인터페이스 뒤로 분리한다.

공개 템플릿에서는 localStorage 구현체를 사용하지만, 향후 실제 API 저장소로 교체해도 UI와 SettingsProvider를 다시 작성하지 않도록 설계한다.

## 구현 요구사항

- UserSettingsRepository 인터페이스를 정의한다.
- 최소한 load, save, reset, migrate, export, import 동작을 제공한다.
- LocalStorageSettingsRepository를 구현한다.
- 테스트와 데모를 위한 MockSettingsRepository를 구현한다.
- 향후 API 구현체가 따라야 할 contract를 문서화한다.
- SettingsProvider는 저장 방식의 세부 구현을 알지 못하게 한다.
- 비동기 load/save 상태를 지원한다.
- loading, saving, saved, error 상태를 구분한다.
- 저장 실패 toast와 재시도 기능을 제공한다.
- JSON 손상, 잘못된 schema version, 일부 필드 누락을 복구한다.
- 마이그레이션은 버전별 순차 함수로 구현한다.
- 알 수 없는 필드는 안전하게 처리한다.
- 저장 데이터 가져오기 전 schema를 검증한다.
- 가져오기 전 현재 설정 백업 또는 확인 UI를 제공한다.
- 설정 내보내기 파일에 schemaVersion과 exportedAt을 포함한다.
- 여러 브라우저 탭에서 storage 이벤트로 설정 변경을 동기화한다.
- 다른 탭에서 변경되었고 현재 draft가 dirty라면 덮어쓰지 말고 충돌 UI를 표시한다.
- 언어, 테마, 사이드바 쿠키처럼 별도 저장 구조가 필요한 설정은 기존 방식을 보존하고 repository와 조정 계층을 둔다.

## 데이터 안전성

- localStorage 접근 실패와 용량 초과를 처리한다.
- SSR 환경에서 window와 localStorage에 접근하지 않는다.
- 잘못된 import 파일이 기존 설정을 손상시키지 않아야 한다.
- 비밀번호, 세션 토큰, 실제 인증정보는 내보내지 않는다.
- mock 보안 설정임을 코드와 UI에서 명확히 구분한다.

## UI 요구사항

- 최초 로딩 시 레이아웃 이동을 최소화한다.
- 저장 중 버튼과 spinner 상태를 표시한다.
- 저장 오류는 다시 시도할 수 있어야 한다.
- 가져오기와 초기화는 ConfirmDialog를 사용한다.
- 내보내기, 가져오기, 초기화 결과는 Toast로 안내한다.
- 모든 상태는 현재 테마와 10개 locale을 지원한다.

## 보존 범위

- 설정 화면 정보 구조와 사용자 기능을 유지한다.
- 실제 서버 API와 데이터베이스는 구현하지 않는다.
- 인증·권한 시스템을 변경하지 않는다.
- 커밋과 Push는 수행하지 않는다.

## 검증

- 신규 설치 기본값 로딩
- 정상 저장과 새로고침 복원
- 이전 schema 마이그레이션
- 손상된 JSON 복구
- 누락 필드 보완
- 저장 실패와 재시도
- 내보내기 후 다시 가져오기
- 잘못된 파일 가져오기 차단
- 다중 탭 변경 동기화와 충돌 처리
- npm run check:locales
- npm run lint
- npm run build

## 완료 기준

- SettingsProvider와 저장 기술이 분리되어 있다.
- localStorage를 API 저장소로 교체할 수 있는 명확한 contract가 있다.
- 마이그레이션과 오류 복구가 검증되어 있다.
- 저장소 구조와 mock 한계가 README에 기록되어 있다.
```

---

## 4단계 — 공통 UI 디자인 시스템 확장

### 목표 프롬프트

```text
# GXWebMail 공통 UI 디자인 시스템 고도화

## 작업 디렉터리

D:\works\projects\GITHUB\sources\v1.0\gxsoft-webmail-template

## 목표

현재 components/ui에 구현된 공통 컴포넌트를 일관된 API, 상태 모델, 테마 토큰과 접근성을 갖춘 GXWebMail 디자인 시스템으로 확장한다.

각 업무 화면과 설정 화면에 흩어진 raw form control과 반복 스타일을 공통 컴포넌트로 교체한다.

## 대상 컴포넌트

기존 Button, IconButton, Input, Textarea, Switch, Checkbox, RadioGroup, Dropdown, Avatar, Progress, Tabs, Panel, Modal, Popover, Toast, Badge, EmptyState, Skeleton, Spinner, Tooltip, SegmentedControl을 점검하고 필요한 기능을 보완한다.

다음 컴포넌트를 추가한다.

- FormField
- Select
- Combobox
- SearchInput
- DatePicker
- TimePicker
- NumberInput
- FileInput
- DataTable
- Pagination
- Menu
- Breadcrumb
- Drawer
- Alert
- CommandPalette

## 컴포넌트 API

- size, variant, tone, disabled, loading 속성을 일관되게 설계한다.
- controlled와 uncontrolled 사용 방식을 명확하게 정의한다.
- label, description, hint, error 연결 방식을 공통화한다.
- ref 전달을 지원한다.
- className 확장을 허용하되 핵심 접근성을 우회하지 못하게 한다.
- 로딩 중 중복 클릭을 방지한다.
- 아이콘 버튼은 반드시 접근 가능한 이름을 갖는다.
- 폼 컴포넌트는 name, required, invalid, describedBy를 지원한다.

## 테마 토큰

- 색상, surface, border, typography, spacing을 중앙 관리한다.
- radius, shadow, density, focus ring, transition을 중앙 관리한다.
- z-index는 임의 숫자 대신 header, sidebar toggle, dropdown, popover, drawer, modal, toast, tooltip 계층 토큰으로 통일한다.

## 접근성

- Modal과 Drawer 포커스 트랩
- Escape 닫기
- 닫은 후 트리거로 포커스 복원
- Dropdown, Menu, Combobox 방향키 탐색
- Tabs의 roving tabindex
- Tooltip의 focus와 hover 지원
- 오류 상태를 색상 외 텍스트와 aria-invalid로 전달
- prefers-reduced-motion 및 사용자 모션 감소 설정 반영
- 키보드만으로 모든 예제 조작 가능

## 적용 범위

- 설정 페이지
- 공통 헤더
- 사이드바
- 작성 Modal
- 메일 목록과 읽기 화면
- 검색과 필터
- 알림과 프로필 Popover

단순한 레이아웃용 div까지 무리하게 컴포넌트화하지 않는다.

## 컴포넌트 카탈로그

- 별도 개발용 /ui-preview route 또는 동등한 카탈로그를 구현한다.
- 운영 내비게이션에는 노출하지 않는다.
- 각 컴포넌트의 variant, size, 상태, dark mode 예제를 표시한다.
- 실제 사용법과 접근성 주의사항을 문서화한다.

## 보존 범위

- 제품 화면 디자인을 전면 재설계하지 않는다.
- 현재 테마 프리셋을 유지한다.
- 외부 UI 프레임워크를 무조건 추가하지 않는다.
- 로그인·설치·관리자 레이아웃을 통합하지 않는다.
- 커밋과 Push는 수행하지 않는다.

## 검증

- 모든 컴포넌트 상태를 카탈로그에서 확인한다.
- 모든 테마 프리셋과 라이트·다크 모드를 확인한다.
- 360px부터 데스크톱까지 가로 스크롤을 검사한다.
- 키보드 탐색과 포커스 복원을 검사한다.
- 중첩 button과 잘못된 HTML 구조를 검사한다.
- hydration과 콘솔 오류를 검사한다.
- npm run check:locales
- npm run lint
- npm run build

## 완료 기준

- 반복되는 raw control 스타일이 공통 UI로 대체되어 있다.
- 컴포넌트 API와 토큰이 일관적이다.
- 개발자가 확인할 수 있는 카탈로그와 문서가 존재한다.
- 접근성, lint, production build 검증이 통과한다.
```

---

## 5단계 — Playwright 회귀 테스트 구축

### 목표 프롬프트

```text
# GXWebMail 브라우저 회귀 테스트 자동화

## 작업 디렉터리

D:\works\projects\GITHUB\sources\v1.0\gxsoft-webmail-template

## 목표

현재 수동으로 확인하는 설정, 다국어, 테마, 반응형, 접근성 동작을 Playwright 기반 자동 회귀 테스트로 전환한다.

단순히 페이지가 열리는지만 확인하지 말고 사용자가 설정을 변경하고 저장한 뒤 실제 화면에 반영되는 전체 흐름을 검증한다.

## 테스트 기반 구축

- Playwright 설정과 테스트 전용 npm script를 추가한다.
- 테스트 간 localStorage, cookie, sessionStorage를 격리한다.
- 테스트용 mock 초기화 helper를 만든다.
- locale과 viewport를 재사용할 fixture를 구성한다.
- console error, pageerror, hydration 오류를 자동 실패 처리한다.
- 테스트 결과와 실패 screenshot을 산출한다.
- 불필요한 고정 sleep 대신 locator와 명시적 상태 대기를 사용한다.

## 필수 테스트

### Route

- 설정 landing과 15개 하위 route
- /rules canonical redirect
- /settings?tab=... 호환 redirect
- 존재하지 않는 설정 route 처리
- 로그인, 회원가입, 설치, 관리자 전용 레이아웃 보존

### 설정 상태

- 최초 기본값
- 값 변경 후 dirty 상태
- 저장
- 취소
- 기본값 복원
- 새로고침 후 유지
- 저장되지 않은 상태에서 링크 이동
- 브라우저 뒤로 가기 경고
- 변경 버리기와 계속 편집

### CRUD

- 서명 생성·수정·삭제
- 라벨 생성·중복 검증·정렬·삭제·undo
- 필터 생성·수정·순서 변경·테스트·삭제
- 차단 발신자 추가·검색·필터·해제
- 발신 별칭 추가·중복 검증·삭제
- 연동 연결·동기화·설정·연결 해제
- 보안 세션 해제와 백업 코드 재발급
- 단축키 변경과 충돌 검증

### 다국어

- 지원 10개 locale의 설정 route smoke test
- 비한국어 locale에서 한국어 잔존 검사
- 언어 변경 후 pathname, query, hash 유지
- 날짜와 시간대 표시
- aria-label, placeholder, validation, toast 번역

### 테마와 반응형

- 모든 테마 프리셋
- 라이트, 다크, 시스템 모드
- 1440, 1024, 768, 390, 360px
- 가로 스크롤, header 겹침, sidebar와 drawer
- 모바일 하단 safe area
- 설정 메뉴와 모바일 뒤로 가기

### 접근성

- 키보드 Tab 순서
- Modal 포커스 트랩
- Escape 닫기
- 포커스 복원
- switch, checkbox, radio, tabs ARIA 상태
- 가능하면 axe 접근성 검사 추가

## 테스트 품질

- 구현 세부 className에 과도하게 의존하지 않는다.
- role, label, visible text, test id를 목적에 맞게 사용한다.
- 같은 기능을 중복 테스트하지 않는다.
- 테스트 실패 시 원인을 파악할 수 있는 이름을 사용한다.
- 병렬 실행에서도 서로 상태가 충돌하지 않아야 한다.
- flaky test를 재시도로 숨기지 않는다.

## CI

- pull request에서 locale, lint, build, 핵심 browser test가 실행되게 한다.
- 전체 브라우저 행렬과 시각 회귀는 필요에 따라 별도 workflow로 분리한다.
- 생성 산출물과 cache 정책을 문서화한다.

## 보존 범위

- 테스트를 통과시키기 위해 제품 기능을 약화하지 않는다.
- 실제 서버나 외부 계정에 연결하지 않는다.
- 테스트 중 실제 알림 권한이나 외부 메시지를 전송하지 않는다.
- 커밋과 Push는 수행하지 않는다.

## 검증

- npm run check:locales
- npm run lint
- npm run build
- 새 Playwright 핵심 테스트
- 전체 Playwright 테스트

## 완료 기준

- 핵심 사용자 설정 흐름이 자동화되어 있다.
- 10개 locale과 주요 viewport가 자동 검증된다.
- console, hydration, 접근성 오류가 테스트 실패로 처리된다.
- 로컬 및 CI 실행 방법이 README에 기록되어 있다.
```

---

## 6단계 — 성능·접근성·품질 최종 감사

### 목표 프롬프트

```text
# GXWebMail 성능·접근성·반응형 최종 고도화

## 작업 디렉터리

D:\works\projects\GITHUB\sources\v1.0\gxsoft-webmail-template

## 목표

GXWebMail의 설정 시스템과 전체 업무 화면을 대상으로 성능, 접근성, 시맨틱 HTML, 반응형 레이아웃, hydration 안정성을 최종 감사하고 발견된 문제를 수정한다.

기능이나 디자인을 불필요하게 재설계하지 말고 측정 가능한 문제를 근거로 개선한다.

## 감사 대상

- 메일
- 캘린더
- 주소록
- 결재
- 공용 편지함
- 파일
- 격리
- 검색
- 설정 전체
- 공통 헤더
- 사이드바와 모바일 drawer
- 작성 Modal
- 알림과 프로필 Popover
- 로그인과 회원가입
- 설치
- 관리자 화면

## 성능

- 초기 JavaScript bundle과 route별 client component 범위를 조사한다.
- 불필요한 use client 경계를 축소한다.
- 중복 context rerender와 큰 목록의 렌더링 비용을 조사한다.
- memoization은 측정 근거가 있을 때만 적용한다.
- 동적 import가 유효한 무거운 UI를 분리한다.
- layout shift와 폰트 변경 현상을 확인한다.
- 이미지 크기와 lazy loading을 점검한다.
- MutationObserver, 전역 event listener, timer 누수를 확인한다.
- localStorage 초기화와 hydration 비용을 확인한다.

## 접근성

- landmark와 heading 계층
- label, hint, error 연결
- 중첩 button 및 잘못된 인터랙티브 요소
- focus-visible과 키보드 조작
- Modal과 Drawer 포커스 트랩
- Escape와 포커스 복원
- ARIA state
- 색상 대비
- 색상에만 의존하는 상태 표시
- reduced motion
- 스크린 리더 읽기 순서
- toast와 오류 메시지 live region

## 반응형

1440, 1280, 1024, 768, 390, 360px에서 다음을 확인한다.

- 가로 스크롤
- header 제목과 action 겹침
- sidebar와 content 너비
- drawer z-index
- Popover 화면 이탈
- Modal 높이와 safe area
- 고정 저장바와 모바일 하단 영역
- 긴 독일어·프랑스어 문구 잘림
- 중국어·일본어 줄바꿈
- 확대 200% 상태

## 코드 품질

- 중복 컴포넌트와 죽은 코드를 제거한다.
- 사용하지 않는 route와 이전 설정 구현을 제거한다.
- raw 색상과 z-index를 토큰으로 통합한다.
- 문자열 기반 상태 판별을 제거한다.
- any와 불필요한 type assertion을 축소한다.
- 브라우저 전용 API의 SSR 안전성을 확인한다.
- 이벤트 listener와 timer cleanup을 확인한다.
- README의 실제 구현 상태와 코드가 일치하는지 확인한다.

## 성능 기준

가능한 환경에서 다음을 측정하고 결과를 기록한다.

- LCP
- CLS
- INP 또는 주요 인터랙션 지연
- 초기 route bundle
- 설정 route 이동 시간
- 대형 메일 목록 렌더링 시간

개발 환경과 production build 결과를 구분한다.

## 보존 범위

- 공개 템플릿의 mock 데이터 구조를 유지한다.
- 실제 백엔드와 인증 시스템을 구현하지 않는다.
- 측정 근거 없이 대규모 구조 개편을 하지 않는다.
- 로그인·설치·관리자 레이아웃을 통합하지 않는다.
- 비즈니스 모델은 구현하지 않는다.
- 커밋과 Push는 수행하지 않는다.

## 검증

- 기존 자동화 테스트
- npm run check:locales
- npm run lint
- npm run build
- 주요 route 브라우저 검증
- 전체 viewport 검사
- 키보드 및 Modal 포커스 검사
- console, pageerror, hydration 오류 검사
- 접근성 자동 검사와 수동 점검

## 완료 기준

- 발견된 문제와 수정 결과가 근거와 함께 정리되어 있다.
- 치명적 접근성 오류와 hydration 오류가 없다.
- 360px 및 200% 확대에서 핵심 기능을 사용할 수 있다.
- 주요 route에 가로 스크롤과 overlay 충돌이 없다.
- 성능 측정 결과와 남은 한계가 README 또는 별도 감사 문서에 기록되어 있다.
- locale, lint, build, browser regression 검증이 통과한다.
```

---

## 7단계 — 실서버 연동

### 현재 승인·구현·검증 상태 (2026-09-28)

이 절은 이 작업에 대해 사용자가 별도로 지시한 **GXWebMail ↔ TASTEMAIL 연동**의 현재 상태다. 아래의 원래 승인 게이트와 목표 프롬프트는 과거 계획으로 보존한다. 이번 승인으로 서버 방화벽·배포·데이터베이스 변경이나 실계정 발송 검증까지 자동 승인된 것은 아니다.

| 범위 | 현재 코드 상태 | 아직 필요한 증거 |
| --- | --- | --- |
| mock/live 경계와 인증 | 서버 전용 API 주소, HttpOnly 세션, MFA·로그아웃·세션 오류 분리 | HTTPS 또는 같은 호스트 loopback에서 실제 계정 로그인·만료·로그아웃 확인 |
| 개인 메일 읽기 | JMAP 메일함·목록·상세·검색·첨부 다운로드와 사이드바 요약 연결 | 실제 메일함 ID·읽지 않음 수·페이지 이동·본문·검색 결과 일치 확인 |
| 개인 메일 변경·작성 | 읽음·별표·시스템 편지함 이동, 일반 텍스트 초안·업로드·발송 큐 제출 연결 | 승인된 테스트 계정에서 변경 후 재조회, 통제된 수신자에게 발송 결과 확인 |
| 부가 업무 | 개인 주소록과 받는 사람 추천, 캘린더, 결재, 공용 메일함 읽기, 필터·서명·보안 일부, 관리자 격리 조회·개별 해제·삭제 연결 | 기능별 권한·충돌·실제 응답 검증; 격리 변경은 관리자 테스트 계정에서만 |
| 미연동 경계 | mock 조직도·일부 설정/관리자 시연을 live 데이터와 분리; 공용 계정 변경, 개인 영구 삭제, HTML 작성·예약 발송, 격리 일괄 처리는 미연동 | 서버 계약과 사용자 승인 범위를 확인한 뒤 별도 설계 |
| 품질 게이트 | 10개 언어 키 검사와 변경 파일 정적 검사를 수시 수행 | 변경 입력을 기준으로 필요한 lint·production build·반응형·hydration·콘솔 회귀를 각각 확인 |

다음 실행 순서는 다음과 같다.

1. 사용자 배포 환경에서 브라우저↔Next.js HTTPS 및 Next.js↔TASTEMAIL의 보호된 서버 경로를 확인한다. LAN 평문 HTTP로 비밀번호나 bearer token을 보내지 않는다. 무인증 `/health` 성공은 실계정 동작의 증거가 아니다.
2. 실제 테스트 계정으로 로그인·세션·메일함·목록·상세·검색을 **읽기 전용으로** 검증한다. UI의 값과 API 결과가 일치하지 않으면 변환 계층을 수정하고 mock으로 대체하지 않는다.
3. 읽기 결과가 확인된 뒤 승인된 테스트 계정에서 읽음·별표·이동·보관·스팸·휴지통을 기능별로 검증한다. 실패·응답 불명확 상태에는 서버 재조회와 중복 요청 방지를 적용한다.
4. 통제된 수신자와 첨부 범위를 정한 뒤 초안·업로드·발송을 검증한다. 격리 해제·영구 삭제와 캘린더 초대처럼 외부 효과가 있는 동작도 별도 승인된 대상에서만 확인한다.
5. mock/live 경계, 10개 언어, 모바일·데스크톱, 접근성·hydration·콘솔을 회귀 확인하고 README 및 `docs/TASTEMAIL_INTEGRATION_GAPS.md`의 검증 상태를 갱신한다. 입력이 바뀌지 않은 성공 게이트는 반복하지 않는다.

현재의 정적 검사 통과나 소스 계약 일치는 위 실계정 검증을 대체하지 않는다. 이 단계가 완료됐다고 표시하지 않는다.

### 필수 사용자 승인 게이트

- 실서버 연동은 사용자의 별도 명시적 동의가 있어야만 착수할 수 있다.
- “템플릿 고도화를 계속 진행”, “다음 단계 진행” 또는 1~6단계 완료는 실서버 연동 승인으로 해석하지 않는다.
- 착수 전 사용자에게 연결 대상 서버, 적용 기능, 사용할 API·프로토콜, 필요한 자격증명, 변경 범위와 검증 환경을 먼저 제시한다.
- 사용자가 승인한 서버와 기능 범위 안에서만 작업한다.
- 승인받지 않은 API 탐색, 실제 로그인, 자격증명 입력, 환경변수 추가, 외부 요청, mock 제거 및 live 구현체 활성화를 수행하지 않는다.
- 승인 범위가 불명확하거나 서버 contract가 제공되지 않았다면 7단계를 시작하지 않고 확인을 요청한다.

### 착수 조건

다음 조건을 모두 만족한 뒤에만 실서버 연동을 시작한다.

- 사용자가 해당 실서버 연동의 대상과 범위를 명시적으로 승인했다.
- SSR 다국어 전환이 완료되어 있다.
- 설정값이 mock 업무 화면에 실제로 반영된다.
- 저장소와 서비스 인터페이스가 UI에서 분리되어 있다.
- 공통 UI 디자인 시스템이 안정되어 있다.
- 핵심 사용자 흐름의 Playwright 회귀 테스트가 존재한다.
- 성능·접근성·반응형 최종 감사가 완료되어 있다.
- mock 데이터와 실제 서버 데이터의 경계가 문서화되어 있다.

### 목표 프롬프트

```text
# GXWebMail 실서버 연동

## 작업 디렉터리

D:\works\projects\GITHUB\sources\v1.0\gxsoft-webmail-template

## 전제 조건

이 단계는 GXWebMail 프런트엔드 템플릿 고도화 1~6단계가 모두 완료되고 검증된 이후에만 수행한다.

1~6단계의 완료는 실서버 연동에 대한 동의가 아니다. 실제 서버 조사, 접속, 자격증명 설정, API 호출 또는 live 구현 작업을 시작하기 전에 사용자에게 대상 서버와 연동 범위를 제시하고 별도의 명시적 승인을 받아야 한다. 승인이 없으면 이 단계는 수행하지 않는다.

기존 UI 컴포넌트, 상태 인터페이스, 다국어 구조와 브라우저 회귀 테스트를 유지하면서 mock repository와 mock service를 실제 서버 구현체로 교체한다.

## 목표

템플릿에서 정의된 사용자 흐름과 데이터 contract를 기준으로 실제 웹메일 서버를 단계적으로 연결한다.

UI 컴포넌트가 API 세부 형식이나 네트워크 구현에 직접 의존하지 않도록 repository와 service 계층을 통해 연동한다.

## 착수 전 조사

- 아래 조사는 사용자가 실서버 연동을 승인한 범위 안에서만 수행한다.
- 실제 서버의 인증 방식과 세션 정책
- 메일 프로토콜과 API 범위
- REST, GraphQL, JMAP 등 실제 데이터 API contract
- 메일함, 메일, 스레드, 첨부 파일 모델
- 작성, 임시저장, 발송, 예약 발송 API
- 주소록과 캘린더 API
- 결재와 공용 편지함 API
- 검색, 격리, 파일, 필터, 차단 발신자 API
- 사용자 설정 저장 API
- 알림 전달 방식과 실시간 연결 방식
- 오류 코드, rate limit, pagination, 동시성 정책
- 서버가 제공하지 않는 템플릿 기능과 대체 처리 범위

확인되지 않은 API를 추측하여 구현하지 않는다. 서버 contract가 없는 기능은 mock 상태로 유지하고 미연동 상태를 명확히 표시한다.

## 연동 순서

### 1. 인증과 세션

- 로그인, 로그아웃, 세션 만료
- 사용자 프로필과 권한
- CSRF, cookie, token 정책
- 인증 오류와 재로그인 흐름
- 기존 공개 템플릿의 mock 인증과 명확히 분리

### 2. 읽기 전용 메일 데이터

- 메일함 목록과 용량
- 메일 목록과 pagination
- 메일 상세와 스레드
- 첨부 파일 메타데이터
- 검색 결과
- loading, empty, error, retry 상태

### 3. 메일 상태 변경

- 읽음·안 읽음
- 중요 표시
- 이동, 보관, 스팸, 휴지통
- 복구와 영구 삭제
- optimistic update와 실패 rollback

### 4. 작성과 발송

- 임시저장
- 새 메일, 답장, 전체 답장, 전달
- 첨부 파일 업로드
- 발송과 전송 취소
- 예약 발송
- 중복 전송 방지와 idempotency

### 5. 부가 업무 기능

- 주소록
- 캘린더
- 결재
- 공용 편지함
- 파일
- 격리
- 필터와 차단 발신자
- 사용자 설정
- 알림과 실시간 업데이트

## 아키텍처 요구사항

- UI는 mock 구현체와 실제 API 구현체를 동일한 interface로 사용한다.
- API DTO와 UI domain model을 분리한다.
- DTO 변환은 adapter 계층에서 수행한다.
- 요청 취소, timeout, retry, pagination을 공통화한다.
- 서버 오류를 사용자 메시지와 개발 진단 정보로 분리한다.
- 캐시 갱신과 optimistic update 정책을 명시한다.
- 인증정보와 비밀값을 클라이언트 코드에 포함하지 않는다.
- 환경별 endpoint와 기능 flag를 명확히 관리한다.
- mock 모드는 계속 실행 가능하게 유지한다.

## 보안 및 데이터 보호

- 실제 자격증명, token, 개인정보를 저장소에 커밋하지 않는다.
- 민감한 메일 본문과 첨부 파일을 로그에 출력하지 않는다.
- 서버 권한 검사를 클라이언트 UI로 대체하지 않는다.
- HTML 메일 본문을 안전하게 정제한다.
- 외부 이미지, 첨부 다운로드, 링크 이동 정책을 적용한다.
- 세션 만료와 권한 부족을 구분하여 처리한다.

## 마이그레이션 원칙

- 전체 mock을 한 번에 제거하지 않는다.
- 기능 단위로 실제 구현체를 연결한다.
- 연동되지 않은 기능은 명시적으로 mock임을 표시한다.
- 각 기능 전환 후 기존 Playwright 회귀 테스트를 실제 API contract에 맞게 확장한다.
- 서버 장애 시 조용히 mock 데이터로 대체하지 않는다.
- mock 모드와 live 모드를 설정으로 명확히 분리한다.

## 검증

- API contract 및 schema 검사
- 인증과 세션 만료 흐름
- loading, empty, error, retry 상태
- pagination과 검색 조건
- optimistic update와 rollback
- 첨부 업로드·다운로드
- 중복 발송 방지
- 권한별 route와 동작 제한
- 네트워크 지연과 실패 상황
- 기존 locale, theme, responsive, accessibility 회귀 테스트
- npm run check:locales
- npm run lint
- npm run build
- 실제 서버 연동 테스트

## 완료 기준

- mock과 live 구현체가 같은 contract를 사용한다.
- 핵심 메일 읽기·상태 변경·작성·발송 흐름이 실제 서버와 연결되어 있다.
- 서버 오류와 세션 만료가 사용자에게 명확히 안내된다.
- 연동된 기능과 아직 mock인 기능이 문서에 구분되어 있다.
- 비밀값과 개인정보가 코드, 로그, 테스트 산출물에 포함되지 않는다.
- 자동화된 회귀 테스트와 production build가 통과한다.

## 제외 범위

- 서버 contract가 확인되지 않은 기능의 추측 구현
- 템플릿 UI의 불필요한 전면 재설계
- 기존 mock 모드의 즉시 제거
- 확인되지 않은 운영 배포
- 사용자 요청 없는 커밋과 GitHub Push
```

## 단계별 운영 원칙

- 각 단계 시작 전 현재 브랜치와 작업 트리 상태를 확인한다.
- 이전 단계에서 통과한 검증은 입력이 변경되지 않았다면 재사용한다.
- 단계별 변경 범위와 검증 결과를 명확히 분리한다.
- 한 단계가 완료될 때마다 별도 영문 커밋으로 기록하는 방식을 권장한다.
- 1~6단계는 프런트엔드 템플릿의 독립 실행 완성도를 우선한다.
- 7단계는 별도의 사용자 동의가 있을 때만 시작하며, mock과 live 구현을 동시에 유지하면서 승인된 기능 단위로 서버를 연결한다.
- 실제 커밋과 원격 Push는 사용자의 명시적인 요청 후 수행한다.

## 2026-09-28 실서버 연동 진행 현황

- 사용자가 TASTEMAIL 서버 연동을 요청하고 API 주소 `192.168.0.109:7531`을 제공했다. 소스 계약 조사와 무인증 연결 확인만 수행했으며 실제 계정 자격증명은 사용하지 않았다.
- `GXWEBMAIL_DATA_MODE=mock|live`를 분리했다. mock이 기본값이고, live의 서버 전용 API 주소는 사용자 지시에 따라 `http://127.0.0.1:7531`을 기본값으로 사용한다. 다른 호스트에서 실행할 때는 같은 호스트 배치 또는 보호된 로컬 터널이 필요하며, 평문 LAN API URL은 거부한다.
- live 로그인/MFA·세션 확인·로그아웃, JMAP 메일함·목록·본문·페이지 이동·첨부 메타데이터·다운로드·메일 검색, 개인 주소록·캘린더·공용 편지함 조회 및 일부 변경 경로를 구현했다. 개인 메일의 읽음·별표·시스템 편지함 이동과 일반 텍스트 작성·임시저장·첨부 업로드·발송 큐 제출도 코드에 연결했다. 영구 삭제·예약 발송·공용 계정 변경은 비활성화되어 있으며 실제 계정의 변경·발송 결과는 검증하지 않았다.
- 로컬 합성 TASTEMAIL 서버로 일부 세션·JMAP·주소록·일정·공용 편지함 조회와 인증 실패·MFA·권한 부족·요청 제한·서버 장애 경로를 검증한 기록이 있다. 이후 추가한 캘린더 초대·취소 보호와 메일 이동 보존 사례는 작성했지만 실행하지 않았다. 배포 API의 무인증 `/health`는 이후 HTTP 200으로 확인되었으나, 배포 버전과 실제 계정·메일 데이터 일치는 미검증이다.
- live 검색에서는 mock 사람·파일 결과를, live 주소록에서는 mock 조직도를, live 캘린더에서는 mock AI 일정·회의실 현황을, live 공용 편지함에서는 mock 예약 발송·템플릿을 표시하지 않는다. 다른 업무 화면에는 mock 기능이 남아 있다. 소스에서 지원 또는 계약 미확인으로 분류한 상세 목록은 `docs/TASTEMAIL_INTEGRATION_GAPS.md`를 참조한다.
- live 로그인은 `/health`를 선행 조건으로 삼지 않고 같은 출처의 세션 경로에 인증을 제출한다. 무인증 상태 확인은 선택적 진단일 뿐 실제 계정 로그인이나 DB 준비 상태를 대신하지 않는다.
- live 로그인에서는 시연용 가입·설치 링크를 숨기고, `/signup` 직접 진입도 가짜 계정 생성 대신 관리자 발급 안내로 전환했다. mock 회원가입 시연은 유지하며 전용 레이아웃은 변경하지 않았다.
- live `/setup` 직접 진입에서는 시연용 DB·DNS 검사와 초대 발송 성공을 보여주지 않고 설치 불가 안내만 표시한다. mock 설치 마법사는 유지한다.
- live 관리자 세 경로는 공통 레이아웃에서 시연 데이터 대신 미연동 안내를 표시한다. mock 관리자 UI를 유지하되 실제 Rust 관리자 권한/데이터와 혼동하지 않는다.
- 이후 live `/files`에서 JMAP 메일 첨부 검색·다운로드를 연결하고 독립 파일 저장소·공유 링크 시연 데이터를 숨겼다. live `/security`는 `/api/user/security`의 MFA·세션·이벤트를 표시하고 다른 기기 세션의 개별·전체 해제를 확인 후 요청한다. mock 보안 점수와 나머지 가짜 변경 동작은 숨긴다. 두 화면과 세션 해제는 실제 계정 검증이 아직 없다.
- live `/settings/signature`는 서버의 발신자별 서명 GET/PATCH를 별도 UI로 연결하고, 새 일반 텍스트 작성에는 기본 발신자 텍스트 서명을 적용한다. HTML 서명은 저장할 수 있지만 GXWebMail live 작성은 아직 HTML 본문을 만들지 않는다. 실제 계정 저장·발송 결과는 검증하지 않았다.
- 로그아웃은 서버 세션 폐기 성공과 로컬 쿠키만 삭제된 불확실한 결과를 구분한다. 읽기 페이지의 끝에서 메일 이동 등으로 현재 페이지가 비면 유효한 마지막 페이지로 이동한다. 이 경계도 실제 계정에서는 검증하지 않았다.
- 다음 게이트는 사용자가 관리하는 배포 환경에서 실제 계정의 읽기 전용 데이터 일치를 확인하는 것이다. 변경·발송은 승인된 테스트 계정과 대상이 정해진 뒤 별도 검증한다.
