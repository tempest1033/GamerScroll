const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
const probe=()=>{
 const ps=[...document.querySelectorAll('article p, .blog-content p, .blog-content .blog-paragraph, .report-content p, main p')].filter(p=>p.getBoundingClientRect().width>200);
 if(!ps.length)return{err:'no paragraphs'};
 const freq={};for(const p of ps){const r=p.getBoundingClientRect();const k=Math.round(r.left)+'|'+Math.round(r.right);freq[k]=(freq[k]||0)+1;}
 const col=Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0].split('|').map(Number);
 const out={col:{l:col[0],r:col[1],w:col[1]-col[0]},mis:[]};
 for(const e of document.querySelectorAll('img,figure,table,iframe,.banner,[class*=banner],[class*=hero],[class*=thumb],[class*=ad-]')){
  const r=e.getBoundingClientRect();if(r.width<100||r.height<40)continue;
  if(r.left<col[0]-4||r.right>col[1]+4){
   let anc=[];let n=e;while(n&&anc.length<3){if(n.className&&typeof n.className==='string'&&n.className)anc.push(n.className.split(' ')[0]);n=n.parentElement;}
   out.mis.push({tag:e.tagName,cls:anc.join('<'),l:Math.round(r.left),r:Math.round(r.right),w:Math.round(r.width)});
   if(out.mis.length>10)break;}}
 return out;};
(async()=>{const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const targets=[['docs',8861,'GS',['/games/007-first-light/','/magazine/hotpick/','/wiki/business/','/tech/ai/']],['ai-docs',8862,'AI',['/article/ai/ai-model-intentional-performance-degradation/','/article/ai-tools/cursor-composer-2-coding-model/']]];
for(const[root,port,tag,urls]of targets){
 const srv=await serve(path.resolve(root),port);
 for(const url of urls){
  const page=await browser.newPage();await page.setViewport({width:1440,height:900});
  await page.goto('http://127.0.0.1:'+port+url,{waitUntil:'networkidle0',timeout:30000}).catch(()=>{});
  console.log('==',tag,url);console.log(JSON.stringify(await page.evaluate(probe)));
  await page.close();}
 srv.close();}
await browser.close();})();
