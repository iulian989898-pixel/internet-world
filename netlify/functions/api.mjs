import {getDatabase} from "@netlify/database";
import {createHash,randomUUID} from "node:crypto";
import {QUESTIONS,VERSION,tierFor,scoreFor} from "../lib/game.mjs";

const SESSION=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID=SESSION;

function respond(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store, max-age=0","x-content-type-options":"nosniff"}});
}
function digest(session){return createHash("sha256").update(session).digest("hex");}
async function input(req){
  const raw=await req.text();
  if(raw.length>2048) throw Object.assign(Error("Request too large"),{status:413});
  try{return JSON.parse(raw);}catch{throw Object.assign(Error("Invalid JSON"),{status:400});}
}
function checkSession(s){
  if(typeof s!=="string"||!SESSION.test(s)) throw Object.assign(Error("A valid anonymous session is required"),{status:400});
  return digest(s);
}
function exposedResult(row){
  return {
    id:row.id,score:Number(row.score),matches:Number(row.matches),title:row.title,
    rarityPercent:row.rarity_percent==null?null:Number(row.rarity_percent),
    comparisonSize:Number(row.comparison_size),version:Number(row.quiz_version),isReplay:Boolean(row.is_replay),
    createdAt:row.created_at
  };
}
async function countsFor(client,questionId) {
  const result=await client.query("SELECT option_index,votes FROM public.quiz_totals WHERE question_id = $1 ORDER BY option_index",[questionId]);
  const totals=[0,0,0];for(const row of result.rows)totals[Number(row.option_index)]=Number(row.votes);
  return totals;
}
async function start(req){
  // POST keeps the anonymous session token out of query strings and access logs.
  const data=await input(req);
  const hash=checkSession(data.session);
  const db=getDatabase();
  const finished=await db.pool.query("SELECT * FROM public.quiz_results WHERE session_hash=$1",[hash]);
  if(finished.rows.length)return respond({version:VERSION,result:exposedResult(finished.rows[0])});
  const row=await db.pool.query("SELECT question_id,option_index FROM public.quiz_votes WHERE session_hash = $1 ORDER BY question_id",[hash]);
  return respond({version:VERSION,questions:QUESTIONS,votes:row.rows.map(r=>({questionId:Number(r.question_id),option:Number(r.option_index)}))});
}
async function tally(req){
  const q=Number(new URL(req.url).searchParams.get("q"));
  if(!Number.isInteger(q)||q<1||q>QUESTIONS.length)return respond({error:"Invalid question"},400);
  const db=getDatabase();
  const totals=await countsFor(db.pool,q);
  return respond({questionId:q,totals,total:totals.reduce((a,b)=>a+b,0)});
}
async function vote(req){
  const data=await input(req);
  const hash=checkSession(data.session);
  const questionId=Number(data.questionId),option=Number(data.option);
  if(!Number.isInteger(questionId)||questionId<1||questionId>QUESTIONS.length||!Number.isInteger(option)||option<0||option>2)
    return respond({error:"Invalid answer"},400);
  const db=getDatabase(),client=await db.pool.connect();
  let selected=option,alreadyVoted=false;
  try{
    await client.query("BEGIN");
    // Serializes overlapping vote/finish requests for the same anonymous session.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[hash]);
    const finished=await client.query("SELECT 1 FROM public.quiz_results WHERE session_hash=$1 LIMIT 1",[hash]);
    if(finished.rows.length){await client.query("ROLLBACK");return respond({error:"This quiz has already been completed."},409);}
    const previous=await client.query("SELECT option_index FROM public.quiz_votes WHERE session_hash=$1 AND question_id=$2",[hash,questionId]);
    if(previous.rows.length){
      selected=Number(previous.rows[0].option_index);alreadyVoted=true;
    }else{
      const recent=await client.query("SELECT 1 FROM public.quiz_votes WHERE session_hash=$1 AND created_at>now()-interval '500 milliseconds' LIMIT 1",[hash]);
      if(recent.rows.length){await client.query("ROLLBACK");return respond({error:"Please wait a moment before the next answer."},429);}
      const inserted=await client.query("INSERT INTO public.quiz_votes (session_hash,question_id,option_index) VALUES($1,$2,$3) ON CONFLICT (session_hash,question_id) DO NOTHING RETURNING option_index",[hash,questionId,option]);
      if(!inserted.rows.length){
        const existing=await client.query("SELECT option_index FROM public.quiz_votes WHERE session_hash=$1 AND question_id=$2",[hash,questionId]);
        if(!existing.rows.length)throw Error("Concurrent vote conflict");
        selected=Number(existing.rows[0].option_index);alreadyVoted=true;
      }else{
        await client.query("UPDATE public.quiz_totals SET votes=votes+1 WHERE question_id=$1 AND option_index=$2",[questionId,option]);
      }
    }
    await client.query("COMMIT");
    const totals=await countsFor(client,questionId);
    return respond({accepted:true,alreadyVoted,option:selected,totals,total:totals.reduce((a,b)=>a+b,0)});
  }catch(e){
    try{await client.query("ROLLBACK");}catch{}
    throw e;
  }finally{client.release();}
}
async function finish(req){
  const data=await input(req),hash=checkSession(data.session);
  const client=await getDatabase().pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[hash]);
    const existing=await client.query("SELECT * FROM public.quiz_results WHERE session_hash=$1",[hash]);
    if(existing.rows.length){
      // Purge any previously saved individual answers; keep score and global totals.
      await client.query("DELETE FROM public.quiz_votes WHERE session_hash=$1",[hash]);
      await client.query("COMMIT");
      return respond({result:exposedResult(existing.rows[0])});
    }
    const selection=await client.query("SELECT question_id,option_index FROM public.quiz_votes WHERE session_hash=$1 ORDER BY question_id",[hash]);
    if(selection.rows.length!==QUESTIONS.length){
      await client.query("ROLLBACK");
      return respond({error:"Answer all 20 questions before requesting a score."},409);
    }
    const totals=await client.query("SELECT question_id,option_index,votes FROM public.quiz_totals ORDER BY question_id,option_index");
    const counts=new Map();
    for(const row of totals.rows){
      const id=Number(row.question_id);
      if(!counts.has(id))counts.set(id,[0,0,0]);
      counts.get(id)[Number(row.option_index)]=Number(row.votes);
    }
    const answers=new Map(selection.rows.map(r=>[Number(r.question_id),Number(r.option_index)]));
    const {matches,score}=scoreFor(answers,counts);
    const tier=tierFor(score);
    const prev=await client.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE score<=$1)::int AS lower FROM public.quiz_results WHERE quiz_version=$2 AND is_replay=FALSE",[score,VERSION]);
    const prior=Number(prev.rows[0].n),priorLower=Number(prev.rows[0].lower);
    const comparisonSize=prior+1;
    const rarityPercent=comparisonSize>=30?Math.round((priorLower+1)/comparisonSize*1000)/10:null;
    const id=randomUUID();
    const inserted=await client.query("INSERT INTO public.quiz_results (id,session_hash,score,matches,title,rarity_percent,comparison_size,quiz_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[id,hash,score,matches,tier.title,rarityPercent,comparisonSize,VERSION]);
    // Keep only aggregate vote counts and the saved final score after completion.
    await client.query("DELETE FROM public.quiz_votes WHERE session_hash=$1",[hash]);
    await client.query("COMMIT");
    return respond({result:exposedResult(inserted.rows[0])});
  }catch(e){
    try{await client.query("ROLLBACK");}catch{}
    if(e.code==="23505"){
      const existing=await getDatabase().pool.query("SELECT * FROM public.quiz_results WHERE session_hash=$1",[hash]);
      if(existing.rows.length)return respond({result:exposedResult(existing.rows[0])});
    }
    throw e;
  }finally{client.release();}
}

