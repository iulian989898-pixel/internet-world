CREATE TABLE IF NOT EXISTS public.quiz_votes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id SMALLINT NOT NULL CHECK (question_id BETWEEN 1 AND 20),
  option_index SMALLINT NOT NULL CHECK (option_index BETWEEN 0 AND 2),
  session_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_vote_per_session_question UNIQUE (session_hash, question_id)
);

CREATE TABLE IF NOT EXISTS public.quiz_totals (
  question_id SMALLINT NOT NULL CHECK (question_id BETWEEN 1 AND 20),
  option_index SMALLINT NOT NULL CHECK (option_index BETWEEN 0 AND 2),
  votes BIGINT NOT NULL DEFAULT 0 CHECK (votes >= 0),
  PRIMARY KEY (question_id, option_index)
);

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id UUID PRIMARY KEY,
  session_hash CHAR(64) NOT NULL UNIQUE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100 AND score % 5 = 0),
  matches SMALLINT NOT NULL CHECK (matches BETWEEN 0 AND 20),
  title TEXT NOT NULL,
  rarity_percent NUMERIC(5,1),
  comparison_size INTEGER NOT NULL DEFAULT 0,
  quiz_version SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_results_score_idx ON public.quiz_results (score);
CREATE INDEX IF NOT EXISTS quiz_votes_session_idx ON public.quiz_votes (session_hash);

INSERT INTO public.quiz_totals (question_id, option_index, votes)
SELECT q.id, o.id, 0
FROM generate_series(1,20) AS q(id)
CROSS JOIN generate_series(0,2) AS o(id)
ON CONFLICT DO NOTHING;
