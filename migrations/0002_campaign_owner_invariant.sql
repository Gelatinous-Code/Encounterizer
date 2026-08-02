-- Enforce the final-owner invariant in SQLite as well as in the service. The
-- trigger closes the race where two owners are demoted or removed concurrently
-- after each request observed the other owner.
CREATE TRIGGER campaignMembership_keep_owner_on_role_change
BEFORE UPDATE OF role ON campaignMembership
WHEN OLD.role = 'owner'
  AND NEW.role <> 'owner'
  AND EXISTS (
    SELECT 1 FROM campaign
     WHERE id = OLD.campaignId
       AND deletedAt IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM campaignMembership
     WHERE campaignId = OLD.campaignId
       AND userId <> OLD.userId
       AND role = 'owner'
  )
BEGIN
  SELECT RAISE(ABORT, 'FINAL_OWNER_REQUIRED');
END;

CREATE TRIGGER campaignMembership_keep_owner_on_delete
BEFORE DELETE ON campaignMembership
WHEN OLD.role = 'owner'
  AND EXISTS (
    SELECT 1 FROM campaign
     WHERE id = OLD.campaignId
       AND deletedAt IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM campaignMembership
     WHERE campaignId = OLD.campaignId
       AND userId <> OLD.userId
       AND role = 'owner'
  )
BEGIN
  SELECT RAISE(ABORT, 'FINAL_OWNER_REQUIRED');
END;
