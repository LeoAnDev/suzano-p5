/* =====================================================================
   ESCALA P5 • 29º BPM — Configuração de acesso (rodar UMA vez)

   Uso (no terminal, na pasta do projeto):
     node gerar-credenciais.js            → pergunta usuário, senha e token
     node gerar-credenciais.js --gerar    → cria uma senha forte aleatória

   O que é gravado em js/config.js (o arquivo é público no GitHub):
     • hashes PBKDF2-SHA-256 do usuário e da senha (310 mil iterações);
     • o token do GitHub CIFRADO com AES-256-GCM, com chave derivada da
       senha. Sem a senha, o token cifrado é inútil.
   Usuário, senha e token NUNCA são gravados em texto puro.

   Com o token configurado, quem entra no sistema publicado no GitHub
   Pages já grava no db.txt do repositório — sem colar token nenhum.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG = path.join(__dirname, 'js', 'config.js');
const ITERACOES = 310000; // recomendação OWASP para PBKDF2-SHA-256
/* Repositório detectado pelo "git remote" da pasta (funciona em qualquer conta) */
function repoDoGit() {
  try {
    const url = require('child_process').execSync('git remote get-url origin', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (m) return { dono: m[1], repo: m[2] };
  } catch (e) { /* sem git: usa o padrão */ }
  return { dono: 'LeoAnDev', repo: 'suzano-p5' };
}
const { dono: DONO, repo: REPO } = repoDoGit();

function hash(texto, saltHex) {
  return crypto.pbkdf2Sync(texto, Buffer.from(saltHex, 'hex'), ITERACOES, 32, 'sha256').toString('hex');
}

/* AES-256-GCM no formato do WebCrypto: dados = cifrado + tag (16 bytes) */
function cifrarToken(token, senha) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const chave = crypto.pbkdf2Sync('chave:' + senha, salt, ITERACOES, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([c.update(token, 'utf8'), c.final(), c.getAuthTag()]);
  return { salt: salt.toString('hex'), iv: iv.toString('hex'), dados: dados.toString('base64') };
}

function senhaForte() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_=+';
  let s = '';
  while (s.length < 20) {
    const b = crypto.randomBytes(1)[0];
    if (b < 256 - (256 % alfabeto.length)) s += alfabeto[b % alfabeto.length];
  }
  return s;
}

function avaliar(senha) {
  const erros = [];
  if (senha.length < 12) erros.push('ter ao menos 12 caracteres');
  if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha)) erros.push('misturar letras maiúsculas e minúsculas');
  if (!/[0-9]/.test(senha)) erros.push('ter números');
  if (!/[^A-Za-z0-9]/.test(senha)) erros.push('ter símbolos (ex.: ! @ # $ %)');
  return erros;
}

function perguntar(rl, texto, oculto) {
  return new Promise((resolve) => {
    if (!oculto || !process.stdin.isTTY) { rl.question(texto, (r) => resolve(r)); return; }
    const escrever = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(texto)) escrever.call(rl, s); else escrever.call(rl, '*'); };
    rl.question(texto, (r) => { rl._writeToOutput = escrever; process.stdout.write('\n'); resolve(r); });
  });
}

/* Confere se o token enxerga o repositório e pode ler o db.txt */
/* Confere LEITURA e ESCRITA de verdade.
   A escrita é testada criando e apagando na hora uma branch temporária
   (exige a mesma permissão "Contents: Read and write"), sem tocar no
   db.txt e sem criar commits. */
async function verificarToken(token) {
  if (typeof fetch !== 'function') throw new Error('Node.js muito antigo: instale a versão LTS em https://nodejs.org');
  const base = 'https://api.github.com/repos/' + DONO + '/' + REPO;
  const h = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'escala-p5', 'X-GitHub-Api-Version': '2022-11-28' };

  const r = await fetch(base + '/git/ref/heads/main', { headers: h });
  if (r.status === 401) throw new Error('Token inválido ou expirado. Gere outro no GitHub.');
  if (r.status === 404 || r.status === 403) throw new Error('O token NÃO tem acesso ao repositório ' + DONO + '/' + REPO + '. No GitHub, edite o token → Repository access → "Only select repositories" → escolha ' + REPO + ' → Update.');
  if (!r.ok) throw new Error('GitHub respondeu ' + r.status + ' na leitura.');
  console.log('    ✔ Leitura do repositório: OK');
  const sha = (await r.json()).object.sha;

  const ref = 'refs/heads/p5-teste-permissao-' + crypto.randomBytes(4).toString('hex');
  const w = await fetch(base + '/git/refs', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ ref: ref, sha: sha }) });
  if (w.status === 403 || w.status === 404) throw new Error('O token só LÊ o repositório, não GRAVA. No GitHub, edite o token → Permissions → Repositories → Contents → "Read and write" → Update.');
  if (!w.ok) throw new Error('GitHub respondeu ' + w.status + ' no teste de escrita.');
  await fetch(base + '/' + ref.replace('refs/', 'git/refs/'), { method: 'DELETE', headers: h });
  console.log('    ✔ Escrita no repositório: OK');
  return 'token pronto para gravar no db.txt';
}

