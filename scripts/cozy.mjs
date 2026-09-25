#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
export async function run(args, env = process.env) {
  const [group, maybeAction, ...rest] = args;
  if (!group || group === "help" || group === "--help")
    return `CozyToolkit · hosted links, tracked QR and analytics
Node.js 22.18+. Try without a key: 3 links/network/day, expiring after 7 days.
Set COZYTOOLKIT_API_KEY for account-linked usage. Trial receipts save locally.

usage
quote --action link.create|tracking.purchase
links list [--search text] [--offset 0]
links get --id UUID
links create --url URL [--title text] [--alias name] [--tags text] [--max-credits 0|10] [--request-id UUID]
links update --id UUID --version N [--url URL] [--title text] [--tags text] [--status active|paused]
qr --id UUID --out code.svg [--preset classic|sage|ocean|rose|clay|ink] [--size 768] [--foreground '#123456'] [--background '#ffffff'] [--logo logo.png]
analytics --id UUID [--days 30] [--format json|csv] [--out report.csv]
capacity --max-credits 50 [--request-id UUID]

Outputs are never overwritten. Retry an interrupted creation or capacity purchase
with the same request ID printed to stderr. There are no automatic retries or top-ups.`;
  const action = group === "links" ? maybeAction : undefined;
  const flags =
    group === "links" ? rest : [...(maybeAction ? [maybeAction] : []), ...rest];
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (
      !/^--[a-z-]+$/.test(flags[i]) ||
      flags[i + 1] === undefined ||
      Object.hasOwn(options, flags[i])
    )
      throw new Error("Use unique --option value pairs.");
    options[flags[i]] = flags[i + 1];
  }
  const allow = {
    usage: [],
    quote: ["action"],
    "links list": ["search", "offset"],
    "links get": ["id"],
    "links create": [
      "url",
      "title",
      "alias",
      "tags",
      "max-credits",
      "request-id",
    ],
    "links update": ["id", "version", "url", "title", "tags", "status"],
    qr: ["id", "out", "preset", "size", "foreground", "background", "logo"],
    analytics: ["id", "days", "format", "out"],
    capacity: ["max-credits", "request-id"],
  }[group === "links" ? `${group} ${action}` : group];
  if (!allow) throw new Error("Unknown command. Run help.");
  for (const k of Object.keys(options))
    if (!allow.includes(k.slice(2))) throw new Error(`Unknown option: ${k}`);
  const need = (k) => {
    const v = options[`--${k}`];
    if (!v) throw new Error(`Missing --${k}`);
    return v;
  };
  const id = () => {
    const value = need("id");
    if (!/^[a-f0-9-]{36}$/i.test(value)) throw new Error("Invalid link ID.");
    return value;
  };
  const root = new URL(env.COZYTOOLKIT_URL || "https://cozytoolkit.com");
  if (
    root.username ||
    root.password ||
    root.search ||
    root.hash ||
    root.pathname !== "/" ||
    !(
      root.origin === "https://cozytoolkit.com" ||
      (["127.0.0.1", "localhost", "[::1]"].includes(root.hostname) &&
        root.protocol === "http:")
    )
  )
    throw new Error(
      "Use https://cozytoolkit.com or an explicit local development server.",
    );
  const hasKey = !!env.COZYTOOLKIT_API_KEY;
  if (hasKey && !/^cozy_live_[a-f0-9]{64}$/.test(env.COZYTOOLKIT_API_KEY))
    throw new Error(
      "Set COZYTOOLKIT_API_KEY in your environment. Never put the key in a prompt.",
    );
  let path = "/account/usage",
    method = "GET",
    body,
    output = options["--out"];
  const params = new URLSearchParams();
  if (group === "quote") {
    path = "/quotes";
    method = "POST";
    body = { action: need("action") };
  }
  if (group === "links") {
    path = "/links";
    if (action === "list") {
      for (const k of ["search", "offset"])
        if (options[`--${k}`]) params.set(k, options[`--${k}`]);
    }
    if (action === "get") path += "/" + id();
    if (action === "create") {
      method = "POST";
      body = {
        target: need("url"),
        maxCredits: Number(options["--max-credits"] || 0),
      };
      for (const k of ["title", "alias", "tags"])
        if (options[`--${k}`] !== undefined) body[k] = options[`--${k}`];
    }
    if (action === "update") {
      path += "/" + id();
      method = "PATCH";
      body = { version: Number(need("version")) };
      for (const k of ["title", "tags", "status"])
        if (options[`--${k}`] !== undefined) body[k] = options[`--${k}`];
      if (options["--url"]) body.target = options["--url"];
    }
  }
  if (group === "qr") {
    path = `/links/${id()}/qr`;
    method = "POST";
    output = need("out");
    body = {
      preset: options["--preset"] || "classic",
      size: Number(options["--size"] || 768),
    };
    for (const k of ["foreground", "background"])
      if (options[`--${k}`]) body[k] = options[`--${k}`];
    if (options["--logo"]) {
      const file = await readFile(options["--logo"]);
      if (file.length > 512000)
        throw new Error(
          "Logo must be a PNG up to 512 KB and 512 × 512 pixels.",
        );
      body.logoPng = `data:image/png;base64,${file.toString("base64")}`;
    }
  }
  if (group === "analytics") {
    path = `/links/${id()}/stats`;
    params.set("days", options["--days"] || "30");
    params.set("format", options["--format"] || "json");
    if (!["json", "csv"].includes(params.get("format")))
      throw new Error("Use json or csv.");
  }
  if (group === "capacity") {
    path = "/links/capacity";
    method = "POST";
    body = { maxCredits: Number(need("max-credits")) };
  }
  const headers = {
    ...(hasKey ? { Authorization: `Bearer ${env.COZYTOOLKIT_API_KEY}` } : {}),
    "Content-Type": "application/json",
  };
  if (group === "capacity" || (group === "links" && action === "create")) {
    const requestId = options["--request-id"] || randomUUID();
    if (!/^[a-f0-9-]{36}$/i.test(requestId))
      throw new Error("Invalid request ID.");
    headers["Idempotency-Key"] = requestId;
    process.stderr.write(`Request ID: ${requestId}\n`);
  }
  const receiptDir = join(
    env.COZYTOOLKIT_TRIAL_DIR ||
      join(homedir(), ".config", "cozytoolkit", "trials"),
    createHash("sha256").update(root.origin).digest("hex").slice(0, 16),
  );
  const creatingTrial = !hasKey && group === "links" && action === "create";
  if (!hasKey) {
    if (group === "usage") path = "/trial";
    else if (creatingTrial) {
      if (
        body.maxCredits !== 0 ||
        body.alias !== undefined ||
        body.tags !== undefined
      )
        throw new Error(
          "Trial links use random aliases and zero credits. Set an API key for account options.",
        );
      await mkdir(receiptDir, { recursive: true, mode: 0o700 });
    } else if (
      group === "qr" ||
      group === "analytics" ||
      (group === "links" && action === "get")
    ) {
      let receipt;
      try {
        receipt = JSON.parse(
          await readFile(
            join(receiptDir, id().toLowerCase() + ".json"),
            "utf8",
          ),
        );
      } catch {
        throw new Error(
          "No local trial receipt for this link. Use the same machine that created it, or set an API key for account links.",
        );
      }
      if (
        !/^[a-f0-9]{64}$/.test(receipt.trialToken) ||
        receipt.origin !== root.origin
      )
        throw new Error("Invalid trial receipt.");
      headers["X-Cozy-Trial-Token"] = receipt.trialToken;
    } else
      throw new Error(
        "This action needs an account API key. Without one, try links create, links get, qr, analytics or usage.",
      );
  }
  const url = new URL("/api/v1" + path, root);
  url.search = params.toString();
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const reader = response.body.getReader(),
    chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2_000_000)
        throw new Error("Response exceeded the size limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!response.ok) {
    let code = "request_failed";
    try {
      code = JSON.parse(text).error || code;
    } catch {}
    throw new Error(`HTTP ${response.status}: ${code}`);
  }
  if (creatingTrial) {
    const result = JSON.parse(text);
    if (
      !/^[a-f0-9-]{36}$/i.test(result.id) ||
      !/^[a-f0-9]{64}$/.test(result.trialToken)
    )
      throw new Error(
        "Invalid trial response. Retry with the same request ID.",
      );
    const { trialToken, ...safe } = result;
    const receipt = {
      trialToken,
      origin: root.origin,
      expiresAt: result.expiresAt,
    };
    try {
      await writeFile(
        join(receiptDir, result.id.toLowerCase() + ".json"),
        JSON.stringify(receipt),
        { mode: 0o600, flag: "wx" },
      );
    } catch (e) {
      if (e.code !== "EEXIST")
        throw new Error(
          "Could not save the trial receipt. Fix local storage and retry with the same request ID.",
        );
      const saved = JSON.parse(
        await readFile(
          join(receiptDir, result.id.toLowerCase() + ".json"),
          "utf8",
        ),
      );
      if (saved.trialToken !== trialToken || saved.origin !== root.origin)
        throw new Error(
          "Trial receipt conflict. Existing receipt was not replaced.",
        );
    }
    return JSON.stringify({ ...safe, receiptSaved: true }, null, 2);
  }
  if (output) {
    await writeFile(output, text, { flag: "wx" });
    return `Saved ${output}`;
  }
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(await run(process.argv.slice(2)));
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Request failed.");
    process.exitCode = 1;
  }
}
