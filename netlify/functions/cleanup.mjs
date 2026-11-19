import {getDatabase} from "@netlify/database";

// Netlify invokes this once daily on production to remove stale incomplete ballots.
// Aggregated vote counts remain; old unfinished sessions cannot resume after expiry.
export default async function cleanup(){
  await getDatabase().pool.query(
    "DELETE FROM public.quiz_votes WHERE created_at < now() - interval '30 days'"
  );
  return new Response(null,{status:204});
}
export const config = {schedule:"@daily"};
