// Quiz v1 is immutable after launch. Make a new version instead of editing live questions.
export const VERSION = 1;
export const QUESTIONS = [
  {id:1,category:"Money & mayhem",emoji:"💸",question:"You get $1 MILLION, but you must accept one lifelong side effect. Which one?",options:["Every time you lie, a car horn goes off.","Every time you laugh, you sound like an evil villain.","Every time you enter a room, people hear applause."]},
  {id:2,category:"Internet drama",emoji:"📱",question:"You can delete ONE app from Earth forever. Which one disappears?",options:["TikTok","YouTube","Instagram"]},
  {id:3,category:"Uncomfortable truths",emoji:"🧠",question:"You may learn exactly ONE truth about your life. Which one?",options:["What your friends say when you're not around.","How much money you'll have in 20 years.","Who has lied to you the most."]},
  {id:4,category:"Social disasters",emoji:"💬",question:"Which accidental message would you rather send?",options:["'I love you' to your boss.","A mean gossip message to the person it was about.","A flirty message to the entire family group chat."]},
  {id:5,category:"Alien technology",emoji:"👽",question:"Aliens offer you ONE completely useless superpower. Which do you take?",options:["The ability to talk to potatoes.","The ability to see through socks.","The ability to stop time, but only while you're asleep."]},
  {id:6,category:"Food crimes",emoji:"🍕",question:"FREE food forever, but you can only eat one of these for dinner. Pick your fate.",options:["Pizza every single night.","Burgers every single night.","Sushi every single night."]},
  {id:7,category:"Phone secrets",emoji:"🔍",question:"Your phone must expose ONE thing on a giant public screen. Which is safest?",options:["Your last 10 web searches.","Your last 10 deleted messages.","Your last 10 photos."]},
  {id:8,category:"Time travel-ish",emoji:"⏳",question:"You can own ONE magic button. Which one do you want?",options:["UNDO: rewind the last minute, once a day.","PAUSE: freeze time for 10 minutes a day.","SKIP: skip one awkward situation a week."]},
  {id:9,category:"Terrible roommates",emoji:"🏠",question:"You must live with ONE of these roommates for a year.",options:["A parrot that repeats all your secrets.","A cat that judges you out loud.","A robot that gives nonstop unsolicited advice."]},
  {id:10,category:"Impossible wealth",emoji:"🤑",question:"One offer is real, right now. What are you taking?",options:["$100,000 cash, no strings.","A free home in any city you choose.","Enough guaranteed income to never need a job again."]},
  {id:11,category:"Artificial intelligence",emoji:"🤖",question:"An AI must impersonate you for ONE important event. Which one?",options:["A job interview.","Dinner with your partner's family.","A first date."]},
  {id:12,category:"Fix the world",emoji:"🌍",question:"You can make ONE annoyance disappear from Earth. Which one?",options:["Unskippable online ads.","Pointless meetings.","Having to work on Mondays."]},
  {id:13,category:"Public embarrassment",emoji:"🦆",question:"You get $10,000, but every video of you online has ONE permanent effect.",options:["You sound exactly like a duck.","Your face looks like a potato.","Every scene has dramatic horror music."]},
  {id:14,category:"Mind reading",emoji:"❤️",question:"You can find out exactly what ONE group really thinks about you.",options:["Your friends.","Your family.","Your coworkers or classmates."]},
  {id:15,category:"Truth apocalypse",emoji:"🚨",question:"For 24 hours, EVERYONE must tell the truth. Where do you spend the day?",options:["At home, avoiding everyone.","At a party with your friends.","At work or school."]},
  {id:16,category:"Animals have spoken",emoji:"🐈",question:"Animals start talking tomorrow. Which causes the MOST chaos?",options:["Cats reveal what humans do at home.","Dogs tell everyone how much they love us.","Pigeons become the world's biggest gossip network."]},
  {id:17,category:"Social endurance",emoji:"🧳",question:"You're trapped in a hotel room for 24 hours. Pick your companion.",options:["Someone who never stops talking.","Someone who sings every sentence.","Someone who asks 'What are you thinking?' every five minutes."]},
  {id:18,category:"Life as a video game",emoji:"🎮",question:"Your life becomes a video game. Which floating stat can you see above people?",options:["Their intelligence level.","How much they like you.","How much money they have."]},
  {id:19,category:"Accidental fame",emoji:"📸",question:"You become world-famous overnight, but ONLY for one ridiculous reason.",options:["You're the world's greatest sock expert.","Every photo of you becomes a meme.","Everyone believes you're an alien in disguise."]},
  {id:20,category:"The final decision",emoji:"🏆",question:"FINAL QUESTION: You can change ONE rule of life on Earth. Which do you pick?",options:["Nobody ever has to work on Mondays.","Everyone gets a free month-long vacation every year.","Everyone can feel fully rested after only 4 hours of sleep."]}
];
export const TIERS=[
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
export function tierFor(score) {
  return TIERS.find(t=>score>=t.min&&score<=t.max)||TIERS[0];
}
export function scoreFor(answers,counts) {
  let matches=0;
  for (const q of QUESTIONS) {
    const selection=answers.get(q.id);
    const row=counts.get(q.id);
    if (!Number.isInteger(selection)||!row||row.length!==3) throw Error("Incomplete ballot or tallies");
    const highest=Math.max(...row);
    if (row[selection]===highest) matches++;
  }
  return {matches,score:matches*5};
}
export function resultColor(score) {
  return score<40?"red":score<69?"blue":"green";
}
