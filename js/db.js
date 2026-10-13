/* =====================================================================
   Banco de dados em TXT (db-local-txt/db.txt)

   Modos de gravação (escolhidos automaticamente):
   1. SERVIDOR  — sistema aberto com "node servidor.js" (ou Live Server
                  com o servidor ligado): grava DIRETAMENTE no db.txt
                  do computador, sem janelas.
   2. GITHUB    — GitHub Pages com token conectado: cada operação vira
                  um COMMIT no db.txt do repositório (API do GitHub).
                  Só quem tem o token consegue gravar.
   3. ARQUIVO   — Chrome/Edge com o db.txt vinculado manualmente.
   4. NAVEGADOR — sem nenhum dos anteriores: os dados ficam no cache do
                  navegador (pendentes) até poderem ser gravados.

   O arquivo é a fonte da verdade: alterações feitas fora do sistema
   são detectadas e recarregadas.

   Formato: blocos legíveis + uma linha "@registro {json}" por registro.
   ===================================================================== */
'use strict';

P5.db = (function () {
  var C = P5.config;
  var U = P5.util;
  /* Repositório onde o db.txt é gravado: detectado pelo endereço do Pages
     (dono.github.io/repositorio). Fora do Pages, usa P5.config.github.
     Assim o mesmo código funciona em qualquer conta sem editar nada. */
  function repoDoSite(cfg) {
    var h = location.hostname.toLowerCase();
    if (/\.github\.io$/.test(h)) {
      var dono = h.replace(/\.github\.io$/, '');
      var seg = location.pathname.split('/').filter(Boolean)[0];
      var repo = seg && !/\.html?$/i.test(seg) ? seg : h; // site de usuário: dono.github.io
      return Object.assign({}, cfg, { dono: dono, repo: repo });
    }
    return cfg;
  }
  var GH = repoDoSite(C.github);
  var PENDENTE_KEY = 'p5.db.pendente';
  var MARCADOR = '@registro ';
  var LARGURA = 72;
  var IDB_NOME = 'p5-escala';
  var IDB_STORE = 'arquivos';
  var API = 'api/db';
  var API_LOCAL = 'http://127.0.0.1:5510/api/db';
  var GH_URL = 'https://api.github.com/repos/' + GH.dono + '/' + GH.repo + '/contents/' + C.dbPath;

  var registros = [];
  var modoServidor = false;
  var modoGithub = false;
  var ghSha = null;               // versão atual do db.txt no repositório
  var ghEtag = null;
  var ghUltimoCommit = null;
  var arquivo = null;             // FileSystemFileHandle com permissão
  var arquivoSemPermissao = null; // handle salvo aguardando permissão
  var ultimaModificacao = 0;
  var ultimosErros = 0;
  var ultimaFalha = '';
  var ouvintes = [];
  var monitor = null;
  var ciclo = 0;

  /* ---------- IndexedDB (guarda o vínculo com o arquivo) ---------- */
  function idb(modo, fn) {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { resolve(null); return; }
      var req = indexedDB.open(IDB_NOME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        var tx = req.result.transaction(IDB_STORE, modo);
        var r = fn(tx.objectStore(IDB_STORE));
        tx.oncomplete = function () { resolve(r && 'result' in r ? r.result : null); };
        tx.onerror = function () { reject(tx.error); };
      };
    });
  }
  function idbObter() { return idb('readonly', function (s) { return s.get('db.txt'); }).catch(function () { return null; }); }
  function idbGravar(h) { return idb('readwrite', function (s) { s.put(h, 'db.txt'); }).catch(function () { /* ignora */ }); }
  function idbApagar() { return idb('readwrite', function (s) { s.delete('db.txt'); }).catch(function () { /* ignora */ }); }

  /* ---------- Sanitização (o .txt é tratado como não confiável) ---------- */
  var RE_ID = /^[a-z]+-[0-9a-f]{16}$/;

  /* Dias trabalhados: datas válidas, sem repetição, todas na mesma semana.
     Sem a lista (registros antigos), vale todo o período início–término. */
  function sanitizarDias(r) {
    var dias = Array.isArray(r.dias) ? r.dias.filter(function (d) { return U.deISO(d); }) : [];
    dias = dias.filter(function (d, i) { return dias.indexOf(d) === i; }).sort();
    if (dias.length) {
      var seg = U.segundaDaSemana(dias[0]);
      dias = dias.filter(function (d) { return U.segundaDaSemana(d) === seg; });
    } else if (U.deISO(r.inicio)) {
      var fim = U.deISO(r.termino) && r.termino >= r.inicio ? r.termino : r.inicio;
      if (fim > U.domingoDaSemana(r.inicio)) fim = U.domingoDaSemana(r.inicio);
      dias = U.diasDoIntervalo(r.inicio, fim);
    }
    return dias;
  }

  function sanitizar(r) {
    if (!r || typeof r !== 'object') return null;
    var dias = sanitizarDias(r);
    var inicio = dias[0] || '', termino = dias[dias.length - 1] || '';
    var rec = {
      id: RE_ID.test(r.id || '') ? r.id : U.uid('e'),
      semana: U.semanaDoMes(inicio),     // S1, S2… dentro do mês (calculada pela data)
      mes: U.mesDe(inicio),              // 'AAAA-MM'
      tipo: C.tipos[r.tipo] ? r.tipo : 'expediente',
      inicio: inicio,                    // primeiro dia trabalhado
      termino: termino,                  // último dia trabalhado
      dias: dias,                        // dias trabalhados na semana
      grad: C.graduacoes.indexOf(r.grad) !== -1 ? r.grad : '',
      rg: String(r.rg == null ? '' : r.rg).replace(/\D/g, '').slice(0, 6),
      nome: U.limpar(r.nome, 60).toLocaleUpperCase('pt-BR'),
      observacoes: P5.rich.maiusculas(r.observacoes || ''),
      criadoEm: Number(r.criadoEm) || Date.now(),
      atualizadoEm: Number(r.atualizadoEm) || Date.now()
    };
    if (!rec.inicio || !rec.termino || !rec.grad || !rec.nome || rec.termino < rec.inicio) return null;
    return rec;
  }

  /* Converte registros do formato anterior (gestão com semanas/efetivo) */
  function migrarAntigo(g) {
    var lista = [];
    (g.semanas || []).forEach(function (s) {
      (s.policiais || []).forEach(function (p) {
        var r = sanitizar({
          tipo: 'expediente', inicio: s.inicio, termino: s.termino, grad: p.grad, nome: p.nome,
          observacoes: s.observacoes ? P5.rich.deTexto(s.observacoes) : '',
          criadoEm: g.criadoEm, atualizadoEm: g.atualizadoEm
        });
        if (r) lista.push(r);
      });
    });
    return lista;
  }

  /* ---------- Ordenação e agrupamento ---------- */
  function comparar(a, b) {
    if (a.inicio !== b.inicio) return a.inicio < b.inicio ? -1 : 1;
    var ga = C.graduacoes.indexOf(a.grad), gb = C.graduacoes.indexOf(b.grad);
    if (ga !== gb) return gb - ga; // maior graduação primeiro
    return a.nome.localeCompare(b.nome, 'pt-BR');
  }

  function agrupar(lista) {
    var grupos = [], mapa = {};
    lista.slice().sort(comparar).forEach(function (r) {
      var k = r.mes + '|' + r.semana;
      if (!mapa[k]) { mapa[k] = { chave: k, mes: r.mes, semana: r.semana, inicio: r.inicio, termino: r.termino, itens: [] }; grupos.push(mapa[k]); }
      var g = mapa[k];
      if (r.inicio < g.inicio) g.inicio = r.inicio;
      if (r.termino > g.termino) g.termino = r.termino;
      g.itens.push(r);
    });
    return grupos;
  }

  /* ---------- Serialização TXT ---------- */
  function linha(c) { return new Array(LARGURA + 1).join(c); }
  function col(t, n) { t = String(t); return t.length >= n ? t.slice(0, n) : t + new Array(n - t.length + 1).join(' '); }

  function serializar(lista) {
    var out = [];
    var grupos = agrupar(lista);
    out.push(linha('#'));
    out.push('#  DB-LOCAL-TXT • ESCALA P5 • COMUNICAÇÃO SOCIAL • ' + C.unidade);
    out.push('#  Cada registro tem um bloco legível e uma linha "@registro" (JSON),');
    out.push('#  que é a parte lida pelo sistema. Não altere a estrutura dessa linha.');
    out.push('#  Atualizado em: ' + U.dataHoraBR(Date.now()) + '   |   Registros: ' + lista.length + '   |   Períodos: ' + grupos.length);
    out.push(linha('#'));

    var n = 0;
    grupos.forEach(function (g) {
      out.push('');
      out.push(linha('='));
      out.push('  S' + g.semana + ' • ' + g.semana + 'ª SEMANA DE ' + U.nomeMes(g.mes).toUpperCase() + '  •  ' + U.br(g.inicio) + ' (' + U.diaSemana(g.inicio) + ') a ' + U.br(g.termino) + ' (' + U.diaSemana(g.termino) + ')');
      out.push('  Efetivo: ' + g.itens.length + ' policial(is)');
      out.push(linha('='));
      g.itens.forEach(function (r) {
        n++;
        out.push('');
        out.push('  [' + String(n).padStart(4, '0') + ']  ' + col(r.grad, 11) + ' RG ' + col(r.rg || '—', 9) + ' ' + col(r.nome, 22) + ' Tipo: ' + C.tipos[r.tipo].label);
        out.push('          ID: ' + r.id + '   |   Criado: ' + U.dataHoraBR(r.criadoEm) + '   |   Atualizado: ' + U.dataHoraBR(r.atualizadoEm));
        out.push('          Dias: ' + U.rotuloDias(r.dias) + '   (' + r.dias.length + ' dia' + (r.dias.length > 1 ? 's' : '') + ')');
        var obs = P5.rich.texto(r.observacoes);
        out.push('          Observações:' + (obs ? '' : ' —'));
        if (obs) obs.split('\n').forEach(function (l) { out.push('            ' + l); });
        out.push(MARCADOR + JSON.stringify(r));
        out.push('  ' + linha('-').slice(2));
      });
    });

    out.push('');
    out.push('# FIM DO ARQUIVO');
    return out.join('\r\n') + '\r\n';
  }

  function interpretar(texto) {
    var lista = [], erros = 0, normalizados = 0, vistos = {};
    String(texto || '').split(/\r?\n/).forEach(function (l) {
      if (l.indexOf(MARCADOR) !== 0) return;
      try {
        var obj = JSON.parse(l.slice(MARCADOR.length));
        var novos = Array.isArray(obj.semanas) ? migrarAntigo(obj) : [sanitizar(obj)];
        novos.forEach(function (r) {
          if (!r) { erros++; return; }
          if (r.nome !== obj.nome || r.observacoes !== (obj.observacoes || '') || r.semana !== Number(obj.semana) || r.mes !== obj.mes ||
              r.inicio !== obj.inicio || r.termino !== obj.termino || JSON.stringify(r.dias) !== JSON.stringify(obj.dias)) normalizados++;
          if (vistos[r.id]) return;
          vistos[r.id] = 1;
          lista.push(r);
        });
      } catch (e) { erros++; }
    });
    return { registros: lista, erros: erros, normalizados: normalizados };
  }

  /* ---------- Estado e eventos ---------- */
  function emitir(evento) {
    var est = estado();
    est.evento = evento || 'mudanca';
    ouvintes.forEach(function (fn) { try { fn(est); } catch (e) { console.error(e); } });
  }
  function aoMudar(fn) { ouvintes.push(fn); }

  function pendente() { try { return localStorage.getItem(PENDENTE_KEY) === '1'; } catch (e) { return false; } }
  function marcarPendente(v) { try { if (v) localStorage.setItem(PENDENTE_KEY, '1'); else localStorage.removeItem(PENDENTE_KEY); } catch (e) { /* ignora */ } }

  function ehLocal() { return location.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname); }

  function estado() {
    var modo = modoServidor ? 'servidor' : modoGithub ? 'github' : arquivo ? 'arquivo' : 'navegador';
    return {
      modo: modo,
      registros: registros.length,
      pendente: pendente(),
      vinculado: modo !== 'navegador',
      reconectar: modo === 'navegador' && !!arquivoSemPermissao,
      nomeArquivo: modoServidor ? C.dbPath
        : modoGithub ? GH.dono + '/' + GH.repo + ' → ' + C.dbPath
        : arquivo ? arquivo.name : arquivoSemPermissao ? arquivoSemPermissao.name : null,
      suportaArquivo: !modoServidor && !modoGithub && typeof window.showOpenFilePicker === 'function',
      podeGithub: !modoServidor && !ehLocal() && !!window.fetch,
      ultimoCommit: ghUltimoCommit,
      erros: ultimosErros,
      falha: ultimaFalha
    };
  }

  function cache(texto) { try { localStorage.setItem(C.dbCacheKey, texto); } catch (e) { /* cota */ } }
  function lerCache() { try { return localStorage.getItem(C.dbCacheKey); } catch (e) { return null; } }

  /* =================================================================
     SERVIDOR LOCAL
     ================================================================= */
  function apiFetch(url, opcoes) {
    opcoes = opcoes || {};
    opcoes.cache = 'no-store';
    opcoes.headers = Object.assign({ 'X-P5': '1' }, opcoes.headers || {});
    return fetch(url, opcoes);
  }

  async function lerApiEm(base) {
    try {
      var resp = await apiFetch(base);
      if (!resp.ok) return null;
      return { texto: await resp.text(), mtime: Number(resp.headers.get('X-DB-Mtime')) || 0 };
    } catch (e) { return null; }
  }

  async function lerApi() {
    if (!ehLocal()) return null; // no GitHub Pages não há servidor local
    var r = await lerApiEm(API);
    if (r || modoServidor) return r;
    if (API !== API_LOCAL) {
      r = await lerApiEm(API_LOCAL);
      if (r) API = API_LOCAL;
    }
    return r;
  }

  /* =================================================================
     GITHUB (API de conteúdo do repositório)
     ================================================================= */
  function tokenGithub() { try { return sessionStorage.getItem(GH.tokenKey); } catch (e) { return null; } }

  function paraBase64(texto) {
    var bytes = new TextEncoder().encode(texto), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function deBase64(b64) {
    var bin = atob(String(b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function ghFetch(token, opcoes) {
    opcoes = opcoes || {};
    opcoes.cache = 'no-store';
    opcoes.headers = Object.assign({
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28'
    }, opcoes.headers || {});
    return fetch(GH_URL + (opcoes.method && opcoes.method !== 'GET' ? '' : '?ref=' + encodeURIComponent(GH.branch)), opcoes);
  }

  function erroGithub(status) {
    if (status === 401) return 'Token do GitHub inválido ou expirado.';
    if (status === 403) return 'O GitHub recusou a gravação: o token só tem permissão de leitura. No GitHub, edite o token → Repositories → Contents → "Read and write" e clique em Update.';
    if (status === 404) return 'O token não tem acesso ao repositório ' + GH.dono + '/' + GH.repo + '.';
    return 'GitHub respondeu com erro ' + status + '.';
  }

  /* Lê o db.txt do repositório. Retorna null se não mudou (ETag). */
  async function lerGithub(token, usarEtag) {
    var resp = await ghFetch(token, { headers: usarEtag && ghEtag ? { 'If-None-Match': ghEtag } : {} });
    if (resp.status === 304) return null;
    if (resp.status === 404) {
      // arquivo ainda não existe no repositório? confere se o token enxerga o repositório
      var repo = await fetch('https://api.github.com/repos/' + GH.dono + '/' + GH.repo, { cache: 'no-store', headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' } });
      if (!repo.ok) throw new Error(erroGithub(repo.status));
      return { texto: '', sha: null };
    }
    if (!resp.ok) throw new Error(erroGithub(resp.status));
    ghEtag = resp.headers.get('ETag');
    var j = await resp.json();
    return { texto: deBase64(j.content), sha: j.sha };
  }

  async function conectarGithub(token) {
    token = String(token || '').trim();
    if (!/^(github_pat_|ghp_|gho_|ghu_)[A-Za-z0-9_]{20,}$/.test(token)) throw new Error('Isso não parece um token do GitHub (começa com "github_pat_").');
    var remoto = await lerGithub(token, false);
    try { sessionStorage.setItem(GH.tokenKey, token); } catch (e) { /* ignora */ }
    modoGithub = true;
    ghSha = remoto.sha;
    var lido = interpretar(remoto.texto);
    var locais = registros;
    registros = lido.registros;
    ultimosErros = lido.erros;
    var gravou = true;
    if (pendente()) {
      var pend = locais;
      gravou = await operar(function (lista) { return mesclarEm(lista, pend).lista; }, 'sincroniza lançamentos pendentes do navegador');
    } else if (lido.normalizados) {
      gravou = await operar(function (lista) { return lista; }, 'normaliza o db.txt (maiúsculas)');
    } else cache(serializar(registros));
    if (!gravou) {
      // o token lê, mas o GitHub recusou a gravação: não finge que conectou
      var motivo = ultimaFalha.replace(' A alteração ficou salva no navegador.', '');
      registros = mesclarEm(registros, locais).lista;
      desconectarGithub();
      throw new Error(motivo);
    }
    emitir('github');
    return true;
  }

  function desconectarGithub() {
    try { sessionStorage.removeItem(GH.tokenKey); } catch (e) { /* ignora */ }
    modoGithub = false;
    ghSha = null;
    ghEtag = null;
    emitir('desvinculado');
  }

  async function gravarGithub(mensagem, aplicar) {
    var token = tokenGithub();
    var sessao = P5.auth.sessaoAtual();
    var corpoMsg = 'Escala P5: ' + (mensagem || 'atualiza o db.txt') + '\n\nOperação feita no sistema por ' +
      (sessao ? sessao.usuario : 'usuário não identificado') + ' em ' + U.dataHoraBR(Date.now()) + '.';
    for (var tentativa = 0; tentativa < 3; tentativa++) {
      var corpo = { message: corpoMsg, content: paraBase64(serializar(registros)), branch: GH.branch };
      if (ghSha) corpo.sha = ghSha;
      var resp = await ghFetch(token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      if (resp.ok) {
        var j = await resp.json();
        ghSha = j.content.sha;
        ghEtag = null;
        ghUltimoCommit = j.commit && j.commit.html_url;
        marcarPendente(false);
        return true;
      }
      if ((resp.status === 409 || resp.status === 422) && aplicar) {
        // alguém gravou antes: relê o repositório e reaplica a operação
        var remoto = await lerGithub(token, false);
        ghSha = remoto.sha;
        registros = aplicar(interpretar(remoto.texto).registros);
        cache(serializar(registros));
        continue;
      }
      throw new Error(erroGithub(resp.status));
    }
    throw new Error('Conflito de gravação repetido no GitHub. Tente de novo.');
  }

  /* =================================================================
     INICIALIZAÇÃO
     ================================================================= */
  async function iniciar() {
    var srv = await lerApi();
    if (srv) {
      modoServidor = true;
      var lido = interpretar(srv.texto);
      registros = lido.registros;
      ultimosErros = lido.erros;
      ultimaModificacao = srv.mtime;
      if (pendente()) registros = mesclarEm(registros, interpretar(lerCache()).registros).lista;
      if (pendente() || lido.normalizados) await gravar();
      else cache(serializar(registros));
    } else {
      var texto = lerCache();
      if (texto == null) {
        texto = await lerServidorEstatico();
        if (texto != null) cache(texto);
      }
      var l2 = interpretar(texto);
      registros = l2.registros;
      ultimosErros = l2.erros;

      var token = tokenGithub();
      if (token) {
        try { await conectarGithub(token); }
        catch (e) { ultimaFalha = e.message; desconectarGithub(); }
      } else {
        var h = await idbObter();
        if (h) {
          try {
            if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') { arquivo = h; await sincronizarComArquivo(); }
            else arquivoSemPermissao = h;
          } catch (e) { arquivoSemPermissao = null; }
        }
      }
    }
    iniciarMonitor();
    emitir('inicio');
  }

  async function lerServidorEstatico() {
    try {
      var resp = await fetch(C.dbPath + '?v=' + Date.now(), { cache: 'no-store' });
      return resp.ok ? await resp.text() : null;
    } catch (e) { return null; }
  }

  async function sincronizarComArquivo() {
    var f = await arquivo.getFile();
    var lido = interpretar(await f.text());
    if (pendente()) { registros = mesclarEm(lido.registros, registros).lista; await gravar(); }
    else {
      registros = lido.registros;
      ultimosErros = lido.erros;
      ultimaModificacao = f.lastModified;
      cache(serializar(registros));
      if (lido.normalizados) await gravar();
    }
  }

  /* ---------- Monitor: detecta alterações feitas fora do sistema ---------- */
  function iniciarMonitor() {
    if (monitor) return;
    var verificar = function () { if (document.visibilityState === 'visible') verificarExterno(); };
    monitor = setInterval(verificar, 3000);
    window.addEventListener('focus', verificar);
    document.addEventListener('visibilitychange', verificar);
  }

  async function tentarServidor() {
    var srv = await lerApi();
    if (!srv) return;
    modoServidor = true;
    var lido = interpretar(srv.texto);
    var locais = registros;
    registros = lido.registros;
    ultimosErros = lido.erros;
    ultimaModificacao = srv.mtime;
    if (pendente()) registros = mesclarEm(registros, locais).lista;
    if (pendente() || lido.normalizados) await gravar();
    else cache(serializar(registros));
    emitir('servidor');
  }

  var verificando = false;
  async function verificarExterno() {
    if (verificando) return;
    verificando = true;
    try {
      if (modoGithub) {
        if (++ciclo % 4 !== 0) return; // GitHub: a cada ~12 s (requisições 304 não gastam cota)
        var remoto = await lerGithub(tokenGithub(), true);
        if (remoto && remoto.sha !== ghSha) {
          ghSha = remoto.sha;
          aplicarExterno(remoto.texto);
          if (interpretar(remoto.texto).normalizados) await operar(function (l) { return l; }, 'normaliza o db.txt (maiúsculas)');
        }
        return;
      }
      if (!modoServidor && !arquivo) { if (ehLocal()) await tentarServidor(); return; }

      var texto = null, mtime = 0;
      if (modoServidor) {
        var info = await (await apiFetch(API + '/info')).json();
        if (info.mtime !== ultimaModificacao) { var srv = await lerApi(); if (srv) { texto = srv.texto; mtime = srv.mtime; } }
      } else {
        var f = await arquivo.getFile();
        if (f.lastModified !== ultimaModificacao) { texto = await f.text(); mtime = f.lastModified; }
      }
      if (texto != null) {
        ultimaModificacao = mtime;
        aplicarExterno(texto);
        if (interpretar(texto).normalizados) await gravar(); // mantém o .txt sempre em MAIÚSCULAS
      }
    } catch (e) {
      if (arquivo) { arquivoSemPermissao = arquivo; arquivo = null; emitir('desconectado'); }
    } finally { verificando = false; }
  }

  function aplicarExterno(texto) {
    var lido = interpretar(texto);
    registros = lido.registros;
    ultimosErros = lido.erros;
    cache(serializar(registros));
    marcarPendente(false);
    emitir('externo');
  }

  /* =================================================================
     GRAVAÇÃO
     ================================================================= */
  /* Aplica uma operação e grava. "aplicar" recebe uma lista e devolve a nova
     lista — no GitHub ela é reaplicada se houver conflito de versões. */
  async function operar(aplicar, mensagem) {
    registros = aplicar(registros.slice());
    return gravar(mensagem, aplicar);
  }

  async function gravar(mensagem, aplicar) {
    var texto = serializar(registros);
    cache(texto);
    ultimaFalha = '';

    if (modoGithub) {
      try { return await gravarGithub(mensagem, aplicar); }
      catch (e) {
        ultimaFalha = e.message + ' A alteração ficou salva no navegador.';
        marcarPendente(true);
        return false;
      }
    }

    if (modoServidor) {
      try {
        var resp = await apiFetch(API, { method: 'PUT', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: texto });
        var r = await resp.json();
        if (!resp.ok || !r.ok) throw new Error(r.erro || 'Falha ao gravar.');
        ultimaModificacao = r.mtime;
        marcarPendente(false);
        return true;
      } catch (e) {
        ultimaFalha = 'Servidor local indisponível (' + e.message + '). A alteração ficou salva no navegador.';
        marcarPendente(true);
        return false;
      }
    }

    if (!arquivo) { marcarPendente(true); return false; }
    try {
      if ((await arquivo.queryPermission({ mode: 'readwrite' })) !== 'granted' &&
          (await arquivo.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permissão negada');
      var w = await arquivo.createWritable();
      await w.write(texto);
      await w.close();
      ultimaModificacao = (await arquivo.getFile()).lastModified;
      marcarPendente(false);
      return true;
    } catch (e) {
      ultimaFalha = 'Não foi possível gravar no db.txt (' + e.message + '). A alteração ficou salva no navegador.';
      marcarPendente(true);
      return false;
    }
  }

  /* ---------- Vínculo manual (modo ARQUIVO) ---------- */
  var TIPOS = [{ description: 'Banco de dados TXT', accept: { 'text/plain': ['.txt'] } }];

  async function reconectar() {
    if (modoServidor || modoGithub || arquivo) return true;
    if (!arquivoSemPermissao) return false;
    if ((await arquivoSemPermissao.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
    arquivo = arquivoSemPermissao;
    arquivoSemPermissao = null;
    await sincronizarComArquivo();
    emitir('vinculado');
    return true;
  }

  async function vincular() {
    var hs = await window.showOpenFilePicker({ types: TIPOS, multiple: false, id: 'p5-db-txt' });
    var h = hs[0];
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Permissão de escrita negada.');
    arquivo = h;
    arquivoSemPermissao = null;
    await idbGravar(h);
    var lido = interpretar(await (await h.getFile()).text());
    registros = mesclarEm(registros, lido.registros).lista;
    ultimosErros = lido.erros;
    await gravar();
    emitir('vinculado');
    return true;
  }

  async function desvincular() {
    if (modoGithub) { desconectarGithub(); return; }
    arquivo = null;
    arquivoSemPermissao = null;
    await idbApagar();
    emitir('desvinculado');
  }

  /* Mescla "novos" em "lista" (por ID; prevalece a versão mais recente) */
  function mesclarEm(lista, novos) {
    var res = { lista: lista.slice(), novos: 0, atualizados: 0 };
    novos.forEach(function (n) {
      var i = res.lista.findIndex(function (r) { return r.id === n.id; });
      if (i === -1) { res.lista.push(n); res.novos++; }
      else if (n.atualizadoEm > res.lista[i].atualizadoEm) { res.lista[i] = n; res.atualizados++; }
    });
    return res;
  }

  /* ---------- Regras de integridade ----------
     • Não se lança nem se altera escala com data anterior a hoje.
     • Registro cujo período já começou fica bloqueado (sem editar/excluir).
     • RG Militar com 5 a 6 dígitos. */
  function bloqueado(r) { return !!r && r.inicio < U.hojeISO(); }

  /* =================================================================
     CRUD
     ================================================================= */
  function todos() { return registros.slice().sort(comparar); }
  function obter(id) { return registros.find(function (r) { return r.id === id; }) || null; }

  function conflito(rec) {
    var nome = U.normalizar(rec.nome);
    return registros.find(function (r) {
      var mesmo = rec.rg && r.rg ? r.rg === rec.rg : U.normalizar(r.nome) === nome;
      return r.id !== rec.id && mesmo && (r.dias || []).some(function (d) { return (rec.dias || []).indexOf(d) !== -1; });
    }) || null;
  }

  function descrever(r) {
    return r.grad + ' ' + r.nome + ' (RG ' + r.rg + ') — ' + U.rotuloSemana(r) + ', ' + U.rotuloDias(r.dias) + ', ' + C.tipos[r.tipo].label;
  }

  async function salvar(rec) {
    var limpo = sanitizar(rec);
    if (!limpo) throw new Error('Registro inválido.');
    var hoje = U.hojeISO();
    var atual = obter(limpo.id);
    if (atual && bloqueado(atual)) throw new Error('Este lançamento já começou e está bloqueado para alterações.');
    if (!limpo.dias.length) throw new Error('Marque ao menos um dia de trabalho.');
    if (limpo.inicio < hoje || limpo.termino < hoje) throw new Error('Não é permitido lançar datas anteriores a hoje (' + U.br(hoje) + ').');
    if (!/^[0-9]{5,6}$/.test(limpo.rg)) throw new Error('O RG Militar deve ter de 5 a 6 dígitos.');
    if (limpo.termino > U.domingoDaSemana(limpo.inicio)) throw new Error('O lançamento deve ficar dentro de uma única semana (até domingo, ' + U.br(U.domingoDaSemana(limpo.inicio)) + ').');

    var agora = Date.now();
    var novo = !atual;
    limpo.atualizadoEm = agora;
    limpo.criadoEm = atual ? atual.criadoEm : agora;
    var aplicar = function (lista) {
      var j = lista.findIndex(function (r) { return r.id === limpo.id; });
      var copia = lista.slice();
      if (j === -1) copia.push(limpo);
      else { limpo.criadoEm = copia[j].criadoEm; copia[j] = limpo; }
      return copia;
    };
    var gravou = await operar(aplicar, (novo ? 'inclui ' : 'altera ') + descrever(limpo));
    emitir(novo ? 'incluido' : 'alterado');
    return { registro: limpo, novo: novo, gravouArquivo: gravou, falha: ultimaFalha, modo: estado().modo };
  }

  async function remover(id) {
    var atual = obter(id);
    if (bloqueado(atual)) throw new Error('Este lançamento já começou e não pode ser excluído.');
    var gravou = await operar(function (lista) {
      return lista.filter(function (r) { return r.id !== id; });
    }, 'exclui ' + (atual ? descrever(atual) : id));
    emitir('excluido');
    return { gravouArquivo: gravou, falha: ultimaFalha, modo: estado().modo };
  }

  /* ---------- Exportar / importar ---------- */
  function baixar() {
    var blob = new Blob(['﻿' + serializar(registros)], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = U.el('a', { href: url, download: 'db.txt' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    emitir('baixado');
  }

  async function importarTexto(texto, mensagem) {
    var lido = interpretar(texto);
    var stats = mesclarEm(registros, lido.registros);
    var gravou = await operar(function (lista) { return mesclarEm(lista, lido.registros).lista; }, mensagem);
    emitir('importado');
    return { novos: stats.novos, atualizados: stats.atualizados, erros: lido.erros, gravouArquivo: gravou };
  }

  async function importar(file) {
    if (!file || file.size > 5 * 1024 * 1024) throw new Error('Arquivo inválido ou maior que 5 MB.');
    return importarTexto(await file.text(), 'importa registros de ' + file.name);
  }

  async function recarregarServidor() {
    var texto = modoServidor ? (await lerApi() || {}).texto : await lerServidorEstatico();
    if (texto == null) throw new Error('Não foi possível ler ' + C.dbPath + '.');
    return importarTexto(texto, 'mescla registros do db.txt publicado');
  }

  function texto() { return serializar(registros); }

  return {
    iniciar: iniciar, aoMudar: aoMudar, estado: estado,
    todos: todos, obter: obter, salvar: salvar, remover: remover,
    conflito: conflito, bloqueado: bloqueado, agrupar: agrupar,
    reconectar: reconectar, vincular: vincular, desvincular: desvincular,
    repoGithub: function () { return GH.dono + '/' + GH.repo; },
    conectarGithub: conectarGithub, desconectarGithub: desconectarGithub,
    baixar: baixar, importar: importar, recarregarServidor: recarregarServidor, texto: texto
  };
})();
