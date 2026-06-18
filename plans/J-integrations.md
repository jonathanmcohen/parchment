# Plan J — Integrations (TIER 7)

External surfaces. Each gated behind config; absent config → feature hidden, not broken.

- **J1** Cairn cross-link: `[[cairn://page-id]]` resolves through configured Cairn URL + PAT; preview card; bidirectional backlinks.
- **J2** Calendar embed: read-only iframe of any iCal URL.
- **J3** Spreadsheet embed: read-only iframe of Google Sheets / Cairn database / Airtable.
- **J4** Slack / Discord: share to channel; notify on comment.
- **J5** Email-in: unique address per doc; SMTP relay routes replies as comments.
- **J6** GitHub: embed PR / issue with live status.
- **J7** Webhooks: on save / publish / comment, HMAC-signed payloads. *FM:* failed delivery retries with backoff, logged in audit.
