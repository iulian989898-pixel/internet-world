-- Prior completed sessions must not retain individual answer patterns.
-- Final score and aggregate counts remain untouched.
DELETE FROM public.quiz_votes
WHERE session_hash IN (SELECT session_hash FROM public.quiz_results);
