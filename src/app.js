/* ====== APPLICATION ====== */
(function(){
"use strict";
var $=function(s){return document.querySelector(s);};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});};
var KEY="thai26-v1";

/* ---------- état persistant ---------- */
var DEFSET={rate:37.71,speed:1,geo:false,auto:false,theme:"auto",offset:0};
function load(){var o={};try{o=JSON.parse(localStorage.getItem(KEY)||"{}");}catch(e){}
  return {done:o.done||{},fired:o.fired||{},ack:o.ack||{},cash:o.cash||{},checks:o.checks||{},visited:o.visited||{},heard:o.heard||{},prog:o.prog||{},exp:o.exp||[],budget:o.budget||{},set:Object.assign({},DEFSET,o.set||{})};}
var S=load();
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}

/* ---------- pont natif Android (Capacitor) ---------- */
var CAPW=window.Capacitor||null;
var NATIVE=!!(CAPW&&CAPW.isNativePlatform&&CAPW.isNativePlatform());
function plug(n){
  if(!NATIVE)return null;
  try{if(CAPW.registerPlugin)return CAPW.registerPlugin(n);if(CAPW.Plugins&&CAPW.Plugins[n])return CAPW.Plugins[n];}catch(e){}
  /* repli : appel direct du pont natif */
  if(CAPW.nativePromise&&window.Proxy)return new Proxy({},{get:function(t,m){return m==="then"?undefined:function(o){return CAPW.nativePromise(n,m,o||{});};}});
  return null;
}
var LN=plug("LocalNotifications"),TTSN=plug("TextToSpeech"),APPN=plug("App");
var NAT={perm:"",exact:"",pending:null,error:""};
function nid(i){return 1000+i;}
function scheduleAll(){
  if(!LN)return Promise.resolve();
  var now=Date.now();
  return LN.createChannel({id:"rappels",name:"Rappels du voyage",description:"Alarmes du carnet de route",importance:5,visibility:1,vibration:true}).catch(function(){})
  .then(function(){return LN.requestPermissions();})
  .then(function(r){NAT.perm=r&&r.display;return LN.cancelAll().catch(function(){});})
  .then(function(){
    var list=[];REMINDERS.forEach(function(r,i){if(r.ms>now+5000)list.push({id:nid(i),title:r.title,body:r.body,channelId:"rappels",schedule:{at:new Date(r.ms),allowWhileIdle:true},smallIcon:"ic_stat_thai",iconColor:"#0B5A44"});});
    if(!list.length)return null;
    return LN.schedule({notifications:list});
  })
  .then(function(){return LN.checkExactNotificationSetting().then(function(x){NAT.exact=x&&x.exact_alarm;}).catch(function(){});})
  .then(function(){return LN.getPending();})
  .then(function(p){NAT.pending=p&&p.notifications?p.notifications.length:0;NAT.error="";})
  .catch(function(e){NAT.error=String((e&&e.message)||e);})
  .then(function(){if(UI.tab==="remind")render(true);});
}


/* ---------- temps ---------- */
function nowMs(){return Date.now()+(S.set.offset||0);}
function fmt(ms,tz,o){return new Intl.DateTimeFormat("fr-FR",Object.assign({timeZone:tz},o)).format(ms);}
function hm(ms,tz){return fmt(ms,tz,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).replace(":","h");}
function spoken(ms,tz){var p=fmt(ms,tz,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).split(":");var h=parseInt(p[0],10),m=parseInt(p[1],10);return h+" heure"+(h>1?"s":"")+(m?" "+m:"");}
function dateKey(ms,tz){return new Intl.DateTimeFormat("en-CA",{timeZone:tz}).format(ms);}
function longDate(ms,tz){return fmt(ms,tz,{weekday:"long",day:"numeric",month:"long"});}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function countdown(d){
  if(d<=0)return "maintenant";
  var m=Math.round(d/60000);
  if(m<1)return "dans moins d’une minute";
  if(m<60)return "dans "+m+" min";
  var h=Math.floor(m/60),mm=m%60;
  if(h<24)return "dans "+h+" h"+(mm?" "+(mm<10?"0":"")+mm:"");
  var j=Math.floor(h/24),hh=h%24;
  return "dans "+j+" jour"+(j>1?"s":"")+(hh?" "+hh+" h":"");
}

/* ---------- indexation ---------- */
var ITEMS=[];
var BASE_DAYS=DAYS.map(function(d){return {items:d.items.slice(),note:d.note};});
var BASE_REM=REMINDERS.slice();
function rebuildProgram(){
  DAYS.forEach(function(d,ix){
    var o=S.prog&&S.prog[d.n];
    if(o&&o.items&&o.items.length){
      d.items=o.items.map(function(a){return {iso:d.date+"T"+a.hm+":00"+d.off,tz:d.tz,title:a.title,detail:a.detail||"",kind:a.kind||"pratique",site:a.site||null,leg:a.leg||null};});
      d.note=o.note!=null?o.note:BASE_DAYS[ix].note;d.modified=true;
    }else{d.items=BASE_DAYS[ix].items.slice();d.note=BASE_DAYS[ix].note;d.modified=false;}
  });
  ITEMS.length=0;
  DAYS.forEach(function(d){d.items.forEach(function(it,i){it.id="d"+d.n+"-"+i;it.ms=Date.parse(it.iso);it.day=d.n;ITEMS.push(it);});});
  ITEMS.sort(function(a,b){return a.ms-b.ms;});
  var rem=BASE_REM.filter(function(r){var o=S.prog&&S.prog[r.day];return !(o&&o.rem);});
  Object.keys(S.prog||{}).forEach(function(n){var o=S.prog[n],d=DAYS[n-1];if(!o||!o.rem||!d)return;o.rem.forEach(function(r,k){rem.push({id:"u"+n+"-"+k+"-"+(o.at||0),day:+n,ms:Date.parse(d.date+"T"+r.hm+":00"+d.off),title:r.title,body:r.body});});});
  REMINDERS.length=0;rem.sort(function(a,b){return a.ms-b.ms;}).forEach(function(r){REMINDERS.push(r);});
}
rebuildProgram();
var UI={tab:"today",openDay:null,sheet:null,filter:"all"};
var POS=null;

function currentDay(){var k=dateKey(nowMs(),TRIP_TZ);for(var i=0;i<DAYS.length;i++){if(DAYS[i].date===k)return DAYS[i];}return null;}

/* ---------- petits utilitaires UI ---------- */
var toastT;
function toast(m){var t=$("#toast");t.textContent=m;t.className="on";clearTimeout(toastT);toastT=setTimeout(function(){t.className="";},2600);}
function copy(txt){
  function fb(){try{var a=document.createElement("textarea");a.value=txt;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();document.execCommand("copy");a.remove();toast("Copié");}catch(e){toast("Copie impossible");}}
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(function(){toast("Copié");},fb);}else fb();}catch(e){fb();}
}
var ICON={
 today:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
 trip:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
 guide:'<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>',
 remind:'<svg viewBox="0 0 24 24"><path d="M6 16v-5a6 6 0 1112 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
 tools:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M3 13h18"/></svg>',
 ai:'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M12 7.5l.9 1.8 1.9.3-1.4 1.3.4 1.9-1.8-1-1.8 1 .4-1.9-1.4-1.3 1.9-.3z"/></svg>',
 convert:'<svg viewBox="0 0 24 24"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>',
 grab:'<svg viewBox="0 0 24 24"><path d="M3 13l2-6h14l2 6v5H3z"/><path d="M3 13h18"/><circle cx="7" cy="16" r="1"/><circle cx="17" cy="16" r="1"/></svg>',
 translate:'<svg viewBox="0 0 24 24"><path d="M3 5h10M8 3v2M5.5 5c.5 3.5 3 6.5 6.5 8M10.5 5c-.8 3.8-3.4 6.7-7 8"/><path d="M13 21l4-9 4 9M14.5 18h5"/></svg>',
 tricount:'<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
 play:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
 pause:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
 prev:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM9 12l10 7V5z"/></svg>',
 next:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM15 12L5 19V5z"/></svg>',
 stop:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>',
 check:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>'
};

/* ---------- trajets : prix, Google Maps, applis VTC ---------- */
function eur(thb){return Math.round(thb/(S.set.rate||37.71));}
function optCost(o){if(o.unit==="inc")return [0,0];var k=o.unit==="pp"?PEOPLE:1;return [o.lo*k,o.hi*k];}
function fmtCost(o){
  if(o.unit==="inc")return "Inclus";
  var c=optCost(o);if(!c[1])return "Gratuit";
  var a=c[0].toLocaleString("fr-FR"),b=c[1].toLocaleString("fr-FR"),e=eur(c[0]),f=eur(c[1]);
  return (c[0]===c[1]?a:a+" à "+b)+" THB (≈ "+(e===f?e:e+" à "+f)+" €) pour deux";
}
function mapsDir(dest,from,mode){return "https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(dest)+(from?"&origin="+encodeURIComponent(from):"")+"&travelmode="+(mode||"driving");}
function siteQuery(s){return s.lat?(s.lat+","+s.lng):(s.name+", "+s.city+", Thaïlande");}
function siteApps(s){var c=s.city;if(c==="Bangkok")return ["grab","bolt"];if(c==="Chiang Mai")return ["grab","bolt","indrive"];if(c.indexOf("Krabi")===0)return ["grab"];if(c==="Phuket")return ["grab","bolt"];return [];}
function appButtons(list){
  if(!list||!list.length)return '<p class="small muted">Pas d’application de VTC fiable sur ce trajet : utilisez le transfert réservé ou un taxi à prix convenu.</p>';
  var h='<div class="row" style="margin-top:8px">';
  list.forEach(function(k){var a=APPS[k];
    if(a.deep)h+='<a class="btn alt" href="'+a.deep+'">Ouvrir '+a.name+'</a><a class="cp" href="'+a.play+'" target="_blank" rel="noopener">Installer</a>';
    else h+='<a class="btn alt" href="'+a.play+'" target="_blank" rel="noopener">'+a.name+' (Play Store)</a>';
  });
  h+='</div><p class="small muted" style="margin-top:6px">Le bouton ouvre l’appli si elle est installée. Saisissez ensuite la destination : le prix s’affiche avant de confirmer.</p>';
  return h;
}
function legList(){var seen={},out=[];ITEMS.forEach(function(it){if(it.leg&&LEGS[it.leg]&&!seen[it.leg]){seen[it.leg]=1;out.push(it.leg);}});return out;}
function legTotal(){var lo=0,hi=0;legList().forEach(function(id){var l=LEGS[id],c=optCost(l.opts[l.rec]);lo+=c[0];hi+=c[1];});return [lo,hi];}
var TABS=[["today","Aujourd’hui"],["trip","Voyage"],["guide","Guide"],["ai","Assistant"],["convert","Convertir"],["grab","Grab"],["translate","Traduire"],["tricount","Tricount"],["remind","Rappels"],["tools","Pratique"]];

/* ---------- vues ---------- */
function timeline(items,t){
  var nextId=null;for(var i=0;i<items.length;i++){if(items[i].ms>t){nextId=items[i].id;break;}}
  var h='<ul class="tl">';
  items.forEach(function(it){
    var past=it.ms<=t&&it.id!==nextId, done=!!S.done[it.id];
    var z=TZNAME[it.tz]?'<small>'+esc(TZNAME[it.tz])+'</small>':'';
    h+='<li class="it k-'+it.kind+(past||done?" past":"")+(it.id===nextId?" next":"")+'">'
     +'<div class="tm">'+hm(it.ms,it.tz)+z+'</div>'
     +'<div class="bd"><b>'+esc(it.title)+'</b>'+(it.detail?'<span>'+esc(it.detail)+'</span>':'')
     +(it.site&&SITE[it.site]?'<button class="go" data-a="site" data-id="'+it.site+'">Guide audio : '+esc(SITE[it.site].name)+'</button>':'')
     +(it.leg&&LEGS[it.leg]?'<button class="go go2" data-a="leg" data-id="'+it.leg+'">Trajet et prix : '+esc(fmtCost(LEGS[it.leg].opts[LEGS[it.leg].rec]).replace(" pour deux",""))+'</button>':'')
     +'</div>'
     +'<button class="chk" data-a="done" data-id="'+it.id+'" aria-pressed="'+done+'" aria-label="Marquer comme fait">'+ICON.check+'</button></li>';
  });
  return h+'</ul>';
}
function hotelBlock(id){
  var H=HOTELS[id];if(!H)return "";
  return '<div class="card"><h3>'+esc(H.name)+'</h3><p class="muted small">'+esc(H.addr)+'</p>'
   +'<div class="row" style="margin-top:10px"><button class="btn" data-a="driver" data-k="h:'+id+'">Montrer au chauffeur</button>'
   +'<a class="btn alt" href="tel:'+H.tel+'">Appeler</a></div></div>';
}
function alertsHtml(){
  var list=REMINDERS.filter(function(r){return S.fired[r.id]==="fired"&&!S.ack[r.id];}).sort(function(a,b){return b.ms-a.ms;});
  return list.map(function(r){return '<div class="alert"><b>'+esc(r.title)+'</b><span>'+esc(r.body)+'</span><br><button class="btn" data-a="ack" data-id="'+r.id+'">Compris</button></div>';}).join("");
}
function vToday(){
  var t=nowMs(),d=currentDay(),nxt=null,i;
  for(i=0;i<ITEMS.length;i++){if(ITEMS[i].ms>t){nxt=ITEMS[i];break;}}
  var title=d?"Jour "+d.n+" sur 15 · "+d.city:(t<ITEMS[0].ms?"Avant le départ":"Voyage terminé");
  var h='<header class="top"><div><h1>'+esc(title)+'</h1><p>'+esc(cap(longDate(t,TRIP_TZ)))+'</p></div>'+(S.set.offset?'<span class="badge">Heure simulée</span>':'')+'</header>';
  h+=alertsHtml();
  if(nxt){
    var site=nxt.site&&SITE[nxt.site];
    h+='<section class="sign"><div class="sign-in"><p class="s-sub">Prochaine étape, '+hm(nxt.ms,nxt.tz)+(TZNAME[nxt.tz]?" ("+TZNAME[nxt.tz]+")":"")+' · '+esc(cap(fmt(nxt.ms,nxt.tz,{weekday:"short",day:"numeric",month:"short"})))+'</p>'
     +'<h2>'+esc(nxt.title)+'</h2>'+(nxt.detail?'<p class="s-det">'+esc(nxt.detail)+'</p>':'')
     +'<p class="s-cd">'+countdown(nxt.ms-t)+'</p>'
     +(site?'<button class="btn-sign" data-a="site" data-id="'+site.id+'">Écouter le guide</button> ':'')
     +(nxt.leg&&LEGS[nxt.leg]?'<button class="btn-sign" data-a="leg" data-id="'+nxt.leg+'">Trajet et prix</button>':'')+'</div></section>';
  }else{
    h+='<section class="sign"><div class="sign-in"><h2>Bon retour</h2><p class="s-det">Le voyage est terminé. Merci d’avoir roulé avec nous.</p></div></section>';
  }
  var nr=REMINDERS.filter(function(r){return r.ms>t;})[0];
  if(nr)h+='<p class="muted small" style="margin:-4px 2px 12px">Prochain rappel '+countdown(nr.ms-t)+' : '+esc(nr.title)+'</p>';
  if(d){
    h+='<div class="row" style="margin-bottom:12px"><button class="btn" data-a="brief" data-n="'+d.n+'">Écouter le briefing du jour</button></div>';
    if(d.note)h+='<div class="card"><h3>À garder en tête</h3><p>'+esc(d.note)+'</p></div>';
    h+='<div class="card"><h3>Programme du jour</h3>'+timeline(d.items,t)+'</div>';
    if(d.sleep)h+='<p class="muted small" style="margin:0 2px 6px">Nuit de ce soir</p>'+hotelBlock(d.sleep);
  }else if(t<ITEMS[0].ms){
    h+='<div class="card"><h3>Départ</h3><p>Tout le roadbook est dans l’application, même sans réseau. Ouvrez la page une fois avec une connexion, puis ajoutez-la à l’écran d’accueil.</p></div>';
  }
  var vt=versionText();
  if(vt)h+='<p class="muted" id="app-version" style="font-size:12px;text-align:center;margin:18px 2px 4px">'+esc(vt)+'</p>';
  return h;
}
function vTrip(){
  var t=nowMs(),cur=currentDay(),h='<header class="top"><div><h1>Voyage</h1><p>5 au 19 novembre 2026</p></div></header>';
  DAYS.forEach(function(d){
    var open=UI.openDay===d.n,today=cur&&cur.n===d.n;
    var lbl=cap(fmt(Date.parse(d.date+"T12:00:00+07:00"),TRIP_TZ,{weekday:"short",day:"numeric",month:"short"}));
    h+='<div class="day'+(today?" today":"")+'"><button data-a="day" data-n="'+d.n+'" aria-expanded="'+open+'"><span class="dn">J'+d.n+'</span><span class="dt"><b>'+esc(d.title)+'</b><span>'+esc(lbl)+(today?" · aujourd’hui":"")+(d.modified?" · modifié":"")+'</span></span></button>';
    if(open){
      h+='<div class="dbody">'+(d.note?'<p class="muted" style="margin-bottom:6px">'+esc(d.note)+'</p>':'')+timeline(d.items,t)
        +(d.sleep?'<p class="small muted" style="margin-top:8px">Nuit : '+esc(HOTELS[d.sleep].name)+'</p>':'')
        +'<div class="row" style="margin-top:10px"><button class="btn alt" data-a="brief" data-n="'+d.n+'">Écouter le briefing</button>'+(d.modified?'<button class="btn alt" data-a="progundo" data-n="'+d.n+'">Annuler la dernière modification</button>':'')+'<button class="btn alt" data-a="progask" data-n="'+d.n+'">Modifier avec l’assistant</button></div></div>';
    }
    h+='</div>';
  });
  return h;
}
function dist(a,b,c,d){var R=6371000,r=Math.PI/180,x=(c-a)*r,y=(d-b)*r,q=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)*Math.sin(y/2);return 2*R*Math.asin(Math.sqrt(q));}
function minutes(s){var w=0;s.ch.forEach(function(c){w+=c.x.split(/\s+/).length;});return Math.max(1,Math.round(w/(150*S.set.speed)));}
function markHeard(id){if(!id||!SITE[id]||S.heard[id])return;S.heard[id]=Date.now();save();toast("« "+SITE[id].name+" » archivé dans Écoutés");if(UI.tab==="guide"&&!UI.sheet)render(true);if(UI.sheet===id)renderSheet();}
function heardLabel(id){return S.heard[id]?"écouté le "+fmt(S.heard[id],TRIP_TZ,{day:"numeric",month:"short"}):"";}
function vGuide(){
  var cities=["all"];SITES.forEach(function(s){if(cities.indexOf(s.city)<0)cities.push(s.city);});
  var nh=SITES.filter(function(s){return S.heard[s.id];}).length,arch=UI.filter==="heard";
  var h='<header class="top"><div><h1>Guide audio</h1><p>'+(SITES.length-nh)+' à écouter · '+nh+' écouté'+(nh>1?'s':'')+'</p></div></header>';
  h+='<div class="card"><div class="row" style="justify-content:space-between"><div><b>Détection automatique</b><p class="muted small">Propose le guide quand vous arrivez sur un site.</p></div>'
    +'<button class="btn '+(S.set.geo?"":"alt")+'" data-a="geo" aria-pressed="'+S.set.geo+'">'+(S.set.geo?"Activée":"Activer")+'</button></div>'
    +(S.set.geo?'<p class="small muted" style="margin-top:8px">'+(POS?"Position trouvée (précision "+Math.round(POS.acc)+" m).":"Recherche de votre position…")+'</p>':'')+'</div>';
  h+='<div class="chips" role="group" aria-label="Filtrer par lieu">';
  cities.forEach(function(c){h+='<button class="chip" data-a="filter" data-v="'+esc(c)+'" aria-pressed="'+(UI.filter===c)+'">'+(c==="all"?"Tout":esc(c))+'</button>';});
  if(POS)h+='<button class="chip" data-a="filter" data-v="near" aria-pressed="'+(UI.filter==="near")+'">Autour de moi</button>';
  h+='<button class="chip" data-a="filter" data-v="heard" aria-pressed="'+arch+'">Écoutés ('+nh+')</button>';
  h+='</div>';
  var list=SITES.slice();
  if(arch)list=list.filter(function(s){return S.heard[s.id];}).sort(function(a,b){return S.heard[b.id]-S.heard[a.id];});
  else{
    list=list.filter(function(s){return !S.heard[s.id];});
    if(UI.filter==="near"&&POS){list=list.filter(function(s){return s.lat;}).sort(function(a,b){return dist(POS.lat,POS.lng,a.lat,a.lng)-dist(POS.lat,POS.lng,b.lat,b.lng);});}
    else if(UI.filter!=="all"){list=list.filter(function(s){return s.city===UI.filter;});}
  }
  if(!list.length)h+='<p class="muted" style="margin:8px 2px">'+(arch?"Aucun guide archivé. Un guide s’archive tout seul quand vous l’écoutez jusqu’au bout, ou avec le bouton « Marquer comme écouté » de sa fiche.":"Tous les guides de cette sélection ont été écoutés : retrouvez-les dans « Écoutés ».")+'</p>';
  list.forEach(function(s){
    var dd=(POS&&s.lat)?dist(POS.lat,POS.lng,s.lat,s.lng):null;
    var ds=dd==null?"":(dd<1000?" · à "+Math.round(dd/10)*10+" m":" · à "+(dd/1000).toFixed(1).replace(".",",")+" km");
    h+='<button class="site'+(S.heard[s.id]?' heard':'')+'" data-a="site" data-id="'+s.id+'"><span><b>'+esc(s.name)+'</b><span>'+esc(s.city)+' · '+minutes(s)+' min'+ds+(S.heard[s.id]?' · '+esc(heardLabel(s.id)):'')+'</span></span><span class="pl">'+ICON.play+'</span></button>';
    if(arch)h+='<div class="row" style="margin:-4px 0 12px;justify-content:flex-end"><button class="cp" data-a="heardset" data-id="'+s.id+'" data-v="0">Remettre dans la liste</button></div>';
  });
  if(arch&&nh)h+='<div class="row" style="margin-top:6px"><button class="cp" data-a="heardall">Tout remettre dans la liste</button></div>';
  return h;
}
function vRemind(){
  var t=nowMs(),h='<header class="top"><div><h1>Rappels</h1><p>'+REMINDERS.length+' rappels programmés</p></div></header>';
  if(NATIVE){
    h+='<div class="card"><h3>Alarmes Android</h3>';
    if(NAT.error)h+='<p>Programmation impossible : '+esc(NAT.error)+'</p>';
    else h+='<p>'+(NAT.pending==null?"Programmation en cours…":NAT.pending+" alarmes programmées dans Android. Elles sonnent à l’heure, même application fermée et écran éteint.")+'</p>';
    if(NAT.perm&&NAT.perm!=="granted")h+='<p class="small" style="margin-top:8px;color:var(--alert)">Les notifications sont refusées : autorisez-les dans Réglages Android → Applications → Thaïlande 2026 → Notifications.</p>';
    if(NAT.exact&&NAT.exact!=="granted")h+='<p class="small" style="margin-top:8px;color:var(--alert)">Les alarmes exactes sont désactivées : les rappels risquent d’arriver avec du retard. Touchez le bouton ci-dessous et autorisez « Alarmes et rappels ».</p><div class="row" style="margin-top:8px"><button class="btn warn" data-a="exact">Autoriser les alarmes exactes</button></div>';
    h+='<div class="row" style="margin-top:10px"><button class="btn alt" data-a="testnotif">Tester dans 10 secondes</button><button class="btn alt" data-a="resched">Reprogrammer</button></div></div>';
  }else{
  var perm=("Notification" in window)?Notification.permission:"unsupported";
  h+='<div class="card"><h3>Notifications</h3>';
  if(perm==="granted")h+='<p>Les notifications sont activées. Elles s’affichent tant que l’application reste ouverte ou en arrière-plan.</p><div class="row" style="margin-top:10px"><button class="btn alt" data-a="testnotif">Tester une notification</button></div>';
  else if(perm==="denied")h+='<p>Les notifications sont bloquées dans votre navigateur. Autorisez-les dans les réglages du site pour les recevoir. Les rappels restent visibles ici.</p>';
  else if(perm==="unsupported")h+='<p>Ce navigateur ne gère pas les notifications. Les rappels apparaissent en haut de l’écran « Aujourd’hui ».</p>';
  else h+='<p>Autorisez les notifications pour être prévenus à l’heure, même quand l’écran est éteint.</p><div class="row" style="margin-top:10px"><button class="btn" data-a="enotif">Activer les notifications</button></div>';
  h+='<p class="muted small" style="margin-top:10px">Un navigateur ne peut pas réveiller une page fermée. Pour des alarmes fiables, ajoutez aussi les moments clés à l’agenda du téléphone.</p></div>';
  }
  var missed=REMINDERS.filter(function(r){return S.fired[r.id]==="missed"&&!S.ack[r.id];});
  if(missed.length){h+='<div class="card"><h3>Manqués</h3>';missed.forEach(function(r){h+='<div class="kv"><span><b>'+esc(r.title)+'</b><br><span class="muted small">'+esc(cap(fmt(r.ms,TRIP_TZ,{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})))+'</span></span><button class="cp" data-a="ack" data-id="'+r.id+'">Ignorer</button></div>';});h+='</div>';}
  var up=REMINDERS.filter(function(r){return !S.fired[r.id]&&r.ms>t;});
  h+='<div class="card"><h3>À venir</h3>';
  if(!up.length)h+='<p class="muted">Aucun rappel à venir.</p>';
  up.forEach(function(r){h+='<div class="kv" style="align-items:flex-start"><span><b>'+esc(r.title)+'</b><br><span class="muted small">'+esc(r.body)+'</span></span><span class="small muted" style="text-align:right;flex:none">'+esc(cap(fmt(r.ms,TRIP_TZ,{weekday:"short",day:"numeric",month:"short"})))+'<br><b style="color:var(--ink)">'+hm(r.ms,TRIP_TZ)+'</b></span></div>';});
  return h+'</div>';
}
function vTools(){
  var h='<header class="top"><div><h1>Pratique</h1><p>Tout ce qu’il faut sous la main</p></div></header>';
  /* version de l’app */
  var vt=versionText();
  h+='<div class="card"><p class="small muted" id="tools-version">'+esc(vt||"Version inconnue")+'</p><div class="row" style="margin-top:8px"><button class="btn alt" data-a="updcheck">Vérifier les mises à jour</button></div></div>';
  /* trajets */
  var tt=legTotal();
  h+='<details class="card"><summary>Trajets et budget transport</summary><div><p class="muted small" style="margin-bottom:6px">Total estimé pour deux, options recommandées : <b style="color:var(--ink)">'+tt[0].toLocaleString("fr-FR")+' à '+tt[1].toLocaleString("fr-FR")+' THB</b> (≈ '+eur(tt[0])+' à '+eur(tt[1])+' €). Certains transferts sont peut-être déjà réservés ou inclus dans vos forfaits.</p>';
  legList().forEach(function(id){var l=LEGS[id],o=l.opts[l.rec];h+='<button class="kv" style="width:100%;text-align:left" data-a="leg" data-id="'+id+'"><span><b>'+esc(l.title)+'</b><br><span class="muted small">'+esc(o.m)+' · '+esc(o.t)+'</span></span><b style="text-align:right;flex:none">'+esc(fmtCost(o).replace(" pour deux","").replace(/ \(≈.*\)/,""))+'</b></button>';});
  h+='</div></details>';
  /* VTC */
  h+='<details class="card"><summary>Équivalent d’Uber : Grab et Bolt</summary><div><p class="small" style="margin-bottom:8px">Uber n’opère plus en Thaïlande : l’appli de référence est <b>Grab</b>, avec <b>Bolt</b> et <b>inDrive</b> en alternatives. Installez-les et créez le compte avant le départ.</p>';
  Object.keys(APPS).forEach(function(k){var a=APPS[k];h+='<div class="hotel"><h4>'+esc(a.name)+'</h4><p class="small muted">'+esc(a.info)+'</p><div class="row" style="margin-top:6px">'+(a.deep?'<a class="cp" href="'+a.deep+'">Ouvrir</a>':'')+'<a class="cp" href="'+a.play+'" target="_blank" rel="noopener">Play Store</a></div></div>';});
  h+='<p style="margin-top:10px"><b>Où ça marche</b></p>';
  RIDE_BY_CITY.forEach(function(r){h+='<div class="thai-row"><b>'+esc(r[0])+'</b><span class="small muted" style="display:block">'+esc(r[1])+'</span></div>';});
  h+='</div></details>';
  /* réservations */
  h+='<details class="card"><summary>Réservations</summary><div>';
  RESA.forEach(function(r,i){h+='<div class="kv"><span>'+esc(r[0])+'<br><span class="ref">'+esc(r[1])+'</span></span><span class="row" style="flex:none">'+(r[2]?'<a class="cp" href="'+r[2]+'" target="_blank" rel="noopener">Gérer</a>':'')+'<button class="cp" data-a="copy" data-v="'+esc(r[1])+'">Copier</button></span></div>';});
  h+='</div></details>';
  /* hôtels */
  h+='<details class="card"><summary>Hôtels</summary><div>';
  Object.keys(HOTELS).forEach(function(k){var H=HOTELS[k];
    h+='<div class="hotel"><h4>'+esc(H.name)+'</h4><p class="muted small">'+esc(H.city)+' · '+esc(H.dates)+'</p><p class="small" style="margin-top:4px">'+esc(H.addr)+'</p><p class="small muted" style="margin-top:4px">'+esc(H.inout)+'</p><p class="small" style="margin-top:4px">Réservation : <span class="ref">'+esc(H.ref)+'</span></p><p class="small" style="margin-top:4px">'+esc(H.note)+'</p>'
      +'<div class="row" style="margin-top:8px"><button class="cp" data-a="driver" data-k="h:'+k+'">Montrer au chauffeur</button><a class="cp" href="tel:'+H.tel+'">Appeler</a><button class="cp" data-a="copy" data-v="'+esc(H.addr)+'">Copier l’adresse</button></div></div>';});
  h+='</div></details>';
  /* espèces */
  var tot=0,left=0;CASH.forEach(function(c){tot+=c[2];if(!S.cash[c[0]])left+=c[2];});
  h+='<details class="card" open><summary>Espèces à prévoir</summary><div><p class="muted small" style="margin-bottom:6px">Cochez ce qui est payé. Reste à prévoir : <b style="color:var(--ink)">'+left.toLocaleString("fr-FR")+' THB</b> (≈ '+Math.round(left/S.set.rate)+' €) sur '+tot.toLocaleString("fr-FR")+' THB.</p>';
  CASH.forEach(function(c){h+='<label class="ck"><input type="checkbox" data-a="cash" data-id="'+c[0]+'"'+(S.cash[c[0]]?" checked":"")+'><span style="flex:1">'+esc(c[1])+'</span><b>'+c[2].toLocaleString("fr-FR")+'</b></label>';});
  h+='</div></details>';
  /* check-lists */
  CHECKS.forEach(function(g){h+='<details class="card"><summary>'+esc(g[0])+'</summary><div>';g[1].forEach(function(c){h+='<label class="ck"><input type="checkbox" data-a="check" data-id="'+c[0]+'"'+(S.checks[c[0]]?" checked":"")+'><span>'+esc(c[1])+'</span></label>';});h+='</div></details>';});
  /* urgences */
  h+='<details class="card"><summary>Numéros d’urgence</summary><div>';
  URG.forEach(function(u){h+='<div class="kv"><span>'+esc(u[0])+'</span><a class="btn" href="tel:'+u[1]+'">'+u[1]+'</a></div>';});
  h+='<p class="muted small" style="margin-top:8px">Ajoutez aussi les numéros d’assistance de votre assurance, de Qatar Airways et d’AirAsia.</p></div></details>';
  /* thaï */
  h+='<details class="card"><summary>Quelques mots de thaï</summary><div>';
  THAI.forEach(function(p){h+='<div class="thai-row"><b>'+esc(p[0])+'</b><i>'+esc(p[1])+'</i></div>';});
  h+='</div></details>';
  h+='<div class="card"><div class="row" style="justify-content:space-between"><div><b>Convertisseur baht / euro</b><p class="muted small">Maintenant dans le menu du bas.</p></div><button class="btn alt" data-a="tab" data-v="convert">Ouvrir</button></div></div>';
  /* réglages */
  var vs=NATIVE?(TTSN?esc(VOICE.state||"Voix Android : vérification…"):"Voix Android indisponible : module de synthèse vocale absent de l’APK."):("speechSynthesis" in window?"Voix du téléphone disponible.":"Voix non disponible sur ce navigateur.");
  if(NATIVE&&TTSN&&!VOICE.checked)voiceCheck();
  h+='<details class="card"><summary>Réglages</summary><div>'
   +'<label>Apparence<select data-a="theme"><option value="auto"'+(S.set.theme==="auto"?" selected":"")+'>Automatique</option><option value="light"'+(S.set.theme==="light"?" selected":"")+'>Clair</option><option value="dark"'+(S.set.theme==="dark"?" selected":"")+'>Sombre</option></select></label>'
   +'<label style="display:block;margin-top:10px">Vitesse de la voix<select data-a="speed">'+[0.8,0.9,1,1.1,1.25].map(function(v){return '<option value="'+v+'"'+(S.set.speed===v?" selected":"")+'>'+(v===1?"Normale":"× "+String(v).replace(".",","))+'</option>';}).join("")+'</select></label>'
   +'<div class="row" style="margin-top:12px;justify-content:space-between"><div><b>Lecture automatique</b><p class="muted small">Démarre seule à l’arrivée sur un site, après une première lecture manuelle.</p></div><button class="btn '+(S.set.auto?"":"alt")+'" data-a="auto" aria-pressed="'+S.set.auto+'">'+(S.set.auto?"Activée":"Désactivée")+'</button></div>'
   +'<div class="row" style="margin-top:12px"><button class="btn alt" data-a="voicetest">Tester la voix</button>'+(NATIVE&&TTSN?'<button class="btn alt" data-a="voiceinstall">Installer la voix française</button>':'')+'</div><p class="muted small" style="margin-top:6px"><span id="voice-state">'+vs+'</span> Pour une voix hors ligne, installez la voix française dans les réglages du téléphone (synthèse vocale).</p>'
   +'<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><b>Serveur Minix</b><p class="muted small">Adresse HTTPS du Minix'+(NATIVE?', préremplie : '+MINIX_DEFAULT+' (si vous videz le champ, elle est reprise par défaut)':', par exemple https://minix.xxxx.ts.net')+'. Sert à l’assistant IA, à Tricount et aux mises à jour rapides de l’APK. Laissez vide dans l’app Claude et sur la page du Minix.</p><input type="url" data-a="aibase" placeholder="https://…" value="'+esc(S.set.aiBase||minixDefault())+'" style="margin-top:6px"><input type="password" data-a="aitoken" placeholder="Code d’accès (APP_TOKEN)" value="'+esc(S.set.aiToken||"")+'" style="margin-top:8px"><p class="muted small" id="minix-state" style="margin-top:6px">État : '+esc(minixState())+'</p><div class="row" style="margin-top:8px"><button class="btn alt" data-a="minixtest">Tester la connexion au Minix</button></div><div id="minix-test" class="small" style="margin-top:8px"></div><hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><b>Tricount</b><p class="muted small">Lien de partage du Tricount du voyage, prérempli. Pour en changer : dans Tricount, ouvrez le tricount, Partager, puis Copier le lien. Si vous videz le champ, le lien du voyage est repris.</p><input type="url" data-a="tclink" placeholder="https://tricount.com/…" value="'+esc(tcLink())+'" style="margin-top:6px"><label style="display:block;margin-top:10px">Compter les dépenses Tricount à partir du<input type="date" data-a="tcfrom" value="'+esc(tcFrom())+'" style="margin-top:6px"></label><p class="muted small" style="margin-top:4px">Les dépenses plus anciennes, comme les réservations faites avant le départ, sont ignorées. Par défaut : 5 novembre 2026.</p>'
   +'<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><label>Simuler une date et une heure (heure de Thaïlande)<input type="datetime-local" id="sim" value="'+simValue()+'" data-a="sim"></label>'
   +'<div class="row" style="margin-top:10px"><button class="btn alt" data-a="simreset">Revenir à l’heure réelle</button><button class="btn alt" data-a="resetrem">Réinitialiser les rappels</button></div>'
   +'<p class="muted small" style="margin-top:10px">Utile pour tester l’application avant le départ.</p></div></details>';
  return h;
}
function simValue(){if(!S.set.offset)return "";var ms=nowMs();return dateKey(ms,TRIP_TZ)+"T"+hm(ms,TRIP_TZ).replace("h",":");}

