let lockCount = 0;
let previousOverflow = "";

export function lockBodyScroll() {
  if (lockCount === 0) previousOverflow = document.body.style.overflow;
  lockCount += 1;
  document.body.style.overflow = "hidden";

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;
    if (lockCount === 0) document.body.style.overflow = previousOverflow;
  };
}
