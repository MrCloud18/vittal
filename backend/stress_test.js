const http = require('http');
const https = require('https');

const DEFAULT_URL = 'http://localhost:3000/api/version';
const URL = process.env.TARGET_URL || process.argv[2] || DEFAULT_URL;
const TOTAL_REQUESTS = Math.max(1, Number(process.env.TOTAL_REQUESTS || process.argv[3] || 100));
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || process.argv[4] || Math.min(50, TOTAL_REQUESTS)));

const client = URL.startsWith('https://') ? https : http;
const agent = URL.startsWith('https://')
  ? new https.Agent({ keepAlive: true, maxSockets: CONCURRENCY })
  : new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });

let startedAt = Date.now();
let completed = 0;
let inFlight = 0;
let dispatched = 0;

const statusCounts = new Map();
let networkErrors = 0;

console.log(`🚀 Iniciando prueba masiva: ${TOTAL_REQUESTS} peticiones a ${URL}`);
console.log(`⚙️  Concurrencia: ${CONCURRENCY}\n`);

function incStatus(code) {
  statusCounts.set(code, (statusCounts.get(code) || 0) + 1);
}

function requestOnce() {
  inFlight++;
  dispatched++;
  const req = client.request(URL, { method: 'GET', agent }, (res) => {
    res.on('data', () => undefined);
    res.on('end', () => {
      completed++;
      inFlight--;
      incStatus(res.statusCode || 0);
      pump();
      maybeFinish();
    });
  });
  req.on('error', () => {
    completed++;
    inFlight--;
    networkErrors++;
    pump();
    maybeFinish();
  });
  req.end();
}

function pump() {
  while (inFlight < CONCURRENCY && dispatched < TOTAL_REQUESTS) {
    requestOnce();
  }
}

function maybeFinish() {
  if (completed !== TOTAL_REQUESTS) return;
  const seconds = (Date.now() - startedAt) / 1000;
  const table = {
    'Total Peticiones': TOTAL_REQUESTS,
    'Concurrencia': CONCURRENCY,
    'Duración (s)': Number(seconds.toFixed(2)),
  };

  const sorted = Array.from(statusCounts.entries()).sort((a, b) => a[0] - b[0]);
  for (const [code, count] of sorted) {
    table[`HTTP ${code}`] = count;
  }
  if (networkErrors > 0) table['Errores de red'] = networkErrors;

  console.table(table);
  console.log('\n✅ Prueba finalizada. Tómale captura a esta tabla para tu informe del 25%.');
  process.exit(0);
}

pump();
