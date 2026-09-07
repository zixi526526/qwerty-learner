-- Practice records were keyed by record_id alone, so a record id submitted by one
-- profile could overwrite another profile's row (the conflict branch never checked
-- or updated profile_id). Re-key every practice table on (profile_id, record_id)
-- so each profile owns an independent copy.

CREATE TABLE practice_word_records_scoped (
  profile_id INTEGER NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, record_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

INSERT INTO practice_word_records_scoped (profile_id, record_id, payload, updated_at)
  SELECT profile_id, record_id, payload, updated_at FROM practice_word_records;

DROP TABLE practice_word_records;
ALTER TABLE practice_word_records_scoped RENAME TO practice_word_records;

CREATE TABLE practice_chapter_records_scoped (
  profile_id INTEGER NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, record_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

INSERT INTO practice_chapter_records_scoped (profile_id, record_id, payload, updated_at)
  SELECT profile_id, record_id, payload, updated_at FROM practice_chapter_records;

DROP TABLE practice_chapter_records;
ALTER TABLE practice_chapter_records_scoped RENAME TO practice_chapter_records;

CREATE TABLE practice_review_records_scoped (
  profile_id INTEGER NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, record_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

INSERT INTO practice_review_records_scoped (profile_id, record_id, payload, updated_at)
  SELECT profile_id, record_id, payload, updated_at FROM practice_review_records;

DROP TABLE practice_review_records;
ALTER TABLE practice_review_records_scoped RENAME TO practice_review_records;
