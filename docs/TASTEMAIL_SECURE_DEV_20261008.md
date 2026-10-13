# 안전한 개발 연결 실행 경로

```text
npm run dev:secure
# 기존 7540 개발 서버를 유지한 채 별도 실행
npm run dev:secure -- --web-port 17540
```

기본 연결은 SSH whitecalvin@192.168.0.109:22 → 원격 loopback6711이며 로컬 SSH 포트16711, 웹 포트7540이다. 실제 서버 확인에 사용된 기존 계정/키를 사용한다. 비밀번호·키·호스트 키를 생성/수정하지 않는다. BatchMode=yes·StrictHostKeyChecking=yes·ExitOnForwardFailure=yes를 유지한다. SSH 실패나 잘못된 health 응답에는 Next를 시작하지 않는다.

사용자 명시 옵션은 `--ssh-host`, `--ssh-user`, `--ssh-port`, `--remote-api-port`, `--local-api-port`, `--web-port`이며, 각 값이 검증된다. 셸 문자열 실행·원격 명령·방화벽/서버 설정 변경은 하지 않는다.

`TASTEMAIL_API_URL=http://127.0.0.1:<local-api-port>` 및 `GXWEBMAIL_BUILD_DIR=.next-secure-dev`를 Next 자식 프로세스에만 적용한다. Next 공식 환경 로딩 우선순위상 process.env가 기존 원격 HTTP 환경 파일보다 우선한다. 브라우저용 NEXT_PUBLIC 변수에 주소를 넣거나 사용자 환경 파일을 덮어쓰지 않는다. SSH/웹 모두 loopback에만 바인딩되므로 원격 브라우저 테스트에는 기존 HTTPS 프록시 등의 별도 승인된 경로가 필요하다.

이미 사용 중인 로컬 포트를 재사용하거나 해당 소유자를 종료하지 않는다. 앱이나 SSH가 종료되면 자신이 시작한 자식만 정리한다. Windows에서는 자신이 생성한 정확한 자식 PID의 트리만 종료해 Next dev worker가 남지 않도록 한다. 종료 과정 실패는 알리되 나머지 자식 정리도 시도한다.

## 검증

- 합성 프로세스 검사: 옵션/포트 검증, 엄격한 SSH 옵션, loopback 환경, 기존 환경 객체 불변, 포트 충돌 시 시작 금지, 무인증 health 서비스 검증, 앱/SSH 종료, 취소, 정리 실패 시 나머지 자식 정리.
- 관련 스크립트 lint 통과.
- 새 dev 생성 타입 경로를 포함한 `npx tsc --noEmit` 통과. Git diff 공백 검사 통과.
- 실제 109 SSH 경로로 별도17540 실행: health200/ok, 무인증 세션401, 한국어 로그인200, CSS 파싱 실패 없음.
- Ctrl+C 이후 소유한16711/17540 수신 포트가 닫힘을 확인했다. 기존7540을 재시작/종료하지 않았다.
- Next dev가 tsconfig에 `.next-secure-dev` 생성 타입 경로를 추가했다. 이 변경은 보존한다.

이 변경은 실행 오케스트레이션이며 앱 소스·의존성·lockfile·locale를 변경하지 않는다. 앱 재빌드 대신 스크립트 계약/구문·새 생성 타입의 정적 검사·실제 실행을 검증한다. 이전 CSS production 빌드는 소스 변경 없이 유지한다. 실계정 로그인/MFA·세션 만료·공유 권한·메일 데이터 일치·전체 화면 회귀·운영 배포는 이 기록으로 완료되지 않는다. 이후 사용자의 live-only 지시를 유지하며 전체 연동 목표는 진행 중이다.

최종 검증 입력 SHA256:

| 파일 | SHA256 |
| --- | --- |
| scripts/dev-secure.mjs | 088704F4FBE02C36732EC8381A0301AA03BDA219022CCD414106BAFBB3B56AAF |
| scripts/secure-dev-contract.mjs | D618EBA78F5F7726FC613AF26AEA4ADE78C57A1C980DD0A4593360EED1BC090B |
| scripts/test-secure-dev.mjs | D31B5AA6227034D80E3BF01413D62773E08089E6FEB0606BC7878F86D31F9D97 |
| package.json | 7D8EBB156DAF72E223E2F9BA4F119BD548B934989DF6B4D861F16DFF31CB4F9F |
| tsconfig.json | B677B8D557591D5485919E37B3BA3426CC16F49EC25B5E74A875E595DF7A1F07 |
