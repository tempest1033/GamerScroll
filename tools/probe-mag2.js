const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
(async()=>{const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const srv=await serve(path.resolve('docs'),8882);
const page=await browser.newPage();await page.setViewport({width:1440,height:1200});
await page.goto('http://127.0.0.1:8882/',{waitUntil:'networkidle0',timeout:30000}).catch(e=>console.log(e.message));
// click 매거진 nav
await page.evaluate(()=>{const t=[...document.querySelectorAll('.nav-item,[data-tab],a,button')].find(e=>e.textContent.trim()==='매거진');if(t)t.click();});
await new Promise(r=>setTimeout(r,2500));
const r=await page.evaluate(()=>{const sec=[...document.querySelectorAll('section')].find(s=>getComputedStyle(s).display!=='none'&&s.querySelector('img'));
 const out={secId:sec?sec.id||sec.className:null,cards:[]};if(!sec)return out;
 const seen=new Set();
 for(const img of sec.querySelectorAll('img')){const wrap=img.closest('a')||img.parentElement;const cls=wrap.className.toString();if(seen.has(cls)||out.cards.length>5)continue;seen.add(cls);
  const iw=img.parentElement;const csI=getComputedStyle(img),csW=getComputedStyle(iw),csC=getComputedStyle(wrap);
  out.cards.push({card:cls.slice(0,50),wrapCls:iw.className.toString().slice(0,50),imgBr:csI.borderRadius,wrapBr:csW.borderRadius,wrapOv:csW.overflow,cardBr:csC.borderRadius,cardBg:csC.backgroundColor});}
 return out;});
console.log(JSON.stringify(r,null,1));
await browser.close();srv.close();})();
