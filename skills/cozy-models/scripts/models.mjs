#!/usr/bin/env node
const help = `CozyToolkit model research — free, read-only; Node.js 22.18+
Commands: search, detail --id ID, compare --ids ID,ID, estimate [--id ID], providers, changes --since ISO_DATETIME
Options: --query TEXT --providers ID,ID --creators ID,ID --official true
  --capabilities tools,structured,reasoning --min-context N --min-output N
  --max-input-price USD_PER_MILLION --max-output-price USD_PER_MILLION
  --min-speed TOKENS_PER_SECOND --max-latency SECONDS
  --input-tokens N --output-tokens N --cached-tokens N --requests N
  --sort cost|input_price|output_price|context|speed|latency|newest|name|coding
  --limit 1..50 --offset N --offer-limit 1..100
Environment: COZYTOOLKIT_URL (default https://cozytoolkit.com), optional COZYTOOLKIT_API_KEY.
Exact IDs come from search results. Costs use tokens PER REQUEST. No inference or credit spending.`;
const [command = "help", ...args] = process.argv.slice(2);
if (command === "help" || command === "--help") {
  console.log(help);
  process.exit(0);
}
try {
  const paths = {
    search: "models",
    detail: "models/detail",
    compare: "models/compare",
    estimate: "models",
    providers: "model-providers",
    changes: "models/changes",
  };
  if (!Object.hasOwn(paths, command))
    throw new Error("Unknown command. Run help.");
  const allowed = new Set([
    "query",
    "id",
    "ids",
    "providers",
    "creators",
    "official",
    "capabilities",
    "min-context",
    "min-output",
    "max-input-price",
    "max-output-price",
    "min-speed",
    "max-latency",
    "input-tokens",
    "output-tokens",
    "cached-tokens",
    "requests",
    "sort",
    "limit",
    "offset",
    "offer-limit",
    "since",
  ]);
  const params = new URLSearchParams();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i].replace(/^--/, "");
    if (
      !args[i].startsWith("--") ||
      !allowed.has(flag) ||
      args[i + 1] === undefined ||
      args[i + 1].startsWith("--")
    )
      throw new Error("Invalid option. Run help.");
    const key = flag === "query" ? "q" : flag.replaceAll("-", "_");
    if (params.has(key)) throw new Error("Duplicate option.");
    params.set(key, args[i + 1]);
  }
  if (
    (command === "detail" && !params.has("id")) ||
    (command === "compare" && !params.has("ids")) ||
    (command === "changes" && !params.has("since"))
  )
    throw new Error("Missing required option. Run help.");
  const base = new URL(
    process.env.COZYTOOLKIT_URL || "https://cozytoolkit.com",
  );
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    !(
      base.protocol === "https:" ||
      (base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
    )
  )
    throw new Error(
      "Service URL must be an HTTPS origin (or localhost for development).",
    );
  const path =
    command === "estimate" && params.has("id")
      ? "models/detail"
      : paths[command];
  const target = new URL(`/api/v1/${path}`, base);
  target.search = params.toString();
  const headers = { Accept: "application/json" };
  if (process.env.COZYTOOLKIT_API_KEY)
    headers.Authorization = `Bearer ${process.env.COZYTOOLKIT_API_KEY}`;
  const response = await fetch(target, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Catalog request failed (${response.status}).${response.status === 429 ? " Rate limited; retry after the service's reset." : " Check options or API key."}`,
    );
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8_000_000)
        throw new Error("Response too large; reduce --limit or --offer-limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  console.log(JSON.stringify(data, null, 2));
} catch (error) {
  console.error(
    error instanceof Error &&
      !["TypeError", "TimeoutError", "AbortError"].includes(error.name)
      ? error.message
      : "Catalog connection failed. Try again later.",
  );
  process.exitCode = 1;
}