async function replayFinish(req) {
  const data=await input(req);
  const originHash=checkSession(data.originalSession);
  const sessionHash=checkSession(data.session);
  if(originHash===sessionHash)return respond({error:"Use a new attempt for replay."},400);
  if(!Array.isArray(data.answers)||data.answers.length!==QUESTIONS.length||
      !data.answers.every(value=>Number.isInteger(value)&&value>=0&&value<=2))
    return respond({error:"Please complete all 20 questions."},400);
  const client=await getDatabase().pool.connect();
  try {
    await client.query("BEGIN");
    // A replay is connected to a completed first attempt and cannot alter vote totals.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[originHash]);
    const priorResult=await client.query("SELECT * FROM public.quiz_results WHERE session_hash=$1",[sessionHash]);
    if(priorResult.rows.length){
      if(!priorResult.rows[0].is_replay||priorResult.rows[0].origin_session_hash?.trim()!==originHash){
        await client.query("ROLLBACK");
        return respond({error:"Attempt identifier already used."},409);
      }
      await client.query("COMMIT");
      return respond({result:exposedResult(priorResult.rows[0])});
    }
    const first=await client.query("SELECT id FROM public.quiz_results WHERE session_hash=$1 AND is_replay=FALSE",[originHash]);
    if(!first.rows.length){
      await client.query("ROLLBACK");
      return respond({error:"Complete the quiz once before replaying."},409);
    }
    const recent=await client.query("SELECT count(*)::int AS n FROM public.quiz_results WHERE origin_session_hash=$1 AND created_at>now()-interval '24 hours'",[originHash]);
    if(Number(recent.rows[0].n)>=20){
      await client.query("ROLLBACK");
      return respond({error:"You have reached the daily replay limit. Try again tomorrow."},429);
    }
    const rows=await client.query("SELECT question_id,option_index,votes FROM public.quiz_totals ORDER BY question_id,option_index");
    const counts=new Map();
    for(const row of rows.rows){
      const id=Number(row.question_id);
      if(!counts.has(id))counts.set(id,[0,0,0]);
      counts.get(id)[Number(row.option_index)]=Number(row.votes);
    }
    const answers=new Map(QUESTIONS.map((q,i)=>[q.id,data.answers[i]]));
    const {matches,score}=scoreFor(answers,counts);
    const previous=await client.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE score<=$1)::int AS lower FROM public.quiz_results WHERE quiz_version=$2 AND is_replay=FALSE",[score,VERSION]);
    const peers=Number(previous.rows[0].n),sameOrLower=Number(previous.rows[0].lower);
    const rarityPercent=peers>=30?Math.round(sameOrLower/peers*1000)/10:null;
    const tier=tierFor(score);
    const inserted=await client.query(
      "INSERT INTO public.quiz_results (id,session_hash,score,matches,title,rarity_percent,comparison_size,quiz_version,is_replay,origin_session_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9) RETURNING *",
      [randomUUID(),sessionHash,score,matches,tier.title,rarityPercent,peers,VERSION,originHash]
    );
    await client.query("COMMIT");
    return respond({result:exposedResult(inserted.rows[0])});
  } catch(e) {
    try{await client.query("ROLLBACK");}catch{}
    throw e;
  } finally {client.release();}
}

