# GXWebMail

**언어:** [English](README.md) · 한국어

기업용 웹메일 클라이언트(국내 사내 메일 시스템, Google Workspace·Microsoft 365 메일과 유사한 성격)의 고품질 UI 프로토타입입니다. Next.js App Router 기반이며, 전부 클라이언트 사이드로 동작하고 별도 백엔드가 없습니다.

## 이 프로젝트의 성격

이 프로젝트는 **디자인·인터랙션 프로토타입**이며, 실제 서비스되는 메일 서버/클라이언트가 아닙니다.

- **백엔드도 데이터베이스도 없습니다.** 받은편지함, 관리자 콘솔, 주소록, 캘린더 등 모든 데이터는 `lib/`의 mock 데이터로 시드된 React state로만 존재합니다. 대부분은 새로고침하면 초기화되지만, 사용자가 저장한 설정과 게시한 테마는 의도적으로 브라우저 저장소에 유지됩니다.
- **실제 인증이 없습니다.** 로그인/회원가입은 값이 비어있지만 않으면 무엇을 입력해도 통과하며, `localStorage`에 플래그 하나만 남깁니다.
- 일부 기능은 의도적으로 "UI만 있고 실제 로직은 없는" 데모입니다 — 작성 화면의 AI 톤 변경 버튼, 시작 가이드(product tour)의 체크리스트, 공용 메일함 화면의 예약 발송 흐름이 여기에 해당합니다.
- mock 데이터 기반이긴 하지만, **모든 인터랙션 요소는 완전히 연결되어 있어야 합니다.** 무언가를 클릭했을 때 항상 눈에 보이는 실제 상태 변화나 피드백(토스트, 모달, 목록 갱신 등)이 있어야 하며, 아무 반응 없는 버튼은 없어야 합니다. 그런 버튼을 발견했다면 버그입니다.

## 기술 스택

