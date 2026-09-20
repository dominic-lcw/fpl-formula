CREATE TABLE IF NOT EXISTS seasons (
  season VARCHAR(9) PRIMARY KEY,
  source VARCHAR NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  season VARCHAR(9) NOT NULL,
  team_id INTEGER NOT NULL,
  name VARCHAR NOT NULL,
  short_name VARCHAR,
  strength_attack_home DOUBLE PRECISION,
  strength_attack_away DOUBLE PRECISION,
  strength_defence_home DOUBLE PRECISION,
  strength_defence_away DOUBLE PRECISION,
  PRIMARY KEY (season, team_id)
);

CREATE TABLE IF NOT EXISTS players (
  season VARCHAR(9) NOT NULL,
  player_id INTEGER NOT NULL,
  web_name VARCHAR NOT NULL,
  first_name VARCHAR,
  second_name VARCHAR,
  player_code INTEGER,
  team_id INTEGER,
  position VARCHAR NOT NULL,
  now_cost DOUBLE PRECISION,
  status VARCHAR,
  chance_of_playing_next_round INTEGER,
  selected_by_percent DOUBLE PRECISION,
  PRIMARY KEY (season, player_id)
);

CREATE TABLE IF NOT EXISTS player_season_summaries (
  season VARCHAR(9) NOT NULL,
  player_code INTEGER NOT NULL,
  web_name VARCHAR NOT NULL,
  position VARCHAR NOT NULL,
  total_points DOUBLE PRECISION,
  minutes DOUBLE PRECISION,
  expected_goals DOUBLE PRECISION,
  expected_assists DOUBLE PRECISION,
  defensive_contribution DOUBLE PRECISION,
  PRIMARY KEY (season, player_code)
);

CREATE TABLE IF NOT EXISTS fixtures (
  season VARCHAR(9) NOT NULL,
  fixture_id INTEGER NOT NULL,
  event INTEGER,
  kickoff_time TIMESTAMPTZ,
  team_h INTEGER NOT NULL,
  team_a INTEGER NOT NULL,
  team_h_score INTEGER,
  team_a_score INTEGER,
  team_h_difficulty INTEGER,
  team_a_difficulty INTEGER,
  finished BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (season, fixture_id)
);

CREATE TABLE IF NOT EXISTS player_fixture_stats (
  season VARCHAR(9) NOT NULL,
  player_id INTEGER NOT NULL,
  fixture_id INTEGER NOT NULL,
  event INTEGER,
  opponent_team INTEGER,
  was_home BOOLEAN,
  total_points DOUBLE PRECISION,
  minutes DOUBLE PRECISION,
  goals_scored DOUBLE PRECISION,
  assists DOUBLE PRECISION,
  clean_sheets DOUBLE PRECISION,
  goals_conceded DOUBLE PRECISION,
  bonus DOUBLE PRECISION,
  bps DOUBLE PRECISION,
  expected_goals DOUBLE PRECISION,
  expected_assists DOUBLE PRECISION,
  expected_goal_involvements DOUBLE PRECISION,
  expected_goals_conceded DOUBLE PRECISION,
  defensive_contribution DOUBLE PRECISION,
  influence DOUBLE PRECISION,
  creativity DOUBLE PRECISION,
  threat DOUBLE PRECISION,
  ict_index DOUBLE PRECISION,
  PRIMARY KEY (season, player_id, fixture_id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY,
  season VARCHAR(9) NOT NULL,
  source VARCHAR NOT NULL,
  status VARCHAR NOT NULL,
  records_loaded INTEGER NOT NULL DEFAULT 0,
  details VARCHAR,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY,
  fixture_id INTEGER NOT NULL,
  season VARCHAR(9) NOT NULL,
  home_team VARCHAR NOT NULL,
  away_team VARCHAR NOT NULL,
  market VARCHAR NOT NULL,
  selection VARCHAR NOT NULL,
  stake DOUBLE PRECISION NOT NULL,
  odds DOUBLE PRECISION NOT NULL,
  expected_home_goals DOUBLE PRECISION NOT NULL,
  expected_away_goals DOUBLE PRECISION NOT NULL,
  model_prob DOUBLE PRECISION NOT NULL,
  expected_value DOUBLE PRECISION NOT NULL,
  notes VARCHAR,
  booked_at TIMESTAMPTZ NOT NULL,
  status VARCHAR NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  outcome VARCHAR,
  pnl DOUBLE PRECISION,
  settled_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_open_unique
  ON bookings (season, fixture_id, market, selection)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS fixture_results (
  season VARCHAR(9) NOT NULL,
  fixture_id INTEGER NOT NULL,
  team_h_score INTEGER NOT NULL,
  team_a_score INTEGER NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL,
  source VARCHAR NOT NULL,
  PRIMARY KEY (season, fixture_id)
);

CREATE INDEX IF NOT EXISTS idx_fixtures_season_event ON fixtures (season, event);
CREATE INDEX IF NOT EXISTS idx_player_fixture_stats_season_event ON player_fixture_stats (season, event);
CREATE INDEX IF NOT EXISTS idx_bookings_season_status ON bookings (season, status);
