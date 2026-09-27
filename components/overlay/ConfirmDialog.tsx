"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ConfirmTone } from "@/types/overlay";

// Shared confirmation dialog for anything from a plain "Are you sure?" to a
// destructive delete that requires typing a confirmation string first
// (`requireTypedText`, e.g. the account email) before the confirm button
// enables.
const ICON_STYLE: Record<Exclude<ConfirmTone, "default">, string> = {
  destructive: "bg-(--status-danger-bg) text-(--status-danger)",
  warning: "bg-(--status-warning-bg) text-(--status-warning)",
  alert: "bg-(--status-success-bg) text-(--status-success)",
};

const CONFIRM_BTN_STYLE: Record<ConfirmTone, string> = {
  destructive: "",
  warning: "bg-(--status-warning-solid) text-white",
  default: "text-white",
  alert: "bg-(--color-primary-solid) text-white",
};

interface ConfirmDialogProps {
  tone: ConfirmTone;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  middleAction?: { label: string; onClick: () => void };
  requireTypedText?: string;
  typedPlaceholder?: string;
}

export function ConfirmDialog({
  tone,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  middleAction,
  requireTypedText,
  typedPlaceholder,
}: ConfirmDialogProps) {
  const t = useTranslations("common");
  const [typed, setTyped] = useState("");
  // Destructive actions and typed-confirmation flows can't be dismissed by
  // clicking outside — the user must explicitly confirm or cancel.
  const dismissible = tone !== "destructive" && !requireTypedText;
  const typedMatches = !requireTypedText || typed === requireTypedText;
  const isAlert = tone === "alert";
  const resolvedCancelLabel = cancelLabel ?? t("cancel");
  const defaultLabel =
    tone === "destructive" ? t("deleteForever") : tone === "warning" ? t("sendAnyway") : t("confirm");

  return (
    <Modal onClose={onCancel} dismissible={dismissible} maxWidth={requireTypedText ? 380 : 392} labelledBy="confirm-dialog-title" describedBy={description ? "confirm-dialog-description" : undefined}>
      <div className="flex flex-col gap-1 p-5">
        {tone !== "default" && (
          <div className="mb-1 flex items-start gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-base font-bold ${ICON_STYLE[tone]}`}
            >
              {tone === "alert" ? <Check size={17} strokeWidth={3} /> : "!"}
            </span>
            <div className="flex flex-col gap-1.5 pt-0.5">
              <h2 id="confirm-dialog-title" className="text-[16px] font-bold leading-snug text-foreground">{title}</h2>
              {description && (
                <p id="confirm-dialog-description" className="text-[13px] leading-relaxed text-(--text-muted) text-pretty">
                  {description}
                </p>
              )}
            </div>
          </div>
        )}
        {tone === "default" && (
          <div className="flex flex-col gap-1.5">
            <h2 id="confirm-dialog-title" className="text-[14.5px] font-bold leading-snug text-foreground">{title}</h2>
            {description && (
              <p id="confirm-dialog-description" className="text-[12.5px] leading-relaxed text-(--text-muted)">{description}</p>
            )}
          </div>
        )}

        {requireTypedText && (
          <Input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={typedPlaceholder ?? requireTypedText}
            data-modal-autofocus
            className="text-[12.5px]"
          />
        )}
      </div>

      <div className="flex items-center gap-2 px-5 pb-5">
        <div className={`flex gap-2 ${isAlert ? "w-full justify-end" : "ml-auto"}`}>
          {!isAlert && (
            <Button
              size="sm"
              onClick={onCancel}
              className="whitespace-nowrap"
            >
              {resolvedCancelLabel}
            </Button>
          )}
          {middleAction && (
            <Button
              variant="ghost"
              size="sm"
              onClick={middleAction.onClick}
              className="whitespace-nowrap"
            >
              {middleAction.label}
            </Button>
          )}
          <Button
            variant={tone === "destructive" ? "danger" : tone === "default" ? "primary" : "secondary"}
            size="sm"
            disabled={requireTypedText ? !typedMatches : false}
            onClick={onConfirm}
            className={`whitespace-nowrap ${
              requireTypedText && !typedMatches ? "" : CONFIRM_BTN_STYLE[tone]
            }`}
            style={
              requireTypedText && !typedMatches
                ? undefined
                : tone === "default"
                  ? { backgroundColor: "var(--color-primary-solid)" }
                  : undefined
            }
          >
            {confirmLabel ?? defaultLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