- [Next.js 16](https://nextjs.org) (App Router), [React 19](https://react.dev), TypeScript
- [Tailwind CSS v4](https://tailwindcss.com)
- 아이콘: [lucide-react](https://lucide.dev)

## 시작하기

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)을 엽니다. 로그인/회원가입 관련 라우트는 `/login`으로 이동하지만, 메인 메일 화면(`/`)은 로그인 없이도 바로 접근됩니다 — 어차피 전부 mock 상태이기 때문입니다.

기타 스크립트:

```bash
npm run build   # 프로덕션 빌드
npm run start   # 프로덕션 빌드 서빙
npm run lint    # eslint
npm run check:locales # locale 키·문구 검사
```

화면 문구는 `messages/{locale}.json`의 의미 기반 `next-intl` 메시지로 서버와 클라이언트에서 직접 렌더링합니다. `npm run check:locales`는 10개 언어의 키와 ICU 변수 일치 여부를 확인합니다. mock 데이터의 상태·분류 값은 안정적인 ID로 보관하고 화면에서 번역하며, 사람 이름·작성된 메일·파일 이름은 예시 콘텐츠로 유지합니다.

## 사용자 설정 시스템

`/{locale}/settings`는 일반, 메일, 메일 관리, 계정으로 나눈 사용자 설정 진입 화면입니다. 데스크톱에서는 왼쪽 설정 메뉴와 상세 화면을 함께 표시하고, 모바일에서는 그룹별 목록에서 상세 route로 이동합니다. 모바일 상세 화면에는 설정 목록으로 돌아가는 동작이 제공되며 가로 스크롤 탭을 사용하지 않습니다.

| 그룹 | 설정 route |
| --- | --- |
| 일반 | `/settings/locale`, `/settings/theme`, `/settings/accessibility` |
| 메일 | `/settings/signature`, `/settings/inbox-display`, `/settings/sending`, `/settings/away`, `/settings/notifications` |
| 메일 관리 | `/settings/labels`, `/settings/filters`, `/settings/blocked-senders` |
| 계정 | `/settings/account`, `/settings/security`, `/settings/integrations`, `/settings/shortcuts` |

모든 설정 route에는 준비 중 화면이나 읽기 전용 상태 카드 대신 실제로 변경 가능한 컨트롤이 있습니다. 공통 설정 행과 패널, 저장 작업 표시줄을 사용하며 저장, 취소, 기본값 복원, 입력 검증, 삭제 확인, undo 및 toast 피드백을 일관되게 제공합니다.

사용자 설정 상태는 다음 세 단계로 구분합니다.

1. 소스에 포함된 타입 안전 기본값
2. 사용자가 마지막으로 저장한 snapshot
3. 현재 화면에서 편집 중인 draft

저장한 값은 schema version을 포함한 `gxmail:user-settings:v1` localStorage 항목에 기록됩니다. 변경 중인 draft는 자동 저장하지 않으며, 저장 버튼은 실제 변경이 있을 때만 활성화됩니다. 취소는 마지막 저장 상태로 돌아가고 기본값 복원은 기본값을 새 draft로 준비합니다. 저장하지 않은 설정 또는 테마 변경이 있으면 내부 링크 이동과 브라우저 종료 전에 이탈 경고가 동작합니다.

언어, 테마, 사이드바 상태는 기존 전역 동작과 연결됩니다.

- 언어 변경은 `next-intl` locale route를 사용하며 현재 pathname, query, hash를 유지합니다.
- 테마 및 화면 설정은 전역 커스터마이저와 같은 `ThemeContext`를 사용하고 게시하기 전까지 live preview로 적용됩니다.
- 사이드바 기본 접힘 상태는 `workspace_sidebar_collapsed` 쿠키를 서버에서 읽어 첫 렌더에 반영하므로 새로고침 시 펼쳐졌다가 접히는 현상이 없습니다.
- 접근성 설정은 글자 크기, 고대비, 모션 감소, 포커스 강화와 보조 기술 관련 값을 실제 문서 속성 및 CSS 변수에 반영합니다.

`/settings/accessibility`는 사용자 환경 설정이고 최상위 `/accessibility`는 별도 점검/참고 화면입니다. `/settings/shortcuts`는 편집 화면이며 최상위 `/shortcuts`는 인쇄 가능한 전체 목록입니다. 기존 `/rules`는 상태가 중복되지 않도록 canonical `/settings/filters`로 이동합니다.

비밀번호 변경, 세션 해제, 백업 코드 재발급, 서비스 연결과 동기화도 화면의 typed mock 상태를 실제로 바꾸지만 서버나 외부 서비스에는 요청하지 않습니다. 이는 공개 프론트엔드 템플릿의 동작 시연 범위입니다.

## 프로젝트 구조

```
app/                  라우트 (App Router) — 화면·섹션별 폴더
components/
  admin/              관리자 콘솔 (13개 탭 + 모바일 버전)
  banner/             전역/인라인 배너
  calendar/           캘린더 그리드 뷰 (일/주/월/모바일)
  compose/            메일 작성 모달 + 일반/서식 텍스트 공용 에디터
  contacts/           주소록 + 조직도 뷰
  customizer/         실시간 테마 커스터마이저 패널
  layout/             앱 셸, 내비게이션 레일, 상단바, 사이드바
  mail/               받은편지함 목록, 읽기창, 회의 초대 카드
  notifications/      알림 벨 팝오버
  overlay/            공용 Modal / Drawer / ConfirmDialog / BottomSheet / ActionSheet
  settings/           그룹형 사용자 설정과 데스크톱·모바일 상세 화면
  toast/              토스트 스택
  tour/               최초 실행 가이드 투어
  ui/                 테마 대응 폼·상태·피드백 공용 컴포넌트
context/              전역 React 상태: 메일, 설정, 사이드바, 테마, 토스트
lib/                  mock 데이터(기능별 파일 하나씩)와 소규모 유틸리티
types/                기능별로 묶인 공용 TypeScript 타입
```

## 디자인 시스템 메모

- 폼과 상호작용에는 `components/ui/`의 테마 대응 `Button`, `IconButton`, `Input`, `Textarea`, `Switch`, `Checkbox`, `RadioGroup`, `Dropdown`, `SegmentedControl`, `Avatar`, `Progress`, `Tabs`, `Panel`, `Modal`, `Popover`, `Toast`, `Badge`, `EmptyState`, `Skeleton`, `Spinner`, `Tooltip`을 재사용합니다.
- disabled가 아닌 모든 `<button>` / `[role="button"]`에는 전역적으로 `cursor: pointer`가 적용됩니다 (`app/globals.css` 참고) — 브라우저 기본값은 `<button>`에 이 커서를 적용하지 않습니다.
- 앱 전체는 커스터마이저와 테마 설정 화면에서 실시간으로 테마를 바꿀 수 있습니다(기본/강조 색상, 폰트, 밀도, 모서리, 레이아웃 스타일, 사이드바 위치, 라이트/다크). 게시된 테마 설정은 `localStorage`에 저장되며 두 화면은 같은 `ThemeContext` 상태를 공유합니다.

## 알려진 한계 (백엔드가 없다는 전제하에 의도된 것)

- 페이지를 새로고침하면 메일, 관리자 콘솔 등 대부분의 변경 가능한 상태가 mock 시드 데이터로 리셋됩니다.
- 사용자 설정은 브라우저에만 저장됩니다. 사이트 데이터를 지우면 사라지며 사용자·기기 간에 동기화되지 않습니다.
- 다중 사용자, 실시간 동기화, 서버 사이드 검증이 없습니다.
- 일부 관리자·보안 작업(계정 삭제, 세션 강제 종료 등)은 로컬 상태만 바꾸고 토스트를 띄울 뿐, 실제로 어딘가에 요청을 보내지 않습니다.

## 기여 · 확장 시 참고

새 화면이나 기능을 추가할 때는 먼저 `components/ui/`와 `components/settings/SettingsPrimitives.tsx`를 확인하세요. 기존 프리미티브와 설정 패턴을 재사용해야 현재 테마, 키보드 접근성, 오류 연결과 반응형 동작을 일관되게 유지할 수 있습니다. 이 Next.js 버전과 관련된 에디터/에이전트 설정 관련 안내는 `AGENTS.md`를 참고하세요.
