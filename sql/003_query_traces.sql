CREATE TABLE IF NOT EXISTS query_traces (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  route_pattern TEXT NOT NULL,
  request_path TEXT NOT NULL,
  query_string TEXT,
  status_code INTEGER NOT NULL,
  latency_ms DOUBLE PRECISION NOT NULL,
  client_ip TEXT,
  ip_source TEXT NOT NULL,
  remote_address TEXT,
  forwarded_for TEXT,
  user_agent TEXT,
  browser_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  query_params JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_query_traces_created_at
  ON query_traces (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_query_traces_route_pattern_created_at
  ON query_traces (route_pattern, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_query_traces_client_ip_created_at
  ON query_traces (client_ip, created_at DESC);
