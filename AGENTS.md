# Family project instructions

## Release behaviour

- After requested code or content changes pass their relevant checks, commit, push, and deploy them. Do not deploy only when the user explicitly requests local-only work or no deployment.
- Preserve existing 好日子 x 相聚 data, LINE bindings, reminders, and access controls unless a change explicitly requires otherwise.
- Public-facing links must use `https://bfc8g4v63.github.io/`. Never present, share, or treat any `*.chatgpt.site` deployment address as a user-facing URL; do not change hosting or domain configuration without explicit user direction.

## Visual quality

- For UI layout changes, verify each affected CTA or button is visibly centred in its intended container and has deliberate spacing from surrounding card edges at desktop and mobile widths.
- Add or update a regression check for the relevant alignment or responsive rule before release.

## 水金呼吸・回憶膠囊

- The product specification lives in `docs/memory-capsule/PRODUCT.md`; read it before implementing this feature.
- The architecture and trust boundaries live in `docs/memory-capsule/ARCHITECTURE.md`; read it before making schema, authentication, storage, or upload changes.
- LINE Login is the sole member identity. Use LINE's immutable subject/user ID as the account key, and show the current LINE public display name and avatar without a separate nickname-setup screen.
- Do not request or persist email, telephone, address, birthday, biometric information, LINE access tokens, or LINE refresh tokens for this product.
- All family media belongs in a private R2 bucket. Never expose a public bucket URL; uploads and reads must use short-lived, scoped signed URLs.
- Family member uploads and comments publish immediately. Moderation is after publication: report, hide, restore, delete, and audit. Do not add an approval queue unless the user changes this decision.
- Do not add a separate password, passkey, or local-account flow. Face ID or Touch ID remains the device and LINE application's responsibility.