/* node gerar-credenciais.js --testar  → só testa o token, não altera nada */
async function testarApenas() {
  console.log('\n  ESCALA P5 • testar token do GitHub (' + DONO + '/' + REPO + ')\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  try {
    const token = (await perguntar(rl, '  Cole o token (não aparece na tela): ', true)).trim();
    if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token)) throw new Error('Isso não parece um token fine-grained (começa com "github_pat_").');
    console.log('\n  Testando…');
    console.log('\n  RESULTADO: ' + await verificarToken(token) + '.\n');
  } catch (e) {
    console.error('\n  ✘ ' + e.message + '\n');
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

function gravar(usuario, senha, token) {
  const salt = crypto.randomBytes(16).toString('hex');
  const cif = token ? cifrarToken(token, senha) : null;
  const bloco =
    '  auth: Object.freeze({\n' +
    "    salt: '" + salt + "',\n" +
    '    iteracoes: ' + ITERACOES + ',\n' +
    "    userHash: '" + hash('usuario:' + usuario, salt) + "',\n" +
    "    passHash: '" + hash('senha:' + senha, salt) + "',\n" +
    '    tokenCifrado: ' + (cif ? "{ salt: '" + cif.salt + "', iv: '" + cif.iv + "', dados: '" + cif.dados + "' }" : 'null') + '\n' +
    '  }),';
  const conteudo = fs.readFileSync(CONFIG, 'utf8');
  const novo = conteudo.replace(/  auth: Object\.freeze\(\{[\s\S]*?\n  \}\),/, bloco);
  if (novo === conteudo) throw new Error('Bloco "auth" não encontrado em js/config.js.');
  fs.writeFileSync(CONFIG, novo, 'utf8');
}

async function principal() {
  console.log('\n  ESCALA P5 • configurar acesso\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  try {
    const usuario = (await perguntar(rl, '  Usuário: ')).trim();
    if (usuario.length < 4) throw new Error('O usuário deve ter ao menos 4 caracteres.');

    let senha;
    if (process.argv.includes('--gerar')) {
      senha = senhaForte();
    } else {
      senha = await perguntar(rl, '  Senha: ', true);
      const erros = avaliar(senha);
      if (erros.length) throw new Error('A senha deve ' + erros.join(', ') + '.');
      const conf = await perguntar(rl, '  Repita a senha: ', true);
      if (conf !== senha) throw new Error('As senhas não conferem.');
    }

    console.log('\n  Token do GitHub (github_pat_…) para gravar no db.txt de ' + DONO + '/' + REPO + ' pelo Pages.');
    console.log('  Deixe em branco para não usar gravação pelo Pages.');
    const token = (await perguntar(rl, '  Token: ', true)).trim();
    if (token) {
      if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token)) throw new Error('Isso não parece um token fine-grained (começa com "github_pat_").');
      console.log('  Verificando token…');
      console.log('  ' + await verificarToken(token));
    }

    gravar(usuario, senha, token);
    console.log('\n  Pronto! js/config.js atualizado (somente hashes e token cifrado).');
    if (process.argv.includes('--gerar')) {
      console.log('\n  SENHA GERADA (anote em local seguro — ela não será exibida de novo):');
      console.log('\n      ' + senha + '\n');
    }
    console.log('  Agora faça commit e push:  git add js/config.js && git commit -m "Atualiza acesso" && git push\n');
  } catch (e) {
    console.error('\n  Erro: ' + e.message + '\n');
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

if (require.main === module) (process.argv.includes('--testar') ? testarApenas : principal)();
module.exports = { gravar, cifrarToken, hash, verificarToken };
