(() => {
  'use strict';
  const root=document.documentElement,body=document.body;
  const toggle=document.getElementById('motion-toggle');
  const hero=document.querySelector('.hero'),stage=document.querySelector('.code-section');
  const photoGrid=document.getElementById('photo-grid');
  const seal=document.querySelector('.personal-seal');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const canvas=document.getElementById('ambient-field'),ctx=canvas.getContext('2d');
  let stored=null,enabled=false,scrollFrame=0,ambientFrame=0,lastPaint=0,width=0,height=0;
  const pointer={x:0,y:0,actualX:0,actualY:0};
  try{stored=localStorage.getItem('hujie-motion');}catch{}
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));

  // The heading keeps one readable accessible name; character spans are decorative.
  let character=0;
  document.querySelectorAll('.hero-line').forEach(line=>{
    const walker=document.createTreeWalker(line,NodeFilter.SHOW_TEXT);const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const fragment=document.createDocumentFragment();
      for(const value of Array.from(node.textContent)){
        const span=document.createElement('span');span.className='headline-char';span.textContent=value;span.style.setProperty('--character',character++);fragment.append(span);
      }
      node.replaceWith(fragment);
    }
  });

  const revealObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}}
  },{threshold:.08,rootMargin:'0px 0px -15px 0px'});
  const prepared=new WeakSet();
  function reveal(element,index=0){
    if(prepared.has(element))return;prepared.add(element);
    element.dataset.reveal='';element.style.setProperty('--reveal-order',index%3);
    if(!enabled)element.classList.add('is-visible');else revealObserver.observe(element);
  }
  function preparePhotos(){
    document.querySelectorAll('.photo-slot').forEach((card,index)=>{
      const fresh=!prepared.has(card);reveal(card,index);
      if(!fresh)return;
      card.addEventListener('pointermove',event=>{
        if(!enabled||!finePointer.matches)return;
        const bounds=card.getBoundingClientRect();
        card.style.setProperty('--card-x',((event.clientX-bounds.left)/bounds.width-.5).toFixed(3));
        card.style.setProperty('--card-y',((event.clientY-bounds.top)/bounds.height-.5).toFixed(3));
      });
      card.addEventListener('pointerleave',()=>{card.style.setProperty('--card-x',0);card.style.setProperty('--card-y',0);});
    });
  }
  const photoChanges=new MutationObserver(records=>{
    for(const record of records)for(const node of record.removedNodes){
      if(node.nodeType!==1)continue;
      revealObserver.unobserve(node);node.querySelectorAll('[data-reveal]').forEach(el=>revealObserver.unobserve(el));
    }
    preparePhotos();
  });
  if(photoGrid)photoChanges.observe(photoGrid,{childList:true});

  const ticker=document.querySelector('.motion-ticker');
  const tickerObserver=new IntersectionObserver(([entry])=>ticker.classList.toggle('ticker-in-view',entry.isIntersecting));
  if(ticker)tickerObserver.observe(ticker);
  const heroObserver=new IntersectionObserver(([entry])=>body.classList.toggle('hero-in-view',entry.isIntersecting));
  if(hero)heroObserver.observe(hero);
  document.querySelectorAll('.header-contact,.contact-actions button,.fullscreen-link').forEach(element=>{
    element.dataset.magnetic='';
    element.addEventListener('pointermove',event=>{
      if(!enabled||!finePointer.matches)return;
      const r=element.getBoundingClientRect();
      element.style.setProperty('--magnet-x',((event.clientX-r.left-r.width/2)*.12).toFixed(2)+'px');
      element.style.setProperty('--magnet-y',((event.clientY-r.top-r.height/2)*.16).toFixed(2)+'px');
    });
    element.addEventListener('pointerleave',()=>{element.style.setProperty('--magnet-x','0px');element.style.setProperty('--magnet-y','0px');});
  });

  let seed=93107;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const stars=Array.from({length:innerWidth<768?40:90},()=>({x:random(),y:random(),r:.4+random()*1.1,phase:random()*Math.PI*2,speed:.15+random()*.25,depth:.3+random()*.7}));
  function sizeCanvas(){
    width=innerWidth;height=innerHeight;
    const ratio=Math.min(devicePixelRatio||1,1.25);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    if(ctx)ctx.setTransform(ratio,0,0,ratio,0,0);
    paint(0);queueScroll();
  }
  function paint(time){
    if(!ctx)return;
    ctx.clearRect(0,0,width,height);
    const seconds=time*.001;
    for(const star of stars){
      const drift=enabled?Math.sin(seconds*star.speed+star.phase)*8:0;
      const x=star.x*width+pointer.actualX*star.depth*14;
      const y=star.y*height+drift+pointer.actualY*star.depth*12;
      ctx.globalAlpha=.1+(enabled?(Math.sin(seconds*.4+star.phase)+1)*.1:.1);
      ctx.fillStyle='#c2b8a4';ctx.beginPath();ctx.arc(x,y,star.r,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  function ambient(time){
    ambientFrame=0;
    if(!enabled||document.hidden)return;
    if(time-lastPaint>33){
      pointer.actualX+=(pointer.x-pointer.actualX)*.06;pointer.actualY+=(pointer.y-pointer.actualY)*.06;
      paint(time);lastPaint=time;
    }
    ambientFrame=requestAnimationFrame(ambient);
  }
  function startAmbient(){if(enabled&&!document.hidden&&!ambientFrame)ambientFrame=requestAnimationFrame(ambient);}
  function updateScroll(){
    scrollFrame=0;
    const maximum=Math.max(1,root.scrollHeight-innerHeight);
    root.style.setProperty('--page-progress',clamp(scrollY/maximum).toFixed(4));
    if(!enabled){root.style.setProperty('--stage-progress','1');return;}
    if(stage){
      const rect=stage.getBoundingClientRect();
      const travel=Math.max(1,stage.offsetHeight-innerHeight);
      stage.style.setProperty('--stage-progress',clamp(-rect.top/travel).toFixed(4));
    }
    if(hero)root.style.setProperty('--hero-drift',Math.min(scrollY*.14,110).toFixed(2));
    if(seal){const r=seal.getBoundingClientRect();seal.style.setProperty('--seal-turn',(clamp((innerHeight-r.top)/(innerHeight+r.height))*120).toFixed(2)+'deg');}
  }
  function queueScroll(){if(!scrollFrame)scrollFrame=requestAnimationFrame(updateScroll);}
  function applyMotion(){
    enabled=!reduced.matches&&stored!=='off';
    body.classList.toggle('motion-on',enabled);body.classList.toggle('motion-off',!enabled);
    toggle.hidden=false;toggle.disabled=reduced.matches;
    toggle.setAttribute('aria-pressed',String(enabled));
    toggle.setAttribute('aria-label',reduced.matches?'系统已启用减少动态效果':enabled?'关闭整体动态效果':'开启整体动态效果');
    toggle.querySelector('span').textContent=reduced.matches?'动态：已减弱':enabled?'动态：开':'动态：关';
    document.dispatchEvent(new CustomEvent('portfolio:motion',{detail:{enabled}}));
    if(enabled)startAmbient();
    else{
      cancelAnimationFrame(ambientFrame);ambientFrame=0;
      pointer.actualX=pointer.actualY=0;paint(0);
      body.classList.remove('intro-active');
      document.querySelectorAll('[data-reveal]').forEach(el=>{el.classList.add('is-visible');revealObserver.unobserve(el);});
    }
    queueScroll();
  }
  toggle.addEventListener('click',()=>{stored=enabled?'off':'on';try{localStorage.setItem('hujie-motion',stored);}catch{}applyMotion();});
  reduced.addEventListener('change',applyMotion);
  window.addEventListener('scroll',queueScroll,{passive:true});
  window.addEventListener('resize',sizeCanvas,{passive:true});
  document.addEventListener('pointermove',event=>{
    if(!enabled||!finePointer.matches)return;
    pointer.x=(event.clientX/innerWidth-.5)*2;pointer.y=(event.clientY/innerHeight-.5)*2;
    if(!hero)return;
    const bounds=hero.getBoundingClientRect();
    if(event.clientY>=bounds.top&&event.clientY<=bounds.bottom){hero.style.setProperty('--pointer-x',(event.clientX/innerWidth*100).toFixed(1)+'%');hero.style.setProperty('--pointer-y',((event.clientY-bounds.top)/bounds.height*100).toFixed(1)+'%');}
  },{passive:true});
  document.addEventListener('visibilitychange',()=>{
    body.classList.toggle('page-hidden',document.hidden);
    ticker?.classList.toggle('document-hidden',document.hidden);
    if(document.hidden){cancelAnimationFrame(ambientFrame);ambientFrame=0;}else{startAmbient();queueScroll();}
  });

  applyMotion();
  document.querySelectorAll('.project-caption,.section-heading,.about-label,.about-copy h2,.about-copy p,.interests,.contact-section,.closing-wordmark').forEach((el,index)=>reveal(el,index%2));
  preparePhotos();sizeCanvas();
  if(enabled&&hero){
    body.classList.add('hero-entering');
    let seen=false;try{seen=sessionStorage.getItem('hujie-intro')==='seen';sessionStorage.setItem('hujie-intro','seen');}catch{}
    if(!seen&&!location.hash)body.classList.add('intro-active');
    setTimeout(()=>{body.classList.remove('intro-active','hero-entering');document.querySelector('.intro-curtain')?.remove();},2800);
  }
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(ambientFrame);cancelAnimationFrame(scrollFrame);});
  window.addEventListener('pageshow',()=>{startAmbient();queueScroll();});
})();
