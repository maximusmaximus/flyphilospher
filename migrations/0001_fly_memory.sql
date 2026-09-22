CREATE EXTENSION IF NOT EXISTS cube;

CREATE TABLE IF NOT EXISTS fly_memory (
  id text PRIMARY KEY,
  label text NOT NULL,
  embedding cube NOT NULL,
  x real NOT NULL,
  y real NOT NULL,
  z real NOT NULL,
  valence real NOT NULL,
  visits integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fly_memory_embedding_gist ON fly_memory USING gist (embedding);
