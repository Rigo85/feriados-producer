ALTER TABLE scrape_runs
  DROP CONSTRAINT IF EXISTS scrape_runs_snapshot_id_fkey;

ALTER TABLE scrape_runs
  ADD CONSTRAINT scrape_runs_snapshot_id_fkey
  FOREIGN KEY (snapshot_id)
  REFERENCES holiday_snapshots(id)
  ON DELETE SET NULL;
