const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.xml':'text/xml','.json':'application/json','.woff2':'font/woff2'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
(async()=>{
const jobs=[{root:'docs',port:8831,tag:'gs'},{root:'ai-docs',port:8832,tag:'ai'}];
const outDir='tmpimg/renewal';fs.mkdirSync(outDir,{recursive:true});
const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const j of jobs){
 const srv=await serve(path.resolve(j.root),j.port);
 // find one article page
 let article=null;
 const cand=j.tag==='gs'?'docs/games':'ai-docs';
 for(const d of fs.readdirSync(cand)){const idx=path.join(cand,d,'index.html');if(fs.existsSync(idx)&&d!=='assets'){article='/'+(j.tag==='gs'?'games/':'')+encodeURIComponent(d)+'/';break;}}
 const targets=[['home','/'],['article',article]].filter(t=>t[1]);
 for(const[name,url]of targets){
  for(const[vp,w,h]of[['desktop',1440,900],['mobile',390,844]]){
   const page=await browser.newPage();
   await page.setViewport({width:w,height:h});
   await page.goto('http://127.0.0.1:'+j.port+url,{waitUntil:'networkidle0',timeout:30000}).catch(e=>console.log('nav warn',e.message));
   await new Promise(r=>setTimeout(r,800));
   await page.screenshot({path:`${outDir}/${j.tag}-${name}-${vp}.png`,fullPage:false});
   await page.screenshot({path:`${outDir}/${j.tag}-${name}-${vp}-full.png`,fullPage:true});
   await page.close();
  }
 }
 srv.close();
}
await browser.close();
console.log('done');fs.readdirSync(outDir).forEach(f=>console.log(f));
})();