async function result(req){
  const id=new URL(req.url).searchParams.get("id");
  if(!id||!UUID.test(id))return respond({error:"Invalid result link"},400);
  const q=await getDatabase().pool.query("SELECT * FROM public.quiz_results WHERE id=$1",[id]);
  if(!q.rows.length)return respond({error:"This result was not found."},404);
  return respond({result:exposedResult(q.rows[0])});
}
export default async function handler(req){
  const path=new URL(req.url).pathname.split("/").filter(Boolean).pop();
  try {
    // Browser CSRF mitigation; not a replacement for bot mitigation or rate limiting.
    if(req.method==="POST"){
      const origin=req.headers.get("origin");
      if(origin&&origin!==new URL(req.url).origin)return respond({error:"Cross-origin requests are not allowed."},403);
    }
    if(req.method==="POST"&&path==="start")return await start(req);
    if(req.method==="GET"&&path==="questions")return respond({version:VERSION,questions:QUESTIONS});
    if(req.method==="GET"&&path==="tally")return await tally(req);
    if(req.method==="GET"&&path==="result")return await result(req);
    if(req.method==="POST"&&path==="vote")return await vote(req);
    if(req.method==="POST"&&path==="finish")return await finish(req);
    if(req.method==="POST"&&path==="replay-finish")return await replayFinish(req);
    if(req.method==="GET"&&path==="health"){
      await getDatabase().pool.query("SELECT 1");
      return respond({status:"ok",database:"connected",version:VERSION});
    }
    return respond({error:"Not found"},404);
  } catch(err) {
    if(err.status)return respond({error:err.message},err.status);
    console.error("Internet Decides API failure:",err?.message||err);
    return respond({error:"Service temporarily unavailable. Please try again shortly."},503);
  }
}
