// One-time, repeatable Twilio configuration sync from Skale Club to Xpot.
//
// Usage:
//   node scripts/sync-skaleclub-twilio.mjs --dry-run
//   node scripts/sync-skaleclub-twilio.mjs
//   node scripts/sync-skaleclub-twilio.mjs --disable-target
//
// Optional:
//   --source-env=C:\path\to\skaleclub\.env
//   --target-env=C:\path\to\xpot\.env
//
// Secrets are moved directly between databases and are never printed.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";
import pg from "pg";

const { Client } = pg;

function option(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

async function readDatabaseUrl(path) {
  const env = parse(await readFile(path));
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error(`DATABASE_URL or POSTGRES_URL is missing from ${path}`);
  return url;
}

function databaseClient(url) {
  const useSsl =
    !url.includes("sslmode=disable") &&
    (url.includes(".supabase.") || url.includes("sslmode=") || process.env.PGSSLMODE === "require");
  const connectionString = useSsl
    ? url.replace(/[?&]sslmode=[^&]*/g, (match) => (match.startsWith("?") ? "?" : ""))
    : url;
  return new Client({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}

function validSource(row) {
  const accountSid = row?.account_sid?.trim() || "";
  const authToken = row?.auth_token?.trim() || "";
  const fromNumber = row?.from_phone_number?.trim() || "";
  return (
    /^AC[0-9a-zA-Z]{32}$/.test(accountSid) &&
    authToken.length > 0 &&
    /^\+[1-9]\d{6,14}$/.test(fromNumber)
  );
}

async function main() {
  const sourceEnv = resolve(option("source-env", resolve(process.cwd(), "../skaleclub/.env")));
  const targetEnv = resolve(option("target-env", resolve(process.cwd(), ".env")));
  const dryRun = process.argv.includes("--dry-run");
  const disableTarget = process.argv.includes("--disable-target");

  const [sourceUrl, targetUrl] = await Promise.all([
    readDatabaseUrl(sourceEnv),
    readDatabaseUrl(targetEnv),
  ]);
  if (sourceUrl === targetUrl) throw new Error("Source and target databases are the same; refusing to sync.");

  const source = databaseClient(sourceUrl);
  const target = databaseClient(targetUrl);
  await Promise.all([source.connect(), target.connect()]);

  try {
    const [sourceTables, targetTables] = await Promise.all([
      source.query(`SELECT to_regclass('public.twilio_settings') AS twilio_settings`),
      target.query(`
        SELECT
          to_regclass('public.integration_settings') AS integration_settings,
          to_regclass('public.users') AS users,
          to_regclass('public.sales_reps') AS sales_reps
      `),
    ]);

    if (!sourceTables.rows[0]?.twilio_settings) {
      throw new Error("Skale Club database has no twilio_settings table.");
    }

    const targetShape = targetTables.rows[0];
    if (!targetShape?.integration_settings || !targetShape?.users || !targetShape?.sales_reps) {
      throw new Error("Xpot database is missing integration_settings, users, or sales_reps.");
    }

    const sourceResult = await source.query(`
      SELECT
        enabled,
        account_sid,
        auth_token,
        from_phone_number,
        count(*) OVER ()::int AS total_rows,
        length(auth_token) AS auth_token_length,
        auth_token = '********' AS auth_token_is_mask
      FROM twilio_settings
      ORDER BY id ASC
      LIMIT 1
    `);
    const twilio = sourceResult.rows[0];
    if (!twilio) throw new Error("Skale Club has no Twilio settings row.");
    if (!validSource(twilio)) {
      throw new Error(
        "Skale Club Twilio settings are incomplete or invalid; a valid Account SID, Auth Token, and E.164 From number are required.",
      );
    }

    console.log(
      `Source ready: rows=${twilio.total_rows}, enabled=${Boolean(twilio.enabled)}, accountSid=set, authToken=set (length=${twilio.auth_token_length}, masked=${Boolean(twilio.auth_token_is_mask)}), fromNumber=set.`,
    );

    const existing = await target.query(
      `SELECT count(*)::int AS count FROM integration_settings WHERE provider = 'twilio'`,
    );
    console.log(`Target ready: existing Twilio rows=${existing.rows[0].count}.`);

    if (disableTarget) {
      const disabled = await target.query(
        `UPDATE integration_settings SET is_enabled = false, updated_at = now() WHERE provider = 'twilio'`,
      );
      console.log(`Target disabled: updated Twilio rows=${disabled.rowCount}. Credentials were preserved.`);
      return;
    }

    if (dryRun) {
      console.log("Dry run complete; no database changes were made.");
      return;
    }

    const phoneMigration = await readFile(resolve(process.cwd(), "migrations/0012_phone_login.sql"), "utf8");
    const configMigration = await readFile(resolve(process.cwd(), "migrations/0016_integration_config.sql"), "utf8");

    await target.query("BEGIN");
    try {
      await target.query(phoneMigration);
      await target.query(configMigration);

      const update = await target.query(
        `
          UPDATE integration_settings
          SET api_key = $1,
              config = jsonb_build_object('accountSid', $2::text, 'fromNumber', $3::text),
              is_enabled = $4,
              updated_at = now()
          WHERE provider = 'twilio'
        `,
        [
          twilio.auth_token.trim(),
          twilio.account_sid.trim(),
          twilio.from_phone_number.trim(),
          Boolean(twilio.enabled),
        ],
      );

      if (update.rowCount === 0) {
        await target.query(
          `
            INSERT INTO integration_settings
              (provider, api_key, config, is_enabled, created_at, updated_at)
            VALUES
              ('twilio', $1, jsonb_build_object('accountSid', $2::text, 'fromNumber', $3::text), $4, now(), now())
          `,
          [
            twilio.auth_token.trim(),
            twilio.account_sid.trim(),
            twilio.from_phone_number.trim(),
            Boolean(twilio.enabled),
          ],
        );
      }

      await target.query("COMMIT");
    } catch (error) {
      await target.query("ROLLBACK");
      throw error;
    }

    const verification = await target.query(`
      SELECT
        is_enabled,
        api_key IS NOT NULL AND length(trim(api_key)) > 0 AS has_auth_token,
        config->>'accountSid' IS NOT NULL AS has_account_sid,
        config->>'fromNumber' IS NOT NULL AS has_from_number
      FROM integration_settings
      WHERE provider = 'twilio'
      ORDER BY id ASC
      LIMIT 1
    `);
    const saved = verification.rows[0];
    console.log(
      `Sync complete: enabled=${Boolean(saved?.is_enabled)}, accountSid=${saved?.has_account_sid ? "set" : "missing"}, authToken=${saved?.has_auth_token ? "set" : "missing"}, fromNumber=${saved?.has_from_number ? "set" : "missing"}.`,
    );
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
