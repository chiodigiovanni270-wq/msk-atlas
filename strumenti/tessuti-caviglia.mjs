/* Strati extra-articolari; richiamato dal generatore dopo muscoli e tendini.
   I decorsi sono ricostruzioni su guide esplicite, adattate alle ossa.
   Guaine sulle mesh tendinee; vene profonde rappresentate come coppie satelliti.
   Calibri, borse virtuali e grasso hanno dimensioni didattiche, non misurate. */
import {ritaglia} from './lib-bp3d.mjs';
import {add,sub,mul,dot,len,unit,mix,cross,point,surface,shell,patch,ribbon,curve,tube,ellipsoid,avoid} from './lib-caviglia.mjs';
export function tessuti(meshes,put,options={}){
 const M=Object.fromEntries(meshes.map(m=>[m.n,m])),bones=meshes.filter(m=>['tibia','fibula','talo','calcagno','navicolare','cuboide'].includes(m.n)),raw=bones.map(surface),BS=Object.fromEntries(bones.map((m,i)=>[m.n,raw[i]]));
 const bounded=(S,tendon=false)=>({...S,nearest:p=>{const d=Math.hypot(...p.map((v,k)=>Math.max(S.root.lo[k]-v,0,v-S.root.hi[k])));if(d>.6)return {d,signed:d,p,n:[0,0,0]};const q=S.nearest(p);if(tendon&&q.d>.35)q.signed=q.d;return q;}});
 const B=raw.map(S=>bounded(S));
 const tendonIds=['t_ta','t_ehl','t_edl','t_ft','t_tp','t_fdl','t_fhl','t_fl','t_fb','achille'];
 // Nei tendini BP3D sottili e talvolta non manifold la normale della faccia
 // più vicina non determina l'interno a grande distanza. Il massimo raggio
 // inscritto locale è <3,5 mm: oltre questo limite la distanza è esterna.
 const TS=Object.fromEntries(tendonIds.filter(n=>M[n]).map(n=>[n,bounded(surface(M[n]),true)]));
 const projects=[];
 const par=TS.achille,paratenon=shell(M.achille,(p,i,s)=>add(p,par.nearest(p).n,s?.025:.055));put({id:'paratenon',cat:'tfl',name:'Paratenon del tendine calcaneale',info:'Rivestimento connettivale di scorrimento e nutrizione; non è una guaina sinoviale. Spessore enfatizzato per la visibilità.',o:'Continuità con la fascia crurale e i tessuti peritendinei prossimali.',ins:'Tessuti peritendinei della regione calcaneale.',fn:'Consente lo scorrimento e contribuisce alla vascolarizzazione del tendine.'},paratenon);
 for(const [id,name,b0,b1,c0,c1,U,V]of [
  ['caps_sub','Capsula subtalare posteriore','talo','calcagno',[.1,-1.1,-1.1],[.1,-2.3,-1.1],[1.8,0,0],[0,0,1.4]],
  ['caps_tn','Capsula talonavicolare','talo','navicolare',[.5,-1.2,2.0],[.5,-1.25,3.5],[1.7,0,0],[0,1.1,0]],
  ['caps_cc','Capsula calcaneocuboidea','calcagno','cuboide',[-1.8,-3,1.5],[-1.8,-3,3.2],[1,0,0],[0,1.1,0]]
 ]){const base=patch(24,64,(t,b)=>{const phi=b*2*Math.PI,rad=add(mul(U,Math.cos(phi)),V,Math.sin(phi)),a=BS[b0].nearest(add(c0,rad)),z=BS[b1].nearest(add(c1,rad));return add(mix(a.p,z.p,t),unit(rad),.05+.07*Math.sin(Math.PI*t));}),m=shell(base,(p,i,s)=>{const phi=(i%64)/64*2*Math.PI,rad=unit(add(mul(U,Math.cos(phi)),V,Math.sin(phi)));return add(p,rad,s?-.02:.02);});avoid(m,B,.02);put({id,cat:'caps',name,info:'Involucro articolare ricostruito sui margini ossei. La capsula subtalare posteriore è distinta dalla cavità talocalcaneonavicolare anteriore; i legamenti sono selezionabili separatamente.'},m);}
 function track(P,r){P=curve(P);const guide=P.map(p=>p.slice());for(let pass=0;pass<6;pass++){const prev=P.map(p=>p.slice());for(let i=0;i<P.length;i++){let p=P[i];if(i&&i<P.length-1)p=mix(p,mix(prev[i-1],prev[i+1],.5),.35);for(const S of B){const q=S.nearest(p);if(q.signed<r+.065)p=add(q.p,q.n,r+.065);}P[i]=p;}}return {P,shift:Math.max(...P.map((p,i)=>len(sub(p,guide[i]))))};}
 function vessel(s){const {P,shift}=track(s.p,s.r),m=tube(P,t=>s.r*(1-.22*t),s.ratio||1);avoid(m,B,.035);put(s,m);projects.push({id:s.id,shift});console.log(s.id,'adattamento',shift.toFixed(2),'cm');return P;}
 if(!options.surfacesOnly){
 const arteries=[
 ['a_tib_ant','Arteria tibiale anteriore',.16,[[-1.6,14,.2],[-1.4,8,.5],[-.6,3,1.45],[.05,.2,2.05]],'Scende sulla membrana interossea nel compartimento anteriore, tra i tendini estensori distalmente; continua nella dorsale del piede.'],
 ['a_dorsale','Arteria dorsale del piede (pedidia)',.14,[[.05,.2,2.05],[.1,-.8,3.1],[.0,-1.8,5.4],[-.1,-2.5,8]],'Continuazione della tibiale anteriore, lateralmente al tendine dell’estensore lungo dell’alluce. Rami digitali e arco distale fuori campo.'],
 ['a_tib_post','Arteria tibiale posteriore',.18,[[.6,14,-1.6],[1.0,8,-1.7],[2.3,2,-1.4],[2.75,-1.2,-1.2],[2.35,-3.1,.2]],'Passa dietro il malleolo mediale con le vene satelliti e il nervo tibiale; si divide nei rami plantari sotto l’abduttore dell’alluce.'],
 ['a_fibulare','Arteria fibulare',.13,[[-1.7,14,-1.7],[-1.9,8,-1.6],[-2,3,-1.65],[-2.1,0,-2.1],[-1.5,-3,-3.2]],'Decorre nel compartimento posteriore profondo, medialmente alla fibula. Contribuisce alle reti malleolare laterale e calcaneale.'],
 ['a_plant_med','Arteria plantare mediale',.10,[[2.35,-3.1,.2],[2.2,-3.6,2.5],[1.8,-4,5.5],[1.5,-4.2,8]],'Ramo terminale mediale della tibiale posteriore; accompagna il nervo plantare mediale.'],
 ['a_plant_lat','Arteria plantare laterale',.12,[[2.35,-3.1,.2],[.8,-4.3,2.2],[-1,-4.5,4.6],[-2.5,-4.5,7.8]],'Ramo terminale laterale; procede obliquamente fra flessore breve delle dita e quadrato della pianta. L’arco plantare profondo è fuori campo.'],
 ['a_mall_med','Ramo malleolare anteriore mediale',.055,[[.05,.2,2.05],[1.35,.2,1.8],[2.8,-.1,1.3],[3,-.5,.2]],'Ramo della tibiale anteriore verso la rete malleolare mediale.'],
 ['a_mall_lat','Ramo malleolare anteriore laterale',.055,[[.05,.2,2.05],[-1,.2,1.7],[-2.4,-.2,.65],[-3,-.5,-.1]],'Ramo della tibiale anteriore verso il malleolo laterale.'],
 ['a_perforante','Ramo perforante fibulare',.06,[[-2,3,-1.65],[-1.8,2.5,-.4],[-1.8,2.3,.8],[-2.4,1.3,1.0],[-3,-.5,-.1]],'Attraversa distalmente la membrana interossea e raggiunge la rete anterolaterale.'],
 ['a_calc_med','Rami calcaneali mediali',.06,[[2.7,-1.2,-1.2],[2.6,-2.6,-2.0],[1.9,-4.5,-3.0]],'Rami della tibiale posteriore per il calcagno e i tessuti del tallone mediale.'],
 ['a_calc_lat','Rami calcaneali laterali',.055,[[-2.1,0,-2.1],[-2.25,-2.5,-2.6],[-1.5,-4.7,-3.4]],'Rami terminali fibulari per la regione calcaneale laterale.'],
 ['a_tars_med','Rami tarsali mediali',.05,[[.1,-.8,3.1],[1.3,-1,3.3],[2,-1.7,4.4]],'Rami della dorsale del piede diretti al margine mediale del tarso.'],
 ['a_tars_lat','Arteria tarsale laterale',.065,[[.1,-.8,3.1],[-1,-1.4,3.4],[-2.4,-2,4.4]],'Passa in profondità all’estensore breve delle dita e raggiunge il tarso laterale.']
 ];
 const tracks={};for(const [id,name,r,p,info]of arteries)tracks[id]=vessel({id,cat:'art',name,info,p,r});
 // Coppie di vene comitanti, mantenute nella stessa scheda.
 for(const [a,name]of [['a_tib_ant','Vene tibiali anteriori'],['a_tib_post','Vene tibiali posteriori'],['a_fibulare','Vene fibulari'],['a_dorsale','Vene dorsali profonde del piede'],['a_plant_med','Vene plantari mediali'],['a_plant_lat','Vene plantari laterali']]){
  const id=a.replace('a_','v_'),P=tracks[a],r=a.includes('tib_')?.11:.08,parts=[];
  for(const sign of [-1,1]){const Q=P.map((p,i)=>{const T=unit(sub(P[Math.min(i+1,P.length-1)],P[Math.max(0,i-1)])),N=unit(cross(T,[0,0,1]));return add(p,N,sign*(r+.19));}),m=tube(Q,r);avoid(m,B,.035);parts.push(m);}
  const p=[],ix=[];for(const m of parts){const off=p.length/3;p.push(...m.pos);for(const i of m.idx)ix.push(i+off);}put({id,cat:'ven',name,info:'Coppia di vene satelliti del vaso arterioso corrispondente; decorso ricostruito. Valvole e microcircolo non rappresentati.'},{pos:Float64Array.from(p),idx:Uint32Array.from(ix)});
 }
 vessel({id:'v_safena_grande',cat:'ven',name:'Vena grande safena – tratto malleolare',info:'Vena superficiale: passa anteriormente al malleolo mediale e risale il versante mediale della gamba. Prosegue oltre il campo.',r:.16,p:[[2.6,-3.1,7.8],[3,-1.4,3.7],[3.55,.5,1.5],[3.45,5,.6],[3.2,14,.2]]});
 vessel({id:'v_safena_piccola',cat:'ven',name:'Vena piccola safena – tratto distale',info:'Vena superficiale: passa dietro il malleolo laterale e risale posteriormente, in rapporto con il nervo surale.',r:.13,p:[[-3.6,-3.4,7.8],[-3.8,-3.4,2.2],[-3.6,-.4,-2.3],[-2,4,-3.9],[-.3,14,-4.2]]});
 const nerves=[
 ['n_tibiale','Nervo tibiale',.16,[[.9,14,-2.2],[1.2,8,-2.2],[2.2,2,-2],[2.7,-1.2,-1.8],[2.3,-3.3,-.2]],'Nervo misto. Nel tunnel tarsale è posteriore al fascio vascolare; dà rami calcaneali e si divide nei nervi plantari. Innerva i muscoli posteriori della gamba e, tramite i rami plantari, gran parte dei muscoli intrinseci.'],
 ['n_plant_med','Nervo plantare mediale',.11,[[2.3,-3.3,-.2],[2.15,-3.9,2.5],[1.5,-4.3,5.5],[1.2,-4.3,8]],'Misto: sensibilità della pianta mediale e delle tre dita e mezzo mediali; motricità di abduttore dell’alluce, flessore breve delle dita, flessore breve dell’alluce e primo lombricale.'],
 ['n_plant_lat','Nervo plantare laterale',.10,[[2.3,-3.3,-.2],[.6,-4.6,2.2],[-1.3,-4.8,4.6],[-2.8,-4.8,7.8]],'Misto: innerva gran parte dei restanti muscoli intrinseci e la cute della pianta laterale e del dito e mezzo laterale.'],
 ['n_calc_med','Rami calcaneali mediali',.065,[[2.6,-.8,-1.9],[2.85,-2.3,-2.3],[2.1,-4.5,-3.8]],'Sensitivi per il tallone mediale e plantare. Origine e numero variabili; è mostrato un decorso esemplificativo dal tibiale.'],
 ['n_baxter','Nervo calcaneale inferiore (di Baxter)',.055,[[2.2,-3.4,.1],[1.8,-4.4,-.4],[.5,-4.9,-1.5],[-1.7,-4.9,-1.8]],'Primo ramo del plantare laterale: prevalentemente motorio per l’abduttore del quinto dito, con fibre sensitive profonde; decorso profondo all’abduttore dell’alluce.'],
 ['n_fib_prof','Nervo fibulare profondo',.085,[[-1.4,14,.45],[-1.15,8,.8],[-.35,3,1.65],[.35,.2,2.15],[.4,-.9,3.3],[.25,-2.3,8]],'Misto: innerva i muscoli anteriori e gli estensori brevi. Il ramo terminale mediale raggiunge la cute del primo spazio interdigitale, fuori campo; passa sotto i retinacoli estensori.'],
 ['n_fib_prof_lat','Ramo laterale del fibulare profondo',.055,[[.4,-.9,3.3],[-.8,-1.5,3.8],[-1.8,-2,4.7]],'Prevalentemente motorio per estensore breve delle dita e dell’alluce; contiene afferenze articolari.'],
 ['n_fib_sup','Nervo fibulare superficiale',.09,[[-3.6,14,.2],[-3.8,8,.6],[-3.9,4,1.2],[-3.2,1,2.0],[-1.9,-.6,3.4]],'Misto prossimalmente, sensitivo dopo l’emergenza dalla fascia crurale. Innerva i fibulari e la maggior parte del dorso del piede attraverso i rami cutanei dorsali.'],
 ['n_dors_med','Nervo cutaneo dorsale mediale',.06,[[-1.9,-.6,3.4],[-.5,-.7,4.3],[1.4,-2.1,7.8]],'Ramo sensitivo del fibulare superficiale per il dorso mediale del piede, escluso il primo spazio interdigitale.'],
 ['n_dors_int','Nervo cutaneo dorsale intermedio',.06,[[-1.9,-.6,3.4],[-2.4,-1.7,4.8],[-3,-3.1,7.8]],'Ramo sensitivo del fibulare superficiale per il dorso centrale e laterale del piede; territorio variabile.'],
 ['n_surale','Nervo surale',.085,[[-.5,14,-4.4],[-2.3,6,-4],[-3.4,1,-2.6],[-3.5,-1.6,-1.6],[-3.8,-3,3],[-3.8,-3.5,8]],'Sensitivo. Passa dietro il malleolo laterale con la piccola safena e prosegue lungo il margine laterale del piede.'],
 ['n_calc_lat','Rami calcaneali laterali',.05,[[-3.4,.3,-2.5],[-2.9,-2.4,-3.5],[-1.5,-4.8,-4]],'Rami sensitivi del surale per il tallone laterale.'],
 ['n_safeno','Nervo safeno – tratto distale',.065,[[3.5,14,.6],[3.6,6,.9],[3.75,1,1.7],[3.5,-.9,2.4],[2.9,-2.2,4.5]],'Ramo sensitivo del femorale. Accompagna la grande safena anteriormente al malleolo mediale; innerva la cute mediale della gamba e del piede prossimale.']
 ];
 for(const [id,name,r,p,info]of nerves)vessel({id,cat:'ner',name,r,p,info});
 }
 const R=[
 ['ret_est_sup','Retinacolo superiore degli estensori',[[-3.3,3.4,.4],[-1.8,3.4,1.8],[.4,3.4,2.2],[2.7,3.4,1.0]],.95,[0,0,1],'Margine anteriore della fibula distale.','Margine anteriore della tibia distale.','Mantiene i tendini estensori aderenti alla gamba.'],
 ['ret_est_inf_lat','Retinacolo inferiore degli estensori – radice laterale',[[-2.1,-2.1,1.2],[-2.0,-.7,2.3],[-.8,.1,3.1]],.85,[0,.70710678,.70710678],'Superficie superolaterale del calcagno, presso il seno del tarso.','Biforcazione mediale del retinacolo.','Trattiene i tendini estensori e delimita il tunnel tarsale anteriore.'],
 ['ret_est_inf_sup','Retinacolo inferiore – braccio superomediale',[[-.8,.1,3.1],[1.0,.7,2.8],[2.8,1.2,1.3]],.65,[0,.70710678,.70710678],'Radice laterale del retinacolo inferiore.','Malleolo mediale.','Trattiene il gruppo estensore sulla caviglia.'],
 ['ret_est_inf_inf','Retinacolo inferiore – braccio inferomediale',[[-.8,.1,3.1],[.6,-.7,4.0],[2.5,-1.9,4.1]],.65,[0,.70710678,.70710678],'Radice laterale del retinacolo inferiore.','Fascia plantare mediale presso navicolare e cuneiforme mediale.','Stabilizza i tendini sul dorso del piede.'],
 ['ret_fless','Retinacolo dei flessori',[[3.0,.25,.1],[3.2,-1.1,-.9],[2.9,-2.5,-1.6],[2.2,-4.0,-2.2]],1.2,[1,0,0],'Malleolo mediale.','Faccia mediale del calcagno.','Forma il tetto del tunnel tarsale sopra tendini, vasi tibiali posteriori e nervo tibiale.'],
 ['ret_fib_sup','Retinacolo superiore dei fibulari',[[-2.9,-.35,-1.6],[-3.4,-1.4,-2.0],[-2.2,-2.8,-2.8]],.85,[-1,0,0],'Margine posteriore del malleolo laterale.','Calcagno laterale; continuità con fascia profonda e paratenon.','Mantiene lungo e breve fibulare nel solco retromalleolare.'],
 ['ret_fib_inf','Retinacolo inferiore dei fibulari',[[-2.3,-2.1,.2],[-2.8,-3.1,.6],[-2.6,-4,1.1]],.9,[-1,0,0],'Calcagno sopra la troclea fibulare.','Calcagno sotto la troclea fibulare.','Separa e stabilizza i due tendini nei rispettivi canali.']
 ];
 for(const [id,name,P,w,N,o,ins,fn]of R){const m=ribbon(P,w,.055,N);const shift=avoid(m,[...B,...Object.values(TS)],.065);put({id,cat:'ret',name,info:'Lamina fibrosa ricostruita sui tessuti sottostanti; nascondibile per esplorare il contenuto del canale.',o,ins,fn},m);console.log(id,'adattamento',shift.toFixed(2),'cm');}
 for(const [id,label,y0,y1]of [['t_ta','tibiale anteriore',-2.6,3.8],['t_ehl','estensore lungo dell’alluce',-2.5,2.7],['t_edl','estensore lungo delle dita',-2.8,2.3],['t_ft','fibulare terzo',-2.8,1.3],['t_tp','tibiale posteriore',-2.7,3],['t_fdl','flessore lungo delle dita',-3.7,3],['t_fhl','flessore lungo dell’alluce',-4.3,.6],['t_fl','fibulare lungo',-4.2,3],['t_fb','fibulare breve',-4,1.3]]){
  if(!M[id])continue;let q=ritaglia(M[id].pos,M[id].idx,[0,1,0],y0);q=ritaglia(q.pos,q.idx,[0,-1,0],-y1);const S=surface(q),m=shell(q,(p,i,s)=>add(p,S.nearest(p).n,s?.02:.055));put({id:'gua_'+id.slice(2),cat:'gua',name:'Guaina sinoviale – '+label,info:'Inviluppo sinoviale per lo scorrimento tendineo. Spessore enfatizzato per la visibilità; non rappresenta un versamento. I fibulari condividono prossimalmente la guaina e si separano distalmente.'},m);
 }
 const ap=ribbon([[.3,-6.15,-2.6],[.2,-5.65,1.5],[-.2,-5.25,5.0],[-.5,-4.9,8]],[.8,4.6],.11,[0,-1,0]);avoid(ap,B,.045);put({id:'aponeurosi',cat:'tfl',name:'Aponeurosi plantare – tratto prossimale',info:'Lamina plantare superficiale; le bande digitali e le inserzioni distali sono fuori campo.',o:'Processo mediale della tuberosità calcaneale.',ins:'Espansioni digitali, placche plantari e guaine fibrose delle dita (fuori campo).',fn:'Sostiene l’arco longitudinale e trasmette la tensione nel meccanismo ad argano.'},ap);
 // Borse sottili, in sedi differenti ai due lati dell’Achille; nessun versamento simulato.
 const soft=[
 ['borsa_retro','bor','Borsa retrocalcaneale',[.2,-2.1,-3.9],[[.65,0,0],[0,.22,0],[0,0,.06]],'Borsa profonda costante fra superficie anteriore dell’Achille e calcagno posterosuperiore; cranialmente è in rapporto col grasso di Kager.'],
 ['borsa_sottocute','bor','Borsa calcaneale sottocutanea',[.2,-2.75,-5.1],[[.65,0,0],[0,.4,0],[0,0,.05]],'Borsa superficiale avventizia e variabile, tra cute e tendine calcaneale; mostrata come sede potenziale, non come struttura costante distesa.'],
 ['grasso_seno','adi','Grasso del seno del tarso',[-.5,-1.8,1.0],[[1.0,0,0],[0,.35,0],[0,0,.6]],'Tessuto adiposo del seno del tarso, attraversato dai legamenti cervicale e interosseo e da piccoli vasi e nervi.'],
 ['grasso_tallone','adi','Cuscinetto adiposo calcaneale',[.2,-6.35,-2.3],[[1.9,0,0],[0,.55,0],[0,0,2.4]],'Cuscinetto plantare specializzato in lobuli separati da setti fibrosi. Involucro didattico: i singoli setti non sono segmentati.']
 ];
 for(const [id,cat,name,c,axes,info]of soft){const m=ellipsoid(c,axes);avoid(m,cat==='bor'?[...B,TS.achille]:B,.035);put({id,cat,name,info},m);}
 // Kager: cuneo triangolare fra Achille, FHL e calcagno, con profilo rastremato.
 const k=ribbon([[.4,5,-2.5],[.35,2,-2.8],[.25,0,-3.1],[.2,-2,-3.55]],[.5,1.7],.6,[0,0,1]);avoid(k,[...B,...Object.values(TS)],.06);put({id:'grasso_kager',cat:'adi',name:'Corpo adiposo di Kager',info:'Spazio adiposo pre-achilleo: anteriormente flessore lungo dell’alluce, posteriormente tendine calcaneale, inferiormente calcagno e borsa retrocalcaneale. Ricostruzione dell’involucro.'},k);
 console.log('Adattamento dei decorsi (cm):',JSON.stringify(projects));
}
