# API behavior

Canonical service: https://cozytoolkit.com/api/v1
Machine schema: https://cozytoolkit.com/openapi.json
Docs: https://cozytoolkit.com/developers

## No-key trials

Omit Authorization to create with `POST /links` and a UUID `Idempotency-Key`. Only `target`, optional `title` and `maxCredits: 0` are accepted. Three links per network per UTC day; shared service cap 100/day. Invalid/revoked supplied keys never fall back to a trial. `GET /trial` reports remaining allowance and reset time without a key.

The creation response includes `trial: true`, `expiresAt` (Unix milliseconds) and a private `trialToken`. Send the token in `X-Cozy-Trial-Token` for GET `/links/{id}`, POST `/links/{id}/qr`, or GET `/links/{id}/stats`. It is valid only for that link. Both redirects and receipt access expire after 7 days. No editing, listing, custom aliases, account access or credit spending. Redirects stop at expiry; do not use trials for permanent printed materials. The CLI saves receipts privately and excludes them from output. A trial cannot be transferred to an account.

## Permissions

- `links:read`: list/get links, account allowance and quotes.
- `links:write`: create/edit/pause links.
- `qr:read`: generate an SVG for an active owned tracked link.
- `analytics:read`: read stats and aggregated CSV for owned links.
- `credits:spend`: opt into purchased-credit operations within a per-key monthly ceiling.

Keys expire after 30, 90 or 365 days, are shown once, stored only as hashes and can be revoked. Use a scoped key in the environment, not command-line arguments, URLs or prompts. The CLI never follows HTTP redirects. COZYTOOLKIT_URL is an optional localhost-only development override; ordinary requests always use cozytoolkit.com.

## Prices and limits

Website and API share 25 new links and 5,000 recorded visits per account per calendar month (UTC). A new hosted link includes its short URL and tracked QR URL. Extra creation is 10 purchased credits; a 10,000-visit recording pack is 50. Existing lower-priced packs keep their original refund value. Static QR codes and local exports on the website remain free.

No credits for edits, QR SVG exports, list/get, quotes, analytics or repeated reads. They remain rate/capacity limited. A pack adds recording capacity, not a guaranteed request rate. Recording stops at account/shared service capacity; redirects continue while the redirect service/database is available. Current beta recording capacity is 5,000 visits/day across the service. Unrecorded visits cannot be recovered; reports include gaps. Retention is 90 days. Paid pack capacity carries forward; monthly freebies do not accumulate. API-key monthly budgets reset in UTC and count gross purchases; returning a pack does not reopen the key budget.

Current management limits use 20 requests/minute/IP and 30/minute/account per Cloudflare location. Follow Retry-After on 429. List pages contain at most 50 links; use `offset` to continue while `hasMore` is true. Quote prices are advisory: `maxCredits` and the database enforce the final ceiling. The API does not sell or spend AI/X daily credits.

## Errors

- 400 invalid_input / invalid_link_target / qr_contrast_required: correct input, keep readable QR contrast.
- 401 api_key_invalid: missing, revoked or expired key, or unverified owner.
- 403 api_scope_required: ask the owner to supply the needed permission.
- 402 api_budget_exceeded / credits_required / link_allowance_required: stop; explain which allowance is exhausted.
- 404 not_found: unavailable or not owned by this account.
- 409 request_conflict / link_alias_taken / link_changed: preserve the original request; resolve the conflict before a new action.
- 410 trial_expired: the trial has ended; stop using its short link and QR.
- 429 trial_limit_reached / trial_capacity_reached: daily network/shared cap; wait until UTC reset. Do not rotate networks.
- 429 rate_limited: pause for Retry-After, do not busy-loop.
- 503 links_unavailable / service_unavailable: do not claim completion. For uncertain creates/purchases, reuse the original request ID after recovery.
