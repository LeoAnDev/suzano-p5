/* =====================================================================
   ESCALA P5 • 29º BPM — Configuração geral (hard code)
   ===================================================================== */
'use strict';

window.P5 = window.P5 || {};

P5.config = Object.freeze({
  appName: 'Escala P5',
  unidade: '29º BPM',
  secao: 'P5 • Comunicação Social',

  /* Usuário único da seção (hard code).
     Credenciais guardadas apenas como hash SHA-256 com salt —
     nunca em texto puro no código-fonte. */
  auth: Object.freeze({
    salt: 'p5-29bpm::',
    userHash: '25926c393dc1906aa2b872a364f620a37b315a7cdf81cb7ab2c0a22ac38e7b82',
    passHash: 'ea2f8a3728f6b400bbcb8f31ec33d8466566f72070552c2ab5bc516405f68f5b'
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

  /* Horário de expediente exibido no painel e nos relatórios */
  horario: Object.freeze({ dias: 'Segunda-feira a Sábado', inicio: '08h00', fim: '18h00' }),

  semanas: Object.freeze([1, 2]),

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
