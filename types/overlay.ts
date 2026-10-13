// Shared shapes for toast notifications and overlay tone variants
// (banners, confirm dialogs).
export type ToastTone = "success" | "error" | "info" | "warning" | "notice" | "undo";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export type BannerTone = "info" | "warning" | "danger" | "success";

export type ConfirmTone = "destructive" | "warning" | "default" | "alert";
