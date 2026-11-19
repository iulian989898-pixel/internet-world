(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
var API="/api/";
var state={session:null,questions:[],votes:new Map(),index:0,choice:null,totals:null,result:null,busy:false,poll:null,toastTimer:null,advanceTimer:null,countdownTimer:null,advanceAt:null,replay:false,replayId:null};
var tiers=[
  {min:0,max:8,title:"MATRIX ERROR",icon:"🛸"},
  {min:9,max:17,title:"ALIEN IN DISGUISE",icon:"👽"},
  {min:18,max:29,title:"THINKING IN REVERSE",icon:"🧠"},
  {min:30,max:39,title:"AGENT OF CHAOS",icon:"🦝"},
  {min:40,max:48,title:"EXPERIMENTAL HUMAN",icon:"🧪"},
  {min:49,max:57,title:"MIXED SIGNAL",icon:"📡"},
  {min:58,max:68,title:"SUSPICIOUSLY HUMAN",icon:"🤨"},
  {min:69,max:78,title:"CERTIFIED INTERNET CITIZEN",icon:"🌍"},
  {min:79,max:89,title:"ALMOST TOO NORMAL",icon:"😎"},
  {min:90,max:100,title:"LEGENDARY NPC",icon:"🏆"}
];
function color(score){return score<40?"red":score<69?"blue":"green";}
function tier(score){return tiers.find(function(t){return score>=t.min&&score<=t.max;})||tiers[0];}
function current(){return state.questions[state.index];}
function hideAll(){
  ["quizScreen","resultScreen","sharedScreen","errorScreen","loadingScreen"].forEach(function(id){$(id).hidden=true;});
}
function show(id){hideAll();$(id).hidden=false;}
function stage(s){$("stageLabel").textContent=s;}
function progress(p){$("progressFill").style.width=p+"%";}
function toast(text){
  clearTimeout(state.toastTimer);
  $("toast").textContent=text;$("toast").classList.add("show");
  state.toastTimer=setTimeout(function(){$("toast").classList.remove("show");},3000);
}
async function api(path,opts){
  var response=await fetch(API+path,Object.assign({cache:"no-store",headers:{"content-type":"application/json"}},opts||{}));
  var payload;
  try{payload=await response.json();}catch{throw Error("The server returned an invalid response.");}
  if(!response.ok)throw Error(payload.error||"Something went wrong. Please try again.");
  return payload;
}
function sessionId(){
  try {
    var stored=localStorage.getItem("internet-decides-session-v1");
    if(stored&&/^[0-9a-f-]{36}$/i.test(stored))return stored;
    var fresh=crypto.randomUUID();localStorage.setItem("internet-decides-session-v1",fresh);return fresh;
  } catch(e) {return crypto.randomUUID();}
}
function stopPolling(){if(state.poll){clearInterval(state.poll);state.poll=null;}}
var REPLAY_PROGRESS_KEY="internet-decides-replay-progress-v1";
var LAST_RESULT_KEY="internet-decides-last-result-v1";
function readReplayProgress(){
  try {
    var item=JSON.parse(localStorage.getItem(REPLAY_PROGRESS_KEY)||"null");
    if(!item||!/^[0-9a-f-]{36}$/i.test(item.id)||!Array.isArray(item.answers)||item.answers.length>20)return null;
    if(!item.answers.every(function(x){return Array.isArray(x)&&Number.isInteger(x[0])&&x[0]>=1&&x[0]<=20&&Number.isInteger(x[1])&&x[1]>=0&&x[1]<=2;}))return null;
    return item;
  }catch(e){return null;}
}
function saveReplayProgress(){
  if(!state.replay)return;
  try{localStorage.setItem(REPLAY_PROGRESS_KEY,JSON.stringify({id:state.replayId,answers:Array.from(state.votes)}));}
  catch(e){}
}
function clearReplayProgress(){
  try{localStorage.removeItem(REPLAY_PROGRESS_KEY);}catch(e){}
}
async function playAgain(){
  stopPolling();stopAutoAdvance();
  state.replay=true;state.replayId=crypto.randomUUID();state.votes=new Map();
  state.index=0;state.choice=null;state.totals=null;state.result=null;state.busy=false;
  saveReplayProgress();
  try{history.replaceState(null,"",location.pathname);}catch(e){}
  show("loadingScreen");stage("PREPARING YOUR REPLAY");progress(0);
  try{
    var data=await api("questions");
    if(!Array.isArray(data.questions)||data.questions.length!==20)throw Error("Questions are temporarily unavailable.");
    state.questions=data.questions;
    drawQuestion();
  }catch(err){showError(err.message);}
}
async function requestFinalResult(){
  if(!state.replay)return api("finish",{method:"POST",body:JSON.stringify({session:state.session})});
  return api("replay-finish",{method:"POST",body:JSON.stringify({
    session:state.replayId,originalSession:state.session,
    answers:state.questions.map(function(q){return state.votes.get(q.id);})
  })});
}
function saveFinalResult(result){
  if(state.replay)clearReplayProgress();
  state.replay=false;state.replayId=null;
  try{localStorage.setItem(LAST_RESULT_KEY,result.id);}catch(e){}
}

function stopAutoAdvance(){
  if(state.advanceTimer){clearTimeout(state.advanceTimer);state.advanceTimer=null;}
  if(state.countdownTimer){clearInterval(state.countdownTimer);state.countdownTimer=null;}
  state.advanceAt=null;
}
function updateCountdown(){
  if(!state.advanceAt)return;
  var remaining=Math.max(0,state.advanceAt-Date.now());
  $("autoSeconds").textContent=Math.ceil(remaining/1000);
  $("countdownFill").style.width=(remaining/20000*100).toFixed(2)+"%";
}
function startAutoAdvance(){
  stopAutoAdvance();
  state.advanceAt=Date.now()+20000;
  $("autoAction").textContent=state.index===state.questions.length-1?"YOUR RESULT IN":"NEXT QUESTION IN";
  $("nextButton").textContent=state.index===state.questions.length-1?"SHOW MY RESULT ↗":"NEXT QUESTION ↗";
  updateCountdown();
  state.countdownTimer=setInterval(updateCountdown,250);
  state.advanceTimer=setTimeout(function(){stopAutoAdvance();nextQuestion();},20000);
}
function beginPolling(){
  stopPolling();
  state.poll=setInterval(async function(){
    if(document.hidden||state.choice===null||!current()||$("quizScreen").hidden)return;
    try {
      var q=current(),r=await api("tally?q="+q.id);
      if(q===current()&&state.choice!==null){state.totals=r.totals;drawAnswers();}
    }catch(e){/* transient failures should not discard an accepted vote */}
  },8000);
}
function initialQuestion(){
  var i=state.questions.findIndex(function(q){return !state.votes.has(q.id);});
  return i<0?state.questions.length:i;
}
function formatCount(n){return Number(n||0).toLocaleString("en-US");}
function percentages(totals){
  var sum=totals.reduce(function(a,b){return a+b;},0);
  if(!sum)return [0,0,0];
  return totals.map(function(n){return n*100/sum;});
}
function colorsByRank(totals){
  var distinct=Array.from(new Set(totals)).sort(function(a,b){return b-a;});
  return totals.map(function(n){
    if(distinct.length===1)return "blue";
    if(n===distinct[0])return "green";
    if(n===distinct[distinct.length-1])return "red";
    return "blue";
  });
}
function drawAnswers(){
  var q=current(),voted=state.choice!==null;
  $("answers").replaceChildren();
  if(!q)return;
  var pct=voted&&state.totals?percentages(state.totals):[];
  var ranks=voted&&state.totals?colorsByRank(state.totals):[];
  q.options.forEach(function(option,i){
    var btn=document.createElement("button");btn.type="button";btn.className="answer";
    var mark=document.createElement("span");mark.className="answer-letter";mark.textContent=["A","B","C"][i];btn.append(mark);
    var text=document.createElement("span");text.className="answer-text";text.textContent=option;btn.append(text);
    if(voted&&state.totals){
      btn.disabled=true;btn.classList.add("is-"+ranks[i]);
      if(i===state.choice)btn.classList.add("voted");
      var bar=document.createElement("span");bar.className="bar";bar.style.width=pct[i].toFixed(1)+"%";btn.append(bar);
      var percent=document.createElement("span");percent.className="choice-percent";percent.textContent=pct[i].toFixed(1)+"%";btn.append(percent);
      if(i===state.choice){var yes=document.createElement("span");yes.className="voted-mark";yes.textContent="✓";btn.append(yes);}
    } else if(voted){
      btn.disabled=true;
      if(i===state.choice){var waiting=document.createElement("span");waiting.className="voted-mark";waiting.textContent="✓";btn.append(waiting);}
    } else {
      btn.disabled=state.busy;btn.addEventListener("click",function(){castVote(i);});
      var arrow=document.createElement("span");arrow.className="voted-mark";arrow.textContent="→";btn.append(arrow);
    }
    $("answers").append(btn);
  });
  $("hintText").hidden=voted;
  $("afterVote").hidden=!(voted&&state.totals);
  if(voted&&state.totals){
    var total=state.totals.reduce(function(a,b){return a+b;},0);
    $("totalVotes").textContent=formatCount(total)+" GLOBAL VOTES";
    var max=Math.max.apply(null,state.totals);
    var chosen=state.totals[state.choice];
    $("voteMessage").textContent=chosen===max?"✳ YOU PICKED THE INTERNET'S FAVORITE.":"✳ YOUR BRAIN HAS OTHER PLANS.";
  }
}
function drawQuestion(){
  stopPolling();stopAutoAdvance();
  var q=current();if(!q)return;
  state.choice=state.votes.has(q.id)?state.votes.get(q.id):null;
  state.totals=null;state.busy=false;
  stage("Question "+(state.index+1)+" of "+state.questions.length);
  progress(state.index/state.questions.length*100);
  $("categoryLabel").textContent=q.emoji+" "+q.category;
  $("questionTitle").textContent=q.question;
  $("afterVote").hidden=true;drawAnswers();show("quizScreen");
  if(state.choice!==null){
    api("tally?q="+q.id).then(function(r){
      if(q===current()){state.totals=r.totals;drawAnswers();beginPolling();startAutoAdvance();}
    }).catch(function(){showError("Unable to load the voting results. Please try again.");});
  }
}
async function castVote(choice){
  if(state.busy||state.choice!==null)return;
  var q=current();state.busy=true;drawAnswers();stage("Saving vote...");
  try{
    var data=state.replay
      ? await api("tally?q="+q.id)
      : await api("vote",{method:"POST",body:JSON.stringify({session:state.session,questionId:q.id,option:choice})});
    if(!state.replay&&!data.accepted)throw Error("Vote could not be recorded.");
    state.choice=state.replay?choice:data.option;
    state.votes.set(q.id,state.choice);
    if(state.replay)saveReplayProgress();
    state.totals=data.totals;
    stage("Question "+(state.index+1)+" of "+state.questions.length);
    beginPolling();drawAnswers();startAutoAdvance();
  }catch(err){
    stage("Question "+(state.index+1)+" of "+state.questions.length);toast(err.message);
  }finally{state.busy=false;if(state.choice===null)drawAnswers();}
}
async function nextQuestion(){
  if(state.choice===null||state.busy)return;
  stopAutoAdvance();stopPolling();
  if(state.index<state.questions.length-1){
    state.index++;drawQuestion();window.scrollTo({top:0,behavior:"smooth"});
  }else{
    state.busy=true;
    show("loadingScreen");stage("CALCULATING YOUR SCORE");progress(100);
    try{
      var data=await requestFinalResult();
      saveFinalResult(data.result);
      renderResult(data.result,false);
    }catch(err){showError(err.message);}
    finally{state.busy=false;}
  }
}
function rarityText(r){
  if(r.rarityPercent===null||r.comparisonSize<30)return "Your rarity comparison unlocks once 30 first-time players complete the quiz. Yours is safely saved.";
  return "Only "+Number(r.rarityPercent).toFixed(1)+"% of first-time players scored the same or less normal than you (at the time of your result).";
}
function paintCard(prefix,r){
  var t=tier(r.score),c=color(r.score);
  var card=$(prefix==="shared"?"sharedCard":"resultCard");
  card.classList.remove("theme-red","theme-blue","theme-green");
  card.classList.add("theme-"+c);
  $(prefix==="shared"?"sharedScore":"scoreNumber").textContent=r.score;
  $(prefix==="shared"?"sharedFill":"resultFill").style.width=r.score+"%";
  $(prefix==="shared"?"sharedTier":"tierTitle").textContent=t.icon+" "+r.title;
  $(prefix==="shared"?"sharedMatches":"matchCopy").textContent="You agreed with the internet on "+r.matches+" of 20 questions.";
  $(prefix==="shared"?"sharedRarity":"rarityCopy").textContent=rarityText(r);
}
function resultUrl(result){return location.origin+location.pathname+"?result="+encodeURIComponent(result.id);}
function shareText(){
  var r=state.result,t=tier(r.score);
  return t.icon+" I scored "+r.score+"% NORMAL on THE INTERNET DECIDES! ("+r.title+")\nI agreed with the majority "+r.matches+"/20 times.\nHow normal are YOU? 🤯\n"+resultUrl(r);
}
function renderResult(result,shared){
  stopPolling();stopAutoAdvance();state.result=result;stage(shared?"SHARED RESULT":"EXPERIMENT COMPLETE");progress(100);
  if(shared){
    paintCard("shared",result);$("sharedTitle").textContent="A "+result.score+"% NORMAL HUMAN.";
    show("sharedScreen");
  }else{
    paintCard("own",result);show("resultScreen");
  }
  window.scrollTo({top:0,behavior:"smooth"});
}
function showError(msg){stopPolling();stopAutoAdvance();stage("SOMETHING WENT WRONG");$("errorText").textContent=msg||"We can't connect right now. Please try again.";show("errorScreen");}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast("COPIED! SEND IT TO YOUR FRIENDS.");}
  catch(e){window.prompt("Copy this result:",text);}
}
function shareLink(kind){
  if(!state.result)return;
  var url=resultUrl(state.result),text=shareText();
  var target=kind==="wa"?"https://api.whatsapp.com/send?text="+encodeURIComponent(text):
    kind==="x"?"https://twitter.com/intent/tweet?text="+encodeURIComponent(text):
    "https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(url);
  window.open(target,"_blank","noopener,noreferrer");
}
async function init(){
  show("loadingScreen");stage("CONNECTING...");progress(0);stopPolling();stopAutoAdvance();
  var shareId=new URLSearchParams(location.search).get("result");
  if(shareId){
    try{
      var shared=await api("result?id="+encodeURIComponent(shareId));renderResult(shared.result,true);
    }catch(err){showError(err.message);}
    return;
  }
  state.session=sessionId();
  try{
    var data=await api("start",{method:"POST",body:JSON.stringify({session:state.session})});
    var progressSaved=readReplayProgress();
    if(data.result && new URLSearchParams(location.search).get("challenge")==="1"){
      await playAgain();return;
    }
    if(data.result && progressSaved){
      state.replay=true;state.replayId=progressSaved.id;
      state.votes=new Map(progressSaved.answers);
      var questionData=await api("questions");
      state.questions=questionData.questions||[];
      if(state.questions.length!==20)throw Error("Questions are temporarily unavailable.");
      state.index=initialQuestion();
      if(state.index>=20){
        var replayFinished=await requestFinalResult();
        saveFinalResult(replayFinished.result);
        renderResult(replayFinished.result,false);
      } else drawQuestion();
      return;
    }
    if(data.result){
      var latest=null;
      try{latest=localStorage.getItem(LAST_RESULT_KEY);}catch(e){}
      if(latest){
        try{
          var stored=await api("result?id="+encodeURIComponent(latest));
          renderResult(stored.result,false);return;
        }catch(e){try{localStorage.removeItem(LAST_RESULT_KEY);}catch(ignore){}}
      }
      renderResult(data.result,false);return;
    }
    if(progressSaved)clearReplayProgress();
    state.replay=false;state.replayId=null;
    state.questions=data.questions||[];
    if(state.questions.length!==20)throw Error("The quiz is being updated. Please try again shortly.");
    state.votes=new Map((data.votes||[]).map(function(v){return [v.questionId,v.option];}));
    state.index=initialQuestion();
    if(state.index>=state.questions.length){
      stage("RESTORING YOUR RESULT");
      var finished=await requestFinalResult();
      saveFinalResult(finished.result);
      renderResult(finished.result,false);
    }else drawQuestion();
  }catch(err){showError(err.message);}
}
$("retryButton").addEventListener("click",init);
$("playAgain").addEventListener("click",playAgain);
$("nextButton").addEventListener("click",nextQuestion);
$("copyResult").addEventListener("click",function(){if(state.result)copyText(shareText());});
$("shareResult").addEventListener("click",async function(){
  if(!state.result)return;
  if(navigator.share){
    try{await navigator.share({title:"How normal are you?",text:"I scored "+state.result.score+"% normal. Can you beat me?",url:resultUrl(state.result)});return;}
    catch(e){if(e.name==="AbortError")return;}
  }
  copyText(shareText());
});
$("shareWhatsApp").addEventListener("click",function(){shareLink("wa");});
$("shareX").addEventListener("click",function(){shareLink("x");});
$("shareFacebook").addEventListener("click",function(){shareLink("fb");});
$("startChallenge").addEventListener("click",function(){location.assign("/?challenge=1");});
window.addEventListener("pagehide",function(){stopPolling();stopAutoAdvance();});
init();
})();
