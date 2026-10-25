const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/segnalazioni.js');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const origin = 'https://atlas.example';
Object.assign(process.env, { RESEND_API_KEY: 'test', REPORT_TO_EMAIL: 'owner@example.com', REPORT_FROM_EMAIL: 'atlas@example.com', TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret', REPORT_ALLOWED_ORIGINS: origin });
const body = () => ({ description: 'Descrizione del problema anatomico', type: 'Errore anatomico', structure: 'Crociato anteriore', email: '', page: '/modelli/ginocchio-3d.html?private=discard', token: 'test', website: '' });
async function call(b = body(), headers = {}, method = 'POST') {
  const res = { code: 0, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(c) { this.code=c;return this; }, json(data) { this.data=data;return this; } };
  await handler({ method, body:b, headers:{ origin, 'content-type':'application/json', ...headers } }, res);return res;
}
test('unconfigured: no fake delivery and no secret exposure', async () => {
  const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
  try { assert.equal((await call()).code,503); assert.deepEqual((await call(null,{},'GET')).data,{available:false,siteKey:null}); }
  finally { process.env.RESEND_API_KEY=key; }
});
test('rejects origin, method, malformed body, header injection and invalid fields before network', async () => {
  global.fetch=()=>{throw Error('must not call provider');};
  assert.equal((await call(body(),{origin:'https://evil.example'})).code,403);
  assert.equal((await call(body(),{},'DELETE')).code,405);
  assert.equal((await call('{')).code,400);
  assert.equal((await call({...body(),email:'a@example.com\r\nBcc:x@example.com'})).code,400);
  assert.equal((await call({...body(),description:'short'})).code,400);
  assert.equal((await call({...body(),description:'x'.repeat(16001)})).code,413);
  assert.equal((await call({...body(),page:'https://evil.example/'})).code,400);
  assert.equal((await call({...body(),website:'spam'})).code,400);
});
test('failed challenge or wrong hostname/action cannot send email', async () => {
  for(const challenge of [{success:false},{success:true,hostname:'evil.example',action:'report'},{success:true,hostname:'atlas.example',action:'login'}]) {
    let calls=0;global.fetch=async()=>{calls++;return {ok:true,json:async()=>challenge};};
    assert.equal((await call()).code,400);assert.equal(calls,1);
  }
});
test('valid report sent only to configured owner; no arbitrary URL parameters; stable retry key', async () => {
  const mails=[];
  global.fetch=async(url,options)=>{
    if(url.includes('siteverify')) return {ok:true,json:async()=>({success:true,hostname:'atlas.example',action:'report'})};
    mails.push(options); return {ok:true,json:async()=>({id:'sent-test'})};
  };
  assert.deepEqual((await call({...body(),email:'reader@example.com'})).data,{ok:true});
  await call({...body(),email:'reader@example.com'});
  const mail=JSON.parse(mails[0].body);
  assert.deepEqual(mail.to,['owner@example.com']);assert.equal(mail.reply_to,'reader@example.com');assert.ok(!mail.text.includes('private='));
  assert.equal(mails[0].headers['Idempotency-Key'],mails[1].headers['Idempotency-Key']);
});
test('provider error or timeout cannot return success', async () => {
  global.fetch=async(url)=>url.includes('siteverify') ? {ok:true,json:async()=>({success:true,hostname:'atlas.example',action:'report'})} : {ok:false,status:429};
  assert.equal((await call()).code,502);
  global.fetch=async()=>{throw Error('timeout');};assert.equal((await call()).code,502);
});

 test('contact requires email and sends a distinct subject to owner', async () => {
  assert.equal((await call({...body(),kind:'contact',type:'Collaborazione'})).code,400);
  let sent;
  global.fetch=async(url,options)=>{
    if(url.includes('siteverify')) return {ok:true,json:async()=>({success:true,hostname:'atlas.example',action:'report'})};
    sent=JSON.parse(options.body);return {ok:true,json:async()=>({id:'contact-test'})};
  };
  const result=await call({...body(),kind:'contact',type:'Collaborazione',email:'reader@example.com'});
  assert.equal(result.code,200);assert.equal(sent.subject,'MSK Atlas — Contatto: Collaborazione');
  assert.equal(sent.reply_to,'reader@example.com');assert.deepEqual(sent.to,['owner@example.com']);
  assert.ok(sent.text.startsWith('Messaggio MSK Atlas'));
  assert.equal((await call({...body(),kind:'contact',type:'Errore anatomico',email:'reader@example.com'})).code,400);
 });
