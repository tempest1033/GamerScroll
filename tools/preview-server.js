const http=require('http'),fs=require('fs'),path=require('path');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.xml':'text/xml','.json':'application/json'};
for(const[root,port]of[['docs',8801],['ai-docs',8802]]){
 http.createServer((req,rsp)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(path.resolve(root),p);try{if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');}catch(e){}
 fs.readFile(f,(e,d)=>{if(e){rsp.writeHead(404);rsp.end();return;}rsp.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'});rsp.end(d);});}).listen(port);
 console.log(root+' -> http://127.0.0.1:'+port);}
