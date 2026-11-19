-- Replays produce new saved results without changing global voting statistics.
-- Keep first-time participant comparisons free of repeated attempts.
ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS is_replay BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.quiz_results
  ADD COLUMN IF NOT EXISTS origin_session_hash CHAR(64);
CREATE INDEX IF NOT EXISTS quiz_replays_origin_recent_idx
  ON public.quiz_results (origin_session_hash, created_at)
  WHERE is_replay = TRUE;
