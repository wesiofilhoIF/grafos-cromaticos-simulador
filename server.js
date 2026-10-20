const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8080;
const HOST = '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  // Normalize URL
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/simulador_grafos_cromaticos.html';
  }

  const filePath = path.join(__dirname, reqPath);

  // Security check: ensure path is within directory
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Proibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to simulador_grafos_cromaticos.html
      const fallback = path.join(__dirname, 'simulador_grafos_cromaticos.html');
      fs.readFile(fallback, (fErr, data) => {
        if (fErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Arquivo não encontrado');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 SERVIDOR DO SIMULADOR DE GRAFOS CROMÁTICOS ATIVO`);
  console.log(`==================================================`);
  console.log(`Localhost: http://localhost:${PORT}/`);
  console.log(`Localhost: http://127.0.0.1:${PORT}/`);

  const ifaces = os.networkInterfaces();
  console.log(`\nAcessos na Rede Local (LAN):`);
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`📡 [${name}] http://${iface.address}:${PORT}/`);
      }
    }
  }
  console.log(`==================================================\n`);
});
