// Intersezione triangoli/piano Y, in cm. Ricucitura limitata alle microfessure documentate.
function interseca(mesh, y) {
  const {pos, idx, tw}=mesh, edges=[], nodes=new Map();
  // Cerca anche nei bucket adiacenti: arrotondare una coordinata da solo
  // separava estremi coincidenti ai due lati del confine di un bucket.
  const eps=0.000001,buckets=new Map();let serial=0;
  const node=p=>{const x=Math.floor(p[0]/eps),z=Math.floor(p[1]/eps);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const k of buckets.get(`${x+dx},${z+dz}`)||[]){const q=nodes.get(k).p;if(Math.hypot(q[0]-p[0],q[1]-p[1])<=eps)return k;}
    const k=serial++;nodes.set(k,{p,edges:[]});const bucket=`${x},${z}`;if(!buckets.has(bucket))buckets.set(bucket,[]);buckets.get(bucket).push(k);return k;};

  const candidates=mesh.sliceBins?(mesh.sliceBins.get(Math.floor(y*10))||[]):null;
  const count=candidates?candidates.length:idx.length/3;
  for(let ti=0;ti<count;ti++){
    const t=candidates?candidates[ti]:ti*3;
    const ids=[idx[t],idx[t+1],idx[t+2]], hits=[];
    for(let e=0;e<3;e++){
      const a=ids[e],b=ids[(e+1)%3],ya=pos[a*3+1],yb=pos[b*3+1];
      if((ya<=y&&yb>y)||(yb<=y&&ya>y)){
        const f=(y-ya)/(yb-ya);hits.push([pos[a*3]+f*(pos[b*3]-pos[a*3]),pos[a*3+2]+f*(pos[b*3+2]-pos[a*3+2]),tw?tw[a]+f*(tw[b]-tw[a]):0]);
      }
    }
    if(hits.length!==2)continue;
    const a=node(hits[0]),b=node(hits[1]);if(a===b)continue;

    const i=edges.length;edges.push({a,b,used:false});nodes.get(a).edges.push(i);nodes.get(b).edges.push(i);
  }
  const loops=[],open=[];
  // Prima le catene con estremi liberi, poi gli anelli: evita di spezzare
  // una catena aperta in più frammenti partendo da un triangolo intermedio.
  const starts=[...nodes.entries()].filter(([,n])=>n.edges.length===1).map(([k,n])=>[n.edges[0],k]);
  starts.push(...edges.map((e,i)=>[i,e.a]));
  for(const [i,origin] of starts){
    if(edges[i].used)continue;
    let edge=i,current=origin,start=current;const points=[];let closed=false;
    while(edge!==undefined&&!edges[edge].used){
      const e=edges[edge];e.used=true;points.push(nodes.get(current).p);current=e.a===current?e.b:e.a;
      if(current===start){closed=true;break;}
      edge=nodes.get(current).edges.find(j=>!edges[j].used);
    }
    if(!closed)points.push(nodes.get(current).p);
    if(points.length>=3)(closed?loops:open).push(points);
  }
  return {id:mesh.id,name:mesh.name,cat:mesh.cat,loops,open};
}

export function sezione(mesh,y){
  const base=interseca(mesh,y);
  if(!base.open.length)return base;
  // Ricuce soltanto una singola microfessura: <=0,15 mm e <=0,1%
  // del perimetro. Non colma tagli anatomici o aperture estese.
  if(base.open.length===1){const p=base.open[0];let length=0;for(let i=1;i<p.length;i++)length+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);
    const gap=Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1]);
    if(p.length>=8&&gap<=0.015&&gap<=length*0.001)return {...base,loops:[...base.loops,p],open:[],repairedGapMM:gap*10};
  }
  // Un piano che coincide con vertici/spigoli può essere singolare.
  // Spostamento massimo 0,0001 mm; nessun collegamento fra margini distanti.
  for(const delta of [0.00001,-0.00001]){
    const retry=interseca(mesh,y+delta);
    if(!retry.open.length && retry.loops.length && retry.loops.length>=base.loops.length)return {...retry,planeOffset:delta};
  }
  return base;
}

// Indice a bande di 1 mm: ogni livello considera solo triangoli vicini al piano.
export function indicizza(mesh){
  const bins=new Map(),{pos,idx}=mesh;
  for(let t=0;t<idx.length;t+=3){const a=pos[idx[t]*3+1],b=pos[idx[t+1]*3+1],c=pos[idx[t+2]*3+1];
    const lo=Math.floor(Math.min(a,b,c)*10),hi=Math.floor(Math.max(a,b,c)*10);
    for(let bin=lo;bin<=hi;bin++){if(!bins.has(bin))bins.set(bin,[]);bins.get(bin).push(t);}
  }
  mesh.sliceBins=new Map([...bins].map(([k,v])=>[k,Uint32Array.from(v)]));return mesh;
}
let meshes=[];
const cache=new Map();
function calcola(y){
  if(cache.has(y)){const result=cache.get(y);cache.delete(y);cache.set(y,result);return result;}
  const result=meshes.map(m=>sezione(m,y)).filter(s=>s.loops.length||s.open.length);
  cache.set(y,result);if(cache.size>24)cache.delete(cache.keys().next().value);return result;
}
if(typeof self!=='undefined')self.onmessage=({data})=>{
  if(data.type==='init'){meshes=data.meshes.map(indicizza);cache.clear();self.postMessage({type:'ready'});return;}
  if(data.type==='slice')self.postMessage({type:'slice',seq:data.seq,y:data.y,sections:calcola(data.y)});
};
