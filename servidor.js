/* =====================================================================
   ESCALA P5 • 29º BPM — Servidor local (Node.js puro, sem dependências)

   • Entrega o sistema em http://127.0.0.1:5510/
   • Grava DIRETAMENTE em db-local-txt/db.txt a cada operação
     (sem janela de seleção de arquivo).

   Uso:   node servidor.js
   Porta: defina a variável PORT para trocar (padrão 5510).

   Segurança:
   • Escuta apenas em 127.0.0.1 (inacessível por outras máquinas).
   • Só grava um único arquivo: db-local-txt/db.txt.
   • Exige o cabeçalho "X-P5: 1" e Origem igual ao próprio servidor
     (bloqueia gravações disparadas por outros sites).
   • Gravação atômica (arquivo temporário + rename) e limite de 5 MB.
   • Bloqueia acesso a arquivos ocultos (.vscode, .git) e path traversal.
   ===================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORTA = Number(process.env.PORT) || 5510;
const RAIZ = __dirname;
const DB = path.join(RAIZ, 'db-local-txt', 'db.txt');
const LIMITE = 5 * 1024 * 1024;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

function responder(res, status, corpo, tipo, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': tipo || 'text/plain; charset=utf-8' }, SEGURANCA, extra || {}));
  res.end(corpo);
}

function json(res, status, obj) {
  responder(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}

/* Só aceita chamadas da própria página (mesma origem + cabeçalho próprio) */
/* Páginas locais autorizadas além do próprio servidor:
   Live Server do VS Code (portas 5500–5599 em 127.0.0.1/localhost). */
const RE_ORIGEM_LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):55\d\d$/;

function origemPermitida(origem, host) {
  return !origem || origem === 'http://' + host || RE_ORIGEM_LOCAL.test(origem);
}

function chamadaValida(req) {
  if (req.headers['x-p5'] !== '1') return false;
  const host = String(req.headers.host || '');
  if (host !== HOST + ':' + PORTA && host !== 'localhost:' + PORTA) return false;
  return origemPermitida(req.headers.origin, host);
}

/* CORS restrito às páginas locais autorizadas */
function cors(req, res) {
  const origem = req.headers.origin;
  if (origem && origemPermitida(origem, req.headers.host) && origem !== 'http://' + req.headers.host) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-P5, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'X-DB-Mtime');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function infoDb() {
  try {
    const st = fs.statSync(DB);
    return { existe: true, mtime: Math.floor(st.mtimeMs), tamanho: st.size };
  } catch (e) {
    return { existe: false, mtime: 0, tamanho: 0 };
  }
}

/* ---------- API do banco ---------- */
function api(req, res, rota) {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    const ok = origemPermitida(req.headers.origin, req.headers.host);
    res.writeHead(ok ? 204 : 403, SEGURANCA);
    return res.end();
  }
  if (!chamadaValida(req)) return json(res, 403, { ok: false, erro: 'Origem não autorizada.' });

  if (rota === '/api/db/info' && req.method === 'GET') return json(res, 200, Object.assign({ ok: true }, infoDb()));

  if (rota === '/api/db' && req.method === 'GET') {
    const info = infoDb();
    const texto = info.existe ? fs.readFileSync(DB, 'utf8').replace(/^﻿/, '') : '';
    return responder(res, 200, texto, 'text/plain; charset=utf-8', { 'Cache-Control': 'no-store', 'X-DB-Mtime': String(info.mtime) });
  }

  if (rota === '/api/db' && req.method === 'PUT') {
    if (!/^text\/plain/i.test(req.headers['content-type'] || '')) return json(res, 415, { ok: false, erro: 'Use text/plain.' });
    const partes = [];
    let total = 0;
    let abortado = false;
    req.on('data', (c) => {
      total += c.length;
      if (total > LIMITE) { abortado = true; json(res, 413, { ok: false, erro: 'Arquivo maior que 5 MB.' }); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (abortado) return;
      try {
        const texto = Buffer.concat(partes).toString('utf8');
        fs.mkdirSync(path.dirname(DB), { recursive: true });
        const tmp = DB + '.tmp';
        fs.writeFileSync(tmp, texto, 'utf8');
        fs.renameSync(tmp, DB);
        const info = infoDb();
        console.log('[' + new Date().toLocaleTimeString('pt-BR') + '] db.txt gravado (' + info.tamanho + ' bytes)');
        json(res, 200, { ok: true, mtime: info.mtime, tamanho: info.tamanho });
      } catch (e) {
        console.error('Falha ao gravar db.txt:', e.message);
        json(res, 500, { ok: false, erro: 'Falha ao gravar o db.txt: ' + e.message });
      }
    });
    return;
  }

  json(res, 405, { ok: false, erro: 'Operação não permitida.' });
}

/* ---------- Arquivos estáticos ---------- */
function estatico(req, res, rota) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return responder(res, 405, 'Método não permitido.');
  if (rota.split('/').some((seg) => seg.startsWith('.'))) return responder(res, 403, 'Acesso negado.');

  let alvo = path.resolve(RAIZ, '.' + rota);
  if (alvo !== RAIZ && !alvo.startsWith(RAIZ + path.sep)) return responder(res, 403, 'Acesso negado.');

  fs.stat(alvo, (err, st) => {
    if (!err && st.isDirectory()) alvo = path.join(alvo, 'index.html');
    fs.readFile(alvo, (erro, dados) => {
      if (erro) return responder(res, 404, 'Não encontrado.');
      const ext = path.extname(alvo);
      responder(res, 200, req.method === 'HEAD' ? '' : dados, TIPOS[ext] || 'application/octet-stream',
        { 'Cache-Control': ext === '.txt' || ext === '.html' ? 'no-store' : 'no-cache' });
    });
  });
}

const servidor = http.createServer((req, res) => {
  let rota;
  try { rota = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { return responder(res, 400, 'Requisição inválida.'); }
  if (rota.startsWith('/api/')) return api(req, res, rota);
  return estatico(req, res, rota);
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('A porta ' + PORTA + ' já está em uso. Feche o outro servidor ou use: PORT=5511 node servidor.js');
  else console.error(e);
  process.exit(1);
});

servidor.listen(PORTA, HOST, () => {
  const url = 'http://' + HOST + ':' + PORTA + '/';
  console.log('');
  console.log('  ESCALA P5 • 29º BPM — servidor local');
  console.log('  Acesse:  ' + url);
  console.log('  Banco:   ' + path.relative(RAIZ, DB) + ' (gravação direta)');
  console.log('  Parar:   Ctrl + C');
  console.log('');
  if (process.platform === 'win32' && !process.env.NO_OPEN) {
    require('child_process').exec('start "" "' + url + '"');
  }
});
