// 메일 iframe 안의 이미지 상태만 관찰하며 별도의 외부 요청은 만들지 않습니다.
export function observeExternalImageFailures(document: Document, onChange: (failed: number) => void) {
  const failed = new Set<HTMLImageElement>();
  let active = true;
  const isExternal = (image: HTMLImageElement) =>
    /^https?:\/\//iu.test(image.currentSrc || image.getAttribute("src") || "");
  const isTrackingPixel = (image: HTMLImageElement) => {
    const dimension = (name: "width" | "height") => {
      const value = image.style?.[name] || image.getAttribute(name);
      if (!value || !/^\s*\d+(?:\.\d+)?(?:px)?\s*$/iu.test(value)) return null;
      return Number.parseFloat(value);
    };
    const width = dimension("width");
    const height = dimension("height");
    // 실패 시 naturalWidth는 0이므로 추적 픽셀 판단에 사용하지 않습니다.
    // 명시된 두 치수가 모두 1px 이하인 경우만 안내에서 제외합니다.
    return width !== null && height !== null && width <= 1 && height <= 1;
  };
  const publish = () => { if (active) onChange(failed.size); };
  const update = (event: Event) => {
    const target = event.target;
    // iframe의 요소는 부모 창의 HTMLImageElement와 다른 생성자를 사용합니다.
    if (!target || !("nodeName" in target) || target.nodeName !== "IMG") return;
    const image = target as HTMLImageElement;
    if (!isExternal(image) || isTrackingPixel(image)) return;
    if (event.type === "error") failed.add(image);
    else failed.delete(image);
    publish();
  };
  document.addEventListener("load", update, true);
  document.addEventListener("error", update, true);
  for (const image of document.querySelectorAll<HTMLImageElement>("img")) {
    if (isExternal(image) && !isTrackingPixel(image) && image.complete && image.naturalWidth === 0) failed.add(image);
  }
  publish();
  return {
    retry() {
      if (!active) return;
      const images = [...failed];
      failed.clear();
      publish();
      for (const image of images) {
        if (!image.isConnected || !isExternal(image)) continue;
        // URL을 변경하지 않고 실패한 이미지 노드만 교체합니다.
        // 성공한 이미지·본문·스크롤은 유지하고 서명된 URL도 보존합니다.
        image.replaceWith(image.cloneNode(true));
      }
    },
    disconnect() {
      active = false;
      document.removeEventListener("load", update, true);
      document.removeEventListener("error", update, true);
      failed.clear();
    },
  };
}
