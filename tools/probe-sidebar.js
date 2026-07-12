const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function serve(root,port){return new Promise(res=>{const s=http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});});s.listen(port,()=>res(s));});}
const probe=()=>{const out=[];
 const sb=document.querySelector('.home-sidebar');if(!sb)return{err:'no sidebar'};
 const add=(label,e)=>{if(!e)return;const r=e.getBoundingClientRect();const cs=getComputedStyle(e);out.push({label,x:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),pl:cs.paddingLeft,pr:cs.paddingRight,ml:cs.marginLeft,bg:cs.backgroundColor,br:cs.borderRadius});};
 add('sidebar',sb);
 sb.querySelectorAll('.home-card').forEach((c,i)=>add('card'+i,c));
 add('card-header',sb.querySelector('.home-card-header'));
 add('toggle-wrap',sb.querySelector('.home-chart-toggle'));
 const btns=sb.querySelectorAll('.home-chart-toggle button, .home-chart-toggle [class*=btn], .sidebar-full-toggle > *');btns.forEach((b,i)=>{if(i<2)add('toggle-btn'+i,b);});
 add('cat-group',sb.querySelector('.sidebar-category-group'));
 add('cat-item',sb.querySelector('.sidebar-category-list a, .sidebar-category-list li'));
 add('list',sb.querySelector('.sidebar-article-list'));
 add('list-item',sb.querySelector('.sidebar-article-list a, .sidebar-article-list li'));
 const num=sb.querySelector('.sidebar-article-list [class*=rank], .sidebar-article-list [class*=num]');add('rank-num',num);
 return out;};
(async()=>{const browser=await puppeteer.launch({headless:'new',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const[root,port,tag]of[['docs',8871,'GS'],['ai-docs',8872,'AI']]){
 const srv=await serve(path.resolve(root),port);
 const page=await browser.newPage();await page.setViewport({width:1440,height:1600});
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle0',timeout:30000}).catch(()=>{});
 console.log('==',tag);const r=await page.evaluate(probe);
 if(r.err)console.log(r.err);else for(const o of r)console.log(('  '+o.label).padEnd(14),'x='+o.x,'right='+o.right,'w='+o.w,'pl='+o.pl,'pr='+o.pr,'bg='+(o.bg==='rgba(0, 0, 0, 0)'?'-':o.bg),'br='+o.br);
 await page.screenshot({path:'tmpimg/renewal/'+tag.toLowerCase()+'-sidebar.png',clip:{x:930,y:150,width:360,height:900}});
 await page.close();srv.close();}
await browser.close();console.log('done');})();
