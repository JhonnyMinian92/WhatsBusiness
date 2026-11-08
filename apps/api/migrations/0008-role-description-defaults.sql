-- Compatibility bridge for legacy tenant-role writers.
-- TASK-004 keeps role descriptions mandatory without breaking existing modules
-- that insert only role_key/display_name. New application code should continue
-- supplying the catalog description explicitly.

CREATE OR REPLACE FUNCTION platform.populate_role_description()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF NEW.description IS NULL OR length(trim(NEW.description)) = 0 THEN
    NEW.description := COALESCE(
      NULLIF(trim(NEW.display_name), ''),
      NULLIF(trim(NEW.role_key), '')
    );
  END IF;

  IF NEW.description IS NULL OR length(trim(NEW.description)) = 0 THEN
    RAISE EXCEPTION 'Tenant role description cannot be empty'
      USING ERRCODE = '23514',
            CONSTRAINT = 'roles_description_nonempty';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS roles_populate_description ON platform.roles;

CREATE TRIGGER roles_populate_description
  BEFORE INSERT OR UPDATE OF role_key, display_name, description
  ON platform.roles
  FOR EACH ROW
  EXECUTE FUNCTION platform.populate_role_description();