/* ---------- fiche de site ---------- */
function renderLeg(id){
  var l=LEGS[id],el=$("#sheet"),h='<div class="sh"><div class="sh-top"><button class="btn alt" data-a="closesheet">Retour</button><span class="muted small">Trajet</span></div>'
   +'<h2>'+esc(l.title)+'</h2><div class="row" style="margin:10px 0"><a class="btn" href="'+mapsDir(l.toQ,l.fromQ,l.mode)+'" target="_blank" rel="noopener">Ouvrir dans Google Maps</a>'
   +'<a class="btn alt" href="'+mapsDir(l.toQ,"",l.mode)+'" target="_blank" rel="noopener">Depuis ma position</a></div>';
  h+='<p class="tip">Estimations pour deux personnes, relevées en 2026 sur des sources publiques. Les prix réels varient selon l’heure, le trafic, les bagages et la saison : vérifiez le prix dans l’appli ou convenez-en avant de monter.</p>';
  l.opts.forEach(function(o,i){
    h+='<section class="ch'+(i===l.rec?" on":"")+'"><h3><span>'+esc(o.m)+'</span></h3><p><b>'+esc(fmtCost(o))+'</b> · '+esc(o.t)+(i===l.rec?' · <span style="color:var(--sign);font-weight:800">recommandé</span>':'')+'</p><p class="muted small">'+esc(o.n)+'</p></section>';
  });
  if(l.apps&&l.apps.length)h+='<div class="card" style="margin-top:12px"><h3>Équivalent d’Uber</h3>'+appButtons(l.apps)+'</div>';
  else h+='<div class="card" style="margin-top:12px"><h3>Appli de VTC</h3>'+appButtons([])+'</div>';
  if(l.driver)h+='<div class="row" style="margin-top:12px"><button class="btn alt" data-a="driver" data-k="'+l.driver+'">Montrer la destination au chauffeur</button></div>';
  h+='</div>';el.innerHTML=h;el.className="open";document.body.classList.add("lock");
}
function renderSheet(){
  var el=$("#sheet");
  if(!UI.sheet){el.className="";el.innerHTML="";document.body.classList.remove("lock");return;}
  if(LEGS[UI.sheet]){renderLeg(UI.sheet);return;}
  var s=SITE[UI.sheet];
  var h='<div class="sh"><div class="sh-top"><button class="btn alt" data-a="closesheet">Retour</button><span class="muted small">'+esc(s.city)+'</span></div>'
   +'<h2>'+esc(s.name)+'</h2>'+(s.th?'<p class="th">'+esc(s.th)+'</p>':'')
   +'<div class="row" style="margin-top:6px"><button class="btn" data-a="playsite" data-id="'+s.id+'" data-c="0">'+ICON.play+' Écouter tout · '+minutes(s)+' min</button>'
   +(s.th?'<button class="btn alt" data-a="driver" data-k="s:'+s.id+'">Montrer au chauffeur</button>':'')+'</div>'
   +'<div class="row" style="margin-top:8px"><button class="cp" data-a="heardset" data-id="'+s.id+'" data-v="'+(S.heard[s.id]?0:1)+'">'+(S.heard[s.id]?'Remettre dans la liste ('+esc(heardLabel(s.id))+')':'Marquer comme écouté')+'</button></div>'
   +(s.tip?'<p class="tip">'+esc(s.tip)+'</p>':'')
   +'<div class="card" style="margin-top:12px"><h3>Y aller</h3><div class="row"><a class="btn" href="'+mapsDir(siteQuery(s),"","driving")+'" target="_blank" rel="noopener">Itinéraire Google Maps</a></div>'+appButtons(siteApps(s))+'</div>';
  s.ch.forEach(function(c,i){
    h+='<section class="ch" data-ch="'+i+'"><h3><span>'+esc(c.t)+'</span><button class="mini-btn" data-a="playsite" data-id="'+s.id+'" data-c="'+i+'" aria-label="Écouter ce passage">'+ICON.play+'</button></h3><p>'+esc(c.x)+'</p></section>';
  });
  h+='</div>';
  el.innerHTML=h;el.className="open";document.body.classList.add("lock");
  markChapter();
}
function markChapter(){
  var el=$("#sheet");if(!el||!UI.sheet)return;
  el.querySelectorAll(".ch").forEach(function(n){var on=TTS.siteId===UI.sheet&&TTS.q.length&&TTS.chap===parseInt(n.getAttribute("data-ch"),10)&&(TTS.playing||TTS.paused);n.classList.toggle("on",!!on);});
}

