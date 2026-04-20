CREATE TABLE IF NOT EXISTS practice_word_records (
  record_id TEXT PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_practice_word_records_profile_id
  ON practice_word_records (profile_id);

CREATE TABLE IF NOT EXISTS practice_chapter_records (
  record_id TEXT PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_practice_chapter_records_profile_id
  ON practice_chapter_records (profile_id);

CREATE TABLE IF NOT EXISTS practice_review_records (
  record_id TEXT PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_practice_review_records_profile_id
  ON practice_review_records (profile_id);
