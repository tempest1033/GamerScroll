const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
function articles(root,tag){const out=[];if(tag==='GS'){const g=path.join(root,'games');const ds=fs.readdirSync(g).filter(d=>fs.existsSync(path.join(g,d,'index.html'))).slice(0,2);for(const d of ds)out.push('/games/'+encodeURIComponent(d)+'/');for(const sub of['magazine','wiki','tech']){const p=path.join(root,sub);if(!fs.existsSync(p))continue;const dd=fs.readdirSync(p).filter(d=>fs.existsSync(path.join(p,d,'index.html'))).slice(0,1);for(const d of dd)out.push('/'+sub+'/'+encodeURIComponent(d)+'/');}}else{const a=path.join(root,'article');if(fs.existsSync(a)){for(const cat of fs.readdirSync(a).slice(0,2)){const cp=path.join(a,cat);if(!fs.statSync(cp).isDirectory())continue;const dd=fs.readdirSync(cp).filter(d=>fs.existsSync(path.join(cp,d,'index.html'))).slice(0,1);for(const d of dd)out.push('/article/'+cat+'/'+encodeURIComponent(d)+'/');}}}
return out;}
const probe=()=>{const vw=document.documentElement.clientWidth;const doc=document.documentElement;const out={vw,scrollW:doc.scrollWidth,offenders:[]};
 const main=document.querySelector('.site-container,.container,main');const mr=main?main.getBoundingClientRect():{left:0,right:vw};
 for(const e of document.querySelectorAll('img,figure,table,iframe,video,.banner,.popular-banner,[class*=banner],[class*=ad-],pre,svg')){
  const r=e.getBoundingClientRect();if(r.width===0)continue;
  const overV=r.right>vw+1||r.left<-1; const overC=(r.right>mr.right+2||r.left<mr.left-2);
  if(overV||overC){const cs=getComputedStyle(e);out.offenders.push({tag:e.tagName,cls:(e.className.baseVal!==undefined?e.className.baseVal:e.className).toString().slice(0,50),l:Math.round(r.left),r:Math.round(r.right),w:Math.round(r.width),overV,ml:cs.marginLeft,mw:cs.maxWidth});if(out.offenders.length>12)break;}}
 return out;};
(async()=>{const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const[root,port,tag]of[['docs',8851,'GS'],['ai-docs',8852,'AI']]){
 const srv=await serve(path.resolve(root),port);
 for(const url of articles(root,tag)){
  for(const w of[1440,390]){
   const page=await browser.newPage();await page.setViewport({width:w,height:900});
   await page.goto('http://127.0.0.1:'+port+url,{waitUntil:'networkidle0',timeout:30000}).catch(()=>{});
   const r=await page.evaluate(probe);
   console.log('==',tag,w,url);console.log('scrollW',r.scrollW,'vw',r.vw,r.scrollW>r.vw?'OVERFLOW':'ok');
   for(const o of r.offenders)console.log('  ',JSON.stringify(o));
   await page.close();}}
 srv.close();}
await browser.close();console.log('done');})();