/* ---------- synthèse vocale ---------- */
var synth=("speechSynthesis" in window)?window.speechSynthesis:null;
var TTS={q:[],i:0,chap:0,playing:false,paused:false,siteId:null,title:"",chapters:[],unlocked:false};
var tok=0,voiceCache=null,wake=null;
function pickVoice(){
  if(!synth)return null;var vs=synth.getVoices()||[];if(!vs.length)return null;
  if(voiceCache&&vs.indexOf(voiceCache)>=0)return voiceCache;
  var fr=vs.filter(function(v){return /^fr/i.test(v.lang);});
  voiceCache=fr.filter(function(v){return /fr[-_]FR/i.test(v.lang)&&v.localService;})[0]||fr.filter(function(v){return /fr[-_]FR/i.test(v.lang);})[0]||fr[0]||null;
  return voiceCache;
}
if(synth&&synth.addEventListener){synth.addEventListener("voiceschanged",function(){voiceCache=null;});}
function sentences(t){return t.match(/[^.!?…]+[.!?…]+["»”]?|\S[^.!?…]*$/g)||[t];}
function buildQueue(chs){var q=[];chs.forEach(function(c,ci){var intro=c.t?c.t+". ":"";sentences(c.x).forEach(function(sn,k){q.push({text:(k===0?intro:"")+sn.trim(),c:ci});});});return q;}
/* Voix Android (plugin TextToSpeech) : français disponible ? */
var VOICE={checked:false,state:"",ok:null};
function voiceCheck(){
  VOICE.checked=true;
  var show=function(t,ok){VOICE.state=t;VOICE.ok=ok;var el=document.getElementById("voice-state");if(el)el.textContent=t;};
  try{TTSN.isLanguageSupported({lang:"fr-FR"}).then(function(r){
    show(r&&r.supported?"Voix Android disponible en français.":"Voix française absente du téléphone : touchez « Installer la voix française », ou Réglages Android → Synthèse vocale → moteur Google, langue Français.",!!(r&&r.supported));
  },function(e){show("Voix Android indisponible : "+((e&&e.message)||e)+". Vérifiez Réglages Android → Synthèse vocale (moteur Google, langue Français).",false);});}catch(e){show("Voix Android indisponible.",false);}
}
function voiceErr(e){
  var m=((e&&e.message)||String(e||"")).replace(/[.\s]+$/,"");
  toast(/not implemented|not available/i.test(m)?"Voix Android indisponible : module de synthèse vocale absent de l’APK":"Voix Android : "+(m||"erreur")+". Vérifiez Pratique → Réglages → Installer la voix française");
}
function speakNative(i){
  var my=++tok;TTS.i=i;
  if(i>=TTS.q.length){TTS.playing=false;TTS.paused=false;releaseWake();if(i>0)markHeard(TTS.siteId);uiAudio();return;}
  TTS.chap=TTS.q[i].c;TTS.playing=true;TTS.paused=false;TTS.unlocked=true;
  var begin=function(){
    if(my!==tok)return;
    for(var k=i;k<TTS.q.length;k++){(function(k){
      TTSN.speak({text:TTS.q[k].text,lang:"fr-FR",rate:S.set.speed,pitch:1,volume:1,queueStrategy:k===i?0:1}).then(function(){
        if(my!==tok)return;
        TTS.i=k+1;
        if(k+1>=TTS.q.length){TTS.playing=false;TTS.paused=false;releaseWake();markHeard(TTS.siteId);}
        else{TTS.chap=TTS.q[k+1].c;}
        uiAudio();
      }).catch(function(e){if(my!==tok||k!==i)return;tok++;TTS.playing=false;TTS.paused=true;releaseWake();uiAudio();voiceErr(e);});
    })(k);}
  };
  takeWake();uiAudio();
  TTSN.stop().catch(function(){}).then(begin);
}
function speakAt(i){
  if(NATIVE&&TTSN)return speakNative(i);
  if(!synth){toast(NATIVE?"Voix Android indisponible : module de synthèse vocale absent de l’APK":"Voix indisponible sur ce navigateur");return;}
  var busy=synth.speaking||synth.pending;
  tok++;var my=tok;TTS.i=i;
  if(busy)synth.cancel();
  if(i>=TTS.q.length){TTS.playing=false;TTS.paused=false;releaseWake();if(i>0)markHeard(TTS.siteId);uiAudio();return;}
  var seg=TTS.q[i],u=new SpeechSynthesisUtterance(seg.text);
  u.lang="fr-FR";u.rate=S.set.speed;var v=pickVoice();if(v)u.voice=v;
  u.onstart=function(){if(my!==tok)return;if(TTS.chap!==seg.c){TTS.chap=seg.c;}uiAudio();};
  u.onend=function(){if(my!==tok)return;speakAt(i+1);};
  u.onerror=function(e){if(my!==tok)return;if(e&&(e.error==="interrupted"||e.error==="canceled"))return;speakAt(i+1);};
  TTS.chap=seg.c;TTS.playing=true;TTS.paused=false;TTS.unlocked=true;
  if(busy)setTimeout(function(){if(my===tok)synth.speak(u);},60);else synth.speak(u);
  takeWake();uiAudio();
}
function takeWake(){try{if(navigator.wakeLock&&!wake){navigator.wakeLock.request("screen").then(function(w){wake=w;w.addEventListener("release",function(){wake=null;});}).catch(function(){});}}catch(e){}}
function releaseWake(){try{if(wake){wake.release();wake=null;}}catch(e){}}
function startQueue(meta,chs,startChap){
  TTS.q=buildQueue(chs);TTS.chapters=chs.map(function(c){return c.t;});TTS.siteId=meta.siteId||null;TTS.title=meta.title;TTS.sub=meta.sub||"";
  var st=0;for(var k=0;k<TTS.q.length;k++){if(TTS.q[k].c===(startChap||0)){st=k;break;}}
  speakAt(st);
}
function playSite(id,c){var s=SITE[id];startQueue({siteId:id,title:s.name,sub:s.city},s.ch,c||0);}
function briefChapters(d){
  var t=nowMs(),p=[];
  p.push("Jour "+d.n+" sur quinze. "+longDate(Date.parse(d.date+"T12:00:00+07:00"),TRIP_TZ)+". "+d.title+".");
  var it=d.items.map(function(x){return "À "+spoken(x.ms,x.tz)+(TZNAME[x.tz]?", "+TZNAME[x.tz]:"")+", "+x.title.replace(/[()]/g,"")+".";});
  var o=[{t:"Briefing du jour",x:p.join(" ")},{t:"Programme",x:it.join(" ")}];
  var tail=[];if(d.sleep)tail.push("Ce soir, vous dormez à "+HOTELS[d.sleep].name+".");if(d.note)tail.push("À garder en tête : "+d.note);
  if(tail.length)o.push({t:"À retenir",x:tail.join(" ")});
  return o;
}
function playBrief(n){var d=DAYS[n-1];startQueue({title:"Briefing du jour "+d.n,sub:d.city},briefChapters(d),0);}
function pauseToggle(){
  if(!TTS.q.length)return;
  if(TTS.playing){tok++;if(NATIVE&&TTSN)TTSN.stop().catch(function(){});else if(synth)synth.cancel();TTS.playing=false;TTS.paused=true;releaseWake();uiAudio();}
  else{speakAt(TTS.i);}
}
function jumpChap(dir){
  if(!TTS.q.length)return;var target=TTS.chap+dir;
  if(target<0)target=0;
  if(target>=TTS.chapters.length){stopAudio();return;}
  for(var k=0;k<TTS.q.length;k++){if(TTS.q[k].c===target){speakAt(k);return;}}
}
function stopAudio(){tok++;if(NATIVE&&TTSN)TTSN.stop().catch(function(){});else if(synth)synth.cancel();TTS.q=[];TTS.playing=false;TTS.paused=false;TTS.siteId=null;releaseWake();uiAudio();}
function uiAudio(){
  var m=$("#mini");
  if(!TTS.q.length){m.className="";m.innerHTML="";markChapter();return;}
  var pct=Math.round(((TTS.i+ (TTS.playing?0.5:0))/TTS.q.length)*100);
  m.className="on";
  m.innerHTML='<div class="mini-in"><div class="mini-top"><button class="mini-t" data-a="opentrack"><b>'+esc(TTS.title)+'</b><span>'+esc(TTS.chapters[TTS.chap]||"")+(TTS.paused?" · en pause":"")+'</span></button>'
   +'<button class="mb" data-a="prev" aria-label="Passage précédent">'+ICON.prev+'</button>'
   +'<button class="mb big" data-a="toggle" aria-label="'+(TTS.playing?"Pause":"Lecture")+'">'+(TTS.playing?ICON.pause:ICON.play)+'</button>'
   +'<button class="mb" data-a="next" aria-label="Passage suivant">'+ICON.next+'</button>'
   +'<button class="mb" data-a="stop" aria-label="Arrêter">'+ICON.stop+'</button></div><div class="bar"><i style="width:'+pct+'%"></i></div></div>';
  markChapter();
}

/* ---------- géolocalisation ---------- */
var watchId=null;
function startGeo(){
  if(!navigator.geolocation){toast("Position indisponible sur cet appareil");S.set.geo=false;save();return;}
  if(watchId!=null)return;
  watchId=navigator.geolocation.watchPosition(onPos,function(){toast("Position refusée ou indisponible");stopGeo();S.set.geo=false;save();render();},{enableHighAccuracy:true,maximumAge:15000,timeout:30000});
}
function stopGeo(){if(watchId!=null&&navigator.geolocation){navigator.geolocation.clearWatch(watchId);}watchId=null;}
function onPos(p){
  var first=!POS;
  POS={lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy};
  var best=null,bd=1e12;
  SITES.forEach(function(s){if(!s.lat)return;var d=dist(POS.lat,POS.lng,s.lat,s.lng);if(d<=(s.r||300)&&d<bd){best=s;bd=d;}});
  if(best&&!S.heard[best.id]){var last=S.visited[best.id]||0;if(Date.now()-last>4*3600*1000){S.visited[best.id]=Date.now();save();offer(best);}}
  if(UI.tab==="guide"&&!UI.sheet&&first)render();
}
function offer(s){
  if(S.set.auto&&TTS.unlocked&&!TTS.playing&&!TTS.paused){playSite(s.id,0);toast("Guide audio : "+s.name);return;}
  var p=$("#prompt");
  p.className="on";
  p.innerHTML='<div class="pr-in"><b>Vous êtes près de '+esc(s.name)+'</b><span class="small">Lancer le guide audio ?</span><div class="row"><button class="btn" data-a="playsite" data-id="'+s.id+'" data-c="0" data-close="1">Écouter</button><button class="btn alt" data-a="dismissprompt">Plus tard</button></div></div>';
  try{if(navigator.vibrate)navigator.vibrate([120,60,120]);}catch(e){}
}

/* ---------- rappels / notifications ---------- */
function osNotify(r){
  if(NATIVE)return;
  if(!("Notification" in window)||Notification.permission!=="granted")return;
  var opt={body:r.body,tag:r.id};
  try{
    if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){
      navigator.serviceWorker.getRegistration().then(function(reg){if(reg&&reg.showNotification)reg.showNotification(r.title,opt);else new Notification(r.title,opt);}).catch(function(){try{new Notification(r.title,opt);}catch(e){}});
    }else new Notification(r.title,opt);
  }catch(e){}
}
function checkReminders(){
  var t=nowMs(),changed=false,fire=false;
  REMINDERS.forEach(function(r){
    if(S.fired[r.id]||r.ms>t)return;
    S.fired[r.id]=(t-r.ms>45*60000)?"missed":"fired";changed=true;
    if(S.fired[r.id]==="fired"){fire=true;osNotify(r);}
  });
  if(changed){save();if(fire){try{if(navigator.vibrate)navigator.vibrate([200,100,200]);}catch(e){}}}
  return changed;
}

/* ====== MODULES : CONVERTISSEUR, GRAB, TRADUCTION, TRICOUNT, ASSISTANT IA ====== */
var TR_PLAY="https://play.google.com/store/apps/details?id=com.google.android.apps.translate";
var TRICOUNT_PLAY="https://play.google.com/store/search?q=tricount&c=apps";
/* Tricount du voyage, utilisé par défaut (modifiable dans Pratique → Réglages) */
var TRICOUNT_DEFAULT="https://tricount.com/tAsDyFSCDVHlNSGfDs";
function tcLink(){return S.set.tricount||TRICOUNT_DEFAULT;}
function gTrans(text,sl,tl){return "https://translate.google.com/?sl="+sl+"&tl="+tl+"&text="+encodeURIComponent(text||"")+"&op=translate";}
function nextLeg(){var t=nowMs();for(var i=0;i<ITEMS.length;i++){var it=ITEMS[i];if(it.ms>t-3600000&&it.leg&&LEGS[it.leg])return it;}return null;}
function tonightHotel(){var d=currentDay();if(d&&d.sleep)return d.sleep;var t=nowMs();for(var i=0;i<DAYS.length;i++){if(Date.parse(DAYS[i].date+"T23:59:00+07:00")>t&&DAYS[i].sleep)return DAYS[i].sleep;}return null;}

/* ---------- convertisseur ---------- */
UI.cv=UI.cv||"";
function vConvert(){
  var r=S.set.rate||37.71,thb=parseFloat(UI.cv),eurv=isNaN(thb)?"":(thb/r).toFixed(2);
  var h='<header class="top"><div><h1>Convertisseur</h1><p>Baht thaïlandais et euro, sans réseau</p></div></header>';
  h+='<div class="card"><label class="lbl" for="cv-thb">Bahts (THB)</label><input class="big-in" type="number" inputmode="decimal" id="cv-thb" placeholder="0" value="'+esc(UI.cv)+'" data-a="cv">'
   +'<label class="lbl" for="cv-eur" style="margin-top:12px">Euros (€)</label><input class="big-in" type="number" inputmode="decimal" id="cv-eur" placeholder="0" value="'+eurv+'" data-a="cv">'
   +'<p class="muted" id="cv-half" style="margin-top:10px">'+(eurv?'Pour deux : '+(thb/2).toLocaleString("fr-FR")+' THB, soit '+(thb/2/r).toFixed(2).replace(".",",")+' € chacun':'Partage à deux affiché ici.')+'</p></div>';
  h+='<div class="chips" role="group" aria-label="Montants rapides">';
  [20,50,100,200,500,1000,2000,5000].forEach(function(v){h+='<button class="chip" data-a="cvq" data-v="'+v+'">'+v.toLocaleString("fr-FR")+' ฿</button>';});
  h+='</div><div class="card"><label class="lbl" for="cv-rate">Taux : 1 € = … THB</label><input type="number" step="0.01" inputmode="decimal" id="cv-rate" value="'+r+'" data-a="rate"><p class="muted small" style="margin-top:6px">Taux de référence par défaut : 37,71. Votre banque et les bureaux de change appliquent leur propre taux et des frais.</p></div>';
  return h;
}
function cvUpdate(src){
  var r=S.set.rate||37.71,a=$("#cv-thb"),b=$("#cv-eur"),hf=$("#cv-half");if(!a||!b)return;
  if(src==="cv-eur"){var y=parseFloat(b.value);a.value=isNaN(y)?"":Math.round(y*r);}else{var x=parseFloat(a.value);b.value=isNaN(x)?"":(x/r).toFixed(2);}
  UI.cv=a.value;var t=parseFloat(a.value);
  if(hf)hf.textContent=isNaN(t)?"Partage à deux affiché ici.":"Pour deux : "+(t/2).toLocaleString("fr-FR")+" THB, soit "+(t/2/r).toFixed(2).replace(".",",")+" € chacun";
}

/* ---------- Grab ---------- */
function vGrab(){
  var h='<header class="top"><div><h1>Grab et VTC</h1><p>L’équivalent d’Uber en Thaïlande</p></div></header>';
  h+='<div class="card"><h3>Commander une course</h3><p class="small muted">Grab ne permet pas de réserver depuis une page web ni dans une autre app : la commande se fait dans son application, qui affiche le prix avant de confirmer.</p>'+appButtons(["grab","bolt","indrive"])+'</div>';
  var nl=nextLeg();
  if(nl){var l=LEGS[nl.leg];h+='<div class="card"><h3>Prochain trajet</h3><p><b>'+esc(l.title)+'</b></p><p class="small muted">'+esc(cap(fmt(nl.ms,nl.tz,{weekday:"long",day:"numeric",month:"long"})))+' à '+hm(nl.ms,nl.tz)+' · estimation '+esc(fmtCost(l.opts[l.rec]))+'</p><div class="row" style="margin-top:8px"><button class="cp" data-a="copy" data-v="'+esc(l.toQ)+'">Copier la destination</button><button class="cp" data-a="leg" data-id="'+nl.leg+'">Détails et prix</button>'+(l.driver?'<button class="cp" data-a="driver" data-k="'+l.driver+'">Montrer au chauffeur</button>':'')+'</div></div>';}
  var hk=tonightHotel();
  if(hk){var H=HOTELS[hk];h+='<div class="card"><h3>Retour à l’hôtel</h3><p><b>'+esc(H.name)+'</b></p><p class="small muted">'+esc(H.addr)+'</p><div class="row" style="margin-top:8px"><button class="cp" data-a="copy" data-v="'+esc(H.name+", "+H.addr)+'">Copier l’adresse</button><a class="cp" href="'+mapsDir(H.name+", "+H.addr,"","driving")+'" target="_blank" rel="noopener">Google Maps</a><button class="cp" data-a="driver" data-k="h:'+hk+'">Montrer au chauffeur</button></div></div>';}
  h+='<div class="card"><h3>Où ça marche</h3>';RIDE_BY_CITY.forEach(function(r){h+='<div class="thai-row"><b>'+esc(r[0])+'</b><span class="small muted" style="display:block">'+esc(r[1])+'</span></div>';});
  h+='<p class="small muted" style="margin-top:8px">Astuce : collez l’adresse copiée dans le champ « Où allez-vous ? » de l’appli. Vérifiez la plaque d’immatriculation avant de monter.</p></div>';
  return h;
}

/* ---------- traduction ---------- */
UI.tr=UI.tr||"";
function vTranslate(){
  var h='<header class="top"><div><h1>Traduction</h1><p>Thaï ↔ français</p></div></header>';
  h+='<div class="card"><a class="btn block" style="min-height:58px;font-size:19px" href="https://translate.google.com/?sl=fr&tl=th&op=translate" target="_blank" rel="noopener">Ouvrir Google Traduction</a>'
   +'<p class="small muted" style="margin-top:8px">Dans l’appli : mode Caméra pour les menus et panneaux, mode Conversation pour parler. Téléchargez le pack thaï pour l’utiliser hors ligne. <a href="'+TR_PLAY+'" target="_blank" rel="noopener">Installer l’appli</a></p></div>';
  h+='<div class="card"><h3>Phrases utiles</h3><p class="small muted" style="margin-bottom:6px">Touchez une phrase pour l’ouvrir en thaï dans Google Traduction, avec l’écriture thaïe et l’audio.</p>';
  THAI.forEach(function(p){h+='<a class="thai-row" style="display:block;text-decoration:none;color:inherit" href="'+gTrans(p[0],"fr","th")+'" target="_blank" rel="noopener"><b>'+esc(p[0])+'</b><i>'+esc(p[1])+'</i></a>';});
  return h+'</div>';
}

/* ---------- Tricount ---------- */
function vTricount(){
  var link=tcLink();
  var h='<header class="top"><div><h1>Tricount</h1><p>Dépenses partagées du voyage</p></div></header>';
  h+='<div class="card"><h3>Notre Tricount</h3>'+(link?'<div class="row"><a class="btn" href="'+esc(link)+'" target="_blank" rel="noopener">Ouvrir notre Tricount</a><button class="cp" data-a="copy" data-v="'+esc(link)+'">Copier le lien</button></div>':'<p class="small">Collez ci-dessous le lien de partage de votre Tricount (dans l’appli : Partager → Copier le lien). Il s’ouvrira ensuite d’un seul geste.</p>')
   +'<label class="lbl" for="tc-link" style="margin-top:12px">Lien de partage</label><input type="url" id="tc-link" placeholder="https://tricount.com/…" value="'+esc(link)+'" data-a="tclink">'
   +'<div class="row" style="margin-top:10px"><a class="cp" href="'+TRICOUNT_PLAY+'" target="_blank" rel="noopener">Installer Tricount</a></div>'
   +'<p class="small muted" style="margin-top:8px">Tricount ne peut pas s’afficher à l’intérieur de cette app : le lien ouvre l’appli Tricount si elle est installée, sinon son site.</p></div>';
  h+='<div class="card"><h3>Bonnes pratiques</h3><p class="small">Créez le Tricount en euros et saisissez chaque dépense en THB : Tricount convertit au taux du jour. Notez les paiements en espèces au moment où vous payez (massages, droits de parc, longtails). Le suivi des espèces à prévoir reste dans Pratique.</p><div class="row" style="margin-top:8px"><button class="cp" data-a="tab" data-v="tools">Espèces à prévoir</button><button class="cp" data-a="tab" data-v="convert">Convertisseur</button></div></div>';
  return h;
}

/* ---------- assistant IA ---------- */
var AIK="thai26-ai";
function loadAi(){try{return JSON.parse(localStorage.getItem(AIK)||"[]");}catch(e){return [];}}
var AI={mode:"pending",sample:null,limits:null,msgs:loadAi(),busy:false,ctl:null,img:null,imgUrl:null,draft:"",live:""};
function saveAi(){try{localStorage.setItem(AIK,JSON.stringify(AI.msgs.slice(-40)));}catch(e){}}
function aiHeaders(){var h={"Content-Type":"application/json"};if(S.set.aiToken)h["X-App-Token"]=S.set.aiToken;return h;}
/* Adresse du Minix utilisée par défaut dans l’APK (la page du Minix et l’app Claude n’en ont pas besoin) */
var MINIX_DEFAULT="https://minix.tailc987de.ts.net";
function minixDefault(){return NATIVE?MINIX_DEFAULT:"";}
function aiBase(){return (S.set.aiBase||minixDefault()).replace(/\/+$/,"");}
function aiRerender(){if(UI.tab==="ai"&&!UI.sheet)render(true);}
function aiServer(cb){
  var base=aiBase(),done=function(){if(typeof cb==="function")try{cb();}catch(e){}};
  if(!base&&!(/^https?:$/.test(location.protocol)&&!NATIVE)){AI.mode="none";aiRerender();done();return;}
  try{
    AI.reach="pending";AI.err="";
    fetch(base+"/api/health",{headers:aiHeaders()}).then(function(r){if(!r.ok)throw new Error("réponse HTTP "+r.status);return r.json().catch(function(){throw new Error("réponse inattendue : ce n’est pas le serveur du carnet");});}).then(function(j){AI.reach=j&&j.ok?"ok":"ko";AI.needsToken=!!(j&&j.needsToken);AI.auth=(j&&j.auth!==undefined)?!!j.auth:!(j&&j.needsToken&&!j.ai&&!j.tricount);AI.tcWhy=(j&&j.tricount)?"":!AI.auth?"token":(j&&j.tricountConfigured===false)?"config":(j&&j.tricountUp===false)?"down":"unknown";AI.mode=(j&&j.ai)?"server":"none";AI.web=!!(j&&j.web);AI.tc=!!(j&&j.tricount);if(AI.tc&&tcLink()&&(!S.tcSync||Date.now()-S.tcSync.at>900000))tcSync(true);}).catch(function(e){AI.mode="none";AI.reach="ko";AI.err=(e instanceof TypeError)?"aucune réponse":((e&&e.message)||"");}).then(function(){aiRerender();var st=document.getElementById("minix-state");if(st)st.textContent="État : "+minixState();done();});
  }catch(e){AI.mode="none";aiRerender();done();}
}
/* État lisible de la connexion au Minix (mises à jour) et de l’assistant IA */
function minixState(){
  if(AI.mode==="claude")return "Claude (app Claude)";
  if(AI.mode==="pending"||AI.reach==="pending")return "connexion…";
  if(AI.mode==="server")return "Minix connecté, assistant IA actif";
  if(!aiBase()&&NATIVE)return "adresse du Minix non renseignée : l’APK ne reçoit pas les mises à jour";
  if(AI.reach==="ok")return "Minix connecté (les mises à jour arrivent), mais assistant IA indisponible : "+(AI.needsToken?"code d’accès absent ou incorrect, ou ":"")+"clé API absente sur le Minix";
  if(aiBase())return "Minix injoignable"+(AI.err?" ("+AI.err+")":"")+". Vérifiez que l’adresse commence par https:// et finit par .ts.net, sans :8080, et que Tailscale est actif sur le téléphone";
  return "non disponible";
}
/* Bouton « Tester la connexion au Minix » : diagnostic pas à pas, affiché dans Réglages */
function fetchT(u,o,ms){
  var c=window.AbortController?new AbortController():null,tm=setTimeout(function(){if(c)c.abort();},ms);
  return fetch(u,Object.assign({cache:"no-store"},o||{},c?{signal:c.signal}:{})).then(function(r){clearTimeout(tm);return r;},function(e){clearTimeout(tm);throw e;});
}
function netErr(e){
  if(e&&e.name==="AbortError")return "pas de réponse en 10 secondes : Tailscale est-il connecté sur le téléphone ?";
  if(e instanceof TypeError)return "connexion impossible : nom introuvable, Tailscale coupé sur le téléphone, tailscale serve arrêté sur le Minix ou adresse erronée"+(e.message?" (détail : "+e.message+")":"");
  return (e&&e.message)||"erreur inconnue";
}
function minixTest(){
  var out=$("#minix-test");if(!out)return;
  var inp=document.querySelector('[data-a=aibase]'),raw=((inp&&inp.value)||S.set.aiBase||"").trim(),base=raw.replace(/\/+$/,""),L=[];
  if(inp&&raw!==(S.set.aiBase||"")){S.set.aiBase=raw;save();}
  var add=function(k,t){L.push([k,t]);show();};
  var show=function(){out.innerHTML=L.map(function(l){var c=l[0]==="ko"?"var(--alert)":l[0]==="ok"?"var(--ink)":"var(--muted)";return '<p style="margin:4px 0;color:'+c+'"><b>'+({ok:"✓",ko:"✗",warn:"⚠",wait:"…"}[l[0]])+'</b> '+esc(l[1])+'</p>';}).join("")+(/^https?:\/\//.test(base)?'<p style="margin-top:6px"><a class="cp" href="'+esc(base)+'/api/health" target="_blank" rel="noopener">Ouvrir le test dans le navigateur</a></p>':'');};
  if(!base){add("ko","Aucune adresse : collez l’adresse https://….ts.net du Minix ci-dessus.");return;}
  var m=/^(https?):\/\/([^\/:]+)(:\d+)?(\/.*)?$/i.exec(base);
  if(!m){add("ko","Adresse invalide : elle doit commencer par https:// (exemple : https://minix.tail1234.ts.net).");return;}
  add(m[1].toLowerCase()==="https"?"ok":"ko","Adresse : "+base+(m[1].toLowerCase()==="https"?"":(NATIVE?" · l’APK refuse les adresses en http:// : utilisez l’adresse https://….ts.net donnée par « tailscale serve status » sur le Minix.":" · en http://, certaines fonctions ne marchent pas.")));
  if(m[3])add("warn","L’adresse contient un port ("+m[3].slice(1)+") : avec tailscale serve, l’adresse https n’en a pas.");
  if(!/\.ts\.net$/i.test(m[2]))add("warn","L’adresse ne finit pas par .ts.net : vérifiez-la avec « tailscale serve status » sur le Minix.");
  if(m[4])add("warn","Retirez ce qui suit le nom ("+m[4]+") : seule l’adresse de base est attendue.");
  if(navigator.onLine===false){add("ko","Le téléphone n’a pas de connexion internet.");return;}
  add("wait","Test 1 sur 2 : lecture de la version publiée sur le Minix…");
  var t0=Date.now();
  fetchT(base+"/version.json",{},10000).then(function(r){
    if(!r.ok)throw new Error("le Minix répond, mais avec l’erreur HTTP "+r.status+(r.status===503?" : l’app est en cours de construction, réessayez dans un instant":""));
    return r.json().catch(function(){throw new Error("une réponse arrive, mais ce n’est pas le carnet de route : mauvaise adresse ?");});
  }).then(function(j){
    L.pop();
    var mine=typeof BUILD!=="undefined"?BUILD:{v:"?",t:0};
    add("ok","Minix joint en "+(Date.now()-t0)+" ms. Version publiée : "+verLabel(j)+", du "+fmt(new Date(j.t),TRIP_TZ,{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).replace(":"," h ")+".");
    add(j.t>mine.t?"warn":"ok",j.t>mine.t?"Elle est plus récente que celle de l’app : touchez « Vérifier les mises à jour » en haut de Pratique.":"L’app est à jour.");
    add("wait","Test 2 sur 2 : assistant IA et Tricount…");
    return fetchT(base+"/api/health",{headers:aiHeaders()},10000).then(function(r){return r.json();}).then(function(h){
      L.pop();
      var auth=h.auth!==undefined?!!h.auth:!(h.needsToken&&!h.ai&&!h.tricount);
      if(!auth)add("ko","Code d’accès manquant ou incorrect : saisissez-le ci-dessus (champ « Code d’accès »). Sans lui, l’assistant IA et Tricount sont refusés.");
      if(h.ai)add("ok","Assistant IA actif.");
      else if(auth)add("warn","Assistant IA inactif : pas de clé API sur le Minix.");
      if(h.tricount)add("ok","Relais Tricount actif.");
      else if(auth)add("warn",h.tricountConfigured===false?"Relais Tricount non configuré sur le Minix.":h.tricountUp===false?"Relais Tricount arrêté ou en redémarrage sur le Minix : réessayez dans une minute.":"Relais Tricount indisponible.");
    },function(e){L.pop();add("warn","Le Minix répond, mais le test de l’assistant échoue : "+netErr(e));});
  }).catch(function(e){L.pop();add("ko","Minix injoignable : "+netErr(e));}).then(function(){aiServer();});
}
function aiInit(){
  if(window.claude&&typeof window.claude.use==="function"){
    window.claude.use("sample").then(function(s){
      if(s){AI.sample=s;AI.mode="claude";s.limits().then(function(l){AI.limits=l;aiRerender();}).catch(function(){});aiRerender();}
      else aiServer();
    },aiServer);
  }else aiServer();
}
var AI_RULES=[
"Tu es l’assistant de voyage et le guide personnel de deux voyageurs français en road trip en Thaïlande, du 5 au 19 novembre 2026.",
"Réponds toujours en français, de façon chaleureuse, concrète et concise : on te lit sur un téléphone. Utilise le contexte du voyage fourni (programme, hôtels, heure actuelle, position) pour personnaliser chaque réponse.",
"PHOTOS : si une photo est jointe, identifie le lieu ou le bâtiment si tu le peux, en disant ton degré de certitude. Explique le style (thaï de Rattanakosin, Ayutthaya, khmer, Lanna, sino-portugais…), les éléments visibles (prang, chedi, ubosot, naga, garuda, chofa…), leur symbolique, l’histoire et les règles de respect. Sur un menu ou un panneau, traduis et explique.",
"AUDIO GUIDE : quand on te demande un audio guide, une narration ou de raconter un lieu, écris un texte fluide destiné à être lu à voix haute, de 300 à 600 mots, sans titre, sans liste, sans markdown, sans emoji, avec des repères concrets du type « regardez sur votre droite ».",
"TRADUCTION : donne la phrase en écriture thaïe, puis une prononciation simple pour un francophone, et précise la particule polie khrap ou kha.",
"FAITS ET PRIX : n’invente rien. Si tu ne sais pas, dis-le. Les prix sont des estimations à vérifier sur place.",
"FORMAT hors audio guide : paragraphes courts ; listes avec « - » autorisées ; gras avec ** pour les noms de lieux ; pas de tableau."
];
function aiRestRule(){return AI.mode==="server"&&AI.web?"RESTAURANTS ET INFOS RÉCENTES : tu peux utiliser la recherche web. Pour des restaurants, cherche près de la position GPS fournie et donne pour chacun le nom, la distance approximative à pied, la spécialité à commander, la fourchette de prix et les horaires si tu les trouves.":"RESTAURANTS ET INFOS RÉCENTES : tu n’as pas accès à internet ni aux avis en temps réel. Propose ce que tu connais avec prudence (adresses réputées, rues ou marchés connus, plats typiques du quartier), dis clairement que c’est à vérifier, et rappelle le bouton « Restaurants autour » qui ouvre Google Maps.";}
function tripContext(){
  var t=nowMs(),d=currentDay(),L=[];
  L.push("Date et heure actuelles en Thaïlande : "+cap(longDate(t,TRIP_TZ))+", "+hm(t,TRIP_TZ)+(S.set.offset?" (heure simulée)":"")+".");
  if(d)L.push("Aujourd’hui : jour "+d.n+" sur 15, "+d.city+". "+(d.sleep?"Nuit à "+HOTELS[d.sleep].name+", "+HOTELS[d.sleep].addr+".":""));
  else L.push(t<ITEMS[0].ms?"Le voyage n’a pas encore commencé.":"Le voyage est terminé.");
  if(POS)L.push("Position GPS actuelle : "+POS.lat.toFixed(5)+", "+POS.lng.toFixed(5)+" (précision environ "+Math.round(POS.acc)+" m).");
  else L.push("Position GPS : inconnue.");
  var nx=null;for(var i=0;i<ITEMS.length;i++){if(ITEMS[i].ms>t){nx=ITEMS[i];break;}}
  if(nx)L.push("Prochaine étape : "+nx.title+" à "+hm(nx.ms,nx.tz)+" le "+fmt(nx.ms,nx.tz,{day:"numeric",month:"long"})+".");
  L.push("","PROGRAMME :");
  DAYS.forEach(function(x){L.push("J"+x.n+" "+x.date+" · "+x.title+(x.sleep?" · nuit : "+HOTELS[x.sleep].name:""));
    x.items.forEach(function(it){L.push("  "+hm(it.ms,it.tz)+(TZNAME[it.tz]?" ("+TZNAME[it.tz]+")":"")+" "+it.title+(it.detail?" : "+it.detail:""));});
    if(x.note)L.push("  À retenir : "+x.note);});
  L.push("","HÔTELS :");Object.keys(HOTELS).forEach(function(k){var H=HOTELS[k];L.push("- "+H.name+" ("+H.city+", "+H.dates+") "+H.addr+", tél. "+H.telTxt+". "+H.inout+". "+H.note);});
  L.push("","RÉSERVATIONS :");RESA.forEach(function(r){L.push("- "+r[0]+" : "+r[1]);});
  L.push("","ESPÈCES À PRÉVOIR :");CASH.forEach(function(c){L.push("- "+c[1]+" : "+c[2]+" THB"+(S.cash[c[0]]?" (déjà réglé)":""));});
  return L.join("\n")+"\n"+budgetContext();
}
function aiMd(s){
  var e=esc(s).replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>");
  return e.split(/\n{2,}/).map(function(p){
    var lines=p.split("\n");
    if(lines.every(function(l){return /^\s*[-•]\s+/.test(l);}))return '<ul>'+lines.map(function(l){return '<li>'+l.replace(/^\s*[-•]\s+/,"")+'</li>';}).join("")+'</ul>';
    return '<p>'+lines.join("<br>")+'</p>';
  }).join("");
}
function aiPlain(s){return s.replace(/\*\*/g,"").replace(/^#+\s*/gm,"").replace(/^\s*[-•]\s+/gm,"").replace(/\n+/g," ");}
function mapsRestaurants(){return POS?"https://www.google.com/maps/search/restaurants/@"+POS.lat.toFixed(5)+","+POS.lng.toFixed(5)+",17z":"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent("restaurants à proximité");}
var AI_CHIPS=[
 ["photo","Analyser une photo","Qu’est-ce que c’est ? Raconte-nous l’histoire de ce lieu et ce qu’il faut regarder.",false],
 ["resto","Restaurants autour de nous","Trouve-nous les meilleurs restaurants autour de notre position actuelle, à moins de dix minutes à pied, avec un plat à commander pour chacun.",false],
 ["audio","Audio guide de l’endroit","Fais-nous un audio guide personnalisé de l’endroit où nous sommes en ce moment, d’après notre position et notre programme.",true],
 ["now","Que faire maintenant ?","Qu’est-ce qu’on fait maintenant et ensuite ? Rappelle les points d’attention, ce qu’il faut avoir sur soi et les horaires à ne pas manquer.",false],
 ["tomorrow","Programme de demain","Résume notre programme de demain, avec les horaires, ce qu’il faut préparer ce soir et l’argent liquide à prévoir.",false],
 ["thai","Traduire en thaï","Traduis en thaï avec la prononciation : ",false]
];
function vAi(){
  var mode=AI.mode,h='<header class="top"><div><h1>Assistant</h1><p>Guide personnel, photos, restaurants, traductions</p></div>'+(mode==="claude"?'<span class="badge">Claude</span>':mode==="server"?'<span class="badge">Serveur IA</span>':'')+'</header>';
  if(mode==="pending")return h+'<div class="card"><p>Connexion à l’assistant…</p></div>';
  if(mode==="none"){
    h+='<div class="card"><h3>Assistant indisponible ici</h3><p class="small">L’assistant fonctionne :</p><ul class="small"><li>dans l’app Claude, en ouvrant le lien de l’artefact ;</li><li>dans la version Minix, si le serveur a une clé API ;</li><li>dans l’APK, en indiquant l’adresse de votre serveur Minix dans Pratique, puis Réglages.</li></ul><div class="row" style="margin-top:8px"><button class="cp" data-a="tab" data-v="tools">Réglages</button><a class="cp" href="'+mapsRestaurants()+'" target="_blank" rel="noopener">Restaurants autour (Google Maps)</a></div></div>';
    return h;
  }
  h+='<div class="chips" role="group" aria-label="Suggestions">';AI_CHIPS.forEach(function(c){h+='<button class="chip" data-a="aichip" data-v="'+c[0]+'">'+esc(c[1])+'</button>';});h+='</div>';
  h+='<div class="row" style="margin:-4px 0 12px"><a class="cp" href="'+mapsRestaurants()+'" target="_blank" rel="noopener">Restaurants autour (Google Maps)</a>'+(AI.msgs.length?'<button class="cp" data-a="aiclear">Effacer la conversation</button>':'')+'</div>';
  h+='<div id="ai-log">';
  if(!AI.msgs.length)h+='<div class="card"><p class="small">Posez une question sur le voyage, envoyez une photo d’un temple ou d’un menu, demandez un audio guide personnalisé ou des restaurants autour de vous. '+(mode==="claude"?'L’assistant utilise votre compte Claude ; il n’a pas accès à internet.':'')+(mode==="server"&&!AI.web?' Recherche web non activée sur le serveur.':'')+'</p></div>';
  AI.msgs.forEach(function(m,i){
    if(m.role==="user")h+='<div class="msg me">'+(m.img?'<span class="small muted">Photo jointe</span><br>':'')+esc(m.content)+'</div>';
    else h+='<div class="msg bot">'+aiMd(m.content)+propCard(m,i)+'<div class="row" style="margin-top:6px"><button class="cp" data-a="aispeak" data-i="'+i+'">Écouter</button><button class="cp" data-a="aicopy" data-i="'+i+'">Copier</button></div></div>';
  });
  if(AI.busy)h+='<div class="msg bot" id="ai-live">'+(AI.live?aiMd(AI.live):'<span class="muted">Réflexion…</span>')+'</div>';
  h+='</div>';
  var canImg=mode==="server"||(AI.limits&&AI.limits.images);
  h+='<div class="composer card">'
   +(AI.imgUrl?'<div class="row" style="margin-bottom:8px"><img src="'+AI.imgUrl+'" alt="Photo jointe" style="width:64px;height:64px;object-fit:cover;border-radius:10px"><button class="cp" data-a="aiclearimg">Retirer la photo</button></div>':'')
   +'<textarea id="ai-text" rows="2" data-a="aidraft" placeholder="Votre question…">'+esc(AI.draft)+'</textarea>'
   +'<div class="row" style="margin-top:8px">'+(canImg?'<button class="btn alt" data-a="aiphoto">Appareil photo</button><button class="btn alt" data-a="aigal">Galerie</button><input type="file" id="ai-file" accept="image/*" capture="environment" data-a="aifile" hidden><input type="file" id="ai-gal" accept="image/*" data-a="aifile" hidden>':'')
   +'<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-a="aipos"'+(S.set.aiPos!==false?" checked":"")+'> Envoyer ma position</label>'
   +(AI.busy?'<button class="btn warn" data-a="aistop" style="margin-left:auto">Stop</button>':'<button class="btn" data-a="aisend" style="margin-left:auto">Envoyer</button>')+'</div></div>';
  return h;
}
function aiLive(text){text=aiStripLive(text);AI.live=text;var el=$("#ai-live");if(el)el.innerHTML=aiMd(text);}
function getPosOnce(cb){
  if(S.set.aiPos===false||!navigator.geolocation)return cb();
  if(POS&&POS.t&&Date.now()-POS.t<120000)return cb();
  var done=false;var fin=function(){if(!done){done=true;cb();}};
  try{navigator.geolocation.getCurrentPosition(function(p){POS={lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy,t:Date.now()};fin();},fin,{enableHighAccuracy:true,timeout:8000,maximumAge:60000});}catch(e){fin();}
  setTimeout(fin,9000);
}
function shrinkImage(file){
  return new Promise(function(res,rej){
    var img=new Image(),u=URL.createObjectURL(file);
    img.onload=function(){var m=1568,w=img.naturalWidth,h=img.naturalHeight,k=Math.min(1,m/Math.max(w,h));var c=document.createElement("canvas");c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL("image/jpeg",0.85).split(",")[1]);};
    img.onerror=function(){URL.revokeObjectURL(u);rej(new Error("image"));};img.src=u;
  });
}
var AI_ERR={not_granted:"L’accès à Claude a été refusé pour cette page.",rate_limited:"Trop de demandes pour le moment. Réessayez dans un instant.",session_expired:"Reconnectez-vous à Claude, puis réessayez.",image_rejected:"Photo refusée : essayez une autre image (JPEG ou PNG).",images_unavailable:"L’envoi de photos n’est pas disponible ici.",refused:"Claude n’a pas pu répondre à cette demande. Reformulez-la.",prompt_too_large:"Conversation trop longue : effacez-la et recommencez.",sampling_disabled:"Claude n’est pas disponible pour ce compte."};
function aiSend(text,speak){
  text=(text||"").trim();if(!text&&!AI.img)return;if(AI.busy)return;
  if(!text)text="Qu’est-ce que c’est ? Raconte-nous ce que nous voyons.";
  var img=AI.img;AI.msgs.push({role:"user",content:text,img:!!img});AI.draft="";AI.img=null;if(AI.imgUrl){try{URL.revokeObjectURL(AI.imgUrl);}catch(e){}}AI.imgUrl=null;
  AI.busy=true;AI.live="";saveAi();render(true);window.scrollTo(0,document.body.scrollHeight);
  getPosOnce(function(){
    var rules=AI_RULES.concat([aiRestRule()]).join("\n")+"\n\n=== CONTEXTE DU VOYAGE ===\n"+tripContext()+"\n=== FIN DU CONTEXTE ===";
    var hist=AI.msgs.slice(-12).map(function(m){var c=m.content;if(m.prop)c+="\n[Bloc PROGRAMME proposé pour le(s) jour(s) "+m.prop.map(function(v){return v.n;}).join(", ")+" : "+(m.applied==="ok"?"appliqué":m.applied==="no"?"ignoré":"en attente")+"]";if(m.exp)c+="\n[Bloc DEPENSES proposé : "+(m.expApplied?"ajouté":"en attente")+"]";if(m.mod)c+="\n[Bloc DEPENSES_MODIF proposé ("+m.mod.length+") : "+(m.modApplied||"en attente")+"]";if(m.del)c+="\n[Bloc DEPENSES_SUPPR proposé ("+m.del.length+") : "+(m.delApplied||"en attente")+"]";if(m.tcl)c+="\n[Liste Tricount extraite : "+m.tcl.length+" dépenses]";if(m.bud)c+="\n[Bloc BUDGET_MODIF proposé ("+m.bud.length+") : "+(m.budApplied||"en attente")+"]";return {role:m.role,content:c};});
    var finish=function(out,err){
      AI.busy=false;AI.ctl=null;
      if(out){var ex=aiExtract(out);out=ex.clean;AI.msgs.push({role:"assistant",content:ex.clean||"(proposition ci-dessous)",prop:ex.prop,exp:ex.exp,mod:ex.mod,del:ex.del,tcl:ex.tcl,bud:ex.bud,err:ex.err});saveAi();}
      if(err)toast(err);
      render(true);window.scrollTo(0,document.body.scrollHeight);
      if(out&&speak){startQueue({title:"Assistant",sub:"Audio guide personnalisé"},[{t:"",x:aiPlain(out)}],0);}
    };
    if(AI.mode==="claude"){
      AI.ctl=new AbortController();
      var opts={cache:false,signal:AI.ctl.signal,onText:function(u){aiLive(u.text);}};
      if(img)opts.images=[img];
      AI.sample([{role:"user",content:rules}].concat(hist),opts).then(function(r){finish(r.text+(r.truncated?"\n\n(Réponse coupée, demandez la suite.)":""));},function(e){
        var code=e&&e.code;if(code==="cancelled")return finish(e.text||"");
        finish(e&&e.text?e.text:"",AI_ERR[code]||"L’assistant n’a pas pu répondre. Réessayez.");
      });
    }else if(AI.mode==="server"){
      AI.ctl=new AbortController();
      var send=function(b64){
        var d=currentDay();
        fetch(aiBase()+"/api/chat",{method:"POST",headers:aiHeaders(),signal:AI.ctl.signal,body:JSON.stringify({system:rules,messages:hist,image:b64?{media_type:"image/jpeg",data:b64}:null,city:d?d.city:"",web:true})})
        .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j&&j.error||("HTTP "+r.status));return j;});})
        .then(function(j){finish(j.text||"");},function(e){finish("",e&&e.name==="AbortError"?"":"Serveur IA : "+((e&&e.message)||"erreur"));});
      };
      if(img)shrinkImage(img).then(send,function(){send(null);});else send(null);
    }else finish("","Assistant indisponible.");
  });
}

/* ====== PROGRAMME MODIFIABLE PAR L'ASSISTANT ====== */
var KINDS=["visit","transport","meal","rest","pratique"];
function progValidate(ch){
  var n=parseInt(ch&&ch.jour,10),d=DAYS[n-1];if(!d)throw new Error("Jour inconnu : "+(ch&&ch.jour));
  if(!Array.isArray(ch.etapes)||!ch.etapes.length)throw new Error("Aucune étape pour le jour "+n);
  var items=ch.etapes.slice(0,30).map(function(e){
    var m=/^(\d{1,2}):(\d{2})$/.exec(String(e.heure||"").trim());if(!m||+m[1]>23||+m[2]>59)throw new Error("Heure invalide : "+e.heure);
    var title=String(e.titre||"").trim().slice(0,120);if(!title)throw new Error("Étape sans titre");
    return {hm:("0"+m[1]).slice(-2)+":"+m[2],title:title,detail:String(e.detail||"").trim().slice(0,400),kind:KINDS.indexOf(e.type)>=0?e.type:"pratique",site:(e.site&&SITE[e.site])?e.site:null,leg:(e.trajet&&LEGS[e.trajet])?e.trajet:null};
  });
  items.sort(function(a,b){return a.hm<b.hm?-1:a.hm>b.hm?1:0;});
  var rem=null;
  if(Array.isArray(ch.rappels))rem=ch.rappels.slice(0,10).map(function(r){var m=/^(\d{1,2}):(\d{2})$/.exec(String(r.heure||"").trim());if(!m)throw new Error("Heure de rappel invalide : "+r.heure);return {hm:("0"+m[1]).slice(-2)+":"+m[2],title:String(r.titre||"Rappel").slice(0,120),body:String(r.texte||"").slice(0,300)};});
  return {n:n,items:items,note:(ch.note!=null&&String(ch.note).trim())?String(ch.note).trim().slice(0,600):null,rem:rem};
}
function progApply(list){
  list.forEach(function(v){
    var prev=S.prog[v.n]||null;
    S.prog[v.n]={items:v.items,note:v.note,rem:v.rem,at:Date.now(),prev:prev};
    Object.keys(S.done).forEach(function(k){if(k.indexOf("d"+v.n+"-")===0)delete S.done[k];});
  });
  save();rebuildProgram();if(NATIVE)scheduleAll();
}
function progUndo(n){var o=S.prog[n];if(!o)return;if(o.prev)S.prog[n]=o.prev;else delete S.prog[n];save();rebuildProgram();if(NATIVE)scheduleAll();}

/* ====== BUDGET ====== */
var CATS=[["vols","Vols"],["transport","Transport"],["nourriture","Nourriture"],["excursions","Excursions et visites"],["hebergement","Hébergement"],["bienetre","Massages et bien-être"],["shopping","Shopping"],["autre","Autre"]];
var CATN={};CATS.forEach(function(c){CATN[c[0]]=c[1];});
/* valeur en euros : celle de Tricount si connue (e.eur), sinon conversion au taux des réglages */
function toEur(e){if(typeof e.eur==="number"&&isFinite(e.eur))return e.eur;return e.cur==="THB"?e.amt/(S.set.rate||37.71):e.amt;}
function eurTxt(v){var r=Math.round(v*100)/100;if(r===0)r=0;return r.toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:2})+" €";}
function thbTxt(v){return Math.round(v).toLocaleString("fr-FR")+" THB";}
function guessCat(title,cat){
  var s=((cat||"")+" "+(title||"")).toLowerCase();
  var R=[["vols",/\bvols?\b|flight|avion|airasia|qatar|nok ?air|thai airways|bangkok airways/],["transport",/transport|taxi|grab|bolt|tuk|bateau|boat|longtail|ferry|train|bus|minivan|songthaew|essence|parking|transfert|chauffeur/],
   ["bienetre",/massage|spa|bien.?[êe]tre/],
   ["nourriture",/food|nourriture|restau|repas|d[ée]jeuner|d[îi]ner|dinner|lunch|breakfast|meal|petit.d[ée]j|caf[ée]|coffee|boisson|drink|bi[èe]re|beer|street|march[ée]|snack|eau|water|7.?eleven|courses|supermarch|pad thai|curry/],
   ["excursions",/excursion|visite|temple|wat |entr[ée]e|ticket|billet|parc|park|tour|activit|kayak|snorkel|plong|atv|canyon|safari|mus[ée]e/],
   ["hebergement",/h[ôo]tel|hotel|h[ée]bergement|logement|resort|booking|airbnb|nuit|d[ée]p[ôo]t/],
   ["shopping",/shopping|souvenir|v[êe]tement|cadeau|achat|pharmacie/]];
  for(var i=0;i<R.length;i++){if(R[i][1].test(s))return R[i][0];}
  return "autre";
}
function expKey(e){return e.date+"|"+e.title.toLowerCase()+"|"+Math.round(e.amt*100)+"|"+e.cur;}
function expAdd(list,src){
  var have={},added=0;S.exp.forEach(function(e){have[expKey(e)]=1;});
  list.forEach(function(e){
    var amt=parseFloat(e.amt);if(!isFinite(amt)||!amt)return;
    var cu=String(e.cur||"THB").toUpperCase();cu=/^[A-Z]{3}$/.test(cu)?cu:"THB";
    var x={id:"e"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),date:/^\d{4}-\d{2}-\d{2}$/.test(e.date)?e.date:dateKey(nowMs(),TRIP_TZ),title:String(e.title||"Dépense").slice(0,100),amt:Math.round(amt*100)/100,cur:cu,cat:CATN[e.cat]?e.cat:guessCat(e.title,""),src:src||"manuel"};
    if(e.eur!=null&&isFinite(parseFloat(e.eur)))x.eur=Math.round(parseFloat(e.eur)*100)/100;
    if(have[expKey(x)])return;have[expKey(x)]=1;S.exp.push(x);added++;
  });
  save();return added;
}
function budgetStats(){
  var today=dateKey(nowMs(),TRIP_TZ),B=S.budget||{},tot=0,day=0,cats={};
  S.exp.forEach(function(e){var v=toEur(e);tot+=v;if(e.date===today)day+=v;cats[e.cat]=(cats[e.cat]||0)+v;});
  var daysLeft=DAYS.filter(function(d){return d.date>=today;}).length||1;
  var dailyB=parseFloat(B.daily)||(parseFloat(B.total)?parseFloat(B.total)/DAYS.length:0);
  var left=parseFloat(B.total)?parseFloat(B.total)-tot:null;
  return {today:today,tot:tot,day:day,cats:cats,dailyB:dailyB,left:left,daysLeft:daysLeft,perDay:left!=null?(left+day)/daysLeft:null};
}
function bar(v,max){var p=max>0?Math.min(100,Math.round(v/max*100)):0;var over=max>0&&v>max+0.005;return '<div class="bbar"><i style="width:'+p+'%;'+(over?'background:var(--alert)':'')+'"></i></div>';}
function budgetContext(){
  var b=budgetStats(),B=S.budget||{},L=["","BUDGET (en euros, au taux 1 € = "+(S.set.rate||37.71)+" THB) :"];
  L.push("Objectif : "+(B.total?B.total+" €":"non défini")+" ; maximum absolu : "+(B.max?B.max+" €":"non défini")+" ; budget par jour hors gros paiements : "+(b.dailyB?Math.round(b.dailyB)+" €":"non défini")+".");
  if(b.perDay!=null)L.push("Pour tenir l’objectif : environ "+Math.round(b.perDay)+" € par jour pour deux ; pour rester sous le maximum : "+Math.round(b.perDayMax)+" € par jour. Gros paiements encore prévus : "+Math.round(b.planned)+" € ("+BIG_PLANNED.map(function(p){return p[1]+" "+p[2]+" THB";}).join(", ")+"). Aide les voyageurs à tenir l’objectif avec des conseils concrets (street food, minivans partagés, retraits d’argent groupés).");
  L.push("Dépensé au total : "+Math.round(b.tot)+" € ; aujourd’hui : "+Math.round(b.day)+" €"+(b.left!=null?" ; reste : "+Math.round(b.left)+" € pour "+b.daysLeft+" jours":"")+".");
  CATS.forEach(function(c){if(b.cats[c[0]]||(B.cats&&B.cats[c[0]]))L.push("- "+c[1]+" : "+Math.round(b.cats[c[0]]||0)+" €"+(B.cats&&B.cats[c[0]]?" sur "+B.cats[c[0]]+" € prévus":""));});
  var inc=!B||B.includePre!==false;
  if(S.exp.length){L.push("","DÉPENSES DE L’APP ("+S.exp.length+", total compté "+Math.round(sumEur(expActive())*100)/100+" €) — identifiant | date | titre | montant devise | ≈ euros | catégorie | source :");
    S.exp.slice().sort(function(a,c){return a.date<c.date?-1:a.date>c.date?1:0;}).forEach(function(e){L.push(e.id+" | "+e.date+" | "+e.title+" | "+e.amt+" "+e.cur+" | "+Math.round(toEur(e)*100)/100+" € | "+e.cat+" | "+(e.src||"manuel")+(e.tid?" (Tricount)":"")+(e.src==="roadbook"&&!inc?" (non comptée)":""));});}
  if(S.tcSync&&S.tcSync.totalAll!=null)L.push("Dernier total lu dans Tricount : "+S.tcSync.totalAll+" €.");
  L.push(budgetSettingsContext());
  L.push("","IDENTIFIANTS UTILISABLES DANS UN BLOC PROGRAMME :");
  L.push("Sites (audio guide) : "+SITES.map(function(s){return s.id+" = "+s.name;}).join(" ; "));
  L.push("Trajets (prix) : "+Object.keys(LEGS).map(function(k){return k+" = "+LEGS[k].title;}).join(" ; "));
  var mod=Object.keys(S.prog||{});if(mod.length)L.push("Jours déjà modifiés par l’assistant : "+mod.join(", ")+".");
  return L.join("\n");
}

