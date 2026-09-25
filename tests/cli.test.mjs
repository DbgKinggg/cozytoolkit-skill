import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../scripts/cozy.mjs";
test("CLI preserves spending ceilings, idempotency, output files and secret boundaries", async () => {
  const seen = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    seen.push({
      url: req.url,
      headers: req.headers,
      body: body ? JSON.parse(body) : undefined,
    });
    if (req.url.endsWith("/qr")) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end("<svg/>");
    } else if (req.url.includes("redirect")) {
      res.writeHead(302, { Location: "https://example.com" });
      res.end();
    } else {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const env = {
    COZYTOOLKIT_API_KEY: "cozy_live_" + "a".repeat(64),
    COZYTOOLKIT_URL: `http://127.0.0.1:${server.address().port}`,
  };
  const dir = await mkdtemp(join(tmpdir(), "cozy-cli-"));
  try {
    assert.match(await run(["help"], {}), /max-credits/);
    const id = "11111111-1111-4111-8111-111111111111";
    await run(
      ["links", "create", "--url", "https://example.com", "--request-id", id],
      env,
    );
    assert.equal(seen[0].body.maxCredits, 0);
    assert.equal(seen[0].headers["idempotency-key"], id);
    assert.equal(
      seen[0].headers.authorization,
      `Bearer ${env.COZYTOOLKIT_API_KEY}`,
    );
    await run(["capacity", "--max-credits", "50", "--request-id", id], env);
    assert.equal(seen[1].body.maxCredits, 50);
    const file = join(dir, "qr.svg");
    await run(["qr", "--id", id, "--out", file, "--preset", "sage"], env);
    assert.equal(await readFile(file, "utf8"), "<svg/>");
    await assert.rejects(run(["qr", "--id", id, "--out", file], env), /EEXIST/);
    await assert.rejects(
      run(["usage"], { ...env, COZYTOOLKIT_URL: "https://evil.example" }),
      /explicit local/,
    );
    await assert.rejects(
      run(["usage", "--token", env.COZYTOOLKIT_API_KEY], env),
      /Unknown option/,
    );
    await assert.rejects(
      run(["links", "list", "--search", "redirect"], env),
      /fetch failed/,
    );
    await assert.rejects(
      run(["links", "update", "--id", id], env),
      /Missing --version/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("no-key trial saves a private receipt, reuses it and blocks account actions", async () => {
  const { readdir, stat } = await import("node:fs/promises");
  const id = "22222222-2222-4222-8222-222222222222",
    token = "b".repeat(64),
    seen = [];
  const server = createServer(async (req, res) => {
    for await (const _ of req) {
    }
    seen.push({ url: req.url, headers: req.headers });
    res.setHeader(
      "Content-Type",
      req.url.endsWith("/qr") ? "image/svg+xml" : "application/json",
    );
    res.end(
      req.url.endsWith("/qr")
        ? "<svg/>"
        : JSON.stringify(
            req.method === "POST"
              ? {
                  id,
                  trial: true,
                  trialToken: token,
                  expiresAt: Date.now() + 604800000,
                }
              : { remaining: 3 },
          ),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dir = await mkdtemp(join(tmpdir(), "cozy-trial-"));
  const env = {
    COZYTOOLKIT_URL: `http://127.0.0.1:${server.address().port}`,
    COZYTOOLKIT_TRIAL_DIR: dir,
  };
  try {
    await run(["usage"], env);
    assert.equal(seen[0].url, "/api/v1/trial");
    const cmd = [
      "links",
      "create",
      "--url",
      "https://example.com",
      "--request-id",
      id,
    ];
    const result = await run(cmd, env);
    assert.ok(!result.includes(token));
    assert.equal(JSON.parse(result).receiptSaved, true);
    assert.equal(seen[1].headers.authorization, undefined);
    const receiptFile = join(dir, (await readdir(dir))[0], id + ".json");
    assert.equal((await stat(receiptFile)).mode & 0o777, 0o600);
    assert.equal(
      JSON.parse(await readFile(receiptFile, "utf8")).trialToken,
      token,
    );
    await run(cmd, env); // Idempotent replay can reuse the same receipt.
    await run(["qr", "--id", id, "--out", join(dir, "code.svg")], env);
    assert.equal(seen.at(-1).headers["x-cozy-trial-token"], token);
    assert.equal(seen.at(-1).headers.authorization, undefined);
    const before = seen.length;
    await assert.rejects(run(["links", "list"], env), /account API key/);
    await assert.rejects(
      run(
        [
          "links",
          "create",
          "--url",
          "https://example.com",
          "--max-credits",
          "10",
        ],
        env,
      ),
      /zero credits/,
    );
    await assert.rejects(
      run(
        ["links", "get", "--id", "33333333-3333-4333-8333-333333333333"],
        env,
      ),
      /No local trial receipt/,
    );
    await assert.rejects(
      run(["usage"], { ...env, COZYTOOLKIT_API_KEY: "bad" }),
      /Set COZYTOOLKIT_API_KEY/,
    );
    assert.equal(seen.length, before);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
