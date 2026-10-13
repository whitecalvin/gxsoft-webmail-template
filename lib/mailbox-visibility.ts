import type { PersonalFolderNode } from "./personal-folder-tree";

// 숨긴 부모의 표시 가능한 자식은 승격한다. 메일 데이터와 원본 트리는 변경하지 않는다.
export function visiblePersonalFolderTree(nodes: PersonalFolderNode[], hiddenIds: readonly string[]): PersonalFolderNode[] {
  const hidden = new Set(hiddenIds);
  const visit = (items: PersonalFolderNode[]): PersonalFolderNode[] => items.flatMap(node => {
    const children = visit(node.children);
    if (node.mailbox && hidden.has(node.mailbox.id)) return children;
    if (!node.mailbox && !children.length) return [];
    return [{ ...node, children }];
  });
  return visit(nodes);
}