/* ---------- import CSV (export Tricount) ---------- */
function parseCSV(text){
  text=text.replace(/^\ufeff/,"");var first=text.split(/\r?\n/)[0]||"";
  var sep=[";",",","\t"].sort(function(a,b){return first.split(b).length-first.split(a).length;})[0];
  var rows=[],row=[],f="",q=false;
  for(var i=0;i<text.length;i++){var c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else if(c==='"')q=true;else if(c===sep){row.push(f);f="";}else if(c==="\n"){row.push(f);rows.push(row);row=[];f="";}else if(c!=="\r")f+=c;}
  if(f||row.length){row.push(f);rows.push(row);}
  return rows.filter(function(r){return r.some(function(x){return x.trim();});});
}
function normH(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();}
function parseAmount(s){s=String(s||"").replace(/[\s\u00a0]/g,"").replace(/[^\d,.\-]/g,"");if(!s)return NaN;var lc=s.lastIndexOf(","),ld=s.lastIndexOf(".");if(lc>ld)s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"");return parseFloat(s);}
function parseDateStr(s){s=String(s||"").trim();var m;
  if((m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)))return m[1]+"-"+("0"+m[2]).slice(-2)+"-"+("0"+m[3]).slice(-2);
  if((m=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(s))){var a=+m[1],b=+m[2],y=m[3].length===2?"20"+m[3]:m[3];var dd=a,mm=b;if(b>12&&a<=12){dd=b;mm=a;}return y+"-"+("0"+mm).slice(-2)+"-"+("0"+dd).slice(-2);}
  return null;}
function importCSV(text,defCur){
  var rows=parseCSV(text);if(rows.length<2)return {added:0,skipped:0,error:"Fichier vide ou illisible."};
  var H=rows[0].map(normH),find=function(re,not){for(var i=0;i<H.length;i++){if(re.test(H[i])&&!(not&&not.test(H[i])))return i;}return -1;};
  var iD=find(/date|datum/),iT=find(/titre|title|description|libelle|what|nom|name|objet/,/pay|par/),iA=find(/montant|amount|valeur|value|total/,/converti|convert|rembours/),iC=find(/devise|currency|monnaie/),iK=find(/categ|category/),iY=find(/^type|transaction/);
  if(iA<0)return {added:0,skipped:0,error:"Colonne de montant introuvable dans l’en-tête : "+rows[0].join(", ")};
  var list=[],skipped=0;
  rows.slice(1).forEach(function(r){
    var title=(iT>=0?r[iT]:"")||"Dépense",typ=iY>=0?r[iY]:"";
    if(/rembours|transfer|virement|reimburs|balance/i.test(title+" "+typ)){skipped++;return;}
    var amt=parseAmount(r[iA]);if(!(Math.abs(amt)>0)){skipped++;return;}
    var cur=iC>=0?String(r[iC]||"").toUpperCase():"";cur=/THB|฿|BAHT/.test(cur)?"THB":/EUR|€/.test(cur)?"EUR":defCur;
    list.push({date:parseDateStr(iD>=0?r[iD]:"")||dateKey(nowMs(),TRIP_TZ),title:title.trim(),amt:amt,cur:cur,cat:guessCat(title,iK>=0?r[iK]:"")});
  });
  var added=expAdd(list,"tricount");
  return {added:added,skipped:skipped+(list.length-added)};
}

/* ---------- page Tricount et budget ---------- */
UI.expOpen=UI.expOpen||false;
function vTricount2(){
  var link=tcLink(),b=budgetStats(),B=S.budget||{};
  var h='<header class="top"><div><h1>Tricount et budget</h1><p>Dépenses partagées et suivi du budget</p></div></header>';
  /* tableau de bord */
  h+='<div class="card"><h3>Aujourd’hui</h3>';
  if(b.dailyB){var rest=b.dailyB-b.day;h+='<p class="bnum'+(rest<0?' over':'')+'">'+(rest>=0?'Reste '+eurTxt(rest):'Dépassé de '+eurTxt(-rest))+'</p><p class="small muted">'+eurTxt(b.day)+' dépensés sur '+eurTxt(b.dailyB)+' prévus (≈ '+thbTxt(b.day*(S.set.rate||37.71))+')</p>'+bar(b.day,b.dailyB);}
  else h+='<p class="small">'+eurTxt(b.day)+' dépensés aujourd’hui. Définissez un budget ci-dessous pour suivre le reste.</p>';
  h+='</div><div class="card"><h3>Tout le voyage</h3>';
  if(b.left!=null){h+='<p class="bnum'+(b.left<0?' over':'')+'">'+(b.left>=0?'Reste '+eurTxt(b.left):'Dépassé de '+eurTxt(-b.left))+'</p><p class="small muted">'+eurTxt(b.tot)+' dépensés sur '+eurTxt(parseFloat(B.total))+'. '+(b.perDay!=null&&b.left>=0?'Soit environ '+eurTxt(b.perDay)+' par jour pour les '+b.daysLeft+' jours restants, aujourd’hui compris.':'')+'</p>'+bar(b.tot,parseFloat(B.total));}
  else h+='<p class="small">'+eurTxt(b.tot)+' dépensés au total.</p>';
  h+='<div style="margin-top:12px">';
  CATS.forEach(function(c){var v=b.cats[c[0]]||0,cb=B.cats&&parseFloat(B.cats[c[0]]);if(!v&&!cb)return;h+='<div class="bcat"><div class="row" style="justify-content:space-between"><span>'+esc(c[1])+'</span><b>'+eurTxt(v)+(cb?' / '+eurTxt(cb):'')+'</b></div>'+bar(v,cb||b.tot)+'</div>';});
  h+='</div></div>';
  /* ajouter une dépense */
  h+='<div class="card"><h3>Ajouter une dépense</h3><div class="row"><input type="number" step="any" inputmode="decimal" id="ex-amt" placeholder="Montant (négatif = correction)" style="flex:1;min-width:110px"><select id="ex-cur" style="width:auto;flex:0 0 90px"><option>THB</option><option>EUR</option></select></div>'
   +'<input type="text" id="ex-title" placeholder="Quoi ? (ex. : taxi, déjeuner, massage)" style="margin-top:8px" class="txt"><div class="row" style="margin-top:8px"><select id="ex-cat" style="flex:1">'+CATS.map(function(c){return '<option value="'+c[0]+'">'+esc(c[1])+'</option>';}).join("")+'</select><input type="date" id="ex-date" value="'+b.today+'" style="flex:1"></div>'
   +'<div class="row" style="margin-top:10px"><button class="btn" data-a="expadd">Ajouter</button><button class="btn alt" data-a="tcshot">Capture Tricount → Assistant</button></div></div>';
  /* import Tricount */
  h+='<div class="card"><h3>Récupérer les dépenses de Tricount</h3><p class="small">Tricount ne propose pas d’accès public permettant à une autre app de lire vos dépenses. Deux façons de les récupérer :</p>'
   +'<p class="small" style="margin-top:6px"><b>1. Export CSV</b> : dans Tricount, exportez les dépenses (si votre version propose l’export), puis importez le fichier ici. Les doublons sont ignorés, vous pouvez donc réimporter chaque soir.</p>'
   +'<div class="row" style="margin-top:6px"><label class="small" for="csv-cur">Devise si absente</label><select id="csv-cur" style="width:auto"><option>EUR</option><option>THB</option></select><button class="btn alt" data-a="csvpick">Importer un CSV</button><input type="file" id="csv-file" accept=".csv,text/csv,text/plain" data-a="csvfile" hidden></div>'
   +'<p class="small" style="margin-top:10px"><b>2. Capture d’écran</b> : envoyez une capture de la liste Tricount à l’Assistant, il en extrait les dépenses et vous propose de les ajouter.</p></div>';
  /* liste */
  var list=S.exp.slice().sort(function(a,c){return a.date<c.date?1:a.date>c.date?-1:0;});
  h+='<details class="card"'+(UI.expOpen?' open':'')+' data-a="expdetails"><summary>Dépenses enregistrées ('+list.length+')</summary><div>';
  if(!list.length)h+='<p class="small muted">Aucune dépense pour l’instant.</p>';
  list.forEach(function(e){h+='<div class="kv" style="flex-wrap:wrap"><span style="flex:1;min-width:140px"><b>'+esc(e.title)+'</b><br><span class="small muted">'+esc(e.date)+(e.src==="tricount"?" · Tricount":e.src==="assistant"?" · Assistant":"")+'</span></span><span style="text-align:right"><b>'+(e.cur==="EUR"?eurTxt(e.amt):thbTxt(e.amt))+'</b><br><span class="small muted">'+(e.cur==="EUR"?thbTxt(e.amt*(S.set.rate||37.71)):eurTxt(toEur(e)))+'</span></span><select data-a="expcat" data-id="'+e.id+'" style="width:auto;min-height:36px;padding:4px 6px;font-size:14px">'+CATS.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===e.cat?" selected":"")+'>'+esc(c[1])+'</option>';}).join("")+'</select><button class="cp" data-a="expdel" data-id="'+e.id+'" aria-label="Supprimer">Suppr.</button></div>';});
  if(list.length)h+='<div class="row" style="margin-top:10px"><button class="cp" data-a="expclear">Tout effacer</button></div>';
  h+='</div></details>';
  /* réglages budget */
  h+='<details class="card"><summary>Définir le budget (en euros)</summary><div><div class="row"><label style="flex:1">Total du voyage<input type="number" inputmode="decimal" data-a="bud" data-k="total" value="'+esc(B.total||"")+'" placeholder="ex. 1500"></label><label style="flex:1">Par jour<input type="number" inputmode="decimal" data-a="bud" data-k="daily" value="'+esc(B.daily||"")+'" placeholder="auto"></label></div><p class="small muted" style="margin:6px 0">Sans budget par jour, le total est divisé par 15.</p>';
  CATS.forEach(function(c){h+='<label style="display:block;margin-top:6px">'+esc(c[1])+'<input type="number" inputmode="decimal" data-a="bud" data-k="cat:'+c[0]+'" value="'+esc((B.cats&&B.cats[c[0]])||"")+'" placeholder="facultatif"></label>';});
  h+='</div></details>';
  /* Tricount */
  h+='<div class="card"><h3>Notre Tricount</h3>'+(link?'<div class="row"><a class="btn" href="'+esc(link)+'" target="_blank" rel="noopener">Ouvrir notre Tricount</a><button class="cp" data-a="copy" data-v="'+esc(link)+'">Copier le lien</button></div>':'<p class="small">Collez le lien de partage de votre Tricount (dans l’appli : Partager, puis Copier le lien).</p>')
   +'<input type="url" id="tc-link" placeholder="https://tricount.com/…" value="'+esc(link)+'" data-a="tclink" style="margin-top:10px"><div class="row" style="margin-top:8px"><a class="cp" href="'+TRICOUNT_PLAY+'" target="_blank" rel="noopener">Installer Tricount</a></div></div>';
  return h;
}

