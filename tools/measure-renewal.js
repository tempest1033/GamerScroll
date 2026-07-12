const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
function firstArticle(root,tag){const cand=tag==='GS'?path.join(root,'games'):root;for(const d of fs.readdirSync(cand)){const idx=path.join(cand,d,'index.html');if(fs.existsSync(idx)&&d!=='assets')return '/'+(tag==='GS'?'games/':'')+encodeURIComponent(d)+'/';}return null;}
const probe=()=>{
 const out={vw:innerWidth,els:[]};
 const sels=['.site-container','.page-container','.home-container','.home-main','.home-hero','.home-sidebar','main','article','.article-container','.article-body','.report-container','.blog-article','.game-container','h1'];
 for(const s of sels){const e=document.querySelector(s);if(!e)continue;const cs=getComputedStyle(e);const r=e.getBoundingClientRect();
  out.els.push({sel:s,w:Math.round(r.width),x:Math.round(r.left),pl:cs.paddingLeft,pr:cs.paddingRight,ml:cs.marginLeft,mr:cs.marginRight,maxw:cs.maxWidth,fs:cs.fontSize});}
 const p=document.querySelector('article p, .article-body p, main p');if(p){const cs=getComputedStyle(p);out.para={fs:cs.fontSize,lh:cs.lineHeight,w:Math.round(p.getBoundingClientRect().width)};}
 return out;};
(async()=>{const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const[root,port,tag]of[['docs',8821,'GS'],['ai-docs',8822,'AI']]){
 const srv=await serve(path.resolve(root),port);const art=firstArticle(root,tag);
 for(const[name,url]of[['home','/'],['article',art]]){if(!url)continue;
  for(const[w,h]of[[1440,900],[390,844]]){
   const page=await browser.newPage();await page.setViewport({width:w,height:h});
   await page.goto('http://127.0.0.1:'+port+url,{waitUntil:'networkidle0',timeout:30000}).catch(()=>{});
   console.log('==',tag,name,w+'px',url);console.log(JSON.stringify(await page.evaluate(probe)));
   await page.close();}}
 srv.close();}
await browser.close();})();
