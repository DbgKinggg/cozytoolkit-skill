# CozyToolkit skill

Hosted short links, editable tracked QR codes and private traffic analytics for agents with a terminal. No model calls or extra AI fees.

```sh
npx skills add DbgKinggg/cozytoolkit-skill --skill cozytoolkit
```

Requires Node.js 22.18+. Try 3 links per network per day without a key; links and QR redirects expire after 7 days. The CLI privately saves a per-link receipt for QR exports and stats. Daily trials reset at midnight UTC, subject to shared capacity. For account links and editing, create a scoped key at https://cozytoolkit.com/api-keys and set `COZYTOOLKIT_API_KEY` in your agent's environment. Keep it out of chat and source control. The installed `SKILL.md` contains workflows; `scripts/cozy.mjs help` lists commands.

Try: “Create a 7-day trial link for my launch and export a sage QR code. I don’t have an API key.”

The website and API share free monthly link allowances. Purchased credits require an explicitly enabled key budget and a request spending ceiling. See https://cozytoolkit.com/developers and https://cozytoolkit.com/pricing. Service limits apply; public payment availability is shown in billing.

This repository contains only the skill, a dependency-free CLI and tests. It does not contain the CozyToolkit application, credentials or customer data. Run tests with `node --test tests/cli.test.mjs`.
