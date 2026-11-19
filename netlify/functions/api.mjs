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
    comparisonSize:Number(row.comparison_size),version:Number(row.quiz_version),
    createdAt:row.created_at
  };
}
async function countsFor(client,questionId) {
  const result=await client.query("SELECT option_index,votes FROM public.quiz_totals WHERE question_id = $1 ORDER BY option_index",[questionId]);
  const totals=[0,0,0];for(const row of result.rows)totals[Number(row.option_index)]=Number(row.votes);
  return totals;
}
async function start(req){
  const sess=new URL(req.url).searchParams.get("session");
  const hash=checkSession(sess);
  const db=getDatabase();
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
    const existing=await client.query("SELECT * FROM public.quiz_results WHERE session_hash=$1",[hash]);
    if(existing.rows.length){await client.query("COMMIT");return respond({result:exposedResult(existing.rows[0])});}
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
    const prev=await client.query("SELECT count(*)::int AS n, count(*) FILTER (WHERE score<=$1)::int AS lower FROM public.quiz_results WHERE quiz_version=$2",[score,VERSION]);
    const prior=Number(prev.rows[0].n),priorLower=Number(prev.rows[0].lower);
    const comparisonSize=prior+1;
    const rarityPercent=comparisonSize>=30?Math.round((priorLower+1)/comparisonSize*1000)/10:null;
    const id=randomUUID();
    const inserted=await client.query("INSERT INTO public.quiz_results (id,session_hash,score,matches,title,rarity_percent,comparison_size,quiz_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[id,hash,score,matches,tier.title,rarityPercent,comparisonSize,VERSION]);
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
    if(req.method==="GET"&&path==="start")return await start(req);
    if(req.method==="GET"&&path==="tally")return await tally(req);
    if(req.method==="GET"&&path==="result")return await result(req);
    if(req.method==="POST"&&path==="vote")return await vote(req);
    if(req.method==="POST"&&path==="finish")return await finish(req);
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
