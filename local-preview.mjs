/**
 * THE INTERNET DECIDES — personal offline-ish preview.
 * Run with: node local-preview.mjs
 * Binds to 127.0.0.1 only. Votes and results are stored exclusively on this PC.
 * No Netlify, PocketBase, Docker, API keys, or external database needed.
 */
import http from "node:http";
import {readFile,stat} from "node:fs/promises";
import {existsSync,readFileSync,writeFileSync,renameSync} from "node:fs";
import {join,resolve,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash,randomUUID} from "node:crypto";
import {exec} from "node:child_process";
import {QUESTIONS,VERSION,scoreFor,tierFor} from "./netlify/lib/game.mjs";

const ROOT=fileURLToPath(new URL(".",import.meta.url));
const SITE=resolve(ROOT,"site");
const DATA=join(ROOT,".local-preview-data.json");
const HOST="127.0.0.1";
const PORT=4173;
const SESSION=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mime={
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".svg":"image/svg+xml",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".ico":"image/x-icon",
  ".webp":"image/webp",
  ".woff2":"font/woff2",
  ".json":"application/json; charset=utf-8"
};
const fresh=()=>({
  votes:{},
  totals:Object.fromEntries(QUESTIONS.map(q=>[q.id,[0,0,0]])),
  results:{},
  sessions:{}
});
function load(){
  if(!existsSync(DATA))return fresh();
  try{
    const saved=JSON.parse(readFileSync(DATA,"utf8"));
    if(!saved||!saved.votes||!saved.totals||!saved.results||!saved.sessions)throw Error("Bad data");
    return saved;
  }catch(error){
    console.error("Cannot read your local voting data. No records were deleted:",error.message);
    process.exit(1);
  }
}
const db=load();
function save(){
  const tmp=DATA+".tmp";
  writeFileSync(tmp,JSON.stringify(db,null,2));
  renameSync(tmp,DATA);
}
const hash=s=>createHash("sha256").update(s).digest("hex");
function userSession(raw){
  if(typeof raw!=="string"||!SESSION.test(raw))throw Object.assign(Error("A valid session is required."),{status:400});
  return hash(raw);
}
function totals(id){return db.totals[id]||[0,0,0];}
function allCounts(){return new Map(QUESTIONS.map(q=>[q.id,totals(q.id)]));}
function completedNonReplays(){
  return Object.values(db.results).filter(r=>!r.isReplay&&r.version===VERSION);
}
function snapshotRarity(score,isReplay){
  const others=completedNonReplays();
  const count=others.length+(isReplay?0:1);
  const lower=others.filter(r=>r.score<=score).length+(isReplay?0:1);
  return {comparisonSize:count,rarityPercent:count>=30?Math.round(lower/count*1000)/10:null};
}
function savedResult(sessionHash,answers,isReplay=false,originHash=null){
  const scoreData=scoreFor(answers,allCounts());
  const rarity=snapshotRarity(scoreData.score,isReplay);
  const item={
    id:randomUUID(),score:scoreData.score,matches:scoreData.matches,
    title:tierFor(scoreData.score).title,
    rarityPercent:rarity.rarityPercent,comparisonSize:rarity.comparisonSize,
    version:VERSION,createdAt:new Date().toISOString(),isReplay,
    originSessionHash:originHash
  };
  db.results[item.id]=item;
  db.sessions[sessionHash]=item.id;
  return item;
}
function expose(r){
  const {originSessionHash,...publicResult}=r;
  return publicResult;
}
function json(res,body,status=200){
  res.writeHead(status,{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff"
  });
  res.end(JSON.stringify(body));
}
async function body(req){
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>2048)throw Object.assign(Error("Request too large."),{status:413});
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
  catch{throw Object.assign(Error("Invalid JSON."),{status:400});}
}
function ensureId(q){
  const n=Number(q);
  if(!Number.isInteger(n)||n<1||n>QUESTIONS.length)throw Object.assign(Error("Invalid question."),{status:400});
  return n;
}
function ensureOption(o){
  if(!Number.isInteger(o)||o<0||o>2)throw Object.assign(Error("Invalid option."),{status:400});
  return o;
}
async function api(req,res,path,url){
  if(req.method==="GET"&&path==="/api/health")return json(res,{status:"ok",database:"local PC",version:VERSION});
  if(req.method==="GET"&&path==="/api/questions")return json(res,{version:VERSION,questions:QUESTIONS});
  if(req.method==="GET"&&path==="/api/tally"){
    const id=ensureId(url.searchParams.get("q"));
    return json(res,{questionId:id,totals:totals(id),total:totals(id).reduce((a,b)=>a+b,0)});
  }
  if(req.method==="GET"&&path==="/api/result"){
    const id=url.searchParams.get("id");
    if(!id||!SESSION.test(id))return json(res,{error:"Invalid result link."},400);
    const r=db.results[id];
    return r?json(res,{result:expose(r)}):json(res,{error:"Result not found on this PC."},404);
  }
  if(req.method!=="POST")return json(res,{error:"Not found."},404);
  const origin=req.headers.origin;
  if(origin&&origin!=="http://"+HOST+":"+PORT&&origin!=="http://localhost:"+PORT)
    return json(res,{error:"Cross-origin requests are not allowed."},403);
  const input=await body(req);
  if(path==="/api/start"){
    const key=userSession(input.session);
    const finished=db.sessions[key]?db.results[db.sessions[key]]:null;
    if(finished)return json(res,{version:VERSION,result:expose(finished)});
    const votes=db.votes[key]||{};
    return json(res,{version:VERSION,questions:QUESTIONS,
      votes:Object.entries(votes).map(([q,option])=>({questionId:Number(q),option}))});
  }
  if(path==="/api/vote"){
    const key=userSession(input.session);
    const id=ensureId(input.questionId);
    const option=ensureOption(input.option);
    if(db.sessions[key])return json(res,{error:"This quiz has already been completed."},409);
    if(!db.votes[key])db.votes[key]={};
    const old=db.votes[key][id];
    const alreadyVoted=old!==undefined;
    const chosen=alreadyVoted?old:option;
    if(!alreadyVoted){
      db.votes[key][id]=chosen;
      db.totals[id][chosen]++;
      save();
    }
    const row=totals(id);
    return json(res,{accepted:true,alreadyVoted,option:chosen,totals:row,total:row.reduce((a,b)=>a+b,0)});
  }
  if(path==="/api/finish"){
    const key=userSession(input.session);
    if(db.sessions[key])return json(res,{result:expose(db.results[db.sessions[key]])});
    const votes=db.votes[key]||{};
    if(QUESTIONS.some(q=>!Number.isInteger(votes[q.id])))return json(res,{error:"Answer all 20 questions first."},409);
    const answers=new Map(QUESTIONS.map(q=>[q.id,votes[q.id]]));
    const result=savedResult(key,answers);
    delete db.votes[key]; // Only global totals and the final score survive completion.
    save();
    return json(res,{result:expose(result)});
  }
  if(path==="/api/replay-finish"){
    const original=userSession(input.originalSession);
    const key=userSession(input.session);
    if(key===original)return json(res,{error:"Use a fresh replay session."},400);
    const previous=db.sessions[key]?db.results[db.sessions[key]]:null;
    if(previous){
      if(previous.isReplay&&previous.originSessionHash===original)return json(res,{result:expose(previous)});
      return json(res,{error:"Attempt identifier is already used."},409);
    }
    const first=db.sessions[original]?db.results[db.sessions[original]]:null;
    if(!first||first.isReplay)return json(res,{error:"Complete your first test before replaying."},409);
    if(!Array.isArray(input.answers)||input.answers.length!==20||
      !input.answers.every(n=>Number.isInteger(n)&&n>=0&&n<=2))
      return json(res,{error:"Answer all 20 questions first."},400);
    const yesterday=Date.now()-24*60*60*1000;
    const count=Object.values(db.results).filter(r=>
      r.isReplay&&r.originSessionHash===original&&Date.parse(r.createdAt)>=yesterday).length;
    if(count>=20)return json(res,{error:"Daily replay limit reached."},429);
    const answers=new Map(QUESTIONS.map((q,i)=>[q.id,input.answers[i]]));
    const result=savedResult(key,answers,true,original);
    save();
    return json(res,{result:expose(result)});
  }
  return json(res,{error:"Not found."},404);
}
async function staticFile(res,path){
  const file=resolve(SITE,"."+path);
  if(file!==SITE&&!file.startsWith(SITE+sep))return json(res,{error:"Bad path."},400);
  let real=file;
  try {
    const info=await stat(real);
    if(info.isDirectory())real=join(real,"index.html");
    let content=await readFile(real);
    // Mark the preview unmistakably as local, never as real internet-wide polling.
    if(real===join(SITE,"index.html")){
      content=Buffer.from(content.toString("utf8").replace(
        '<main class="layout">',
        '<div role="status" style="position:relative;z-index:3;text-align:center;padding:9px 14px;background:#182719;color:#d6f7b9;font:12px Arial,sans-serif">LOCAL PREVIEW · Only your PC votes are counted. No internet-wide results.</div><main class="layout">'
      ));
    }else if(real===join(SITE,"app.js")){
      content=Buffer.from(content.toString("utf8").replace('" GLOBAL VOTES"','" LOCAL TEST VOTES"'));
    }
    res.writeHead(200,{"Content-Type":mime[extname(real).toLowerCase()]||"application/octet-stream","Cache-Control":"no-cache","X-Content-Type-Options":"nosniff"});
    res.end(content);
  }catch{
    json(res,{error:"File not found."},404);
  }
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,"http://"+HOST+":"+PORT);
    const path=decodeURIComponent(url.pathname);
    if(path.startsWith("/api/"))return await api(req,res,path,url);
    if(req.method!=="GET"&&req.method!=="HEAD")return json(res,{error:"Method not allowed."},405);
    return await staticFile(res,path==="/"?"/index.html":path);
  }catch(error){
    console.error("Local preview:",error.message);
    return json(res,{error:error.status?error.message:"Local preview error."},error.status||500);
  }
});
server.on("error",error=>{
  console.error("Cannot start local preview:",error.message);
  process.exitCode=1;
});
server.listen(PORT,HOST,()=>{
  const address="http://"+HOST+":"+PORT;
  console.log("\nTHE INTERNET DECIDES — LOCAL PREVIEW");
  console.log("Open: "+address);
  console.log("Your votes stay on this PC. No internet hosting is needed.");
  console.log("To stop the server, close this window or press Ctrl+C.\n");
  if(process.platform==="win32"&&process.env.NO_AUTO_OPEN!=="1"){
    exec('start "" "'+address+'"',{windowsHide:true},()=>{});
  }
});
