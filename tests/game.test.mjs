import test from "node:test";
import assert from "node:assert/strict";
import {QUESTIONS,TIERS,scoreFor,tierFor,resultColor} from "../netlify/lib/game.mjs";
test("the quiz has 20 questions, each with three distinct choices",()=>{
  assert.equal(QUESTIONS.length,20);
  assert.deepEqual(QUESTIONS.map(q=>q.id),Array.from({length:20},(_,i)=>i+1));
  for(const q of QUESTIONS){assert.equal(q.options.length,3);assert.equal(new Set(q.options).size,3);assert.ok(q.question.length>18);}
});
test("all possible scores map to one and only one tier",()=>{
  assert.equal(TIERS.length,10);
  for(let score=0;score<=100;score+=5){assert.equal(TIERS.filter(t=>score>=t.min&&score<=t.max).length,1);assert.ok(tierFor(score));}
});
test("score is calculated against the global plurality including ties",()=>{
  const answers=new Map(),counts=new Map();
  for(const q of QUESTIONS){answers.set(q.id,0);counts.set(q.id,[5,3,1]);}
  assert.deepEqual(scoreFor(answers,counts),{matches:20,score:100});
  counts.set(1,[1,5,6]);counts.set(2,[3,3,1]);
  assert.deepEqual(scoreFor(answers,counts),{matches:19,score:95});
  for(const q of QUESTIONS)counts.set(q.id,[1,2,3]);
  assert.deepEqual(scoreFor(answers,counts),{matches:0,score:0});
});
test("score colors are red, blue and green",()=>{
  assert.equal(resultColor(35),"red");assert.equal(resultColor(40),"blue");assert.equal(resultColor(65),"blue");assert.equal(resultColor(70),"green");
});
