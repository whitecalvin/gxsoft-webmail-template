// Synthetic public values only. Never generates or contains a private signing key.
export function adminDkimFixture(domain = "example.test") {
  const status = domain.startsWith("active.") ? "active" : domain.startsWith("retired.") ? "retired" : "pending";
  return {
    domain, keyGenerationConfigured: !domain.startsWith("unconfigured."), observedAt: "2026-10-12T00:00:00Z",
    records: [
      { recordType: "MX", name: domain, value: "10 mail.example.test.", purpose: "inbound mail routing", status: "published" },
      { recordType: "TXT", name: domain, value: "v=spf1 mx -all", purpose: "SPF sender authorization", status: "published" },
      { recordType: "TXT", name: `_dmarc.${domain}`, value: "v=DMARC1; p=quarantine", purpose: "DMARC receiver policy", status: "missing" },
      { recordType: "PTR", name: "sending public IP", value: "mail.example.test", purpose: "outbound reverse DNS (set at the IP provider)", status: "manual" },
    ],
    keys: [{ id: "11111111-1111-4111-8111-111111111111", selector: "synthetic-qa", algorithm: "ed25519-sha256", status, dnsName: `synthetic-qa._domainkey.${domain}`, dnsTxtValue: "v=DKIM1; k=ed25519; p=c3ludGhldGljLXB1YmxpYy1vbmx5", dnsStatus: "published", createdAt: "2026-10-11T00:00:00Z", activatedAt: status === "pending" ? null : "2026-10-11T01:00:00Z", retiredAt: status === "retired" ? "2026-10-12T00:00:00Z" : null }],
  };
}
