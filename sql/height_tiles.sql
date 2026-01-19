-- Height tile schema for storing compressed elevation grids
CREATE TABLE IF NOT EXISTS height_tiles (
  id SERIAL PRIMARY KEY,
  tile_key TEXT UNIQUE NOT NULL,
  min_lat DOUBLE PRECISION NOT NULL,
  min_lon DOUBLE PRECISION NOT NULL,
  max_lat DOUBLE PRECISION NOT NULL,
  max_lon DOUBLE PRECISION NOT NULL,
  resolution_m DOUBLE PRECISION NOT NULL,
  grid_w INT NOT NULL,
  grid_h INT NOT NULL,
  heights BYTEA NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
