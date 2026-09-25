// Read-only health probes. Normal Node TLS name, expiry and chain verification remains enabled.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const ca = fs.readFileSync(path.join(__dirname, '../infra/docker/certs/patrol360.rootCA.crt'));
function probe(url) {
  return new Promise(resolve => {
    const transport = url.startsWith('https:') ? https : http;
    const request = transport.get(url, {ca, timeout:8000, headers:{Accept:'application/json','X-Patrol360-Contour':'patrol360-local-enterprise'}}, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk=>{body+=chunk;});
      const cert = response.socket.getPeerCertificate?.();
      const authorized = response.socket.authorized;
      response.on('end',()=>resolve({url,status:response.statusCode,body,authorized,certificate:cert?.fingerprint256,validTo:cert?.valid_to}));
    });
    request.on('timeout',()=>request.destroy(new Error('health timeout')));
    request.on('error',error=>resolve({url,error:error.message,code:error.code}));
  });
}
Promise.all(['http://192.168.2.194','http://192.168.2.194:5173','https://192.168.2.194'].map(base=>probe(base+'/api/v1/mobile/health')))
  .then(results=>console.log(JSON.stringify(results,null,2)));
