"use client";

// Admin Console > Billing & Licensing tab: current plan, seat usage,
// license breakdown, and invoice history.
import { useLocale, useTranslations } from "next-intl";
import { BILLING_OVERVIEW, INVOICES, LICENSES } from "@/lib/mock-admin";
import { AdminCard, Pill, ProgressBar } from "../primitives";
import { useToast } from "@/context/toast-context";

export function BillingTab() {
  const t = useTranslations("adminBilling");
  const locale = useLocale();
  const toast = useToast();
  const numberFormatter = new Intl.NumberFormat(locale);
  const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T00:00:00Z`));
  const remainingSeats = BILLING_OVERVIEW.seatsTotal - BILLING_OVERVIEW.seatsUsed;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 text-white" style={{ backgroundColor: "#17181B" }}>
          <p className="text-xs text-white/55">{t("currentPlan")}</p>
          <p className="mt-1 text-lg font-bold">{t("enterpriseAnnual")}</p>
          <p className="mt-1 text-[11px] text-white/50">{t("planPeriod", { start: formatDate(BILLING_OVERVIEW.planStartsOn), end: formatDate(BILLING_OVERVIEW.planEndsOn) })}</p>
          <button
            type="button"
            onClick={() => toast.info(t("openPlanChange"))}
            className="mt-3 h-8 w-full rounded-lg bg-white/10 text-xs font-semibold"
          >
            {t("changePlan")}
          </button>
        </div>

        <AdminCard>
          <p className="text-xs text-(--text-muted)">{t("seatUsage")}</p>
          <p className="mt-1 text-lg font-bold">{t("seatsUsed", { used: numberFormatter.format(BILLING_OVERVIEW.seatsUsed), total: numberFormatter.format(BILLING_OVERVIEW.seatsTotal) })}</p>
          <div className="mt-2">
            <ProgressBar pct={(BILLING_OVERVIEW.seatsUsed / BILLING_OVERVIEW.seatsTotal) * 100} color="#E0AC4A" />
          </div>
          <p className="mt-1.5 text-[11px] text-(--text-muted)">{t("seatEstimate", { remaining: numberFormatter.format(remainingSeats), months: numberFormatter.format(BILLING_OVERVIEW.monthsUntilCapacity) })}</p>
        </AdminCard>

        <AdminCard>
          <p className="text-xs text-(--text-muted)">{t("nextBilling")}</p>
          <p className="mt-1 text-lg font-bold">{currencyFormatter.format(BILLING_OVERVIEW.nextBillingAmountKrw)}</p>
          <p className="mt-1 text-[11px] text-(--text-muted)">{t("nextBillingDetails", { date: formatDate(BILLING_OVERVIEW.nextBillingOn) })}</p>
          <button
            type="button"
            onClick={() => toast.info(t("openPaymentMethods"))}
            className="mt-2 text-[11px] font-semibold"
            style={{ color: "var(--color-primary)" }}
          >
            {t("managePaymentMethods")}
          </button>
        </AdminCard>
      </div>

      <AdminCard title={t("licensesTitle")}>
        <div className="flex flex-col gap-2">
          {LICENSES.map((l) => (
            <div key={l.id} className="flex items-center justify-between border-t border-(--border-app) pt-2 text-xs first:border-t-0 first:pt-0">
              <div>
                <p className="font-semibold">{t(`licenses.${l.id}`)}</p>
                <p className="text-[10.5px] text-(--text-muted)">{t(`licenseNotes.${l.noteId}`)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{t("seatCount", { count: numberFormatter.format(l.seats) })}</p>
                <p className="text-[10.5px] text-(--text-muted)">{l.priceKrw === null ? t("included") : t("pricePerMonth", { amount: currencyFormatter.format(l.priceKrw) })}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-[#FBF9F4] px-3 py-2 text-[11px] text-(--text-muted)">
          {t("contractNotice", { number: BILLING_OVERVIEW.procurementContractNo })}
        </p>
      </AdminCard>

      <AdminCard title={t("invoicesTitle")}>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_100px_120px_90px] gap-2 text-[10px] font-bold uppercase text-(--text-muted)">
            <span>{t("columns.number")}</span>
            <span>{t("columns.date")}</span>
            <span>{t("columns.amount")}</span>
            <span>{t("columns.status")}</span>
          </div>
          {INVOICES.map((iv) => (
            <div key={iv.no} className="grid grid-cols-[1fr_100px_120px_90px] items-center gap-2 border-t border-(--border-app) pt-2 text-xs">
              <span className="font-mono">{iv.no}</span>
              <span className="text-(--text-muted)">{formatDate(iv.date)}</span>
              <span className="font-semibold">{currencyFormatter.format(iv.amountKrw)}</span>
              <Pill label={t(`invoiceStates.${iv.stateId}`)} tone={iv.tone} />
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}
