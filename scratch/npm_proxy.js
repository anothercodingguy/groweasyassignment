const http = require('http');
const { execSync } = require('child_process');

const PORT = 18080;
const REGISTRY_HOST = 'registry.npmjs.org';
const REGISTRY_URL = `https://${REGISTRY_HOST}`;

const server = http.createServer((req, res) => {
  // Translate the local request path to the remote registry URL
  const targetUrl = REGISTRY_URL + req.url;
  console.log(`Proxying request: ${req.url} -> ${targetUrl}`);
  
  try {
    // If it's a tarball (.tgz) request, download it as a binary buffer
    if (req.url.endsWith('.tgz')) {
      const curlCmd = `curl -s -L "${targetUrl}"`;
      const data = execSync(curlCmd, { maxBuffer: 150 * 1024 * 1024 });
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(data);
      return;
    }
    
    // For metadata JSON requests
    const curlCmd = `curl -s -L "${targetUrl}"`;
    const dataStr = execSync(curlCmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    
    // Replace all instances of the registry domain to route through our proxy
    let rewritten = dataStr.replace(/https:\/\/registry\.npmjs\.org/g, `http://localhost:${PORT}`);
    // Also rewrite yarn registry links just in case they appear
    rewritten = rewritten.replace(/https:\/\/registry\.yarnpkg\.com/g, `http://localhost:${PORT}`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(rewritten);
  } catch (err) {
    console.error(`Error proxying ${req.url}:`, err.message);
    res.writeHead(500);
    res.end(err.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local registry proxy listening on http://127.0.0.1:${PORT}`);
});
