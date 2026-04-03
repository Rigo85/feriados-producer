CREATE TABLE IF NOT EXISTS holiday_baselines (
  year INTEGER NOT NULL,
  scope TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  month INTEGER NOT NULL,
  day INTEGER NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  source_label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, scope, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_holiday_baselines_scope_year_date
  ON holiday_baselines (scope, year, holiday_date);

CREATE TABLE IF NOT EXISTS scrape_run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL,
  code TEXT NOT NULL,
  holiday_date DATE,
  scope TEXT,
  message TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_scrape_run_events_run_id
  ON scrape_run_events (run_id, created_at);

ALTER TABLE holidays_current
  ADD COLUMN IF NOT EXISTS source_of_truth TEXT;

ALTER TABLE holidays_current
  ADD COLUMN IF NOT EXISTS last_confirmed_snapshot_id BIGINT REFERENCES holiday_snapshots(id);

UPDATE holidays_current
SET source_of_truth = COALESCE(source_of_truth, 'gobpe'),
    last_confirmed_snapshot_id = COALESCE(last_confirmed_snapshot_id, snapshot_id);

ALTER TABLE holidays_current
  ALTER COLUMN source_of_truth SET DEFAULT 'baseline';

ALTER TABLE holidays_current
  ALTER COLUMN source_of_truth SET NOT NULL;

INSERT INTO holiday_baselines (
  year,
  scope,
  holiday_date,
  month,
  day,
  name,
  notes,
  source_label,
  is_active
)
VALUES
  (2026, 'national', DATE '2026-01-01', 1, 1, 'Año Nuevo', 'Inamovible', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-04-02', 4, 2, 'Semana Santa', 'Fin de semana largo', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-04-03', 4, 3, 'Semana Santa', 'Fin de semana largo', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-05-01', 5, 1, 'Día del Trabajo', 'Inamovible; en 2026, forma un fin de semana largo.', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-06-07', 6, 7, 'Batalla de Arica y Día de la Bandera', NULL, 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-06-29', 6, 29, 'Día de San Pedro y San Pablo', 'Fin de semana largo', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-07-23', 7, 23, 'Día de la Fuerza Aérea del Perú', NULL, 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-07-28', 7, 28, 'Fiestas Patrias', NULL, 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-07-29', 7, 29, 'Fiestas Patrias', NULL, 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-08-06', 8, 6, 'Batalla de Junín', 'Inamovible', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-08-30', 8, 30, 'Santa Rosa de Lima', 'Inamovible', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-10-08', 10, 8, 'Combate de Angamos', 'Inamovible', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-11-01', 11, 1, 'Día de Todos los Santos', NULL, 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-12-08', 12, 8, 'Inmaculada Concepción', 'Inamovible', 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-12-09', 12, 9, 'Batalla de Ayacucho', NULL, 'seed_2026_table', TRUE),
  (2026, 'national', DATE '2026-12-25', 12, 25, 'Navidad', 'Inamovible', 'seed_2026_table', TRUE)
ON CONFLICT (year, scope, holiday_date) DO UPDATE
SET month = EXCLUDED.month,
    day = EXCLUDED.day,
    name = EXCLUDED.name,
    notes = EXCLUDED.notes,
    source_label = EXCLUDED.source_label,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
