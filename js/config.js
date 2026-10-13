/* =====================================================================
   ESCALA P5 • 29º BPM — Configuração geral (hard code)
   ===================================================================== */
'use strict';

window.P5 = window.P5 || {};

P5.config = Object.freeze({
  appName: 'Escala P5',
  unidade: '29º BPM',
  secao: 'P5 • Comunicação Social',

  /* Usuário único da seção.
     Somente hashes PBKDF2-SHA-256 (310 mil iterações, salt aleatório):
     usuário e senha nunca aparecem no código nem na documentação.
     Para definir/trocar: node gerar-credenciais.js */
  auth: Object.freeze({
    salt: 'be572a36a99aeadb3c7b47d24c38cfbe',
    iteracoes: 310000,
    userHash: '949f4129c220f28aa9e04287a1b2992d45a1a77c206acdfeb2729ca3d3eb7d9f',
    passHash: '8ce7dbf73a7538099a0f3be68dd73c2cd6dd5a8fed7248d0766f8319ffcae80f',
    tokenCifrado: null
  }),

  /* Sessão */
  sessionKey: 'p5.session',
  flashKey: 'p5.flash',
  lockKey: 'p5.lock',
  viewKey: 'p5.view',
  sessionHours: 8,
  idleMinutes: 30,
  maxAttempts: 5,
  lockSeconds: 60,

  /* Banco de dados local (.txt) */
  dbPath: 'db-local-txt/db.txt',
  dbCacheKey: 'p5.db.txt',

  /* Gravação pelo GitHub Pages: cada operação vira um commit no db.txt
     do repositório (via API do GitHub, com token pessoal).
     No Pages, dono e repositório são detectados pelo endereço do site;
     os valores abaixo valem só fora do Pages (ex.: servidor local). */
  github: Object.freeze({
    dono: 'LeoAnDev',
    repo: 'suzano-p5',
    branch: 'main',
    tokenKey: 'p5.gh.token',
    criarToken: 'https://github.com/settings/personal-access-tokens/new'
  }),

  /* Horário de expediente exibido no painel e nos relatórios */
  horario: Object.freeze({ dias: 'Segunda-feira a Sábado', inicio: '08h00', fim: '18h00' }),



  /* Tipo de escala: rótulo, grupo, ícone (sprite SVG) e classe do badge */
  tipos: Object.freeze({
    expediente:  { label: 'Expediente',        grupo: 'Carga horária', icon: 'i-briefcase', badge: 'badge-expediente' },
    h12:         { label: '12 horas',          grupo: 'Carga horária', icon: 'i-timer',     badge: 'badge-h12' },
    h24:         { label: '24 horas',          grupo: 'Carga horária', icon: 'i-timer',     badge: 'badge-h24' },
    h48:         { label: '48 horas',          grupo: 'Carga horária', icon: 'i-timer',     badge: 'badge-h48' },
    feriado:     { label: 'Feriado',           grupo: 'Situação',      icon: 'i-star',      badge: 'badge-feriado' },
    troca:       { label: 'Troca',             grupo: 'Situação',      icon: 'i-swap',      badge: 'badge-troca' },
    sobreaviso:  { label: 'Sobreaviso',        grupo: 'Situação',      icon: 'i-bell',      badge: 'badge-sobreaviso' },
    facultativo: { label: 'Ponto facultativo', grupo: 'Situação',      icon: 'i-flag',      badge: 'badge-facultativo' },
    folga:       { label: 'Folga',             grupo: 'Situação',      icon: 'i-coffee',    badge: 'badge-folga' }
  }),

  graduacoes: Object.freeze([
    'SD PM',
    'CB PM',
    '3º SGT PM',
    '2º SGT PM',
    '1º SGT PM',
    'SUBTEN PM',
    'ASP PM',
    '2º TEN PM',
    '1º TEN PM',
    'CAP PM',
    'MAJ PM',
    'TEN CEL PM',
    'CEL PM'
  ]),

  diasSemana: Object.freeze(['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']),
  diasCurtos: Object.freeze(['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'])
});
