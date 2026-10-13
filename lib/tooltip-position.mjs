/**
 * Keep body-portalled tooltips clear of sidebar clipping and viewport edges.
 * @param {{left:number,right:number,top:number,bottom:number,width:number}} anchor
 * @param {{width:number,height:number}} tooltip
 * @param {{left:number,top:number,width:number,height:number}} viewport
 * @param {"top"|"bottom"} side
 */
export function tooltipPosition(anchor, tooltip, viewport, side) {
  const margin = 8;
  const leftEdge = viewport.left + margin;
  const topEdge = viewport.top + margin;
  const rightEdge = viewport.left + viewport.width - margin;
  const bottomEdge = viewport.top + viewport.height - margin;
  const above = anchor.top - margin - tooltip.height;
  const below = anchor.bottom + margin;
  let top = side === "top" ? above : below;
  if (side === "top" && above < topEdge && below + tooltip.height <= bottomEdge) top = below;
  if (side === "bottom" && below + tooltip.height > bottomEdge && above >= topEdge) top = above;
  return {
    left: Math.max(leftEdge, Math.min(anchor.left + anchor.width / 2 - tooltip.width / 2, rightEdge - tooltip.width)),
    top: Math.max(topEdge, Math.min(top, bottomEdge - tooltip.height)),
  };
}
