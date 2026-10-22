-- Additive category nesting. The composite FK prevents cross-workspace parents.
ALTER TABLE "Category" ADD COLUMN "parentId" TEXT;
CREATE INDEX "Category_workspaceId_parentId_idx" ON "Category"("workspaceId", "parentId");
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_workspaceId_parentId_fkey"
  FOREIGN KEY ("workspaceId", "parentId") REFERENCES "Category"("workspaceId", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Even direct SQL writes cannot assign a parent of another kind or create a cycle.
CREATE OR REPLACE FUNCTION finova_check_category_parent() RETURNS trigger AS $$
DECLARE parent_kind "AccountKind";
BEGIN
  IF NEW."parentId" IS NULL THEN RETURN NEW; END IF;
  IF NEW."parentId" = NEW.id THEN
    RAISE EXCEPTION 'category cannot parent itself';
  END IF;
  SELECT kind INTO parent_kind FROM "Category"
    WHERE id = NEW."parentId" AND "workspaceId" = NEW."workspaceId";
  IF parent_kind IS NOT NULL AND parent_kind <> NEW.kind THEN
    RAISE EXCEPTION 'category parent kind must match';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId", ARRAY[id] AS seen FROM "Category"
        WHERE id = NEW."parentId" AND "workspaceId" = NEW."workspaceId"
      UNION ALL
      SELECT c.id, c."parentId", a.seen || c.id FROM "Category" c
        JOIN ancestors a ON c.id = a."parentId"
        WHERE c."workspaceId" = NEW."workspaceId" AND NOT c.id = ANY(a.seen)
    ) SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN RAISE EXCEPTION 'category hierarchy cycle'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER category_parent_integrity
BEFORE INSERT OR UPDATE OF "parentId", kind, "workspaceId" ON "Category"
FOR EACH ROW EXECUTE FUNCTION finova_check_category_parent();
