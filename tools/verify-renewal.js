const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
(async()=>{const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const[root,port,tag]of[['docs',8811,'GS'],['ai-docs',8812,'AI']]){
 const srv=await serve(path.resolve(root),port);
 const page=await browser.newPage();await page.setViewport({width:1440,height:900});
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle0',timeout:30000});
 const r=await page.evaluate(()=>{const g=document.querySelector('.home-hero-grid');const f=document.querySelector('.hero-feature');const t=document.querySelector('.home-section-title');const cs=g?getComputedStyle(g):null;
 return{grid:cs?cs.display+' / '+cs.gridTemplateColumns:'MISSING',featureW:f?f.getBoundingClientRect().width:0,sectionTitle:t?getComputedStyle(t).borderBottomWidth+' box='+getComputedStyle(t).backgroundColor:'MISSING',gradients:[...document.querySelectorAll('.home-main *')].filter(e=>getComputedStyle(e).backgroundImage.includes('gradient')).length};});
 console.log(tag,JSON.stringify(r));
 await page.close();srv.close();}
await browser.close();})();
