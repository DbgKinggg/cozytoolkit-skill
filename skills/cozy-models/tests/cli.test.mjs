import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile),
  script = new URL("../scripts/models.mjs", import.meta.url).pathname;
async function fixture(run) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, auth: req.headers.authorization });
    if (req.url.includes("limited")) {
      res.writeHead(429, { "Retry-After": "60" });
      res.end("{}");
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        data: [{ id: "openai/example", offers: [{ modelId: "example" }] }],
        meta: { creditsCharged: 0 },
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await run(`http://127.0.0.1:${server.address().port}`, requests);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
test("no-key search encodes filters, exact IDs and workload safely", () =>
  fixture(async (base, requests) => {
    const { stdout } = await exec(
      process.execPath,
      [
        script,
        "search",
        "--query",
        "a&b",
        "--providers",
        "openai,openrouter",
        "--input-tokens",
        "8000",
        "--requests",
        "10000",
      ],
      {
        env: { ...process.env, COZYTOOLKIT_URL: base, COZYTOOLKIT_API_KEY: "" },
        cwd: "/tmp",
      },
    );
    assert.equal(JSON.parse(stdout).meta.creditsCharged, 0);
    const url = new URL(requests[0].url, base);
    assert.equal(url.pathname, "/api/v1/models");
    assert.equal(url.searchParams.get("q"), "a&b");
    assert.equal(url.searchParams.get("input_tokens"), "8000");
    assert.equal(requests[0].auth, undefined);
  }));
test("estimate resolves the detail route and keeps optional key out of stdout", () =>
  fixture(async (base, requests) => {
    const { stdout } = await exec(
      process.execPath,
      [script, "estimate", "--id", "openai/example", "--cached-tokens", "500"],
      {
        env: {
          ...process.env,
          COZYTOOLKIT_URL: base,
          COZYTOOLKIT_API_KEY: "test-secret",
        },
      },
    );
    assert.match(requests[0].url, /\/models\/detail/);
    assert.equal(requests[0].auth, "Bearer test-secret");
    assert.ok(!stdout.includes("test-secret"));
  }));
test("invalid flags and insecure remote origins fail before a request", async () => {
  for (const args of [
    ["search", "--bogus", "x"],
    ["detail"],
    ["search", "--query", "a", "--query", "b"],
  ])
    await assert.rejects(exec(process.execPath, [script, ...args]));
  await assert.rejects(
    exec(process.execPath, [script, "search"], {
      env: { ...process.env, COZYTOOLKIT_URL: "http://example.com" },
    }),
  );
});
test("rate limits stop without retries or leaking credentials", () =>
  fixture(async (base, requests) => {
    await assert.rejects(
      exec(process.execPath, [script, "search", "--query", "limited"], {
        env: {
          ...process.env,
          COZYTOOLKIT_URL: base,
          COZYTOOLKIT_API_KEY: "test-secret",
        },
      }),
      (e) => e.stderr.includes("429") && !e.stderr.includes("test-secret"),
    );
    assert.equal(requests.length, 1);
  }));
