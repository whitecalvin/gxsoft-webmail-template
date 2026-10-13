// Synthetic only; never contains operational credentials or mail data.
export const adminOverviewFixture = {
  observedAt: "2026-10-12T00:00:00Z",
  service: { status: "running", version: "synthetic-only", hostname: "admin-fixture.example.test", startedAt: "2026-10-11T23:00:00Z", uptimeSeconds: 3600 },
  database: { status: "connected", schemaStatus: "current", tlsMode: "verify_full", caConfigured: true, serverVersionNum: 170006, serverMajor: 17, migrationVersion: 64, expectedMigrationVersion: 64 },
  certificate: { status: "expired", configured: true, hostnameMatches: true, notBefore: "2025-01-01T00:00:00Z", notAfter: "2026-10-11T00:00:00Z", daysRemaining: -1 },
  listeners: [{ protocol: "SMTP", address: "127.0.0.1:2525", tlsRequired: false, status: "configured" }, { protocol: "IMAPS", address: "127.0.0.1:2993", tlsRequired: true, status: "disabled" }],
  backup: { status: "application_ready", preflightCommand: "tastedev-mail backup check", guide: "docs/BACKUP_RESTORE.md" },
  metrics: { queueActive: 2, queueFailed: 1, quarantinePending: 3, oldestQueueSeconds: null, dmarcReportsPending: 4, tlsReportsPending: 5 },
  alerts: [{ key: "certificate_invalid", severity: "critical", summary: "Synthetic expired certificate" }],
};
