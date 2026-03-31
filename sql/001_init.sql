CREATE TABLE IF NOT EXISTS holiday_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash TEXT NOT NULL,
  normalized_hash TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  raw_html TEXT NOT NULL,
  normalized_payload JSONB NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS holiday_snapshot_items (
  snapshot_id BIGINT NOT NULL REFERENCES holiday_snapshots(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, holiday_date)
);

CREATE TABLE IF NOT EXISTS holidays_current (
  holiday_date DATE PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  snapshot_id BIGINT NOT NULL REFERENCES holiday_snapshots(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holidays_current_year_date
  ON holidays_current (year, holiday_date);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id BIGSERIAL PRIMARY KEY,
  trigger TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  http_status INTEGER,
  used_browser_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  changed BOOLEAN NOT NULL DEFAULT FALSE,
  error_code TEXT,
  error_message TEXT,
  snapshot_id BIGINT REFERENCES holiday_snapshots(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_holiday_snapshots_current
  ON holiday_snapshots (is_current)
  WHERE is_current = TRUE;