/* ---------- protocole des blocs de l'assistant ---------- */
AI_RULES.push(
"MODIFIER LE PROGRAMME : uniquement si l’utilisateur le demande explicitement (par exemple « mets à jour le programme », « applique », « modifie la journée », « ajoute au programme »). Sinon, propose en texte sans bloc. Quand c’est demandé, explique le changement en deux ou trois phrases, puis termine la réponse par ce bloc, sans rien après :\n<<<PROGRAMME\n{\"jours\":[{\"jour\":3,\"note\":\"…\",\"etapes\":[{\"heure\":\"08:00\",\"titre\":\"…\",\"detail\":\"…\",\"type\":\"visit|transport|meal|rest|pratique\",\"site\":\"identifiant de site ou null\",\"trajet\":\"identifiant de trajet ou null\"}],\"rappels\":[{\"heure\":\"08:45\",\"titre\":\"…\",\"texte\":\"…\"}]}]}\nPROGRAMME>>>\nLe numéro de jour va de 1 à 15. Le bloc remplace TOUTES les étapes du jour : inclus aussi celles qui ne changent pas. Heures en HH:MM, heure locale. Mets « rappels » seulement pour remplacer les rappels de ce jour. N’utilise que les identifiants listés dans le contexte. L’utilisateur verra un bouton pour appliquer ou ignorer.",
"AJOUTER DES DÉPENSES : si l’utilisateur demande d’ajouter des dépenses au budget (texte, ticket, capture d’écran de Tricount), liste-les brièvement puis termine par :\n<<<DEPENSES\n[{\"date\":\"2026-11-07\",\"titre\":\"…\",\"montant\":120,\"devise\":\"THB\",\"categorie\":\"transport|nourriture|excursions|hebergement|bienetre|shopping|autre\"}]\nDEPENSES>>>\nPour Tricount, prends le montant total de chaque dépense, ignore les remboursements et indique la devise affichée.",
"BUDGET : utilise les chiffres du contexte pour dire si le budget du jour ou du voyage est respecté, combien il reste et par catégorie.",
"CORRIGER DES DÉPENSES : la liste complète des dépenses de l’app est dans le contexte, avec leur identifiant. Tricount est la référence. Si l’utilisateur demande de corriger ou de supprimer des dépenses (doublon, mauvais montant, mauvaise catégorie), explique en deux ou trois phrases puis termine par l’un ou les deux blocs, sans rien après :\n<<<DEPENSES_MODIF\n[{\"id\":\"…\",\"champ\":\"montant|devise|titre|date|categorie|payeur\",\"valeur\":…}]\nDEPENSES_MODIF>>>\n<<<DEPENSES_SUPPR\n[\"id1\",\"id2\"]\nDEPENSES_SUPPR>>>\nN’utilise que des identifiants présents dans le contexte. Un montant est un nombre (négatif autorisé pour une correction). L’utilisateur verra un aperçu et un bouton pour appliquer ou ignorer.",
"MODIFIER LE BUDGET : si l’utilisateur demande de changer un réglage du budget (objectif, maximum, budget du jour, budget d’une catégorie ou d’un poste du jour, repas par jour, reste à payer), explique en une ou deux phrases puis termine par ce bloc, sans rien après :\n<<<BUDGET_MODIF\n[{\"champ\":\"objectif|maximum|jour|repas_jour\",\"valeur\":4100},{\"champ\":\"categorie\",\"cle\":\"nourriture\",\"valeur\":350},{\"champ\":\"poste_jour\",\"cle\":\"nourriture\",\"valeur\":30},{\"champ\":\"reste_ajout\",\"libelle\":\"Bateau Koh Lanta\",\"montant\":1500,\"devise\":\"THB\",\"categorie\":\"transport\"},{\"champ\":\"reste_modif\",\"cle\":\"…\",\"montant\":2500},{\"champ\":\"reste_paye\",\"cle\":\"…\",\"valeur\":true},{\"champ\":\"reste_suppr\",\"cle\":\"…\"}]\nBUDGET_MODIF>>>\nMontants en euros sauf pour le reste à payer (THB par défaut). N’utilise que les clés du contexte. Quand tu ajoutes un poste au reste à payer, propose aussi d’augmenter le budget de sa catégorie si nécessaire. L’utilisateur verra un aperçu avant / après et un bouton pour appliquer ou ignorer.",
"LISTE TRICOUNT : si l’utilisateur envoie une capture de Tricount pour la comparer ou la synchroniser avec l’app, recopie toutes les dépenses visibles (montant total, devise affichée, sans les remboursements) dans ce bloc, sans rien après :\n<<<TRICOUNT_LISTE\n[{\"date\":\"2026-11-07\",\"titre\":\"…\",\"montant\":120,\"devise\":\"THB\",\"payeur\":\"…\"}]\nTRICOUNT_LISTE>>>\nL’app comparera elle-même avec ses dépenses."
);
function aiExtract(text){
  var out={clean:text,prop:null,exp:null,mod:null,del:null,tcl:null,bud:null,err:null};
  var jb=function(tag){var r=new RegExp("<<<"+tag+"\\s*([\\s\\S]*?)\\s*"+tag+">>>").exec(text);if(!r)return undefined;out.clean=out.clean.replace(r[0],"").trim();try{var v=JSON.parse(r[1].replace(/^```(json)?|```$/g,""));return Array.isArray(v)?v:[v];}catch(e){out.err="Bloc "+tag+" illisible : "+e.message;return null;}};
  var md=jb("DEPENSES_MODIF");if(md)out.mod=md.slice(0,200).map(function(o){return {id:String(o.id||""),champ:String(o.champ||o.field||"").toLowerCase(),valeur:o.valeur!=null?o.valeur:o.value};}).filter(function(o){return o.id&&o.champ;});
  var bd=jb("BUDGET_MODIF");if(bd)out.bud=bd.slice(0,50).filter(function(o){return o&&o.champ;});
  var dl=jb("DEPENSES_SUPPR");if(dl)out.del=dl.slice(0,200).map(function(o){return String(o&&o.id?o.id:o);}).filter(Boolean);
  var tl=jb("TRICOUNT_LISTE");if(tl)out.tcl=tl.slice(0,400).filter(function(o){return !RC_SKIP.test(String(o.titre||o.title||""));}).map(function(o){return {date:o.date,title:o.titre||o.title,amt:parseFloat(o.montant!=null?o.montant:o.amount),cur:String(o.devise||o.currency||"EUR").toUpperCase().replace("€","EUR").replace("฿","THB"),eur:o.euros!=null?o.euros:null,payer:o.payeur||o.payer||""};}).filter(function(o){return isFinite(o.amt)&&o.amt;});
  var m=/<<<PROGRAMME\s*([\s\S]*?)\s*PROGRAMME>>>/.exec(text);
  if(m){out.clean=out.clean.replace(m[0],"").trim();try{var j=JSON.parse(m[1].replace(/^```(json)?|```$/g,""));var days=Array.isArray(j)?j:(j.jours||[j]);out.prop=days.map(progValidate);}catch(e){out.err="Proposition de programme illisible : "+e.message;}}
  var x=/<<<DEPENSES\s*\n?\s*(\[[\s\S]*?)\s*DEPENSES>>>/.exec(out.clean);
  if(x){out.clean=out.clean.replace(x[0],"").trim();try{var arr=JSON.parse(x[1].replace(/^```(json)?|```$/g,""));if(!Array.isArray(arr))arr=[arr];out.exp=arr.slice(0,100).map(function(e){return {date:parseDateStr(e.date)||dateKey(nowMs(),TRIP_TZ),title:String(e.titre||e.title||"Dépense"),amt:parseFloat(e.montant!=null?e.montant:e.amount),cur:/EUR/i.test(e.devise||e.currency||"")?"EUR":"THB",cat:CATN[e.categorie]?e.categorie:guessCat(e.titre||"","")};}).filter(function(e){return Math.abs(e.amt)>0;});}catch(e){out.err="Liste de dépenses illisible : "+e.message;}}
  return out;
}
function aiStripLive(t){var i=t.indexOf("<<<");return i>=0?t.slice(0,i)+"\n\n…préparation de la proposition…":t;}
function propCard(m,i){
  var h="";
  if(m.prop){
    h+='<div class="prop"><b>Proposition de programme</b>';
    m.prop.forEach(function(v){var d=DAYS[v.n-1];h+='<p class="small" style="margin-top:6px"><b>Jour '+v.n+' · '+esc(cap(fmt(Date.parse(d.date+"T12:00:00+07:00"),TRIP_TZ,{weekday:"long",day:"numeric",month:"long"})))+'</b></p><ul class="small">'+v.items.map(function(it){return '<li>'+it.hm.replace(":","h")+' · '+esc(it.title)+'</li>';}).join("")+'</ul>'+(v.rem?'<p class="small muted">'+v.rem.length+' rappel(s) remplacé(s)</p>':'');});
    if(m.applied==="ok")h+='<p class="small" style="color:var(--ok);font-weight:700">Appliqué au programme.</p><div class="row"><button class="cp" data-a="progundo" data-n="'+m.prop.map(function(v){return v.n;}).join(",")+'">Annuler la modification</button><button class="cp" data-a="tab" data-v="trip">Voir le programme</button></div>';
    else if(m.applied==="no")h+='<p class="small muted">Ignorée.</p>';
    else h+='<div class="row" style="margin-top:6px"><button class="btn" data-a="propapply" data-i="'+i+'">Appliquer au programme</button><button class="btn alt" data-a="propignore" data-i="'+i+'">Ignorer</button></div>';
    h+='</div>';
  }
  if(m.exp&&m.exp.length){
    var tot=0;m.exp.forEach(function(e){tot+=toEur(e);});
    h+='<div class="prop"><b>'+m.exp.length+' dépense(s) détectée(s)</b> · '+eurTxt(tot)+'<ul class="small">'+m.exp.slice(0,12).map(function(e){return '<li>'+esc(e.date)+' · '+esc(e.title)+' · '+(e.cur==="EUR"?eurTxt(e.amt):thbTxt(e.amt))+' · '+esc(CATN[e.cat])+'</li>';}).join("")+(m.exp.length>12?'<li>…</li>':'')+'</ul>';
    if(m.expApplied)h+='<p class="small" style="color:var(--ok);font-weight:700">'+m.expApplied+'</p>';
    else h+='<div class="row"><button class="btn" data-a="expapply" data-i="'+i+'">Ajouter au budget</button></div>';
    h+='</div>';
  }
  h+=aiExpCards(m,i);
  h+=budCard(m,i);
  if(m.err)h+='<p class="small" style="color:var(--alert)">'+esc(m.err)+'</p>';
  return h;
}

/* ====== BUDGET v2 : vols, réservations du roadbook, synchronisation Tricount ====== */
CATS=[["vols","Vols"],["transport","Transport sur place"],["nourriture","Nourriture"],["excursions","Excursions et visites"],["hebergement","Hébergement"],["bienetre","Massages et bien-être"],["shopping","Shopping"],["autre","Autre et marge"]];
CATN={};CATS.forEach(function(c){CATN[c[0]]=c[1];});
var ROADBOOK_BUDGET={total:4000,max:4400,daily:32,dailyMax:63,
  cats:{vols:1711.26,hebergement:1263.47,excursions:448.64,bienetre:21.22,transport:330,nourriture:205,autre:20},
  catsMax:{vols:1711.26,hebergement:1263.47,excursions:448.64,bienetre:21.22,transport:380,nourriture:450,autre:100},
  hints:{vols:"Déjà payé : Qatar 1 341,38 € + AirAsia 126,66 € + 243,22 €",hebergement:"Déjà réservé : hôtels et forfait lac, ≈ 1 263,47 €",excursions:"Réservées 253,48 € + canoë et ATV 3 400 THB + droits et entrées ≈ 105 €",bienetre:"Massage Las Orquideas 800 THB",transport:"Objectif 330 € (max 380 €) : chauffeur Ayutthaya, 3 transferts, taxis, longtail, taxi HKT",nourriture:"Objectif 205 € (max 450 €) : street food et cantines locales",autre:"Objectif 20 € (max 100 €) : imprévus"}};
var BIG_PLANNED=[["2026-11-08","Chauffeur Ayutthaya (à négocier vers 3 000–3 500 THB)",3500],["2026-11-11","Transfert Surat Thani → Khao Sok",1900],["2026-11-12","ATV Jungle Tour (Sylvain)",2200],["2026-11-14","Transfert Khao Sok → Ao Nang",2500],["2026-11-18","Transfert Ao Nang → Mai Khao",3000]];
var BIG_THB=1500;
function applyScenario(k){S.budget=S.budget||{};var mx=k==="max";S.budget.scen=k;S.budget.total=ROADBOOK_BUDGET.total;S.budget.max=ROADBOOK_BUDGET.max;S.budget.daily=mx?ROADBOOK_BUDGET.dailyMax:ROADBOOK_BUDGET.daily;S.budget.cats=JSON.parse(JSON.stringify(mx?ROADBOOK_BUDGET.catsMax:ROADBOOK_BUDGET.cats));save();}
var ROADBOOK_PREPAID=[
 ["2026-11-05","Vols Qatar Airways aller-retour",1341.38,"EUR","vols"],
 ["2026-11-08","Vol AirAsia Don Mueang → Chiang Mai",126.66,"EUR","vols"],
 ["2026-11-11","Vol AirAsia Chiang Mai → Surat Thani",243.22,"EUR","vols"],
 ["2026-11-06","Hôtel Rambuttri Village Plaza (2 nuits)",88.70,"EUR","hebergement"],
 ["2026-11-08","Hôtel At Pingnakorn Riverside (3 nuits)",213.08,"EUR","hebergement"],
 ["2026-11-11","Khao Sok Las Orquideas Resort (2 nuits)",144.00,"EUR","hebergement"],
 ["2026-11-13","Forfait lac Cheow Lan (Nong Prae)",6480,"THB","hebergement"],
 ["2026-11-14","Aonang Fiore Resort (4 nuits, net)",537.85,"EUR","hebergement"],
 ["2026-11-18","Maikhao Palm Beach Resort (1 nuit)",108.00,"EUR","hebergement"],
 ["2026-11-10","Excursion Doi Inthanon (Oh-Hoo)",85.08,"EUR","excursions"],
 ["2026-11-15","Excursion Phi Phi (GetYourGuide)",93.94,"EUR","excursions"],
 ["2026-11-17","Hong Islands en catamaran (Oh-Hoo)",74.46,"EUR","excursions"]
];
function seedBudget(force){
  S.budget=S.budget||{};
  if(S.budget.seeded==="roadbook-2026-11-v2"&&!force)return false;
  applyScenario(S.budget.scen==="max"?"max":"obj");
  if(S.budget.includePre==null)S.budget.includePre=true;
  S.exp=S.exp.filter(function(e){return e.src!=="roadbook";});
  ROADBOOK_PREPAID.forEach(function(p,i){S.exp.push({id:"rb"+i,date:p[0],title:p[1],amt:p[2],cur:p[3],cat:p[4],src:"roadbook",pre:true});});
  S.budget.seeded="roadbook-2026-11-v2";save();return true;
}
function expActive(){var inc=!S.budget||S.budget.includePre!==false;return S.exp.filter(function(e){return inc||e.src!=="roadbook";});}
function budgetStats(){
  var today=dateKey(nowMs(),TRIP_TZ),B=S.budget||{},rate=S.set.rate||37.71,tot=0,day=0,dayBig=0,pre=0,cats={};
  expActive().forEach(function(e){var v=toEur(e);tot+=v;if(e.pre)pre+=v;else if(e.date===today){if(v*rate>=BIG_THB)dayBig+=v;else day+=v;}cats[e.cat]=(cats[e.cat]||0)+v;});
  var tripDays=DAYS.filter(function(d){return d.n>1;}).length;
  var daysLeft=DAYS.filter(function(d){return d.date>=today&&d.n>1;}).length||1;
  var planned=0;if(B.resteTHB!=null&&B.resteTHB!=="")planned=(parseFloat(B.resteTHB)||0)/rate;else BIG_PLANNED.forEach(function(p){if(p[0]>today)planned+=p[2]/rate;});
  var T=parseFloat(B.total)||0,M=parseFloat(B.max)||0;
  var dailyB=parseFloat(B.daily)||(T?(T-pre)/tripDays:0);
  var left=T?T-tot:null,leftMax=M?M-tot:null;
  return {today:today,tot:tot,day:day,dayBig:dayBig,pre:pre,onsite:tot-pre,cats:cats,dailyB:dailyB,left:left,leftMax:leftMax,planned:planned,daysLeft:daysLeft,
    perDay:left!=null?(left-planned+day)/daysLeft:null,perDayMax:leftMax!=null?(leftMax-planned+day)/daysLeft:null};
}
var TC_MAP={TRANSPORT:"transport",FOOD_AND_DRINK:"nourriture",GROCERIES:"nourriture",TRAVEL:"hebergement",ENTERTAINMENT:"excursions",SHOPPING:"shopping",HEALTHCARE:"autre",INSURANCE:"autre",RENT_AND_UTILITIES:"hebergement"};
function tcCat(x){
  var t=(x.title||"")+" "+(x.category_custom||"");
  if(/\bvol\b|flight|qatar|airasia|avion/i.test(t))return "vols";
  if(x.category_custom)return guessCat(t,"");
  var m=TC_MAP[x.category];if(m&&m!=="autre")return m;
  return guessCat(t,"");
}
var TC={busy:false,err:""};
/* Date de début des dépenses courantes du voyage lues dans Tricount */
var TC_FROM="2026-11-05";
function tcFrom(){return /^\d{4}-\d{2}-\d{2}$/.test(S.set.tcFrom||"")?S.set.tcFrom:TC_FROM;}
function tcFromTxt(){return fmt(Date.parse(tcFrom()+"T12:00:00+07:00"),TRIP_TZ,{day:"numeric",month:"long"}).replace(/^1 /,"1er ");}
/* reset : relecture après un changement de réglage, sans marquer de dépenses comme nouvelles */
function tcSync(silent,fresh,reset){
  var link=tcLink();
  if(!link){if(!silent)toast("Collez d’abord le lien de partage Tricount");return;}
  if(TC.busy)return;TC.busy=true;TC.err="";if(!silent)render(true);
  fetch(aiBase()+"/api/tricount?link="+encodeURIComponent(link)+(fresh?"&fresh=1":""),{headers:aiHeaders()}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j&&j.error||("HTTP "+r.status));return j;});})
  .then(function(j){
    /* seules les dépenses à partir du début du voyage comptent (avant : réservations, déjà dans le budget) */
    var all=j.expenses||[],truth=!!(S.budget&&S.budget.tcTruth),exps=truth?all:all.filter(function(x){return !/^\d{4}-\d{2}-\d{2}$/.test(x.date)||x.date>=tcFrom();});
    var totalAll=0;all.forEach(function(x){totalAll+=x.cur_tricount==="EUR"?x.amt_tricount:(x.cur==="EUR"?x.amt:x.cur==="THB"?x.amt/(S.set.rate||37.71):x.amt_tricount||0);});
    var prev={},first=!!reset||!S.exp.some(function(e){return e.tid;});S.exp.forEach(function(e){if(e.tid)prev[e.tid]=e;});
    var added=exps.filter(function(x){return !prev[x.tid];});
    S.exp=S.exp.filter(function(e){return !e.tid;});
    exps.forEach(function(x){var p=prev[x.tid];var cur=/^[A-Z]{3}$/.test(x.cur||"")?x.cur:(x.cur_tricount||"EUR");var amt=cur===x.cur?x.amt:x.amt_tricount;
      var dt=/^\d{4}-\d{2}-\d{2}$/.test(x.date)?x.date:dateKey(nowMs(),TRIP_TZ);
      /* une dépense importée à la main (liste collée, CSV, assistant) qui correspond est remplacée par celle de Tricount */
      S.exp=S.exp.filter(function(e){return e.tid||!(e.src==="import"||e.src==="assistant")||e.date!==dt||e.cur!==cur||Math.abs(e.amt-amt)>0.01;});
      var ne={id:"t"+x.tid,tid:x.tid,date:dt,title:x.title,amt:amt,cur:cur,cat:(p&&p.catUser)?p.cat:tcCat(x),catUser:!!(p&&p.catUser),payer:x.payer||"",src:"tricount",when:x.when||""};
      if(x.cur_tricount==="EUR"&&isFinite(x.amt_tricount))ne.eur=x.amt_tricount;if(truth&&dt<tcFrom())ne.pre=true;S.exp.push(ne);});
    if(!first&&added.length)S.tcNew={at:Date.now(),ids:added.map(function(x){return x.tid;})};
    S.tcSync={at:Date.now(),title:j.title||"",n:exps.length,skip:(resteAuto(),all.length-exps.length),totalAll:Math.round(totalAll*100)/100,truth:truth,currency:j.currency||""};save();
    var nt=first?"":added.length?added.length+(added.length>1?" nouvelles dépenses":" nouvelle dépense")+" : "+added.slice(0,3).map(function(x){return x.title;}).join(", "):"Aucune nouvelle dépense dans Tricount";
    if(!silent)toast(first?exps.length+" dépense(s) lue(s) dans Tricount":nt);else if(added.length&&!first)toast("Tricount · "+nt);
  },function(e){TC.err=(e&&e.message)||"erreur";if(!silent)toast("Tricount : "+TC.err);})
  .then(function(){TC.busy=false;if(UI.tab==="tricount")render(true);});
}
function tcAvailable(){return !!AI.tc;}
/* Pourquoi Tricount n’est pas lisible, en clair */
function tcWhyText(){
  if(AI.reach!=="ok")return "Minix injoignable : vérifiez Tailscale, puis Pratique → Réglages → Tester la connexion.";
  return {token:"Code d’accès manquant ou incorrect : saisissez le code d’accès (APP_TOKEN) dans Pratique → Réglages → Serveur Minix.",
    config:"Le relais Tricount n’est pas configuré sur le Minix.",
    down:"Le relais Tricount du Minix ne répond pas : il redémarre peut-être. Réessayez dans une minute."}[AI.tcWhy]||"Relais Tricount injoignable pour l’instant.";
}
/* un Minix peut lire Tricount : adresse renseignée (APK) ou page servie par le Minix (pas l’app Claude) */
function tcPossible(){return !!aiBase()||(/^https?:$/.test(location.protocol)&&!NATIVE&&!window.claude);}
/* bouton « Mettre à jour depuis Tricount » : reconnecte le Minix si besoin, puis relit Tricount */
function tcSyncNow(){
  if(AI.tc){tcSync(false,true);return;}
  toast("Connexion au Minix…");AI.mode="pending";if(UI.tab==="tricount")render(true);
  aiServer(function(){
    if(AI.tc)tcSync(false,true);
    else{toast(tcWhyText());if(UI.tab==="tricount")render(true);}
  });
}
/* Dernières dépenses lues dans Tricount, les nouvelles de la dernière synchronisation en tête */
function tcRecentHtml(){
  var list=S.exp.filter(function(e){return e.src==="tricount";});
  if(!list.length)return "";
  var nw=(S.tcNew&&Date.now()-S.tcNew.at<86400000)?S.tcNew.ids:[];
  list.forEach(function(e,i){e._i=i;});
  list.sort(function(a,b){var na=nw.indexOf(a.tid)>=0,nb=nw.indexOf(b.tid)>=0;if(na!==nb)return na?-1:1;var ka=a.when||a.date,kb=b.when||b.date;return ka<kb?1:ka>kb?-1:b._i-a._i;});
  var h='<div class="card"><h3>Dernières dépenses Tricount</h3>';
  list.slice(0,6).forEach(function(e){
    var isNew=nw.indexOf(e.tid)>=0,hr=/\d{2}:\d{2}$/.test(e.when||"")?" à "+e.when.slice(11).replace(":"," h "):"";
    h+='<div class="kv"><span><b>'+esc(e.title)+'</b>'+(isNew?' <span class="small" style="background:var(--sign);color:var(--sign-ink);border-radius:6px;padding:1px 6px">nouveau</span>':'')+'<br><span class="small muted">'+esc(cap(fmt(Date.parse(e.date+"T12:00:00+07:00"),TRIP_TZ,{weekday:"short",day:"numeric",month:"short"})))+esc(hr)+(e.payer?' · '+esc(e.payer):'')+'</span></span><b style="text-align:right;flex:none">'+(e.cur==="EUR"?eurTxt(e.amt):thbTxt(e.amt))+'</b></div>';
  });
  return h+'<p class="small muted" style="margin-top:6px">'+list.length+' dépense(s) lue(s) dans Tricount. La liste complète est dans « Dépenses enregistrées », plus bas.</p></div>';
}
/* ---------- détail des dépenses par jour ---------- */
function catName(c){var x=CATS.filter(function(k){return k[0]===c;})[0];return x?x[1]:"Autre";}
function dayLabel(date){var d=DAYS.filter(function(x){return x.date===date;})[0];return cap(fmt(Date.parse(date+"T12:00:00+07:00"),TRIP_TZ,{weekday:"short",day:"numeric",month:"short"}))+(d?" · J"+d.n+" · "+d.city:"");}
function expRow(e){
  var rate=S.set.rate||37.71,hr=/\d{2}:\d{2}$/.test(e.when||"")?e.when.slice(11).replace(":"," h "):"",big=toEur(e)*rate>=BIG_THB;
  var info=[hr,e.payer,catName(e.cat)+(big?" · gros paiement":"")].filter(Boolean).join(" · ");
  return '<div class="kv"><span><b>'+esc(e.title)+'</b><br><span class="small muted">'+esc(info)+'</span></span><span style="text-align:right;flex:none"><b>'+(e.cur==="EUR"?eurTxt(e.amt):thbTxt(e.amt))+'</b><br><span class="small muted">'+(e.cur==="EUR"?thbTxt(e.amt*rate):eurTxt(toEur(e)))+'</span></span></div>';
}
function dayExps(date){return expActive().filter(function(e){return !e.pre&&e.date===date;}).sort(function(a,b){var ka=a.when||"",kb=b.when||"";return ka<kb?1:ka>kb?-1:0;});}
function catLine(list){var c={};list.forEach(function(e){c[e.cat]=(c[e.cat]||0)+toEur(e);});var k=Object.keys(c).sort(function(a,b){return c[b]-c[a];});return k.length>1?'<p class="small muted" style="margin-top:6px">'+k.map(function(x){return esc(catName(x))+" "+eurTxt(c[x]);}).join(" · ")+'</p>':"";}
/* Budget du jour par poste : part du budget quotidien (modifiable dans « Définir le budget ») */
var DAY_GROUPS=[["nourriture","Repas et boissons",["nourriture"],0.5],["transport","Transport",["transport"],0.25],["activites","Activités et visites",["excursions"],0.15],["bienetre","Massages",["bienetre"],0.06],["autre","Shopping et divers",["shopping","autre","hebergement","vols"],0.04]];
function dayGroupBudget(g,dailyB){var B=S.budget||{},v=B.dcat&&parseFloat(B.dcat[g[0]]);return v>0?v:dailyB*g[3];}
function todayBarsHtml(today){
  var rate=S.set.rate||37.71,dailyB=budgetStats().dailyB;if(!dailyB)return "";
  var list=dayExps(today).filter(function(e){return toEur(e)*rate<BIG_THB;});
  var h='<div style="margin-top:12px">';
  DAY_GROUPS.forEach(function(g){
    var v=0;list.forEach(function(e){if(g[2].indexOf(e.cat)>=0)v+=toEur(e);});
    var bud=dayGroupBudget(g,dailyB),over=v>bud+0.005;
    h+='<div class="bcat"><div class="row" style="justify-content:space-between"><span>'+esc(g[1])+'</span><b'+(over?' style="color:var(--alert)"':'')+'>'+eurTxt(v)+' / '+eurTxt(bud)+'</b></div>'+bar(v,bud)
      +'<span class="small muted">'+(over?'<span style="color:var(--alert)">Dépassé de '+eurTxt(v-bud)+'</span>':'Reste '+eurTxt(bud-v))+' · '+thbTxt(v*rate)+' sur '+thbTxt(bud*rate)+'</span></div>';
  });
  return h+'</div>';
}
function todayExpHtml(today){
  var list=dayExps(today);
  var bars=todayBarsHtml(today);
  if(!list.length)return bars+'<p class="small muted" style="margin-top:8px">Aucune dépense enregistrée aujourd’hui pour l’instant.</p>';
  return bars+'<p class="small" style="margin-top:12px"><b>Dépenses du jour</b></p><div>'+list.map(expRow).join("")+'</div>';
}
function dayExpHtml(){
  var rate=S.set.rate||37.71,by={},today=dateKey(nowMs(),TRIP_TZ),dailyB=budgetStats().dailyB;
  expActive().forEach(function(e){if(!e.pre&&e.date)(by[e.date]=by[e.date]||[]).push(e);});
  var dates=Object.keys(by).filter(function(d){return d<=today;}).sort().reverse();
  if(!dates.length)return "";
  var h='<div class="card"><h3>Dépenses par jour</h3>';
  dates.forEach(function(d){
    var list=dayExps(d),tot=0,small=0;list.forEach(function(e){var v=toEur(e);tot+=v;if(v*rate<BIG_THB)small+=v;});
    var over=dailyB&&small>dailyB+0.005;
    h+='<details class="dayexp" style="border-top:1px solid var(--line);padding:6px 0"><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:8px"><span><b>'+esc(dayLabel(d))+'</b>'+(d===today?' · aujourd’hui':'')+'<br><span class="small muted">'+list.length+' dépense'+(list.length>1?'s':'')+'</span></span><span style="text-align:right;flex:none"><b'+(over?' style="color:var(--alert)"':'')+'>'+eurTxt(tot)+'</b><br><span class="small muted">'+thbTxt(tot*rate)+'</span></span></summary>'
      +'<div style="margin-top:6px">'+list.map(expRow).join("")+catLine(list)+(dailyB?'<p class="small muted" style="margin-top:6px">Hors gros paiements : '+eurTxt(small)+' sur '+eurTxt(dailyB)+' prévus par jour.</p>':'')+'</div></details>';
  });
  return h+'</div>';
}
function vTricount2(){
  var link=tcLink(),b=budgetStats(),B=S.budget||{},rate=S.set.rate||37.71;
  var h='<header class="top"><div><h1>Tricount et budget</h1><p>Dépenses partagées et suivi du budget</p></div></header>';
  /* aujourd'hui */
  h+='<div class="card"><h3>Aujourd’hui</h3>';
  if(b.dailyB){var rest=b.dailyB-b.day;h+='<p class="bnum'+(rest<0?' over':'')+'">'+(rest>=0?'Reste '+eurTxt(rest):'Dépassé de '+eurTxt(-rest))+'</p><p class="small muted">'+eurTxt(b.day)+' dépensés sur '+eurTxt(b.dailyB)+' prévus (≈ '+thbTxt(b.day*rate)+' sur '+thbTxt(b.dailyB*rate)+')</p>'+bar(b.day,b.dailyB)+(b.dayBig?'<p class="small muted" style="margin-top:6px">Plus '+eurTxt(b.dayBig)+' de gros paiement(s) aujourd’hui (1 500 THB et plus : transferts, ATV…), comptés dans le total du voyage mais pas dans le budget du jour.</p>':'<p class="small muted" style="margin-top:6px">Les gros paiements (1 500 THB et plus : chauffeur, transferts, ATV) sont suivis dans le total du voyage, pas ici.</p>');}
  else h+='<p class="small">'+eurTxt(b.day)+' dépensés aujourd’hui.</p>';
  h+=todayExpHtml(b.today);
  h+='</div>';
  /* synchro */
  h+='<div class="card"><h3>Synchronisation Tricount</h3>';
  if(tcPossible()){
    if(!AI.tc&&AI.reach!=="pending"&&AI.mode!=="pending")h+='<p class="small" style="color:var(--alert);margin-bottom:8px">'+esc(tcWhyText())+' Puis touchez le bouton pour réessayer.</p>';
    h+='<div class="row"><button class="btn" data-a="tcsync"'+(TC.busy?" disabled":"")+'>'+(TC.busy?"Lecture en cours…":"Mettre à jour depuis Tricount")+'</button>'+(link?'<a class="cp" href="'+esc(link)+'" target="_blank" rel="noopener">Ouvrir Tricount</a>':'')+'</div>';
    h+='<p class="small muted" style="margin-top:6px">'+(S.tcSync?'Dernière lecture : '+esc(cap(fmt(S.tcSync.at,TRIP_TZ,{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})))+' · '+S.tcSync.n+' dépense(s) depuis le '+esc(tcFromTxt())+(S.tcSync.skip?' ('+S.tcSync.skip+' antérieure'+(S.tcSync.skip>1?'s':'')+' ignorée'+(S.tcSync.skip>1?'s':'')+')':'')+(S.tcSync.title?' · « '+esc(S.tcSync.title)+' »':''):'Jamais synchronisé.')+(TC.err?'<br><span style="color:var(--alert)">'+esc(TC.err)+'</span>':'')+'</p>';
    h+=tcCheckHtml();
  }else{
    h+='<p class="small">La lecture automatique de Tricount passe par l’API perso installée sur votre serveur Minix (version Docker). '+(NATIVE?'Dans l’APK, indiquez l’adresse du serveur dans Pratique → Réglages.':'Elle n’est pas disponible dans l’app Claude : utilisez la capture d’écran ci-dessous.')+'</p>';
  }
  h+='<div class="row" style="margin-top:8px"><button class="cp" data-a="tcshot">Capture Tricount → Assistant</button>'+(!link?'<a class="cp" href="'+TRICOUNT_PLAY+'" target="_blank" rel="noopener">Installer Tricount</a>':'')+'</div></div>';
  h+=rcHtml();
  h+=tcRecentHtml();
  h+=dayExpHtml();
  /* voyage */
  h+='<div class="card"><h3>Tout le voyage</h3>';
  if(b.left!=null){
    h+='<p class="bnum'+(b.left<0?' over':'')+'">'+(b.left>=0?'Reste '+eurTxt(b.left):'Objectif dépassé de '+eurTxt(-b.left))+'</p><p class="small muted">Objectif '+eurTxt(parseFloat(B.total))+' · '+eurTxt(b.tot)+' engagés, dont '+eurTxt(b.pre)+' de réservations et '+eurTxt(b.onsite)+' dépensés sur place.</p>'+bar(b.tot,parseFloat(B.total));
    if(b.leftMax!=null)h+='<p class="small" style="margin-top:8px"><b>Maximum '+eurTxt(parseFloat(B.max))+'</b> : '+(b.leftMax>=0?'reste '+eurTxt(b.leftMax):'<span style="color:var(--alert)">dépassé de '+eurTxt(-b.leftMax)+'</span>')+'</p>'+bar(b.tot,parseFloat(B.max));
    if(b.planned>0.5)h+='<p class="small muted" style="margin-top:8px">Reste à payer : '+eurTxt(b.planned)+' ('+(B.resteTHB!=null&&B.resteTHB!==""?esc(resteLabelTxt()):'chauffeur Ayutthaya, transferts, ATV')+').</p>';
    var fs=forecastStats(b);if(fs)h+='<p class="small" style="margin-top:8px"><b>Prévision fin de voyage : '+eurTxt(fs.end)+'</b> = '+eurTxt(b.tot)+' dépensés + '+eurTxt(fs.reste)+' à payer + '+fs.days+' jour'+(fs.days>1?'s':'')+' de nourriture ('+eurTxt(fs.food)+')'+(parseFloat(B.total)?' · objectif '+(fs.end<=parseFloat(B.total)?'tenu':'<span style="color:var(--alert)">dépassé de '+eurTxt(fs.end-parseFloat(B.total))+'</span>'):'')+'.</p>';
    if(b.perDay!=null){h+='<div class="prop" style="margin-top:10px"><p class="small"><b>Pour tenir 4 000 €</b> : '+(b.perDay>=0?'environ '+eurTxt(b.perDay)+' par jour pour deux ('+thbTxt(b.perDay*rate)+')':'<span style="color:var(--alert)">objectif déjà hors d’atteinte</span>')+'.<br><b>Pour rester sous 4 400 €</b> : '+(b.perDayMax>=0?'environ '+eurTxt(b.perDayMax)+' par jour ('+thbTxt(b.perDayMax*rate)+')':'<span style="color:var(--alert)">maximum déjà dépassé</span>')+'.</p><p class="small muted">Sur les '+b.daysLeft+' jours restants, aujourd’hui compris, après les gros paiements prévus.</p></div>';}
  }else h+='<p class="small">'+eurTxt(b.tot)+' au total.</p>';
  h+='<div style="margin-top:12px">';
  CATS.forEach(function(c){var v=b.cats[c[0]]||0,cb=B.cats&&parseFloat(B.cats[c[0]]);if(!v&&!cb)return;h+='<div class="bcat"><div class="row" style="justify-content:space-between"><span>'+esc(c[1])+'</span><b>'+eurTxt(v)+(cb?' / '+eurTxt(cb):'')+'</b></div>'+bar(v,cb||b.tot)+(cb&&v<=cb+0.005?'<span class="small muted">Reste '+eurTxt(cb-v)+'</span>':cb?'<span class="small" style="color:var(--alert)">Dépassé de '+eurTxt(v-cb)+'</span>':'')+'</div>';});
  h+='</div></div>';
  /* conseils */
  h+='<details class="card"><summary>Comment tenir 4 000 €</summary><div><ul class="small" style="padding-left:18px;margin:0">'
   +'<li><b>Repas</b> : street food et cantines locales, 60 à 120 THB le plat. Visez environ 600 à 800 THB par jour pour deux hors petits-déjeuners inclus.</li>'
   +'<li><b>Boissons</b> : eau et snacks au 7-Eleven plutôt qu’à l’hôtel ou sur la plage.</li>'
   +'<li><b>Chauffeur Ayutthaya</b> : négociez la journée complète avec dépose à Don Mueang vers 3 000 à 3 500 THB.</li>'
   +'<li><b>Surat Thani → Khao Sok</b> : le minivan partagé (250 à 300 THB par personne) économise environ 35 € si l’horaire colle avec le vol.</li>'
   +'<li><b>Taxis</b> : Bolt est souvent moins cher que Grab ; songthaews à Chiang Mai.</li>'
   +'<li><b>Distributeurs</b> : chaque retrait avec une carte étrangère coûte environ 220 à 250 THB de frais : retirez moins souvent, de plus gros montants.</li>'
   +'<li><b>Entrées</b> : le Grand Palais, retiré du programme, économise environ 1 000 THB pour deux.</li>'
   +'</ul><p class="small muted" style="margin-top:6px">Avec ces choix, 4 000 € reste serré mais atteignable. Le maximum de 4 400 € laisse environ deux fois plus de marge par jour.</p></div></details>';
  /* ajout */
  h+='<div class="card"><h3>Ajouter une dépense</h3><div class="row"><input type="number" step="any" inputmode="decimal" id="ex-amt" placeholder="Montant (négatif = correction)" style="flex:1;min-width:110px"><select id="ex-cur" style="width:auto;flex:0 0 90px"><option>THB</option><option>EUR</option></select></div>'
   +'<input type="text" id="ex-title" placeholder="Quoi ? (ex. : taxi, déjeuner, massage)" style="margin-top:8px" class="txt"><div class="row" style="margin-top:8px"><select id="ex-cat" style="flex:1">'+CATS.map(function(c){return '<option value="'+c[0]+'"'+(c[0]==="nourriture"?" selected":"")+'>'+esc(c[1])+'</option>';}).join("")+'</select><input type="date" id="ex-date" value="'+b.today+'" style="flex:1"></div>'
   +'<div class="row" style="margin-top:10px"><button class="btn" data-a="expadd">Ajouter</button></div><p class="small muted" style="margin-top:6px">Si vous utilisez Tricount, ajoutez plutôt vos dépenses dans Tricount puis synchronisez, pour éviter les doublons.</p></div>';
  /* liste */
  h+=expListHtml();
  /* réglages */
  h+='<details class="card"><summary>Définir le budget (en euros)</summary><div><p class="small muted" style="margin-bottom:8px">Prérempli d’après le roadbook : 3 228,21 € de vols, hôtels et excursions déjà réservés, objectif 4 000 € et maximum 4 400 € pour deux.</p><div class="row" style="margin-bottom:10px"><button class="'+(B.scen!=="max"?"btn":"btn alt")+'" data-a="budscen" data-v="obj">Répartition 4 000 €</button><button class="'+(B.scen==="max"?"btn":"btn alt")+'" data-a="budscen" data-v="max">Répartition 4 400 €</button></div><div class="row"><label style="flex:1">Objectif<input type="number" inputmode="decimal" data-a="bud" data-k="total" value="'+esc(B.total||"")+'"></label><label style="flex:1">Maximum<input type="number" inputmode="decimal" data-a="bud" data-k="max" value="'+esc(B.max||"")+'"></label></div><div class="row" style="margin-top:8px"><label style="flex:1">Par jour, hors gros paiements<input type="number" inputmode="decimal" data-a="bud" data-k="daily" value="'+esc(B.daily||"")+'" placeholder="auto"></label></div>'
   +'<p class="small" style="margin-top:10px"><b>Budget du jour par poste</b> (en euros, facultatif)</p><p class="small muted">Laissé vide : part du budget du jour (repas 50 %, transport 25 %, activités 15 %, massages 6 %, divers 4 %).</p>'
   +DAY_GROUPS.map(function(g){var dB=budgetStats().dailyB;return '<label style="display:block;margin-top:6px">'+esc(g[1])+'<input type="number" inputmode="decimal" data-a="bud" data-k="dcat:'+g[0]+'" value="'+esc((B.dcat&&B.dcat[g[0]])||"")+'" placeholder="'+(dB?(Math.round(dB*g[3]*100)/100).toString().replace(".",","):"auto")+'"></label>';}).join("");
  CATS.forEach(function(c){h+='<label style="display:block;margin-top:8px">'+esc(c[1])+'<input type="number" inputmode="decimal" data-a="bud" data-k="cat:'+c[0]+'" value="'+esc((B.cats&&B.cats[c[0]])||"")+'" placeholder="facultatif"></label>'+(ROADBOOK_BUDGET.hints[c[0]]?'<span class="small muted">'+esc(ROADBOOK_BUDGET.hints[c[0]])+'</span>':'');});
  h+='<label class="ck" style="margin-top:10px"><input type="checkbox" data-a="budpre"'+(B.includePre!==false?" checked":"")+'><span>Compter les réservations du roadbook (vols, hôtels, excursions). Décochez si elles sont déjà saisies dans Tricount.</span></label>';
  h+='<div class="row" style="margin-top:10px"><button class="cp" data-a="budseed">Recharger les valeurs du roadbook</button></div></div></details>';
  h+=forecastHtml();
  h+=backupHtml();
  return h;
}

