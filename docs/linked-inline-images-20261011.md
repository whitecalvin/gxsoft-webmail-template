# 연결 계정 CID 이미지

## 연결 범위

연결 계정의 캐시 HTML 본문이 참조하는 CID만 기존 첨부 다운로드 GET BFF로 읽는다. 정확한 연결 계정/폴더/UIDVALIDITY/UID/첨부 번호와 metadata 크기 검사를 재사용한다. 기본 계정의 JMAP blob ID를 만들거나 기본 첨부 경로를 호출하지 않는다. SSR에서는 요청하지 않고 본문 컴포넌트가 마운트된 뒤 캐시 GET만 실행한다. 외부 IMAP 접속·동기화·발송·메일 상태 변경은 자동 실행하지 않는다.

허용 대상은 disposition:inline인 PNG/JPEG/GIF/WebP와 본문 src=cid 참조의 정확한 일치다. 같은 CID가 여러 첨부에 있으면 임의 하나를 선택하지 않고 거부한다. 기존 제한인 최대 10개·이미지당 5,000,000바이트를 유지한다. SVG·지원하지 않는 MIME·빈/과대 이미지·누락 참조는 내려받지 않으며 불가 안내를 표시한다. 바이트 크기와 파일 형식 signature도 확인한 뒤 고정 raster MIME의 base64 data URL만 만든다. Signature 검사는 전체 이미지 디코딩·악성 콘텐츠 검사를 증명하지 않는다.

`LinkedHtmlMessageBody`는 첫 CID 조회 완료 전 기존 iframe을 생성하지 않고 번역된 로딩 상태를 표시한다. 일부 실패 후에는 확인된 이미지를 포함해 본문을 표시한다. 명시적 재시도는 실패한 이미지만 요청하고 기존 성공 이미지와 본문을 유지한다. 계정/메일/상세 객체가 바뀌면 이전 source map을 새 iframe에 전달하지 않는다. effect cleanup은 요청을 취소하고 늦은 결과는 publish하지 않는다. data URL을 localStorage·서버 설정·로그에 저장하지 않는다.

기존 `LiveHtmlMessageBody`는 읽기 전용 계정에서 검증된 source map을 전달받는다. CSP/sandbox/referrer/외부 링크/높이/외부 이미지 실패 처리는 그대로이며 기본 계정의 연락처·신뢰 발신자·이미지 설정 저장·JMAP inline effect는 계속 차단한다. 외부 HTTPS 이미지의 한 번 보기 정책도 바꾸지 않는다. CSS background/srcset 등 기존 renderer가 처리하지 않는 CID 확장은 추가하지 않았다.

## 검증 및 남은 작업

`test-linked-inline-image.mjs`는 CID 참조/대소문자/중복·지원 MIME·개수·크기·signature/data URL 정책, 10개 언어 초기 SSR에서 요청 없음, 실제 loader effect의 사전 로딩·실패 이미지 전용 재시도·성공 source 유지·계정 변경·취소 후 늦은 publish 차단을 합성 fixture로 검사했다. 지원 이미지가 브라우저에서 완전히 디코딩된다는 보장이나 실제 메일 화면 검수는 아니다.

메일 보기/첨부 다운로드와 공통 frame policy/resize 회귀, 변경 범위 ESLint 및 10개 언어/3139키 검사 통과. 실제 사용자 CID 첨부/메일·운영 서버·설정·DB를 조회·변경하지 않았고 현재 브라우저 정책 차단은 우회하지 않았다. 실제 서비스·desktop/mobile·hydration/콘솔·이미지 디코딩 수용과 동기화 큐/내구성 작업 복구는 남는다. 전체 실서버 연동 완료가 아니다.
