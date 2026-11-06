const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(__dirname + '/probe.js', 'utf8');
const secret = 'private-test-key-never-print-12345';
const base = {id:603,title:'Матрица'};
let tested = 0;
function make(mode, handler, useNative = true) {
  let requests = [];
  const ctx = { module:{exports:{}}, console, SCRAPER_ID:'test-repo:hdcheck-'+mode,
    fetch:(url, opts) => {requests.push({url,opts}); return handler(url,opts);}
  };
  if(useNative)ctx.TMDB_API_KEY=secret;
  vm.createContext(ctx); vm.runInContext(code,ctx,{timeout:1000});
  return {get:ctx.module.exports.getStreams, requests};
}
function response(status, body, statusText='') {
  return Promise.resolve({status,ok:status>=200&&status<300,statusText,text:()=>Promise.resolve(typeof body==='string'?body:JSON.stringify(body))});
}
async function check(name, mode, handler, expected, options={}) {
  const s = make(mode,handler,options.useNative!==false);
  const rows = await s.get(options.id||'603','movie');
  if(options.empty)assert.equal(rows.length,0);
  else {
    assert.equal(rows.length,1); assert.match(rows[0].title,expected);
    assert.equal(rows[0].type,'diagnostic'); assert.match(rows[0].url,/^data:text\/plain/);
    assert(!JSON.stringify(rows).includes(secret),'secret exposed');
    assert.match(rows[0].quality,/NOT VIDEO/);
  }
  assert(s.requests.length<=1,'more than one network request');
  if(options.noNetwork)assert.equal(s.requests.length,0);
  if(options.inspect)options.inspect(s,rows);
  console.log('PASS '+name); tested++;
}
(async()=>{
 await check('runtime, no network','runtime',()=>{throw Error('network must not be used')},/^RUNTIME: OK/,{noNetwork:true});
 await check('other titles stay empty','runtime',()=>{throw Error('unexpected')},/./,{id:'123',empty:true,noNetwork:true});
 await check('TMDB valid','tmdb',()=>response(200,base),/^TMDB: OK/,{inspect:(s)=>assert(s.requests[0].url.includes(encodeURIComponent(secret)))});
 await check('TMDB fallback','tmdb',()=>response(200,base),/^TMDB: OK/,{useNative:false,inspect:(s,r)=>assert(r[0].quality.includes('upstream fallback'))});
 await check('TMDB bad key','tmdb',()=>response(401,{status_message:'Invalid API key: '+secret}),/^TMDB: HTTP 401/);
 await check('TMDB bad JSON','tmdb',()=>response(200,'<html>oops</html>'),/^TMDB: UNEXPECTED/);
 await check('TMDB wrong movie','tmdb',()=>response(200,{id:12,title:'Other'}),/^TMDB: UNEXPECTED/);
 await check('TMDB fetch reject, redacted','tmdb',()=>Promise.reject(Error('failed api_key='+secret)),/^TMDB: NETWORK/);
 await check('TMDB synchronous throw','tmdb',()=>{throw Error('network fails')},/^TMDB: NETWORK/);
 await check('site valid HTML','rezka',()=>response(200,'<a href="https://hdrezka.ag/films/fiction/123-matrica-1999.html"><span class="enty">Матрица</span> (The Matrix, 1999)</a>'),/PARSED 1$/);
 await check('site HTTP 403','rezka',()=>response(403,'<title>Access denied</title>','Forbidden'),/^HDREZKA: HTTP 403/);
 await check('site browser challenge HTTP 200','rezka',()=>response(200,'<title>Just a moment...</title><script src="challenge-platform"></script>'),/POSSIBLE BROWSER CHECK/);
 await check('site changed markup','rezka',()=>response(200,'<a href="/films/123-matrix.html"><b>Matrix</b></a>'),/PARSED 0$/,{inspect:(s,r)=>assert(r[0].quality.includes('links=1'))});
 await check('site failed native fetch status zero','rezka',()=>response(0,'','Unable to resolve host'),/^HDREZKA: HTTP 0/);
 await check('site network rejection','rezka',()=>Promise.reject(Error('DNS failure')),/^HDREZKA: NETWORK/);
 await check('unknown runtime id','unknown',()=>{throw Error('unexpected')},/UNKNOWN PROBE ID/,{noNetwork:true});
 console.log('TOTAL: '+tested+' mocked tests passed. No live network/Fire TV tests.');
})().catch(e=>{console.error(e);process.exit(1)});
