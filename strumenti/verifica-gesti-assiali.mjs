// node strumenti/verifica-gesti-assiali.mjs
// Richiede build Preview e server locale sulla porta 8000; Chrome/Chromium installato.
// Verifica interazioni reali a due dita, senza modificare file del modello.
import {avviaChrome} from './lib-chrome.mjs';import assert from 'node:assert/strict';const c=await avviaChrome();
try{
 await c.cdp('Page.enable');await c.cdp('Page.addScriptToEvaluateOnNewDocument',{source:`for(const method of ['moveTo','lineTo']){const f=Path2D.prototype[method];Path2D.prototype[method]=function(x,y){(this.points??=[]).push([x,y]);return f.call(this,x,y);};}const f=CanvasRenderingContext2D.prototype.fill,g=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.fill=function(p,...args){if(this.canvas.id==='slice'&&p?.points)(window.axPaths??=[]).push(p);return f.call(this,p,...args)};CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.id==='slice')window.axPaths=[];return g.apply(this,args);};`});
 await c.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await c.cdp('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 await c.cdp('Page.navigate',{url:'http://localhost:8000/modelli/spalla-3d.html?sezioni=assiali#lite'});
 for(let i=0;i<180;i++){if(await c.evaluate(`!!window.axPaths?.length`))break;await new Promise(r=>setTimeout(r,500));}
 // Ferma solo il rendering WebGL software del riferimento 3D nascosto, per misurare i gesti 2D reali.
 await c.evaluate(`{const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>cb.name==='loop'?0:raf(cb);}`);
 const settle=()=>c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const snapshot=()=>c.evaluate(`(()=>{const el=document.getElementById('slice'),r=el.getBoundingClientRect(),pts=axPaths[0].points;return {p:pts[0],q:pts[Math.floor(pts.length/2)],rect:{x:r.x,y:r.y,w:r.width,h:r.height},selected:__dbg.selected(),level:document.getElementById('level').value};})()`);
 const send=async(type,touchPoints)=>{const r=await c.cdp('Input.dispatchTouchEvent',{type,touchPoints});if(r.error)throw Error(JSON.stringify(r.error));return r;};
 await settle();const original=await snapshot();assert.equal(await c.evaluate(`getComputedStyle(document.querySelector('.ax-zoom')).display`),'none');
 const cx=original.rect.x+original.rect.w/2,cy=original.rect.y+original.rect.h/2;
 const a={id:1,x:cx-40,y:cy},b={id:2,x:cx+40,y:cy};
 await send('touchStart',[a]);await send('touchStart',[a,b]);
 const a2={id:1,x:cx-60,y:cy+15},b2={id:2,x:cx+100,y:cy+15};
 await send('touchMove',[a2,b2]);await settle();const zoomed=await snapshot();
 const distance=s=>Math.hypot(s.p[0]-s.q[0],s.p[1]-s.q[1]);assert.ok(Math.abs(distance(zoomed)/distance(original)-2)<.01);
 const midX=original.rect.w/2,midY=original.rect.h/2;
 assert.ok(Math.abs(zoomed.p[0]-(midX+20+2*(original.p[0]-midX)))<1);assert.ok(Math.abs(zoomed.p[1]-(midY+15+2*(original.p[1]-midY)))<1);
 await send('touchEnd',[b2]);await send('touchMove',[{...a2,x:a2.x+30,y:a2.y+20}]);await send('touchEnd',[]);await settle();const dragged=await snapshot();
 assert.ok(Math.abs(dragged.p[0]-zoomed.p[0]-30)<1);assert.ok(Math.abs(dragged.p[1]-zoomed.p[1]-20)<1);assert.equal(dragged.selected,original.selected);assert.equal(dragged.level,original.level);
 // Due tocchi brevi ripristinano la vista senza aprire o chiudere una scheda.
 for(let i=0;i<2;i++){await send('touchStart',[{id:1,x:cx,y:cy}]);await send('touchEnd',[]);}
 await settle();const reset=await snapshot();assert.ok(Math.abs(reset.p[0]-original.p[0])<1&&Math.abs(reset.p[1]-original.p[1])<1);assert.equal(reset.selected,original.selected);
 const hit=await c.evaluate(`(()=>{const el=document.getElementById('slice'),ctx=el.getContext('2d'),r=el.getBoundingClientRect();ctx.save();ctx.setTransform(1,0,0,1,0,0);let hit=null;for(let y=30;y<r.height-40&&!hit;y+=5)for(let x=30;x<r.width-30;x+=5)if(axPaths.some(p=>ctx.isPointInPath(p,x,y,'evenodd'))){hit={x:r.x+x,y:r.y+y};break;}ctx.restore();return hit;})()`);
 await send('touchStart',[{id:1,...hit}]);await send('touchEnd',[]);await new Promise(r=>setTimeout(r,400));await settle();assert.ok((await snapshot()).selected);
 await c.cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:850,deviceScaleFactor:1,mobile:false});await settle();assert.notEqual(await c.evaluate(`getComputedStyle(document.querySelector('.ax-zoom')).display`),'none');
 console.log({pinchFactor:distance(zoomed)/distance(original),anchored:true,oneFingerAfterPinch:true,doubleTapReset:true,singleTapSelects:true,levelUnchanged:true,desktopButtons:true});
}finally{await c.chiudi();}