/* ====== MISES À JOUR RAPIDES ====== */
var UPD={pending:false,lastInput:Date.now()};
function liveT(){try{var c=JSON.parse(localStorage.getItem("thai26-live")||"null");return c&&c.t||0;}catch(e){return 0;}}
function updIdle(){var a=document.activeElement;return !TTS.playing&&!AI.busy&&!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))&&Date.now()-UPD.lastInput>45000;}
/* Installe la version reçue puis redémarre l’app ; au redémarrage, un message confirme la nouvelle version */
function updApply(){
  try{sessionStorage.setItem("thai26-tab",UI.tab);sessionStorage.setItem("thai26-updated",String(typeof BUILD!=="undefined"?BUILD.t:0));}catch(e){}
  var p=$("#prompt");if(p){p.className="on";p.innerHTML='<div class="pr-in"><b>Installation de la mise à jour…</b><span class="small">L’app redémarre dans un instant.</span></div>';}
  setTimeout(function(){location.reload();},700);
}
function updReady(t){
  UPD.pending=true;
  var tried=0;try{tried=+sessionStorage.getItem("thai26-upd-tried")||0;}catch(e){}
  if(updIdle()&&tried!==t){try{sessionStorage.setItem("thai26-upd-tried",String(t));}catch(e){}updApply();return;}
  var p=$("#prompt");if(p.className==="on")return;
  p.className="on";p.innerHTML='<div class="pr-in"><b>Nouvelle version de l’app disponible</b><span class="small">Elle s’installe et l’app redémarre en un instant.</span><div class="row"><button class="btn" data-a="updnow">Installer et redémarrer</button><button class="btn alt" data-a="dismissprompt">Plus tard</button></div></div>';
}
/* APK : la version qui tourne vient-elle du Minix (app-bundle.json) ou de l’APK installé ? */
function runningFromMinix(){
  if(!NATIVE||typeof BUILD==="undefined")return false;
  try{var el=document.getElementById("app-js"),m=el&&/BUILD=\{v:"[^"]*",t:(\d+)/.exec(el.textContent.slice(0,300));return !!m&&+m[1]!==BUILD.t;}catch(e){return false;}
}
/* « 1.31 (22fdf96ad9) » : numéro lisible et code exact de la version */
function verLabel(o){o=o||(typeof BUILD!=="undefined"?BUILD:{});return o.n?o.n+" ("+o.v+")":(o.v||"?");}
function versionText(){
  if(typeof BUILD==="undefined")return "";
  var d=new Date(BUILD.t),txt="Version "+verLabel()+" · publiée le "+fmt(d,TRIP_TZ,{day:"numeric",month:"long",year:"numeric"})+" à "+fmt(d,TRIP_TZ,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).replace(":"," h ")+", heure de Thaïlande";
  if(NATIVE)txt+=runningFromMinix()?" · reçue du Minix":" · version d’origine de l’APK";
  return txt;
}
/* cb (facultatif) reçoit : "new", "none", "offline", "unavailable" ou "error" */
function updCheck(cb){
  var done=function(s){if(cb)cb(s);};
  if(!cb&&document.hidden)return;
  if(navigator.onLine===false)return done("offline");
  if(typeof BUILD==="undefined")return done("unavailable");
  var getJ=function(u){return fetch(u,{cache:"no-store"}).then(function(r){return r.ok?r.json():null;});};
  try{
    if(NATIVE){
      if(cb&&liveT()>BUILD.t){updReady(liveT());return done("new");}
      var base=aiBase();if(!base)return done("unavailable");
      getJ(base+"/version.json").then(function(j){
        if(!j)return "error";
        if(!(j.t>Math.max(BUILD.t,liveT())))return "none";
        return getJ(base+"/app-bundle.json").then(function(b){
          if(b&&b.t===j.t&&b.js){localStorage.setItem("thai26-live",JSON.stringify(b));updReady(b.t);return "new";}
          return "error";
        });
      }).then(done,function(){done("error");});
    }else if(!window.claude&&/^https?:$/.test(location.protocol)){
      getJ("version.json").then(function(j){
        if(!j)return "error";
        if(j.t>BUILD.t){updReady(j.t);return "new";}
        return "none";
      }).then(done,function(){done("error");});
    }else done("unavailable");
  }catch(e){done("error");}
}
function updCheckNow(){
  toast("Recherche d’une nouvelle version…");
  updCheck(function(s){
    if(s==="new"){updApply();return;}
    var m={none:"Vous avez la dernière version",offline:"Pas de connexion : vérification impossible",
      unavailable:NATIVE?"Adresse du Minix non renseignée : vérification impossible":"Vérification impossible depuis cette page",
      error:"Le serveur ne répond pas. Réessayez plus tard."}[s];
    if(m)toast(m);
  });
}

/* ---------- affichage ---------- */
function renderTabs(){
  setTimeout(function(){var c=document.querySelector('.tab[aria-current="page"]');if(c&&c.scrollIntoView)try{c.scrollIntoView({inline:"nearest",block:"nearest"});}catch(e){}},0);
  $("#tabs").innerHTML=TABS.map(function(t){return '<button class="tab" data-a="tab" data-v="'+t[0]+'"'+(UI.tab===t[0]?' aria-current="page"':"")+'>'+ICON[t[0]]+'<span>'+t[1]+'</span></button>';}).join("");
}
function render(keep){
  var y=window.scrollY;
  renderTabs();
  var f={today:vToday,trip:vTrip,guide:vGuide,ai:vAi,convert:vConvert,grab:vGrab,translate:vTranslate,tricount:vTricount2,remind:vRemind,tools:vTools}[UI.tab]||vToday;
  $("#view").innerHTML=f();
  if(keep)window.scrollTo(0,y);
}
function setTheme(){
  var r=document.documentElement;
  if(S.set.theme==="auto")r.removeAttribute("data-theme");else r.setAttribute("data-theme",S.set.theme);
}

/* ---------- actions ---------- */
function openSheet(id){UI.sheet=id;renderSheet();var s=$("#sheet");s.scrollTop=0;}
function closeSheet(){UI.sheet=null;renderSheet();if(UI.tab==="guide")render(true);}
function showDriver(k){
  var p=k.split(":"),el=$("#driver"),h="";
  if(p[0]==="h"){var H=HOTELS[p[1]];h='<p>Merci de m’emmener à cet hôtel :</p><h2>'+esc(H.name)+'</h2><p class="big" style="font-size:26px">'+esc(H.addr)+'</p><p>Téléphone : '+esc(H.telTxt)+'</p>';}
  else{var s=SITE[p[1]];h='<p>Merci de m’emmener à :</p><div class="big">'+esc(s.th)+'</div><h2>'+esc(s.name)+'</h2>';}
  el.innerHTML=h+'<button class="btn block" data-a="closedriver">Fermer</button>';el.className="on";
}
document.addEventListener("click",function(e){
  UPD.lastInput=Date.now();
  var b=e.target.closest("[data-a]");if(!b)return;
  var a=b.getAttribute("data-a"),id=b.getAttribute("data-id"),v=b.getAttribute("data-v");
  switch(a){
    case "tab":if(v==="tricount"&&AI.tc&&tcLink()&&(!S.tcSync||Date.now()-S.tcSync.at>60000))setTimeout(function(){tcSync(true);},50);
      else if(v==="tricount"&&!AI.tc&&tcPossible()&&AI.mode!=="pending")aiServer(function(){if(AI.tc&&tcLink())tcSync(true);else if(UI.tab==="tricount")render(true);});UI.tab=v;if(UI.sheet){UI.sheet=null;renderSheet();}render();window.scrollTo(0,0);break;
    case "day":var n=parseInt(b.getAttribute("data-n"),10);UI.openDay=(UI.openDay===n)?null:n;render(true);break;
    case "done":S.done[id]=!S.done[id];save();render(true);break;
    case "ack":S.ack[id]=true;save();render(true);break;
    case "site":case "leg":openSheet(id);break;
    case "closesheet":closeSheet();break;
    case "opentrack":if(TTS.siteId){openSheet(TTS.siteId);}break;
    case "playsite":playSite(id,parseInt(b.getAttribute("data-c"),10)||0);if(b.getAttribute("data-close")){$("#prompt").className="";openSheet(id);}break;
    case "dismissprompt":$("#prompt").className="";break;
    case "brief":playBrief(parseInt(b.getAttribute("data-n"),10));break;
    case "toggle":pauseToggle();break;
    case "prev":jumpChap(-1);break;
    case "next":jumpChap(1);break;
    case "stop":stopAudio();break;
    case "filter":UI.filter=v;render(true);break;
    case "geo":S.set.geo=!S.set.geo;save();if(S.set.geo){startGeo();}else{stopGeo();POS=null;}render(true);break;
    case "auto":S.set.auto=!S.set.auto;save();render(true);break;
    case "enotif":if("Notification" in window){Notification.requestPermission().then(function(){render(true);});}break;
    case "exact":if(LN){LN.changeExactNotificationSetting().then(function(x){NAT.exact=x&&x.exact_alarm;scheduleAll();}).catch(function(){});}break;
    case "resched":scheduleAll();toast("Alarmes reprogrammées");break;
    case "testnotif":if(NATIVE&&LN){LN.schedule({notifications:[{id:999,title:"Test de notification",body:"Les rappels du voyage sonneront comme ceci.",channelId:"rappels",schedule:{at:new Date(Date.now()+10000),allowWhileIdle:true},smallIcon:"ic_stat_thai"}]}).then(function(){toast("Notification dans 10 secondes");}).catch(function(e){toast("Échec : "+((e&&e.message)||e));});break;}osNotify({id:"test",title:"Test de notification",body:"Les rappels du voyage s’afficheront comme ceci."});toast("Notification envoyée");break;
    case "copy":copy(v);break;
    case "cvq":UI.cv=v;render(true);break;
    case "updnow":updApply();break;
    case "updcheck":updCheckNow();break;
    case "minixtest":minixTest();break;
    case "heardset":if(v==="1"){S.heard[id]=Date.now();toast("Archivé dans Écoutés");}else{delete S.heard[id];toast("Remis dans la liste");}save();if(UI.sheet)renderSheet();render(true);break;
    case "heardall":if(confirm("Remettre tous les guides écoutés dans la liste ?")){S.heard={};save();render(true);}break;
    case "propapply":var pm=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(pm&&pm.prop){try{progApply(pm.prop);pm.applied="ok";saveAi();toast("Programme mis à jour");}catch(err){toast(err.message);}render(true);}break;
    case "propignore":var pn=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(pn){pn.applied="no";saveAi();render(true);}break;
    case "progundo":var ns=String(b.getAttribute("data-n")).split(",");ns.forEach(function(n){progUndo(parseInt(n,10));});AI.msgs.forEach(function(m){if(m.applied==="ok"&&m.prop&&m.prop.some(function(v){return ns.indexOf(String(v.n))>=0;}))m.applied="undone";});saveAi();toast("Modification annulée");render(true);break;
    case "progask":UI.tab="ai";AI.draft="Modifie le programme du jour "+b.getAttribute("data-n")+" et applique-le : ";render();window.scrollTo(0,document.body.scrollHeight);var pa=$("#ai-text");if(pa){pa.focus();pa.setSelectionRange(pa.value.length,pa.value.length);}break;
    case "expapply":var em=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(em&&em.exp){var na=expAdd(em.exp,"assistant");em.expApplied=na+" dépense(s) ajoutée(s) au budget"+(na<em.exp.length?" ("+(em.exp.length-na)+" doublon(s) ignoré(s))":"")+".";saveAi();render(true);}break;
    case "expadd":var am=parseFloat(($("#ex-amt")||{}).value);if(!isFinite(am)||!am){toast("Indiquez un montant (négatif pour une correction)");break;}var tt=(($("#ex-title")||{}).value||"").trim()||"Dépense";var cc=($("#ex-cat")||{}).value;expAdd([{amt:am,cur:($("#ex-cur")||{}).value,title:tt,cat:cc,date:($("#ex-date")||{}).value}],"manuel");toast("Dépense ajoutée");render(true);break;
    case "expdel":expDelete(id);break;
    case "expedit":UI.expEdit=UI.expEdit===id?null:id;UI.expOpen=true;render(true);break;
    case "expsave":expSave(id);break;
    case "expcancel":UI.expEdit=null;render(true);break;
    case "bkpnow":if(backup("Sauvegarde manuelle"))toast("Sauvegarde faite");render(true);break;
    case "bkpexport":copy(JSON.stringify({exp:S.exp,budget:S.budget},null,1));break;
    case "bkprestore":backupRestore(parseInt(v,10));break;
    case "bkpcopy":var bk=backupList()[parseInt(v,10)];if(bk)copy(JSON.stringify(bk,null,1));break;
    case "rclive":RC.done=null;rcLive();break;
    case "rcpaste":RC.paste=(($("#rc-paste")||{}).value||"");var rp=rcParse(RC.paste);if(rp.error){RC.err=rp.error;render(true);}else if(!rp.list.length){RC.err="Aucune dépense reconnue ("+rp.skipped+" ligne(s) ignorée(s)).";render(true);}else{rcLoad(rp.list,"paste");toast(rp.list.length+" dépense(s) lue(s)"+(rp.skipped?", "+rp.skipped+" ligne(s) ignorée(s)":""));}break;
    case "rccsv":var rf=$("#rc-file");if(rf)rf.click();break;
    case "rcshot":UI.tab="ai";AI.draft="Voici une capture de notre Tricount : extrais la liste complète des dépenses pour la comparer avec l’app.";render();var rsf=$("#ai-gal");if(rsf)rsf.click();else toast("Photos non disponibles ici");break;
    case "rcapply":rcApply();break;
    case "rcall":if(RC.rows){RC.rows.forEach(function(r){if(r.kind===v)RC.sel[r.key]=id==="1";});var ys=window.scrollY;render(true);window.scrollTo(0,ys);}break;
    case "rcclose":RC.rows=null;RC.done=null;RC.list=null;render(true);break;
    case "fcapply":forecastApply();break;
    case "tclcompare":var tm=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(tm&&tm.tcl)rcLoad(tm.tcl.map(function(o,k){return rcItem(o,k);}),"capture");break;
    case "modapply":case "delapply":var mm=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(mm){var r1=a==="modapply"?aiModApply(mm.mod):aiDelApply(mm.del);if(r1!=null){if(a==="modapply")mm.modApplied=r1;else mm.delApplied=r1;saveAi();}render(true);}break;
    case "budapply":var bm=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(bm){var rb=budApply(bm.bud);if(rb!=null){bm.budApplied=rb;saveAi();}render(true);}break;
    case "budignore":var bi=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(bi){bi.budApplied="Ignorée";saveAi();render(true);}break;
    case "modignore":case "delignore":var mi=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(mi){if(a==="modignore")mi.modApplied="Ignorée";else mi.delApplied="Ignorée";saveAi();render(true);}break;
    case "expclear":if(confirm("Effacer toutes les dépenses enregistrées ?")){S.exp=[];save();render(true);}break;
    case "tcsync":tcSyncNow();break;
    case "budscen":applyScenario(v);toast(v==="max"?"Répartition 4 400 € appliquée":"Répartition 4 000 € appliquée");render(true);break;
    case "budseed":if(confirm("Remplacer le budget par les valeurs du roadbook ?")){seedBudget(true);toast("Budget du roadbook rechargé");render(true);}break;
    case "csvpick":var cf=$("#csv-file");if(cf)cf.click();break;
    case "tcshot":UI.tab="ai";AI.draft="Voici une capture de notre Tricount : ajoute ces dépenses au budget.";render();var af=$("#ai-gal");if(af)af.click();else toast("Photos non disponibles ici");break;
    case "aichip":var ch=AI_CHIPS.filter(function(c){return c[0]===v;})[0];if(!ch)break;
      if(v==="photo"){AI.draft=ch[2];render(true);var fi=$("#ai-file");if(fi)fi.click();else toast("Photos non disponibles ici");}
      else if(v==="thai"){AI.draft=ch[2];render(true);var ta=$("#ai-text");if(ta){ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);}}
      else aiSend(ch[2],ch[3]);break;
    case "aisend":var tx=$("#ai-text");var aud=/audio ?guide|raconte|narration/i.test(tx?tx.value:"");aiSend(tx?tx.value:"",aud);break;
    case "aistop":if(AI.ctl)AI.ctl.abort();break;
    case "aiclear":if(confirm("Effacer la conversation ?")){AI.msgs=[];saveAi();render(true);}break;
    case "aiclearimg":AI.img=null;if(AI.imgUrl){try{URL.revokeObjectURL(AI.imgUrl);}catch(e){}}AI.imgUrl=null;render(true);break;
    case "aiphoto":var f2=$("#ai-file");if(f2)f2.click();break;
    case "aigal":var f3=$("#ai-gal");if(f3)f3.click();break;
    case "aispeak":var m1=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(m1)startQueue({title:"Assistant",sub:"Réponse"},[{t:"",x:aiPlain(m1.content)}],0);break;
    case "aicopy":var m2=AI.msgs[parseInt(b.getAttribute("data-i"),10)];if(m2)copy(m2.content);break;
    case "driver":showDriver(b.getAttribute("data-k"));break;
    case "closedriver":$("#driver").className="";break;
    case "voiceinstall":if(TTSN)TTSN.openInstall().catch(function(e){toast("Ouvrez Réglages Android → Synthèse vocale : "+((e&&e.message)||"installation impossible"));});break;
    case "voicetest":if(!synth&&!(NATIVE&&TTSN)){toast("Voix indisponible");break;}TTS.q=[];startQueue({title:"Test de la voix",sub:""},[{t:"",x:"Bonjour ! Ceci est le guide audio de votre voyage en Thaïlande. Bon voyage !"}],0);break;
    case "simreset":S.set.offset=0;save();render(true);break;
    case "resetrem":S.fired={};S.ack={};save();checkReminders();if(NATIVE)scheduleAll();render(true);toast("Rappels réinitialisés");break;
  }
});
document.addEventListener("change",function(e){
  var el=e.target,a=el.getAttribute&&el.getAttribute("data-a");if(!a)return;
  if(a==="aifile"){var fl=el.files&&el.files[0];if(fl){AI.img=fl;if(AI.imgUrl){try{URL.revokeObjectURL(AI.imgUrl);}catch(e){}}AI.imgUrl=URL.createObjectURL(fl);var ta2=$("#ai-text");if(ta2)AI.draft=ta2.value;render(true);}return;}
  if(a==="aipos"){S.set.aiPos=el.checked;save();return;}
  if(a==="restepaid"){resteToggle(el.getAttribute("data-id"),el.checked);return;}
  if(a==="rcsel"){RC.sel[el.getAttribute("data-k")]=el.checked;var y=window.scrollY;render(true);window.scrollTo(0,y);return;}
  if(a==="rcfile"){var rcf=el.files&&el.files[0];if(!rcf)return;var rr=new FileReader();rr.onload=function(){var pr=rcParse(String(rr.result||""));if(pr.error||!pr.list.length){RC.err=pr.error||"Aucune dépense reconnue dans le fichier.";render(true);}else rcLoad(pr.list,"csv");};rr.readAsText(rcf);return;}
  if(a==="budpre"){S.budget=S.budget||{};S.budget.includePre=el.checked;save();render(true);return;}
  if(a==="expcat"){S.exp.forEach(function(x){if(x.id===el.getAttribute("data-id")){x.cat=el.value;x.catUser=true;}});save();UI.expOpen=true;render(true);return;}
  if(a==="bud"){var k=el.getAttribute("data-k"),val=el.value===""?"":parseFloat(el.value);S.budget=S.budget||{};if(k.indexOf("dcat:")===0){S.budget.dcat=S.budget.dcat||{};S.budget.dcat[k.slice(5)]=val;}else if(k.indexOf("cat:")===0){S.budget.cats=S.budget.cats||{};S.budget.cats[k.slice(4)]=val;}else S.budget[k]=val;save();render(true);return;}
  if(a==="csvfile"){var cfile=el.files&&el.files[0];if(!cfile)return;var rd=new FileReader();rd.onload=function(){var r=importCSV(String(rd.result||""),($("#csv-cur")||{}).value||"EUR");if(r.error)toast(r.error);else toast(r.added+" dépense(s) importée(s), "+r.skipped+" ignorée(s)");UI.expOpen=true;render(true);};rd.readAsText(cfile);return;}
  if(a==="tcfrom"){S.set.tcFrom=/^\d{4}-\d{2}-\d{2}$/.test(el.value)?el.value:"";save();S.tcNew=null;if(AI.tc){tcSync(true,false,true);toast("Tricount relu à partir du "+tcFromTxt());}else toast("Date enregistrée : "+tcFromTxt());return;}
  if(a==="tclink"){S.set.tricount=el.value.trim();save();S.tcSync=null;if(UI.tab==="tricount")render(true);if(AI.tc)tcSync(false);else toast("Lien Tricount enregistré");return;}
  if(a==="aibase"){S.set.aiBase=el.value.trim();save();AI.mode="pending";aiServer();return;}
  if(a==="aitoken"){S.set.aiToken=el.value.trim();save();if(aiBase()){AI.mode="pending";aiServer();}return;}
  if(a==="cash"){S.cash[el.getAttribute("data-id")]=el.checked;save();render(true);reopen();}
  else if(a==="check"){S.checks[el.getAttribute("data-id")]=el.checked;save();}
  else if(a==="theme"){S.set.theme=el.value;save();setTheme();}
  else if(a==="speed"){S.set.speed=parseFloat(el.value);save();}
  else if(a==="rate"){var r=parseFloat(el.value);if(r>0){S.set.rate=r;save();cvUpdate("cv-thb");}}
  else if(a==="sim"){
    if(!el.value)return;var ms=Date.parse(el.value+":00+07:00");if(isNaN(ms))return;
    S.set.offset=ms-Date.now();
    var t=nowMs();REMINDERS.forEach(function(r){if(r.ms>t){delete S.fired[r.id];delete S.ack[r.id];}});
    save();checkReminders();toast("Heure simulée");render(true);
  }
});
document.addEventListener("toggle",function(e){var t=e.target;if(t&&t.getAttribute&&t.getAttribute("data-a")==="expdetails")UI.expOpen=t.open;},true);
document.addEventListener("input",function(e){
  UPD.lastInput=Date.now();
  var el=e.target,a=el.getAttribute&&el.getAttribute("data-a");
  if(a==="cv"){cvUpdate(el.id);return;}
  if(a==="trtext"){UI.tr=el.value;var x1=$("#tr-fr-th"),x2=$("#tr-th-fr");if(x1)x1.href=gTrans(el.value,"fr","th");if(x2)x2.href=gTrans(el.value,"th","fr");return;}
  if(a==="aidraft"){AI.draft=el.value;return;}
});
function reopen(){var ds=document.querySelectorAll("details.card");ds.forEach(function(d){if(d.querySelector("[data-a=cash]"))d.open=true;});}

