/** 초기 SSR 조회는 StrictMode 재실행에서도 재조회하지 않는다. 사용자 조회 조건이 바뀌면 원본을 재사용하지 않는다. */
export function adminInitialReadGate(loaded: boolean, initialKey: string): (key: string) => boolean {
  let retained = loaded;
  return key => {
    if (retained && key === initialKey) return true;
    retained = false;
    return false;
  };
}
