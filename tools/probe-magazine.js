const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
(async()=>{const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const srv=await serve(path.resolve('docs'),8881);
const page=await browser.newPage();await page.setViewport({width:1440,height:1200});
await page.goto('http://127.0.0.1:8881/magazine/',{waitUntil:'networkidle0',timeout:30000}).catch(e=>console.log(e.message));
await new Promise(r=>setTimeout(r,1500));
const r=await page.evaluate(()=>{const out=[];
 for(const sel of ['[class*=latest] a','[class*=issue-card]','[class*=trend-card]','[class*=grid] a']){
  const e=document.querySelector(sel);if(!e)continue;
  const img=e.querySelector('img, [class*=image], [class*=thumb]');
  const cs=img?getComputedStyle(img):null;const pcs=img&&img.parentElement?getComputedStyle(img.parentElement):null;
  out.push({sel,cardCls:e.className.toString().slice(0,60),imgCls:img?img.className.toString().slice(0,50):null,imgBr:cs?cs.borderRadius:null,parentBr:pcs?pcs.borderRadius:null,parentCls:img&&img.parentElement?img.parentElement.className.toString().slice(0,50):null});}
 return out;});
console.log(JSON.stringify(r,null,1));
await browser.close();srv.close();})();
