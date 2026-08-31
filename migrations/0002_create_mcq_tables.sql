-- Migration number: 0002 	 2026-08-31T14:59:22.946Z

-- created_by and user_id are nullable on purpose. This app has no session management, so
-- no route can know who is acting; the columns exist so a later sprint can populate them
-- without a second migration. They stay NULL for now.

CREATE TABLE mcq_questions (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name          TEXT NOT NULL,
  question_text TEXT NOT NULL,
  created_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcq_choices (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  question_id TEXT NOT NULL REFERENCES mcq_questions (id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  is_correct  INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position    INTEGER NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- choice_id is SET NULL rather than CASCADE: replacing a choice during an edit must not
-- silently delete the attempt history that pointed at it. question_id still cascades, so
-- deleting a question does clear its attempts.
CREATE TABLE mcq_attempts (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  question_id TEXT NOT NULL REFERENCES mcq_questions (id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  choice_id   TEXT REFERENCES mcq_choices (id) ON DELETE SET NULL,
  is_correct  INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcq_questions_created_by ON mcq_questions (created_by);
CREATE INDEX idx_mcq_choices_question_id ON mcq_choices (question_id);
CREATE INDEX idx_mcq_attempts_question_id ON mcq_attempts (question_id);
CREATE INDEX idx_mcq_attempts_user_id ON mcq_attempts (user_id);
CREATE INDEX idx_mcq_attempts_choice_id ON mcq_attempts (choice_id);
