-- The platform's owners have one company, Skale Club. They were each left in a one-person organization of their own
-- (`legacy-rep-1` from 0024, `rep-2` from the sign-up flow) while the company organization held the stock with no members.
-- This renames the company, makes them its owners, moves everything from those workspaces into it and removes them.
--
-- Only workspaces whose every member is a platform admin: a seller's own workspace is never touched, and a database
-- without such a workspace (fresh dev/CI) changes nothing but the company's name. A row that cannot move (the same
-- Google place twice, say) fails the migration, so the new container does not start and nothing has changed.
--
-- Recovery: the moved rows are not marked. Restore from the backup taken before the deploy; the audit log entry written
-- here on the company lists the workspaces that were merged.

DO $$
DECLARE
  company integer;
  merged integer[];
  merged_names jsonb;
  reference record;
BEGIN
  SELECT "id" INTO company FROM "organizations" WHERE "slug" = 'xpot-company';
  IF company IS NULL THEN
    RETURN;
  END IF;

  UPDATE "organizations" SET "name" = 'Skale Club', "updated_at" = now() WHERE "id" = company;

  SELECT array_agg(o."id"), jsonb_agg(jsonb_build_object('id', o."id", 'name', o."name", 'slug', o."slug"))
  INTO merged, merged_names
  FROM "organizations" o
  WHERE o."id" <> company
    AND o."slug" ~ '^(legacy-)?rep-[0-9]+$'
    AND EXISTS (SELECT 1 FROM "organization_memberships" m WHERE m."organization_id" = o."id")
    AND NOT EXISTS (
      SELECT 1
      FROM "organization_memberships" m
      JOIN "sales_reps" r ON r."id" = m."rep_id"
      JOIN "users" u ON u."id" = r."user_id"
      WHERE m."organization_id" = o."id" AND NOT u."is_admin"
    );
  IF merged IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO "organization_memberships" ("organization_id", "rep_id", "role")
  SELECT DISTINCT company, m."rep_id", 'admin'::"organization_member_role"
  FROM "organization_memberships" m
  WHERE m."organization_id" = ANY (merged)
  ON CONFLICT ("organization_id", "rep_id") DO UPDATE SET "role" = 'admin', "is_active" = true, "blocked_at" = NULL, "updated_at" = now();

  -- Their sign-in record takes the name the app shows, so it no longer holds an old one.
  UPDATE "users" u
  SET "first_name" = split_part(btrim(r."display_name"), ' ', 1),
      "last_name" = NULLIF(btrim(substr(btrim(r."display_name"), length(split_part(btrim(r."display_name"), ' ', 1)) + 1)), ''),
      "updated_at" = now()
  FROM "sales_reps" r
  JOIN "organization_memberships" m ON m."rep_id" = r."id"
  WHERE r."user_id" = u."id" AND m."organization_id" = ANY (merged) AND btrim(r."display_name") <> '';

  DELETE FROM "organization_memberships" WHERE "organization_id" = ANY (merged);
  DELETE FROM "organization_links" WHERE "producer_id" = ANY (merged) OR "seller_id" = ANY (merged);

  -- Every other reference to an organization moves, including tables added after this was written.
  FOR reference IN
    SELECT c.conrelid::regclass AS table_name, a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = '"organizations"'::regclass
      AND array_length(c.conkey, 1) = 1
      AND c.conrelid NOT IN ('"organization_memberships"'::regclass, '"organization_links"'::regclass)
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = ANY ($2)', reference.table_name, reference.column_name, reference.column_name)
      USING company, merged;
  END LOOP;

  DELETE FROM "organizations" WHERE "id" = ANY (merged);

  INSERT INTO "organization_audit_log" ("organization_id", "action", "detail")
  VALUES (company, 'organizations_merged', jsonb_build_object('merged', merged_names));
END $$;
