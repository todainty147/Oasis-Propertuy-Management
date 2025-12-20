-- =========================================================
-- ROW LEVEL SECURITY (RLS)
-- Oasis Rental Management App
-- SAFE / IDEMPOTENT VERSION
-- =========================================================

-- -------------------------
-- PROPERTIES
-- -------------------------
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "properties_select_own" ON properties;
DROP POLICY IF EXISTS "properties_insert_own" ON properties;
DROP POLICY IF EXISTS "properties_update_own" ON properties;
DROP POLICY IF EXISTS "properties_delete_own" ON properties;

CREATE POLICY "properties_select_own"
ON properties
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "properties_insert_own"
ON properties
FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "properties_update_own"
ON properties
FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "properties_delete_own"
ON properties
FOR DELETE
USING (owner_id = auth.uid());


-- -------------------------
-- TENANTS
-- -------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
DROP POLICY IF EXISTS "tenants_insert_own" ON tenants;
DROP POLICY IF EXISTS "tenants_update_own" ON tenants;
DROP POLICY IF EXISTS "tenants_delete_own" ON tenants;

CREATE POLICY "tenants_select_own"
ON tenants
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "tenants_insert_own"
ON tenants
FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "tenants_update_own"
ON tenants
FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "tenants_delete_own"
ON tenants
FOR DELETE
USING (owner_id = auth.uid());


-- -------------------------
-- PAYMENTS
-- -------------------------
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_own" ON payments;
DROP POLICY IF EXISTS "payments_insert_own" ON payments;
DROP POLICY IF EXISTS "payments_update_own" ON payments;
DROP POLICY IF EXISTS "payments_delete_own" ON payments;
DROP POLICY IF EXISTS "payments_property_must_be_owned" ON payments;

CREATE POLICY "payments_select_own"
ON payments
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "payments_insert_own"
ON payments
FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "payments_update_own"
ON payments
FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "payments_delete_own"
ON payments
FOR DELETE
USING (owner_id = auth.uid());

-- Prevent inserting payments for properties not owned by user
CREATE POLICY "payments_property_must_be_owned"
ON payments
FOR INSERT
WITH CHECK (
  owner_id = auth.uid()
  AND property_id IN (
    SELECT id FROM properties WHERE owner_id = auth.uid()
  )
);
