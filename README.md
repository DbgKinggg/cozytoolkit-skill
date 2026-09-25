# CozyToolkit skill

Hosted short links, editable tracked QR codes and private traffic analytics for agents with a terminal. No model calls or extra AI fees.

```sh
npx skills add DbgKinggg/cozytoolkit-skill --skill cozytoolkit
```

Requires Node.js 22.18+. Create a scoped key at https://cozytoolkit.com/api-keys and set `COZYTOOLKIT_API_KEY` in your agent's environment. Keep it out of chat and source control. The installed `SKILL.md` contains workflows; `scripts/cozy.mjs help` lists commands.

Try: “Create a tracked link for my launch and export a sage QR code. Use my free allowance only.”

The website and API share free monthly link allowances. Purchased credits require an explicitly enabled key budget and a request spending ceiling. See https://cozytoolkit.com/developers and https://cozytoolkit.com/pricing. Service limits apply; public payment availability is shown in billing.

This repository contains only the skill, a dependency-free CLI and tests. It does not contain the CozyToolkit application, credentials or customer data. Run tests with `node --test tests/cli.test.mjs`.
