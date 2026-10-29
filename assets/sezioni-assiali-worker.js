// Intersezione triangoli/piano Y, in cm. Non chiude artificialmente contorni aperti.
export function sezione(mesh, y) {
  const {pos, idx, tw}=mesh, edges=[], nodes=new Map();
  const key=p=>`${Math.round(p[0]*10000)},${Math.round(p[1]*10000)}`;
  const node=p=>{const k=key(p);if(!nodes.has(k))nodes.set(k,{p,edges:[]});return k;};
  for(let t=0;t<idx.length;t+=3){
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
  for(let i=0;i<edges.length;i++){
    if(edges[i].used)continue;
    let edge=i,current=edges[i].a,start=current;const points=[];let closed=false;
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
let meshes=[];
if(typeof self!=='undefined')self.onmessage=({data})=>{
  if(data.type==='init'){meshes=data.meshes;self.postMessage({type:'ready'});return;}
  if(data.type==='slice')self.postMessage({type:'slice',seq:data.seq,y:data.y,sections:meshes.map(m=>sezione(m,data.y)).filter(s=>s.loops.length||s.open.length)});
};