/* ====== BUDGET : sauvegardes, modification, synchronisation avec Tricount ====== */
/* Affichage d’un montant dans sa devise d’origine, et sa contrepartie */
function amtTxt(e){if(e.cur==="EUR")return eurTxt(e.amt);if(e.cur==="THB")return thbTxt(e.amt);return (Math.round(e.amt*100)/100).toLocaleString("fr-FR")+" "+(e.cur||"");}
function altTxt(e){return e.cur==="EUR"?thbTxt(e.amt*(S.set.rate||37.71)):eurTxt(toEur(e));}
function sumEur(list){var t=0;list.forEach(function(e){t+=toEur(e);});return t;}
function catTotals(list){var c={};list.forEach(function(e){c[e.cat]=(c[e.cat]||0)+toEur(e);});return c;}
function newExpId(p){return (p||"e")+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

/* --- sauvegardes des dépenses et du budget (15 dernières, sur le téléphone) --- */
var BKEY="thai26-backups";
function backupList(){try{return JSON.parse(localStorage.getItem(BKEY)||"[]")||[];}catch(e){return [];}}
function backup(reason){
  try{
    var L=backupList();
    L.unshift({at:Date.now(),reason:reason,exp:JSON.parse(JSON.stringify(S.exp)),budget:JSON.parse(JSON.stringify(S.budget||{})),n:S.exp.length,tot:Math.round(sumEur(expActive())*100)/100});
    localStorage.setItem(BKEY,JSON.stringify(L.slice(0,15)));return true;
  }catch(e){toast("Sauvegarde impossible : correction annulée ("+((e&&e.message)||e)+")");return false;}
}
function backupRestore(i){
  var L=backupList(),b=L[i];if(!b)return;
  if(!confirm("Restaurer la sauvegarde du "+cap(fmt(b.at,TRIP_TZ,{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}))+" ("+b.n+" dépenses, "+eurTxt(b.tot)+") ?\nLes données actuelles seront d’abord sauvegardées."))return;
  if(!backup("Avant restauration"))return;
  S.exp=b.exp;S.budget=b.budget;save();toast("Sauvegarde restaurée");render(true);
}
function backupHtml(){
  var L=backupList(),h='<details class="card"><summary>Sauvegardes des dépenses ('+L.length+')</summary><div>';
  h+='<p class="small muted">Une sauvegarde est faite automatiquement avant chaque correction (modification, suppression, synchronisation, budget). Les 15 dernières sont gardées sur ce téléphone.</p>';
  h+='<div class="row" style="margin:8px 0"><button class="cp" data-a="bkpnow">Sauvegarder maintenant</button><button class="cp" data-a="bkpexport">Copier toutes les dépenses (JSON)</button></div>';
  L.forEach(function(b,i){h+='<div class="kv"><span><b>'+esc(cap(fmt(b.at,TRIP_TZ,{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"})))+'</b><br><span class="small muted">'+esc(b.reason)+' · '+b.n+' dépenses · '+eurTxt(b.tot)+'</span></span><span class="row" style="flex:none"><button class="cp" data-a="bkprestore" data-v="'+i+'">Restaurer</button><button class="cp" data-a="bkpcopy" data-v="'+i+'">Copier</button></span></div>';});
  if(!L.length)h+='<p class="small muted">Aucune sauvegarde pour l’instant.</p>';
  return h+'</div></details>';
}

/* --- modifier ou supprimer une dépense --- */
UI.expEdit=null;
function expEditHtml(e){
  var curs=["THB","EUR"];if(curs.indexOf(e.cur)<0)curs.push(e.cur);
  return '<div class="prop" style="width:100%;margin-top:6px"><label class="small">Titre<input type="text" class="txt" id="ee-title" value="'+esc(e.title)+'"></label>'
   +'<div class="row" style="margin-top:6px"><label class="small" style="flex:1">Montant (négatif = correction)<input type="number" step="any" inputmode="decimal" id="ee-amt" value="'+esc(e.amt)+'"></label><label class="small" style="flex:0 0 96px">Devise<select id="ee-cur">'+curs.map(function(c){return '<option'+(c===e.cur?' selected':'')+'>'+esc(c)+'</option>';}).join("")+'</select></label></div>'
   +'<div class="row" style="margin-top:6px"><label class="small" style="flex:1">Date<input type="date" id="ee-date" value="'+esc(e.date)+'"></label><label class="small" style="flex:1">Catégorie<select id="ee-cat">'+CATS.map(function(c){return '<option value="'+c[0]+'"'+(c[0]===e.cat?' selected':'')+'>'+esc(c[1])+'</option>';}).join("")+'</select></label></div>'
   +'<label class="small" style="display:block;margin-top:6px">Payé par<input type="text" class="txt" id="ee-payer" value="'+esc(e.payer||"")+'"></label>'
   +(e.tid?'<p class="small muted" style="margin-top:6px">Dépense lue dans Tricount : corrigez-la aussi dans Tricount, sinon la prochaine lecture la remettra comme dans Tricount.</p>':'')
   +'<div class="row" style="margin-top:8px"><button class="btn" data-a="expsave" data-id="'+esc(e.id)+'">Enregistrer</button><button class="btn alt" data-a="expcancel">Annuler</button></div></div>';
}
function expSave(id){
  var e=S.exp.filter(function(x){return x.id===id;})[0];if(!e)return;
  var amt=parseFloat(($("#ee-amt")||{}).value),cur=($("#ee-cur")||{}).value||e.cur;
  if(!isFinite(amt)||amt===0){toast("Indiquez un montant (négatif autorisé)");return;}
  if(!backup("Avant modification de « "+e.title+" »"))return;
  if(amt!==e.amt||cur!==e.cur){if(cur==="EUR")e.eur=amt;else delete e.eur;}
  e.title=(($("#ee-title")||{}).value||"").trim()||e.title;e.amt=Math.round(amt*100)/100;e.cur=cur;
  var d=($("#ee-date")||{}).value;if(/^\d{4}-\d{2}-\d{2}$/.test(d))e.date=d;
  var c=($("#ee-cat")||{}).value;if(CATN[c]&&c!==e.cat){e.cat=c;e.catUser=true;}
  e.payer=(($("#ee-payer")||{}).value||"").trim();e.edited=Date.now();
  save();UI.expEdit=null;toast("Dépense modifiée");render(true);
}
function expDelete(id){
  var e=S.exp.filter(function(x){return x.id===id;})[0];if(!e)return;
  if(!confirm("Supprimer « "+e.title+" » ("+amtTxt(e)+", "+e.date+") ?"+(e.tid?"\nAttention : elle vient de Tricount et reviendra à la prochaine lecture si elle n’est pas supprimée dans Tricount.":"")))return;
  if(!backup("Avant suppression de « "+e.title+" »"))return;
  S.exp=S.exp.filter(function(x){return x.id!==id;});save();UI.expOpen=true;toast("Dépense supprimée");render(true);
}
function expListHtml(){
  var list=S.exp.slice().sort(function(a,c){return a.date<c.date?1:a.date>c.date?-1:0;}),inc=!S.budget||S.budget.includePre!==false;
  var h='<details class="card"'+(UI.expOpen?' open':'')+' data-a="expdetails"><summary>Dépenses enregistrées ('+list.length+' · '+eurTxt(sumEur(expActive()))+')</summary><div>';
  if(!list.length)h+='<p class="small muted">Aucune dépense pour l’instant.</p>';
  list.forEach(function(e){
    var off=e.src==="roadbook"&&!inc,src=e.src==="tricount"?"Tricount"+(e.payer?" ("+e.payer+")":""):e.src==="assistant"?"Assistant":e.src==="roadbook"?"réservé (roadbook)":e.src==="import"?"importée":"manuelle";
    h+='<div class="kv" style="flex-wrap:wrap'+(off?';opacity:.45':'')+'"><span style="flex:1;min-width:140px"><b>'+esc(e.title)+'</b><br><span class="small muted">'+esc(e.date)+' · '+esc(catName(e.cat))+' · '+esc(src)+(e.pre?' · réservation':'')+'</span></span><span style="text-align:right"><b'+(e.amt<0?' style="color:var(--ok)"':'')+'>'+amtTxt(e)+'</b><br><span class="small muted">'+altTxt(e)+'</span></span>'
      +'<span class="row" style="flex:none"><button class="cp" data-a="expedit" data-id="'+esc(e.id)+'">Modifier</button><button class="cp" data-a="expdel" data-id="'+esc(e.id)+'" aria-label="Supprimer">Suppr.</button></span>'
      +(UI.expEdit===e.id?expEditHtml(e):'')+'</div>';
  });
  return h+'</div></details>';
}

/* --- synchronisation avec Tricount : comparer, valider ligne par ligne, corriger --- */
var RC={list:null,src:"",rows:null,sel:{},busy:false,err:"",done:null,paste:"",open:false};
/* dépense Tricount normalisée : montant et devise d’origine, valeur en euros de Tricount si connue */
function rcItem(o,k){
  var amt=parseFloat(o.amt),cur=String(o.cur||"EUR").toUpperCase(),eur=o.eur!=null&&isFinite(parseFloat(o.eur))?Math.round(parseFloat(o.eur)*100)/100:(cur==="EUR"?amt:null);
  var x={key:o.tid?"t:"+o.tid:"p:"+k,tid:o.tid||null,date:parseDateStr(o.date)||dateKey(nowMs(),TRIP_TZ),title:String(o.title||"Dépense").slice(0,100),amt:Math.round(amt*100)/100,cur:cur,payer:o.payer||"",when:o.when||""};
  if(eur!=null)x.eur=eur;
  x.cat=CATN[o.cat]?o.cat:(o.tc?tcCat(o.tc):guessCat(x.title,o.catHint||""));
  return x;
}
function rcFromBridge(all){return all.map(function(x,k){var eur=x.cur_tricount==="EUR"?x.amt_tricount:(x.cur==="EUR"?x.amt:null);return rcItem({tid:x.tid,date:x.date,title:x.title,amt:x.amt,cur:x.cur,eur:eur,payer:x.payer,when:x.when,tc:x},k);});}
var RC_SKIP=/rembours|reimburs|virement|transfert d.argent|money transfer|paid back|balance|règlement|reglement|equilibr/i;
/* texte collé : CSV (export Tricount) ou une dépense par ligne (« 12/11 Taxi 120 THB ») */
function rcParse(text){
  text=String(text||"").replace(/^﻿/,"");var lines=text.split(/\r?\n/).filter(function(l){return l.trim();});
  if(!lines.length)return {list:[],skipped:0,error:"Rien à lire."};
  var head=normH(lines[0]),skipped=0,out=[];
  if(/[;,\t]/.test(lines[0])&&/(montant|amount|prix|price|total)/.test(head)){
    var rows=parseCSV(text),H=rows[0].map(normH),find=function(re,not){for(var i=0;i<H.length;i++){if(re.test(H[i])&&!(not&&not.test(H[i])))return i;}return -1;};
    var iD=find(/date|datum/),iT=find(/titre|title|description|libelle|what|objet|nom/,/pay|par/),iA=find(/montant|amount|prix|price|total|valeur|value/,/convert|default|defaut|devise par|euro|rembours|taux|rate/),iE=find(/(convert|default|defaut|en eur|in eur|euro)/),iC=find(/devise|currency|monnaie/,/default|defaut|convert/),iK=find(/categ/),iY=find(/^type|transaction/),iP=find(/pay[eé]? ?par|paid ?by|payer|payeur/);
    if(iA<0)return {list:[],skipped:0,error:"Colonne de montant introuvable : "+rows[0].join(", ")};
    rows.slice(1).forEach(function(r,k){
      var title=(iT>=0?r[iT]:"")||"Dépense",typ=iY>=0?r[iY]:"";
      if(RC_SKIP.test(title+" "+typ)){skipped++;return;}
      var amt=parseAmount(r[iA]);if(!isFinite(amt)||!amt){skipped++;return;}
      var cur=String(iC>=0?r[iC]:"").toUpperCase();cur=/THB|฿|BAHT/.test(cur)?"THB":/EUR|€/.test(cur)?"EUR":/^[A-Z]{3}$/.test(cur.trim())?cur.trim():(/฿|THB/i.test(r[iA])?"THB":"EUR");
      var eur=iE>=0?parseAmount(r[iE]):NaN;
      out.push(rcItem({date:iD>=0?r[iD]:"",title:title.trim(),amt:amt,cur:cur,eur:isFinite(eur)?eur:null,payer:iP>=0?r[iP]:"",catHint:iK>=0?r[iK]:""},k));
    });
    return {list:out,skipped:skipped};
  }
  var reAmt=/(-?\d[\d\s .,]*)\s*(€|eur|euros?|thb|฿|bahts?)(?![a-z])|(€|thb|฿)\s*(-?\d[\d\s .,]*)/i;
  lines.forEach(function(l,k){
    if(RC_SKIP.test(l)){skipped++;return;}
    var m=reAmt.exec(l);if(!m){skipped++;return;}
    var num=m[1]||m[4],cu=(m[2]||m[3]||"").toLowerCase(),amt=parseAmount(num);if(!isFinite(amt)||!amt){skipped++;return;}
    var cur=/€|eur/.test(cu)?"EUR":"THB",rest=l.replace(m[0]," ");
    var dm=/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)/.exec(rest),date=null;
    if(dm){var ds=dm[1];if(/^\d{1,2}[\/.]\d{1,2}$/.test(ds))ds+="/2026";date=parseDateStr(ds);rest=rest.replace(dm[0]," ");}
    var title=rest.replace(/[|;\t]+/g," ").replace(/\s{2,}/g," ").replace(/^[\s\-–—:·,]+|[\s\-–—:·,]+$/g,"")||"Dépense";
    out.push(rcItem({date:date,title:title,amt:amt,cur:cur},k));
  });
  return {list:out,skipped:skipped};
}
function rcEur(x){return x.eur!=null?x.eur:toEur(x);}
function rcWords(s){return normH(s).replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(function(w){return w.length>2;});}
function rcSim(a,b){var A=rcWords(a),B=rcWords(b);if(!A.length||!B.length)return 0;var n=0;A.forEach(function(w){if(B.some(function(v){return v.indexOf(w)>=0||w.indexOf(v)>=0;}))n++;});return n/Math.max(A.length,B.length);}
function rcDays(a,b){return Math.abs(Date.parse(a+"T12:00:00Z")-Date.parse(b+"T12:00:00Z"))/86400000;}
/* compare la liste Tricount T aux dépenses actives de l’app */
function rcCompare(T){
  var A=expActive(),usedA={},usedT={},rows=[];
  T.forEach(function(t){if(!t.tid)return;var a=A.filter(function(x){return x.tid===t.tid&&!usedA[x.id];})[0];if(a){usedA[a.id]=1;usedT[t.key]=1;rows.push({a:a,t:t});}});
  var pairs=[];
  T.forEach(function(t){if(usedT[t.key])return;var et=rcEur(t);
    A.forEach(function(a){if(usedA[a.id]||(a.tid&&a.tid!==t.tid&&T.some(function(o){return o.tid===a.tid;})))return;
      var ea=toEur(a),d=Math.abs(ea-et)/Math.max(Math.abs(ea),Math.abs(et),0.01);if(d>0.15)return;
      var sc=(1-d)*3+(a.cat===t.cat?1:0)+rcSim(a.title,t.title)*2+(a.date===t.date?1:rcDays(a.date,t.date)<=3?0.5:0)+(a.cur===t.cur&&Math.abs(a.amt-t.amt)<0.005?1:0);
      if(sc>=3.4)pairs.push({a:a,t:t,s:sc});});});
  pairs.sort(function(x,y){return y.s-x.s;});
  pairs.forEach(function(p){if(usedA[p.a.id]||usedT[p.t.key])return;usedA[p.a.id]=1;usedT[p.t.key]=1;rows.push({a:p.a,t:p.t});});
  rows.forEach(function(r){var same=r.a.cur===r.t.cur&&Math.abs(r.a.amt-r.t.amt)<0.005&&Math.abs(toEur(r.a)-rcEur(r.t))<0.5;r.kind=same?"same":"diff";r.key="m:"+r.a.id;});
  T.forEach(function(t){if(!usedT[t.key])rows.push({kind:"missing",t:t,key:"a:"+t.key});});
  A.forEach(function(a){if(!usedA[a.id])rows.push({kind:"extra",a:a,key:"d:"+a.id});});
  return rows;
}
function rcLoad(list,src){
  RC.list=list;RC.src=src;RC.rows=rcCompare(list);RC.sel={};RC.done=null;RC.err="";RC.open=true;
  RC.rows.forEach(function(r){RC.sel[r.key]=true;});
  UI.tab="tricount";render();setTimeout(function(){var el=document.getElementById("rc-card");if(el&&el.scrollIntoView)try{el.scrollIntoView({block:"start"});}catch(e){}},50);
}
function rcLive(){
  if(!AI.tc){toast(tcWhyText());return;}
  RC.busy=true;RC.err="";render(true);
  fetch(aiBase()+"/api/tricount?link="+encodeURIComponent(tcLink())+"&fresh=1",{headers:aiHeaders()}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j&&j.error||("HTTP "+r.status));return j;});})
  .then(function(j){RC.busy=false;rcLoad(rcFromBridge(j.expenses||[]),"live");},function(e){RC.busy=false;RC.err="Lecture de Tricount impossible : "+((e&&e.message)||e);render(true);});
}
/* applique les corrections cochées : sauvegarde d’abord */
function rcResult(rows,sel){
  var keep=expActive().slice(),byId={};keep.forEach(function(e){byId[e.id]=e;});
  var after=keep.filter(function(e){return !rows.some(function(r){return r.kind==="extra"&&sel[r.key]&&r.a.id===e.id;});}).map(function(e){
    var r=rows.filter(function(r){return (r.kind==="same"||r.kind==="diff")&&sel[r.key]&&r.a.id===e.id;})[0];
    return r?rcMerge(e,r.t):e;});
  rows.forEach(function(r){if(r.kind==="missing"&&sel[r.key])after.push(rcNew(r.t));});
  return after;
}
function rcMerge(e,t){
  var x=JSON.parse(JSON.stringify(e));
  x.title=t.title;x.amt=t.amt;x.cur=t.cur;x.date=t.date;if(t.eur!=null)x.eur=t.eur;else delete x.eur;
  if(!x.catUser)x.cat=t.cat;if(t.payer)x.payer=t.payer;if(t.when)x.when=t.when;
  if(t.tid){x.tid=t.tid;x.src="tricount";}else if(x.src==="roadbook")x.src="import";
  x.pre=t.date<tcFrom();return x;
}
function rcNew(t){var x={id:t.tid?"t"+t.tid:newExpId("i"),date:t.date,title:t.title,amt:t.amt,cur:t.cur,cat:t.cat,payer:t.payer||"",when:t.when||"",src:t.tid?"tricount":"import",pre:t.date<tcFrom()};if(t.eur!=null)x.eur=t.eur;if(t.tid)x.tid=t.tid;return x;}
function rcApply(){
  if(!RC.rows)return;
  var n=RC.rows.filter(function(r){return r.kind!=="same"&&RC.sel[r.key];}).length;
  var before=expActive().slice(),beforeTot=sumEur(before),after=rcResult(RC.rows,RC.sel),tcTot=sumEur(RC.list);
  if(!confirm("Appliquer "+n+" correction(s) ?\nTotal de l’app : "+eurTxt(beforeTot)+" → "+eurTxt(sumEur(after))+" (Tricount : "+eurTxt(tcTot)+").\nUne sauvegarde est faite avant."))return;
  if(!backup("Avant synchronisation avec Tricount"))return;
  var inactive=S.exp.filter(function(e){return before.indexOf(e)<0;});
  S.exp=inactive.concat(after);
  if(RC.src==="live")S.budget.tcTruth=true;
  save();
  var now=expActive();
  RC.done={before:catTotals(before),beforeTot:beforeTot,after:catTotals(now),afterTot:sumEur(now),tc:catTotals(RC.list),tcTot:tcTot,n:n};
  RC.rows=null;RC.list=RC.list;toast("Corrections appliquées");render(true);
}
function rcTable(cols){
  var keys=[];cols.forEach(function(c){Object.keys(c[1]).forEach(function(k){if(keys.indexOf(k)<0&&Math.abs(c[1][k])>=0.005)keys.push(k);});});
  keys.sort(function(a,b){return CATS.map(function(c){return c[0];}).indexOf(a)-CATS.map(function(c){return c[0];}).indexOf(b);});
  var h='<table class="small" style="width:100%;border-collapse:collapse;margin-top:8px"><tr><th style="text-align:left">Catégorie</th>'+cols.map(function(c){return '<th style="text-align:right">'+esc(c[0])+'</th>';}).join("")+'</tr>';
  keys.forEach(function(k){h+='<tr style="border-top:1px solid var(--line)"><td>'+esc(catName(k))+'</td>'+cols.map(function(c,i){var v=c[1][k]||0,ref=cols[cols.length-1][1][k]||0;var bad=i<cols.length-1&&cols[i][0]!=="Avant"&&Math.abs(v-ref)>1;return '<td style="text-align:right'+(bad?';color:var(--alert)':'')+'">'+eurTxt(v)+'</td>';}).join("")+'</tr>';});
  h+='<tr style="border-top:2px solid var(--line);font-weight:700"><td>Total</td>'+cols.map(function(c){return '<td style="text-align:right">'+eurTxt(c[2])+'</td>';}).join("")+'</tr></table>';
  return h;
}
function rcRowHtml(r){
  var on=RC.sel[r.key],cb='<input type="checkbox" data-a="rcsel" data-k="'+esc(r.key)+'"'+(on?' checked':'')+' style="flex:none;width:22px;height:22px">';
  var side=function(e,lbl){return '<span class="small"><span class="muted">'+lbl+' :</span> '+esc(e.date)+' · '+esc(e.title)+' · <b>'+amtTxt(e)+'</b>'+(e.cur!=="EUR"?' ('+eurTxt(lbl==="Tricount"?rcEur(e):toEur(e))+')':'')+'</span>';};
  var body=r.kind==="missing"?side(r.t,"Tricount")+'<br><span class="small muted">À ajouter dans l’app · '+esc(catName(r.t.cat))+'</span>'
    :r.kind==="extra"?side(r.a,"App")+'<br><span class="small muted">Absente de Tricount : à supprimer de l’app'+(r.a.src==="roadbook"?' (réservation du roadbook)':'')+'</span>'
    :side(r.a,"App")+'<br>'+side(r.t,"Tricount")+(r.kind==="diff"?'<br><span class="small" style="color:var(--alert)">Écart : '+eurTxt(rcEur(r.t)-toEur(r.a))+' · l’app prendra la valeur de Tricount</span>':'');
  return '<label class="ck" style="align-items:flex-start;gap:10px;padding:8px 0;border-top:1px solid var(--line)">'+cb+'<span style="flex:1">'+body+'</span></label>';
}
function rcHtml(){
  var h='<div class="card" id="rc-card"><h3>Synchroniser avec Tricount</h3>';
  if(RC.done){
    var d=RC.done,gap=d.afterTot-d.tcTot,ok=Math.abs(gap)<=5;
    h+='<p class="small" style="font-weight:700;color:'+(ok?'var(--ok)':'var(--alert)')+'">'+(ok?'✓ Total de l’app = total Tricount':'⚠ Écart avec Tricount')+' : '+eurTxt(d.afterTot)+' contre '+eurTxt(d.tcTot)+' (écart '+eurTxt(gap)+')</p>';
    h+='<p class="small muted">'+d.n+' correction(s) appliquée(s). Récapitulatif par catégorie :</p>'+rcTable([["Avant",d.before,d.beforeTot],["Après",d.after,d.afterTot],["Tricount",d.tc,d.tcTot]]);
    h+='<div class="row" style="margin-top:10px"><button class="cp" data-a="rcclose">Fermer</button><button class="cp" data-a="rclive">Comparer à nouveau</button></div></div>';
    return h;
  }
  if(!RC.rows){
    h+='<p class="small">L’app compare ses dépenses à celles de Tricount, vous montre les différences, puis corrige ce que vous validez. Remboursements entre vous ignorés, montant total et devise de Tricount conservés.</p>';
    if(tcPossible())h+='<div class="row" style="margin-top:8px"><button class="btn" data-a="rclive"'+(RC.busy?' disabled':'')+'>'+(RC.busy?'Lecture de Tricount…':'Lire Tricount et comparer')+'</button></div>';
    h+='<details style="margin-top:10px"><summary class="small">Coller une liste, importer un CSV ou une capture</summary><div style="margin-top:8px"><textarea id="rc-paste" class="txt" rows="5" placeholder="Une dépense par ligne (12/11 Taxi 120 THB) ou le contenu d’un export CSV de Tricount">'+esc(RC.paste)+'</textarea>'
      +'<div class="row" style="margin-top:8px"><button class="btn alt" data-a="rcpaste">Comparer cette liste</button><button class="cp" data-a="rccsv">Importer un CSV</button><input type="file" id="rc-file" accept=".csv,text/csv,text/plain" data-a="rcfile" hidden><button class="cp" data-a="rcshot">Capture → Assistant</button></div></div></details>';
    if(RC.err)h+='<p class="small" style="color:var(--alert);margin-top:8px">'+esc(RC.err)+'</p>';
    return h+'</div>';
  }
  var rows=RC.rows,g=function(k){return rows.filter(function(r){return r.kind===k;});},before=expActive(),after=rcResult(rows,RC.sel);
  h+='<p class="small muted">Source : '+({live:"Tricount, lu à l’instant",paste:"liste collée",csv:"fichier CSV",capture:"capture lue par l’assistant"}[RC.src]||RC.src)+' · '+RC.list.length+' dépenses</p>';
  h+=rcTable([["Avant",catTotals(before),sumEur(before)],["Après",catTotals(after),sumEur(after)],["Tricount",catTotals(RC.list),sumEur(RC.list)]]);
  var sec=function(k,title,open){var L=g(k);if(!L.length)return "";return '<details style="margin-top:10px"'+(open?' open':'')+'><summary><b>'+title+' ('+L.length+')</b></summary><div class="row" style="margin:6px 0"><button class="cp" data-a="rcall" data-v="'+k+'" data-id="1">Tout cocher</button><button class="cp" data-a="rcall" data-v="'+k+'" data-id="0">Tout décocher</button></div>'+L.map(rcRowHtml).join("")+'</details>';};
  if(RC.src!=="live"&&g("extra").length>Math.max(3,RC.list.length/2))h+='<p class="small" style="color:var(--alert);margin-top:8px">La liste lue semble incomplète : tout ce qui n’y figure pas est proposé à la suppression. Décochez « En trop dans l’app » si la liste ne contient pas toutes les dépenses.</p>';
  h+=sec("diff","Montants différents",true)+sec("missing","Manquantes dans l’app",true)+sec("extra","En trop dans l’app",true)+sec("same","Identiques (liées à Tricount)",false);
  if(!g("diff").length&&!g("missing").length&&!g("extra").length)h+='<p class="small" style="color:var(--ok);margin-top:8px">✓ Aucune différence avec Tricount.</p>';
  h+='<div class="row" style="margin-top:12px"><button class="btn" data-a="rcapply">Appliquer les corrections cochées</button><button class="btn alt" data-a="rcclose">Annuler</button></div>';
  h+='<p class="small muted" style="margin-top:6px">Rien n’est modifié avant votre validation. Une sauvegarde est faite juste avant.</p>';
  return h+'</div>';
}

/* --- budget prévisionnel d’après Tricount (12 novembre) --- */
var TC_FORECAST={id:"tricount-2026-11-12-v2",label:"valeurs Tricount du 12 novembre",total:4000,max:4400,
  spent:{vols:1696,hebergement:1248,excursions:421,nourriture:156,transport:160,shopping:25},
  /* reste à payer d’ici la fin : [clé, libellé, THB, catégorie, mots-clés, du, au] ; repéré automatiquement dans Tricount une fois payé */
  reste:[["kao","Transfert Khao Sok → Ao Nang",3000,"transport",/khao ?sok|ao ?nang|krabi/i,"2026-11-13","2026-11-16"],
    ["anmk","Transfert Ao Nang → Mai Khao",3000,"transport",/mai ?khao|phuket|ao ?nang/i,"2026-11-17","2026-11-19"],
    ["lac","Taxe du lac (espèces)",680,"excursions",/lac|lake|cheo?w|ratchaprapha/i,"2026-11-12","2026-11-19"],
    ["phiphi","Parc de Phi Phi (espèces)",800,"excursions",/phi ?phi/i,"2026-11-12","2026-11-19"],
    ["railay","Bateau de Railay (espèces)",400,"excursions",/rail[ae]y/i,"2026-11-12","2026-11-19"],
    ["hong","Parc de Hong Islands (espèces)",600,"excursions",/hong/i,"2026-11-12","2026-11-19"]],
  resteLabel:"transferts Khao Sok → Ao Nang et Ao Nang → Mai Khao, espèces pour la taxe du lac, Phi Phi, Railay et Hong Islands",foodDay:25,foodDays:7};
function restePaid(k){var B=S.budget||{};return !!(B.restePaid&&B.restePaid[k]);}
/* repère dans Tricount les paiements du reste à payer (montant en THB proche, mot-clé ou période) */
function resteAuto(){
  var B=S.budget;if(!B||!B.forecastV)return false;B.restePaid=B.restePaid||{};
  var used={},changed=false;Object.keys(B.restePaid).forEach(function(k){var v=B.restePaid[k];if(typeof v==="string")used[v.slice(5)]=1;});
  resteItems().forEach(function(x){
    if(B.restePaid[x[0]]!=null)return;/* déjà payé, ou décoché à la main : on n’y touche plus */
    var cand=S.exp.filter(function(e){if(!e.tid||used[e.tid]||e.cur!=="THB"||e.date<x[5]||e.date>x[6])return false;var d=Math.abs(e.amt-x[2])/x[2];return d<=0.15&&(x[4].test(e.title)||x[4].test(normH(e.title))||(d<=0.03&&e.cat===x[3]));});
    cand.sort(function(a,b){return (x[4].test(b.title)?1:0)-(x[4].test(a.title)?1:0)||Math.abs(a.amt-x[2])-Math.abs(b.amt-x[2]);});
    if(cand[0]){B.restePaid[x[0]]="auto:"+cand[0].tid;used[cand[0].tid]=1;changed=true;}
  });
  if(changed){B.resteTHB=resteTHB();save();}
  return changed;
}
function kwRegex(label){var w=normH(label).split(/[^a-z0-9]+/).filter(function(x){return x.length>3&&!/^(transfert|bateau|especes|parc|taxe|frais|pour|avec)$/.test(x);});return w.length?new RegExp(w.join("|"),"i"):/$^/;}
/* postes du reste à payer : [clé, libellé, THB, catégorie, mots-clés, du, au] */
function resteItems(){
  var B=S.budget||{},rm=B.resteRemoved||{},am=B.resteAmt||{};
  var L=TC_FORECAST.reste.filter(function(x){return !rm[x[0]];}).map(function(x){return [x[0],x[1],am[x[0]]!=null?am[x[0]]:x[2],x[3],x[4],x[5],x[6]];});
  (B.resteExtra||[]).forEach(function(e){L.push([e.k,e.label,am[e.k]!=null?am[e.k]:e.thb,e.cat,kwRegex(e.label),e.from||"2026-11-12","2026-11-19"]);});
  return L;
}
function resteTHB(){var t=0;resteItems().forEach(function(x){if(!restePaid(x[0]))t+=x[2];});return t;}
function resteLabelTxt(){var L=resteItems().filter(function(x){return !restePaid(x[0]);}).map(function(x){return x[1].replace(/ \(espèces\)$/,"");});return L.length?L.join(", "):"rien";}
function forecastCats(){
  var f=TC_FORECAST,r=S.set.rate||37.71,c=JSON.parse(JSON.stringify(f.spent));
  c.nourriture=Math.round((c.nourriture+f.foodDay*f.foodDays)*100)/100;
  resteItems().forEach(function(x){c[x[3]]=Math.round(((c[x[3]]||0)+x[2]/r)*100)/100;});
  return c;
}
function forecastHtml(){
  var B=S.budget||{},f=TC_FORECAST,r=S.set.rate||37.71,nc=forecastCats(),applied=B.forecastV===f.id;
  var spent=0;Object.keys(f.spent).forEach(function(k){spent+=f.spent[k];});
  var resteAll=0;resteItems().forEach(function(x){resteAll+=x[2];});
  var food=f.foodDay*f.foodDays,end=spent+resteAll/r+food;
  var h='<details class="card"'+(applied?'':' open')+'><summary>Budget prévisionnel ('+esc(f.label)+')'+(applied?' · appliqué':'')+'</summary><div>';
  h+='<p class="small">Dépensé selon Tricount : <b>'+eurTxt(spent)+'</b>. À payer d’ici la fin : <b>'+thbTxt(resteAll)+' ≈ '+eurTxt(resteAll/r)+'</b>, plus '+f.foodDays+' jours de repas pour deux à '+eurTxt(f.foodDay)+' = '+eurTxt(food)+'.</p>';
  h+='<p class="small" style="margin-top:6px"><b>Prévision fin de voyage : '+eurTxt(end)+'</b> · objectif '+eurTxt(f.total)+' ('+(end<=f.total?'tenu':'<span style="color:var(--alert)">dépassé de '+eurTxt(end-f.total)+'</span>')+') · maximum '+eurTxt(f.max)+' ('+(end<=f.max?'reste '+eurTxt(f.max-end):'<span style="color:var(--alert)">dépassé</span>')+').</p>';
  var cur=B.cats||{},keys=CATS.map(function(c){return c[0];}).filter(function(k){return cur[k]||nc[k];});
  h+='<table class="small" style="width:100%;border-collapse:collapse;margin-top:8px"><tr><th style="text-align:left">Catégorie</th><th style="text-align:right">Avant</th><th style="text-align:right">Après</th></tr>'
    +keys.map(function(k){return '<tr style="border-top:1px solid var(--line)"><td>'+esc(catName(k))+'</td><td style="text-align:right">'+(cur[k]?eurTxt(parseFloat(cur[k])):"—")+'</td><td style="text-align:right">'+(nc[k]?eurTxt(nc[k]):"—")+'</td></tr>';}).join("")+'</table>';
  h+='<p class="small muted" style="margin-top:6px">Transport : dépensé + transferts. Excursions : dépensé + espèces pour les frais. Nourriture : dépensé + repas des jours restants. Budget des repas du jour : '+eurTxt(f.foodDay)+'.</p>';
  h+='<div class="row" style="margin-top:8px"><button class="'+(applied?'cp':'btn')+'" data-a="fcapply">'+(applied?'Réappliquer ce budget':'Appliquer ce budget')+'</button></div>';
  h+='<p class="small" style="margin-top:12px"><b>À payer d’ici la fin</b> · repéré automatiquement dans Tricount une fois payé (sinon, cochez à la main)</p>';
  resteItems().forEach(function(x){var pv=B.restePaid&&B.restePaid[x[0]],ae=typeof pv==="string"?S.exp.filter(function(e){return e.tid===pv.slice(5);})[0]:null;h+='<label class="ck"><input type="checkbox" data-a="restepaid" data-id="'+x[0]+'"'+(restePaid(x[0])?' checked':'')+'><span style="flex:1'+(restePaid(x[0])?';opacity:.6':'')+'"><span'+(restePaid(x[0])?' style="text-decoration:line-through"':'')+'>'+esc(x[1])+'</span>'+(ae?'<br><span class="small" style="color:var(--ok)">Payé : trouvé dans Tricount (« '+esc(ae.title)+' », '+esc(ae.date)+')</span>':'')+'</span><b>'+thbTxt(x[2])+'</b><span class="small muted" style="flex:none;margin-left:6px">≈ '+eurTxt(x[2]/r)+'</span></label>';});
  h+='<p class="small" style="margin-top:4px">Reste : <b>'+thbTxt(resteTHB())+' ≈ '+eurTxt(resteTHB()/r)+'</b></p>';
  h+='<label class="small" style="display:block;margin-top:10px">Repas pour deux par jour restant (€)<input type="number" inputmode="decimal" data-a="bud" data-k="foodDay" value="'+esc(B.foodDay!=null?B.foodDay:"")+'" placeholder="'+f.foodDay+'"></label>';
  return h+'</div></details>';
}
function forecastApply(){
  var f=TC_FORECAST,nc=forecastCats();
  if(!confirm("Remplacer le budget prévisionnel par les "+f.label+" ?\nUne sauvegarde est faite avant."))return;
  if(!backup("Avant mise à jour du budget prévisionnel"))return;
  S.budget=S.budget||{};S.budget.cats=nc;S.budget.total=f.total;S.budget.max=f.max;S.budget.foodDay=f.foodDay;S.budget.forecastV=f.id;
  S.budget.dcat=S.budget.dcat||{};S.budget.dcat.nourriture=f.foodDay;
  S.budget.resteTHB=resteTHB();
  save();resteAuto();toast("Budget prévisionnel mis à jour");render(true);
}
function resteToggle(k,on){
  if(!backup("Avant changement du reste à payer"))return;
  S.budget=S.budget||{};S.budget.restePaid=S.budget.restePaid||{};S.budget.restePaid[k]=on?true:false;
  if(S.budget.forecastV)S.budget.resteTHB=resteTHB();save();if(on)resteAuto();var y=window.scrollY;render(true);window.scrollTo(0,y);
}
/* prévision : dépensé + reste à payer + nourriture des jours restants */
function forecastStats(b){
  var B=S.budget||{};if(B.resteTHB==null||B.resteTHB==="")return null;
  var today=dateKey(nowMs(),TRIP_TZ),days=DAYS.filter(function(d){return d.date>today;}).length,food=(parseFloat(B.foodDay)||0)*days,reste=(parseFloat(B.resteTHB)||0)/(S.set.rate||37.71);
  return {reste:reste,food:food,days:days,end:b.tot+reste+food};
}
/* contrôle permanent : total de l’app comparé au dernier total lu dans Tricount */
function tcCheckHtml(){
  if(!S.tcSync||S.tcSync.totalAll==null)return "";
  var app=sumEur(expActive()),gap=app-S.tcSync.totalAll,ok=Math.abs(gap)<=5;
  return '<p class="small" style="margin-top:6px;color:'+(ok?'var(--ok)':'var(--alert)')+'">'+(ok?'✓ ':'⚠ ')+'Total app '+eurTxt(app)+' · Tricount '+eurTxt(S.tcSync.totalAll)+(ok?'':' · écart '+eurTxt(gap)+' : touchez « Lire Tricount et comparer » plus bas')+'</p>';
}

/* --- blocs DEPENSES_MODIF, DEPENSES_SUPPR et TRICOUNT_LISTE de l’assistant --- */
var AI_FIELDS={montant:"montant",amount:"montant",devise:"devise",currency:"devise",titre:"titre",title:"titre",date:"date",categorie:"categorie","catégorie":"categorie",category:"categorie",payeur:"payeur",payer:"payeur"};
function expById(id){return S.exp.filter(function(e){return e.id===id;})[0]||null;}
function aiModPreview(o){
  var e=expById(o.id),f=AI_FIELDS[o.champ];if(!e)return {ok:false,txt:"Identifiant inconnu : "+o.id};if(!f)return {ok:false,txt:"Champ inconnu : "+o.champ};
  var v=o.valeur,old,nw;
  if(f==="montant"){v=parseFloat(v);if(!isFinite(v)||!v)return {ok:false,txt:e.title+" : montant invalide"};old=amtTxt(e);nw=amtTxt({amt:v,cur:e.cur});}
  else if(f==="devise"){v=String(v||"").toUpperCase().replace("€","EUR").replace("฿","THB");if(!/^[A-Z]{3}$/.test(v))return {ok:false,txt:e.title+" : devise invalide"};old=e.cur;nw=v;}
  else if(f==="date"){v=parseDateStr(v);if(!v)return {ok:false,txt:e.title+" : date invalide"};old=e.date;nw=v;}
  else if(f==="categorie"){v=String(v||"").toLowerCase();if(!CATN[v])return {ok:false,txt:e.title+" : catégorie inconnue"};old=catName(e.cat);nw=catName(v);}
  else{v=String(v||"").slice(0,100);old=f==="titre"?e.title:(e.payer||"—");nw=v;}
  return {ok:true,e:e,f:f,v:v,txt:e.title+" · "+({montant:"montant",devise:"devise",titre:"titre",date:"date",categorie:"catégorie",payeur:"payé par"}[f])+" : "+old+" → "+nw};
}
function aiModApply(list){
  var P=(list||[]).map(aiModPreview).filter(function(p){return p.ok;});if(!P.length){toast("Aucune modification valide");return null;}
  if(!backup("Avant modifications proposées par l’assistant"))return null;
  P.forEach(function(p){var e=p.e;
    if(p.f==="montant"){e.amt=Math.round(p.v*100)/100;if(e.cur==="EUR")e.eur=e.amt;else delete e.eur;}
    else if(p.f==="devise"){e.cur=p.v;if(p.v==="EUR")e.eur=e.amt;else delete e.eur;}
    else if(p.f==="date")e.date=p.v;else if(p.f==="categorie"){e.cat=p.v;e.catUser=true;}else if(p.f==="titre")e.title=p.v;else e.payer=p.v;
    e.edited=Date.now();});
  save();toast(P.length+" modification(s) appliquée(s)");return P.length+" modification(s) appliquée(s)";
}
function aiDelApply(ids){
  var L=(ids||[]).map(expById).filter(Boolean);if(!L.length){toast("Aucune dépense à supprimer");return null;}
  if(!confirm("Supprimer "+L.length+" dépense(s) ("+eurTxt(sumEur(L))+") ?"))return null;
  if(!backup("Avant suppressions proposées par l’assistant"))return null;
  S.exp=S.exp.filter(function(e){return L.indexOf(e)<0;});save();toast(L.length+" dépense(s) supprimée(s)");return L.length+" dépense(s) supprimée(s)";
}
function aiExpCards(m,i){
  var h="";
  if(m.mod&&m.mod.length){
    var P=m.mod.map(aiModPreview);
    h+='<div class="prop"><b>Corrections de dépenses proposées ('+P.length+')</b><ul class="small">'+P.map(function(p){return '<li'+(p.ok?'':' style="color:var(--alert)"')+'>'+esc(p.txt)+'</li>';}).join("")+'</ul>';
    h+=m.modApplied?'<p class="small" style="color:'+(m.modApplied==="Ignorée"?'var(--muted)':'var(--ok)')+';font-weight:700">'+esc(m.modApplied)+'</p>':'<div class="row"><button class="btn" data-a="modapply" data-i="'+i+'">Appliquer</button><button class="btn alt" data-a="modignore" data-i="'+i+'">Ignorer</button></div>';
    h+='</div>';
  }
  if(m.del&&m.del.length){
    h+='<div class="prop"><b>Suppressions proposées ('+m.del.length+')</b><ul class="small">'+m.del.map(function(id){var e=expById(id);return e?'<li>'+esc(e.date)+' · '+esc(e.title)+' · '+amtTxt(e)+(e.cur!=="EUR"?' ('+eurTxt(toEur(e))+')':'')+'</li>':'<li style="color:var(--alert)">Identifiant inconnu : '+esc(id)+'</li>';}).join("")+'</ul>';
    h+=m.delApplied?'<p class="small" style="color:'+(m.delApplied==="Ignorée"?'var(--muted)':'var(--ok)')+';font-weight:700">'+esc(m.delApplied)+'</p>':'<div class="row"><button class="btn" data-a="delapply" data-i="'+i+'">Appliquer</button><button class="btn alt" data-a="delignore" data-i="'+i+'">Ignorer</button></div>';
    h+='</div>';
  }
  if(m.tcl&&m.tcl.length){
    var tt=0;m.tcl.forEach(function(o){tt+=o.eur!=null?parseFloat(o.eur):toEur({amt:o.amt,cur:o.cur});});
    h+='<div class="prop"><b>Liste Tricount lue : '+m.tcl.length+' dépense(s)</b> · '+eurTxt(tt)+'<div class="row" style="margin-top:6px"><button class="btn" data-a="tclcompare" data-i="'+i+'">Comparer avec l’app</button></div></div>';
  }
  return h;
}


/* --- bloc BUDGET_MODIF : l’assistant propose des changements de réglages du budget --- */
var BUD_FIELDS={objectif:"objectif",total:"objectif",maximum:"maximum",max:"maximum",jour:"jour",budget_jour:"jour",categorie:"categorie","catégorie":"categorie",poste_jour:"poste_jour",repas_jour:"repas_jour",reste_ajout:"reste_ajout",reste_modif:"reste_modif",reste_paye:"reste_paye","reste_payé":"reste_paye",reste_suppr:"reste_suppr"};
function budNum(v){var n=parseFloat(String(v).replace(",","."));return isFinite(n)?Math.round(n*100)/100:NaN;}
function budDayGroup(k){return DAY_GROUPS.filter(function(g){return g[0]===k;})[0]||null;}
function budPreview(o){
  var B=S.budget||{},f=BUD_FIELDS[String(o.champ||"").toLowerCase()],r=S.set.rate||37.71,v=budNum(o.valeur),k=String(o.cle||o.key||"").toLowerCase(),it,dB=budgetStats().dailyB;
  var bad=function(t){return {ok:false,txt:t};},euro=function(x){return x===""||x==null||!isFinite(parseFloat(x))?"—":eurTxt(parseFloat(x));};
  if(!f)return bad("Réglage inconnu : "+o.champ);
  if(f==="objectif"||f==="maximum"||f==="jour"||f==="repas_jour"){if(!(v>=0))return bad("Montant invalide pour « "+o.champ+" »");
    var key={objectif:"total",maximum:"max",jour:"daily",repas_jour:"foodDay"}[f],lbl={objectif:"Objectif du voyage",maximum:"Maximum du voyage",jour:"Budget du jour (hors gros paiements)",repas_jour:"Repas pour deux par jour"}[f];
    return {ok:true,f:f,key:key,v:v,txt:lbl+" : "+euro(f==="jour"?(B.daily||dB):B[key])+" → "+eurTxt(v)};}
  if(f==="categorie"){if(!CATN[k])return bad("Catégorie inconnue : "+k);if(!(v>=0))return bad("Montant invalide pour "+catName(k));return {ok:true,f:f,k:k,v:v,txt:"Budget "+catName(k)+" : "+euro(B.cats&&B.cats[k])+" → "+eurTxt(v)};}
  if(f==="poste_jour"){var g=budDayGroup(k);if(!g)return bad("Poste du jour inconnu : "+k);if(!(v>=0))return bad("Montant invalide pour "+g[1]);return {ok:true,f:f,k:k,v:v,txt:"Budget du jour « "+g[1]+" » : "+eurTxt(dayGroupBudget(g,dB))+" → "+eurTxt(v)};}
  if(f==="reste_ajout"){var m=budNum(o.montant!=null?o.montant:o.valeur),cu=String(o.devise||"THB").toUpperCase(),lab=String(o.libelle||o.titre||"").trim().slice(0,80),ct=String(o.categorie||"transport").toLowerCase();
    if(!lab)return bad("Libellé manquant pour le reste à payer");if(!(m>0))return bad("Montant invalide pour « "+lab+" »");if(!CATN[ct])ct="autre";
    var thb=Math.round(cu==="EUR"?m*r:m);return {ok:true,f:f,lab:lab,thb:thb,cat:ct,txt:"Reste à payer + « "+lab+" » : "+thbTxt(thb)+" ≈ "+eurTxt(thb/r)+" ("+catName(ct)+")"};}
  it=resteItems().filter(function(x){return x[0]===k;})[0];
  if(!it)return bad("Poste du reste à payer inconnu : "+k);
  if(f==="reste_modif"){var m2=budNum(o.montant!=null?o.montant:o.valeur),cu2=String(o.devise||"THB").toUpperCase();if(!(m2>=0))return bad("Montant invalide pour « "+it[1]+" »");var t2=Math.round(cu2==="EUR"?m2*r:m2);return {ok:true,f:f,k:k,thb:t2,txt:"Reste à payer « "+it[1]+" » : "+thbTxt(it[2])+" → "+thbTxt(t2)};}
  if(f==="reste_paye"){var on=!(o.valeur===false||/^(non|false|0)$/i.test(String(o.valeur)));return {ok:true,f:f,k:k,on:on,txt:"« "+it[1]+" » : "+(on?"marqué payé":"remis à payer")};}
  return {ok:true,f:"reste_suppr",k:k,txt:"Retirer « "+it[1]+" » ("+thbTxt(it[2])+") du reste à payer"};
}
function budApply(list){
  var P=(list||[]).map(budPreview).filter(function(p){return p.ok;});if(!P.length){toast("Aucun changement valide");return null;}
  if(!backup("Avant changements du budget proposés par l’assistant"))return null;
  var B=S.budget=S.budget||{};
  P.forEach(function(p){
    if(p.key){B[p.key]=p.v;if(p.f==="repas_jour"){B.dcat=B.dcat||{};B.dcat.nourriture=p.v;}}
    else if(p.f==="categorie"){B.cats=B.cats||{};B.cats[p.k]=p.v;}
    else if(p.f==="poste_jour"){B.dcat=B.dcat||{};B.dcat[p.k]=p.v;}
    else if(p.f==="reste_ajout"){B.resteExtra=B.resteExtra||[];B.resteExtra.push({k:"x"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),label:p.lab,thb:p.thb,cat:p.cat,from:dateKey(nowMs(),TRIP_TZ)});}
    else if(p.f==="reste_modif"){B.resteAmt=B.resteAmt||{};B.resteAmt[p.k]=p.thb;}
    else if(p.f==="reste_paye"){B.restePaid=B.restePaid||{};B.restePaid[p.k]=p.on;}
    else if(p.f==="reste_suppr"){B.resteExtra=(B.resteExtra||[]).filter(function(e){return e.k!==p.k;});if(TC_FORECAST.reste.some(function(x){return x[0]===p.k;})){B.resteRemoved=B.resteRemoved||{};B.resteRemoved[p.k]=true;}if(B.restePaid)delete B.restePaid[p.k];}
  });
  if(B.resteTHB!=null||P.some(function(p){return /^reste_/.test(p.f);}))B.resteTHB=resteTHB();
  save();resteAuto();toast(P.length+" changement(s) du budget appliqué(s)");return P.length+" changement(s) du budget appliqué(s)";
}
function budCard(m,i){
  if(!m.bud||!m.bud.length)return "";
  var P=m.bud.map(budPreview);
  var h='<div class="prop"><b>Changements du budget proposés ('+P.length+')</b><ul class="small">'+P.map(function(p){return '<li'+(p.ok?'':' style="color:var(--alert)"')+'>'+esc(p.txt)+'</li>';}).join("")+'</ul>';
  h+=m.budApplied?'<p class="small" style="color:'+(m.budApplied==="Ignorée"?'var(--muted)':'var(--ok)')+';font-weight:700">'+esc(m.budApplied)+'</p>':'<div class="row"><button class="btn" data-a="budapply" data-i="'+i+'">Appliquer</button><button class="btn alt" data-a="budignore" data-i="'+i+'">Ignorer</button></div>';
  return h+'</div>';
}
function budgetSettingsContext(){
  var B=S.budget||{},r=S.set.rate||37.71,dB=budgetStats().dailyB,L=["","RÉGLAGES DU BUDGET (modifiables avec le bloc BUDGET_MODIF) :"];
  L.push("objectif = "+(B.total||"—")+" € ; maximum = "+(B.max||"—")+" € ; jour (budget du jour hors gros paiements) = "+Math.round(dB*100)/100+" € ; repas_jour (repas pour deux par jour restant) = "+(B.foodDay!=null?B.foodDay:"—")+" €.");
  L.push("categorie (budget du voyage par catégorie, clé = montant) : "+CATS.map(function(c){return c[0]+" = "+(B.cats&&B.cats[c[0]]!=null&&B.cats[c[0]]!==""?B.cats[c[0]]:"—");}).join(" ; ")+".");
  L.push("poste_jour (budget du jour par poste, clé = montant) : "+DAY_GROUPS.map(function(g){return g[0]+" ("+g[1]+") = "+Math.round(dayGroupBudget(g,dB)*100)/100;}).join(" ; ")+".");
  var R=resteItems();L.push("Reste à payer (clé | libellé | THB | payé) : "+(R.length?R.map(function(x){return x[0]+" | "+x[1]+" | "+x[2]+" | "+(restePaid(x[0])?"oui":"non");}).join(" ; "):"aucun")+". Total restant : "+resteTHB()+" THB ≈ "+Math.round(resteTHB()/r)+" €.");
  return L.join("\n");
}

/* ---------- boucle ---------- */
try{var stab=sessionStorage.getItem("thai26-tab");if(stab){UI.tab=stab;sessionStorage.removeItem("thai26-tab");}}catch(e){}
try{var uprev=sessionStorage.getItem("thai26-updated");if(uprev!==null){sessionStorage.removeItem("thai26-updated");setTimeout(function(){toast(typeof BUILD!=="undefined"&&BUILD.t>+uprev?"Mise à jour installée · version "+verLabel():"La mise à jour ne s’est pas installée : réessayez avec « Vérifier les mises à jour »");},600);}}catch(e){}
seedBudget(false);
setTheme();
checkReminders();
render();
aiInit();
if(S.set.geo)startGeo();
if(NATIVE){scheduleAll();if(APPN&&APPN.addListener){APPN.addListener("backButton",function(){if($("#driver").className==="on"){$("#driver").className="";}else if(UI.sheet){closeSheet();}else if(UI.tab!=="today"){UI.tab="today";render();window.scrollTo(0,0);}else if(APPN.minimizeApp){APPN.minimizeApp();}});}}
setInterval(function(){
  var ch=checkReminders();
  if(UI.tab==="today"&&!UI.sheet){
    var active=document.activeElement;
    if(!(active&&/INPUT|SELECT|TEXTAREA/.test(active.tagName)))render(true);
  }else if(ch&&UI.tab==="remind"){render(true);}
},20000);
document.addEventListener("visibilitychange",function(){if(!document.hidden){checkReminders();if(UI.tab==="today")render(true);if(UI.tab==="tricount"&&AI.tc&&(!S.tcSync||Date.now()-S.tcSync.at>60000))tcSync(true);updCheck();}});
setInterval(function(){updCheck();},NATIVE?30000:15000);setTimeout(function(){updCheck();},3000);
try{if(!NATIVE&&"serviceWorker" in navigator&&/^https?:$/.test(location.protocol)){navigator.serviceWorker.register("sw.js").catch(function(){});}}catch(e){}
})();
