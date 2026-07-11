-- ── P-009B: Compliance Import Labeling Gate ────────────────────────────────────
-- RB-02 enforcement: imported compliance dates MUST be visibly distinguished
-- from natively-recorded dates at every surface where a landlord can see them.
--
-- The spreadsheet import (process_import_batch) already stores honest provenance
-- in provenance_events (actor_type='integration', source_type='spreadsheet_import').
-- This file exposes that provenance on the item row itself so the rendering layer
-- can show the "Attested import" label without a second round-trip.
--
-- Scope: tenancy_compliance_items only.
-- The old compliance_items table (used by PropertyComplianceCard, Portfolio Health,
-- and Command Centre) is NOT written to by the import, so those surfaces require
-- no change (IMPORTED-DATA-CANNOT-REACH-IT).

-- ── §1  Add import_batch_id column ──────────────────────────────────────────────
-- Nullable by default; populated by the trigger below and back-fill.
-- ON DELETE SET NULL: if an import batch is purged the label is removed, not errored.

ALTER TABLE public.tenancy_compliance_items
  ADD COLUMN IF NOT EXISTS import_batch_id uuid
    REFERENCES public.import_batches(id) ON DELETE SET NULL;

-- ── §2  Trigger: auto-set import_batch_id from provenance ───────────────────────
-- Fires after every INSERT into provenance_events.
-- Only acts when entity_type='compliance_item' and source_type='spreadsheet_import'
-- and the metadata carries the import_batch_id.
-- SECURITY DEFINER bypasses RLS on tenancy_compliance_items for the update.

CREATE OR REPLACE FUNCTION public._set_compliance_item_import_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entity_type    = 'compliance_item'
     AND NEW.source_type = 'spreadsheet_import'
     AND (NEW.metadata->>'import_batch_id') IS NOT NULL
  THEN
    UPDATE public.tenancy_compliance_items
    SET    import_batch_id = (NEW.metadata->>'import_batch_id')::uuid
    WHERE  id              = NEW.entity_id
      AND  import_batch_id IS NULL;  -- idempotent; never overwrite an existing value
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_compliance_item_import_batch
  ON public.provenance_events;

CREATE TRIGGER trg_set_compliance_item_import_batch
  AFTER INSERT ON public.provenance_events
  FOR EACH ROW
  EXECUTE FUNCTION public._set_compliance_item_import_batch();

-- ── §3  Back-fill: existing imported items from provenance ───────────────────────
-- Items that were imported before this column was added will already have a
-- provenance_events row with source_type='spreadsheet_import' and
-- metadata->>'import_batch_id'. This update maps that back onto the item row.
-- Idempotent on re-run (only updates where import_batch_id IS NULL).

UPDATE public.tenancy_compliance_items tci
SET    import_batch_id = pe.batch_id
FROM (
  SELECT DISTINCT ON (entity_id)
    entity_id,
    (metadata->>'import_batch_id')::uuid AS batch_id
  FROM   public.provenance_events
  WHERE  entity_type = 'compliance_item'
    AND  source_type = 'spreadsheet_import'
    AND  (metadata->>'import_batch_id') IS NOT NULL
  ORDER  BY entity_id, recorded_at
) pe
WHERE  tci.id             = pe.entity_id
  AND  tci.import_batch_id IS NULL
  AND  pe.batch_id        IS NOT NULL;

-- ── Comments ─────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.tenancy_compliance_items.import_batch_id IS
  'Non-null when this item was created by a spreadsheet import (P-009). '
  'Set by trg_set_compliance_item_import_batch after the provenance event is written. '
  'Used by the rendering layer to show the "Attested import — not independently verified" label (RB-02).';

COMMENT ON FUNCTION public._set_compliance_item_import_batch() IS
  'Trigger function (provenance_events AFTER INSERT) that sets '
  'tenancy_compliance_items.import_batch_id when a compliance_item.imported '
  'provenance event arrives with source_type=spreadsheet_import. '
  'Part of P-009B compliance import labeling gate (RB-02).';
