if (window.Capacitor?.isNativePlatform?.()) document.documentElement.classList.add('native-app');

(function(){
  var $=function(q,r){return (r||document).querySelector(q)},$$=function(q,r){return Array.prototype.slice.call((r||document).querySelectorAll(q))};
  var toast=$("#toast"),tt,cur="home",stack=[];
  function soon(){window.dispatchEvent(new CustomEvent("astral:unavailable"))}
  function render(n){
    $$(".view").forEach(function(v){v.hidden=v.id!=="v-"+n});
    var v=$("#v-"+n),t=(v&&v.dataset.tab)||(n==="settings"?"profile":n);
    $$(".tab").forEach(function(b){b.classList.toggle("on",b.dataset.v===t);if(b.dataset.v===t)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
    if(v)v.scrollTop=0;
    window.dispatchEvent(new CustomEvent("astral:view",{detail:n}));
    var dm=document.getElementById("dd-notif");if(dm)dm.hidden=true;
    var L=!!(v&&v.dataset.land),ph=$(".phone");
    if(ph.classList.contains("land")!==L){ph.classList.toggle("land",L);orient(L)}
  }
  function orient(L){
    try{
      var d=document.documentElement;
      if(L){var r=(d.requestFullscreen||d.webkitRequestFullscreen);if(r){var p=r.call(d);if(p&&p.catch)p.catch(function(){})}
        if(screen.orientation&&screen.orientation.lock){screen.orientation.lock("landscape").catch(function(){})}}
      else{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();
        if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(function(){})}
    }catch(e){}
  }
  function show(n){if(!$("#v-"+n))return;if(n!==cur){stack.push(cur);cur=n}render(n)}
  function root(n){if(!$("#v-"+n))return;stack=[];cur=n;render(n)}
  function back(){var p=stack.pop();if(p){cur=p;render(p)}else root("home")}
  function bind(el,fn){if(!el)return;el.setAttribute("data-h","1");el.addEventListener("click",fn);
    if(!/^(BUTTON|A|INPUT)$/.test(el.tagName)){el.setAttribute("role","button");el.tabIndex=0;el.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();fn()}})}}
  function go(sel,n,root){$$(sel,root).forEach(function(e){bind(e,function(){show(n)});e.setAttribute("data-go",n)})}

  window.astralNav={show:show,root:root,back:back};

  /* tabs */
  $$(".tab").forEach(function(b){bind(b,function(){root(b.dataset.v)})});

  /* self-contained controls */
  $$("#v-shop .pill").forEach(function(p){bind(p,function(){$$("#v-shop .pill").forEach(function(x){x.classList.toggle("on",x===p)})})});
  $$(".pf-pills .pill").forEach(function(p){bind(p,function(){$$(".pf-pills .pill").forEach(function(x){x.classList.toggle("on",x===p)})})});
  $$(".pm-seg button").forEach(function(b){bind(b,function(){var seg=b.parentNode;$$("button",seg).forEach(function(x){x.classList.toggle("on",x===b)});seg.classList.toggle("yr",b.dataset.u==="year");$("#pm-unit").textContent=b.dataset.u==="year"?"/ year":"/ month"})});
  $$(".pf-row.tg").forEach(function(r){bind(r,function(){r.classList.toggle("on")})});
  $$("summary,.search input").forEach(function(e){e.setAttribute("data-h","1")});

  /* generic wiring: data-go / data-root / back / pill groups */
  $$("[data-go]").forEach(function(e){if(e.getAttribute("data-h"))return;var n=e.getAttribute("data-go");bind(e,function(){show(n)})});
  $$("[data-root]").forEach(function(e){var n=e.getAttribute("data-root");bind(e,function(){root(n)})});
  $$(".back,#back").forEach(function(b){bind(b,back)});
  $$(".fx-pills").forEach(function(g){$$(".pill",g).forEach(function(p){bind(p,function(){$$(".pill",g).forEach(function(x){x.classList.toggle("on",x===p)})})})});

  /* combat HUD */
  bind($("#cb-auto"),function(){$("#cb-auto").classList.toggle("on")});
  bind($("#cb-gear"),function(){$("#cb-pause").hidden=false});
  bind($("#cb-resume"),function(){$("#cb-pause").hidden=true});
  bind($("#cb-leave"),function(){$("#cb-pause").hidden=true;root("fight")});

  /* links between pages */
  var H="#v-home ";
  var dd=$("#dd-notif"),bell=$(H+".tools .rb:nth-child(1)");
  bell.setAttribute("aria-haspopup","true");bell.setAttribute("aria-expanded","false");
  function ddSet(o){dd.hidden=!o;bell.setAttribute("aria-expanded",o?"true":"false")}
  bind(bell,function(){ddSet(dd.hidden)});
  document.addEventListener("click",function(e){if(!dd.hidden&&!dd.contains(e.target)&&!bell.contains(e.target))ddSet(false)});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"){if(!dd.hidden)ddSet(false);else back()}});
  bind($("#dd-read"),function(){$$(".dd-item.un").forEach(function(x){x.classList.remove("un")});var d=$(H+".dot");if(d)d.style.display="none"});
  $$(".dd-act:not(#dd-read)").forEach(function(a){bind(a,soon)});
  $$(".dd-item").forEach(function(a){bind(a,soon)});
  go(H+".tools .rb:nth-child(2)","profile");           /* avatar */
  go(H+".tools .rb:nth-child(3)","settings");          /* gear */
  go(H+".me","profile");
  go(H+".stat:nth-child(1)","shop");go(H+".stat:nth-child(2)","shop");
  $$(H+".sec a").forEach(function(a){if(/Battle/.test(a.textContent))bind(a,function(){show("fight")})});
  go(H+".prem","premium");
  go("#open-settings","settings");
  go(".pf-go","fight");


  /* everything else: Coming soon */
  $$("button,.sec a,.rb,.season,.box,.mon,.tcard,.rank,.stat,.pf-slot .sq,.pf-inv .sq,.pf-av .edit,.pf-row,.deal,.pack,.bun,.feat,.pf-h,.fx-soon").forEach(function(e){
    if(e.getAttribute("data-h")||e.closest(".nav")||e.closest(".pf-row.tg"))return;
    if(e.matches(".deal,.pack,.bun,.pf-h,.feat")&&$("button",e))return;
    bind(e,soon);e.setAttribute("data-soon","1");
  });
})();
