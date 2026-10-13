/* =====================================================================
   ESCALA P5 • 29º BPM — Definir usuário e senha de acesso

   Uso (no terminal, na pasta do projeto):
     node gerar-credenciais.js            → pergunta usuário e senha
     node gerar-credenciais.js --gerar    → cria uma senha forte aleatória

   O script grava em js/config.js APENAS:
     • um salt aleatório,
     • o número de iterações,
     • os hashes PBKDF2-SHA-256 do usuário e da senha.
   Usuário e senha NUNCA são gravados em nenhum arquivo.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG = path.join(__dirname, 'js', 'config.js');
const ITERACOES = 310000; // recomendação OWASP para PBKDF2-SHA-256

function hash(texto, saltHex) {
  return crypto.pbkdf2Sync(texto, Buffer.from(saltHex, 'hex'), ITERACOES, 32, 'sha256').toString('hex');
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
    if (!oculto) { rl.question(texto, (r) => resolve(r)); return; }
    const escrever = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(texto)) escrever.call(rl, s); else escrever.call(rl, '*'); };
    rl.question(texto, (r) => { rl._writeToOutput = escrever; process.stdout.write('\n'); resolve(r); });
  });
}

function gravar(usuario, senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const bloco =
    '  auth: Object.freeze({\n' +
    "    salt: '" + salt + "',\n" +
    '    iteracoes: ' + ITERACOES + ',\n' +
    "    userHash: '" + hash('usuario:' + usuario, salt) + "',\n" +
    "    passHash: '" + hash('senha:' + senha, salt) + "'\n" +
    '  }),';
  const conteudo = fs.readFileSync(CONFIG, 'utf8');
  const novo = conteudo.replace(/  auth: Object\.freeze\(\{[\s\S]*?\}\),/, bloco);
  if (novo === conteudo) throw new Error('Bloco "auth" não encontrado em js/config.js.');
  fs.writeFileSync(CONFIG, novo, 'utf8');
}

(async () => {
  console.log('\n  ESCALA P5 • definir credenciais de acesso\n');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  try {
    const usuario = (await perguntar(rl, '  Usuário: ')).trim();
    if (usuario.length < 4) throw new Error('O usuário deve ter ao menos 4 caracteres.');

    let senha;
    if (process.argv.includes('--gerar')) {
      senha = senhaForte();
    } else {
      senha = await perguntar(rl, '  Nova senha: ', true);
      const erros = avaliar(senha);
      if (erros.length) throw new Error('A senha deve ' + erros.join(', ') + '.');
      const conf = await perguntar(rl, '  Repita a senha: ', true);
      if (conf !== senha) throw new Error('As senhas não conferem.');
    }

    gravar(usuario, senha);
    console.log('\n  Credenciais atualizadas em js/config.js (somente hashes).');
    if (process.argv.includes('--gerar')) {
      console.log('\n  SENHA GERADA (anote em local seguro — ela não será exibida de novo):');
      console.log('\n      ' + senha + '\n');
    }
    console.log('  Faça commit e push para valer também no GitHub Pages.\n');
  } catch (e) {
    console.error('\n  Erro: ' + e.message + '\n');
    process.exitCode = 1;
  } finally {
    rl.close();
  }
})();
