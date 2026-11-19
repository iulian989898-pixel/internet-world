/**
 * Sky ambience for THE INTERNET DECIDES.
 * Decorative only: no networking, tracking, images or libraries.
 */
(function(){
  "use strict";
  var backdrop=document.getElementById("spaceBackdrop");
  if(!backdrop)return;
  var reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var seed=873821;
  function random(){
    // Stable star positions between page loads.
    seed=(seed*1664525+1013904223)>>>0;
    return seed/4294967296;
  }
  function makeStars(){
    var count=window.innerWidth<560?72:115;
    var fragment=document.createDocumentFragment();
    for(var i=0;i<count;i++){
      var star=document.createElement("span");
      star.className="sky-star";
      var size=random()>.89?2.1:random()>.48?1.4:.85;
      var opacity=(.27+random()*.65).toFixed(2);
      star.style.setProperty("--star-size",size+"px");
      star.style.setProperty("--star-left",(2+random()*96).toFixed(2)+"%");
      star.style.setProperty("--star-top",(2+random()*96).toFixed(2)+"%");
      star.style.setProperty("--star-opacity",opacity);
      star.style.setProperty("--star-duration",(6+random()*9).toFixed(1)+"s");
      star.style.setProperty("--star-delay",(-random()*15).toFixed(1)+"s");
      fragment.appendChild(star);
    }
    backdrop.appendChild(fragment);
  }
  makeStars();
  if(reduceMotion)return;

  var nextMeteorTimer=null;
  function scheduleMeteor(min,max){
    nextMeteorTimer=window.setTimeout(function(){
      if(!document.hidden)shootMeteor();
      scheduleMeteor(12000,25000);
    },Math.round(min+Math.random()*(max-min)));
  }
  function shootMeteor(){
    var meteor=document.createElement("span");
    meteor.className="shooting-star";
    meteor.style.setProperty("--meteor-left",(54+Math.random()*40).toFixed(1)+"%");
    meteor.style.setProperty("--meteor-top",(8+Math.random()*29).toFixed(1)+"%");
    backdrop.appendChild(meteor);
    meteor.addEventListener("animationend",function(){meteor.remove();},{once:true});
    window.setTimeout(function(){meteor.remove();},1900);
  }
  scheduleMeteor(6500,13500);
  window.addEventListener("pagehide",function(){
    if(nextMeteorTimer!==null)window.clearTimeout(nextMeteorTimer);
  });
})();
