const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
const probe=()=>{const out={vw:innerWidth,els:[]};
 for(const s of ['.header','.header-inner','.gs-header-inner','.aiscroll-header-inner','.header-title','.gs-search','.aiscroll-search','.search-box','.search-box input','.search-container','.nav-inner','.nav']){
  const e=document.querySelector(s);if(!e)continue;const r=e.getBoundingClientRect();const cs=getComputedStyle(e);
  out.els.push({sel:s,x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),disp:cs.display,ai:cs.alignItems,maxw:cs.maxWidth,pl:cs.paddingLeft,pr:cs.paddingRight});}
 return out;};
(async()=>{const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const[root,port,tag]of[['docs',8841,'GS'],['ai-docs',8842,'AI']]){
 const srv=await serve(path.resolve(root),port);
 for(const[w,h]of[[1440,900],[390,844]]){
  const page=await browser.newPage();await page.setViewport({width:w,height:h});
  await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle0',timeout:30000}).catch(()=>{});
  console.log('==',tag,w+'px');console.log(JSON.stringify(await page.evaluate(probe)));
  await page.screenshot({path:`tmpimg/renewal/${tag.toLowerCase()}-header-${w}.png`,clip:{x:0,y:0,width:w,height:120}});
  await page.close();}
 srv.close();}
await browser.close();console.log('done');})();
