/* =====================================================================
   Banco de dados local em TXT (db-local-txt/db.txt)

   Modos de gravação (escolhidos automaticamente):
   1. SERVIDOR  — sistema aberto pelo "node servidor.js":
                  cada operação é gravada DIRETAMENTE no db.txt,
                  sem nenhuma janela. (Modo recomendado.)
   2. ARQUIVO   — Chrome/Edge com o db.txt vinculado manualmente na
                  aba "Banco db.txt" (File System Access API).
   3. NAVEGADOR — GitHub Pages/Live Server sem vínculo: os dados ficam
                  no cache do navegador até poderem ser gravados.

   O arquivo é a fonte da verdade: alterações feitas fora do sistema
   (ex.: editando no VS Code) são detectadas e recarregadas.

   Formato: blocos legíveis + uma linha "@registro {json}" por registro.
   ===================================================================== */
'use strict';

P5.db = (function () {
  var C = P5.config;
  var U = P5.util;
  var PENDENTE_KEY = 'p5.db.pendente';
  var MARCADOR = '@registro ';
  var LARGURA = 72;
  var IDB_NOME = 'p5-escala';
  var IDB_STORE = 'arquivos';
  var API = 'api/db';

  var registros = [];
  var modoServidor = false;
  var arquivo = null;             // FileSystemFileHandle com permissão
  var arquivoSemPermissao = null; // handle salvo aguardando permissão
  var ultimaModificacao = 0;
  var ultimosErros = 0;
  var ultimaFalha = '';
  var ouvintes = [];
  var monitor = null;

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

  function sanitizar(r) {
    if (!r || typeof r !== 'object') return null;
    var rec = {
      id: RE_ID.test(r.id || '') ? r.id : U.uid('e'),
      semana: Number(r.semana) === 2 ? 2 : 1,
      tipo: C.tipos[r.tipo] ? r.tipo : 'expediente',
      inicio: U.deISO(r.inicio) ? r.inicio : '',
      termino: U.deISO(r.termino) ? r.termino : '',
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
          semana: s.numero, tipo: 'expediente', inicio: s.inicio, termino: s.termino, grad: p.grad, nome: p.nome,
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
    if (a.semana !== b.semana) return a.semana - b.semana;
    var ga = C.graduacoes.indexOf(a.grad), gb = C.graduacoes.indexOf(b.grad);
    if (ga !== gb) return gb - ga; // maior graduação primeiro
    return a.nome.localeCompare(b.nome, 'pt-BR');
  }

  function agrupar(lista) {
    var grupos = [], mapa = {};
    lista.slice().sort(comparar).forEach(function (r) {
      var k = r.semana + '|' + r.inicio + '|' + r.termino;
      if (!mapa[k]) { mapa[k] = { chave: k, semana: r.semana, inicio: r.inicio, termino: r.termino, itens: [] }; grupos.push(mapa[k]); }
      mapa[k].itens.push(r);
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
      out.push('  SEMANA ' + g.semana + '  •  ' + U.br(g.inicio) + ' (' + U.diaSemana(g.inicio) + ') a ' + U.br(g.termino) + ' (' + U.diaSemana(g.termino) + ')');
      out.push('  Efetivo: ' + g.itens.length + ' policial(is)');
      out.push(linha('='));
      g.itens.forEach(function (r) {
        n++;
        out.push('');
        out.push('  [' + String(n).padStart(4, '0') + ']  ' + col(r.grad, 11) + ' RG ' + col(r.rg || '—', 9) + ' ' + col(r.nome, 22) + ' Tipo: ' + C.tipos[r.tipo].label);
        out.push('          ID: ' + r.id + '   |   Criado: ' + U.dataHoraBR(r.criadoEm) + '   |   Atualizado: ' + U.dataHoraBR(r.atualizadoEm));
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
          if (r.nome !== obj.nome || r.observacoes !== (obj.observacoes || '')) normalizados++;
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

  function estado() {
    return {
      modo: modoServidor ? 'servidor' : arquivo ? 'arquivo' : 'navegador',
      registros: registros.length,
      pendente: pendente(),
      vinculado: modoServidor || !!arquivo,
      reconectar: !modoServidor && !arquivo && !!arquivoSemPermissao,
      nomeArquivo: modoServidor ? C.dbPath : arquivo ? arquivo.name : arquivoSemPermissao ? arquivoSemPermissao.name : null,
      suportaArquivo: !modoServidor && typeof window.showOpenFilePicker === 'function',
      erros: ultimosErros,
      falha: ultimaFalha
    };
  }

  function cache(texto) { try { localStorage.setItem(C.dbCacheKey, texto); } catch (e) { /* cota */ } }
  function lerCache() { try { return localStorage.getItem(C.dbCacheKey); } catch (e) { return null; } }

  /* ---------- API do servidor local ---------- */
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

  /* Procura o servidor local: primeiro na própria origem (node servidor.js);
     se a página veio do Live Server (localhost), usa o servidor da porta 5510. */
  var API_LOCAL = 'http://127.0.0.1:5510/api/db';
  function ehLocal() { return location.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname); }

  async function lerApi() {
    var r = await lerApiEm(API);
    if (r || modoServidor) return r;
    if (ehLocal() && API !== API_LOCAL) {
      r = await lerApiEm(API_LOCAL);
      if (r) API = API_LOCAL;
    }
    return r;
  }

  /* ---------- Inicialização ---------- */
  async function iniciar() {
    var srv = await lerApi();
    if (srv) {
      modoServidor = true;
      var lido = interpretar(srv.texto);
      registros = lido.registros;
      ultimosErros = lido.erros;
      ultimaModificacao = srv.mtime;
      // alterações que ficaram só no navegador (antes do servidor) são gravadas agora
      if (pendente()) mesclar(interpretar(lerCache()).registros);
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

      var h = await idbObter();
      if (h) {
        try {
          if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') { arquivo = h; await sincronizarComArquivo(); }
          else arquivoSemPermissao = h;
        } catch (e) { arquivoSemPermissao = null; }
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
    if (pendente()) { mesclar(lido.registros); await gravar(); }
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

  var verificando = false;
  /* Servidor local ligado depois da página aberta: conecta e grava o que estava pendente */
  async function tentarServidor() {
    var srv = await lerApi();
    if (!srv) return;
    modoServidor = true;
    var lido = interpretar(srv.texto);
    var locais = registros;
    registros = lido.registros;
    ultimosErros = lido.erros;
    ultimaModificacao = srv.mtime;
    if (pendente()) mesclar(locais);
    if (pendente() || lido.normalizados) await gravar();
    else cache(serializar(registros));
    emitir('servidor');
  }

  async function verificarExterno() {
    if (verificando) return;
    if (!modoServidor && !arquivo) {
      if (!ehLocal()) return;
      verificando = true;
      try { await tentarServidor(); } finally { verificando = false; }
      return;
    }
    verificando = true;
    try {
      var texto = null, mtime = 0;
      if (modoServidor) {
        var info = await (await apiFetch(API + '/info')).json();
        if (info.mtime !== ultimaModificacao) { var srv = await lerApi(); if (srv) { texto = srv.texto; mtime = srv.mtime; } }
      } else {
        var f = await arquivo.getFile();
        if (f.lastModified !== ultimaModificacao) { texto = await f.text(); mtime = f.lastModified; }
      }
      if (texto != null) {
        var lido = interpretar(texto);
        registros = lido.registros;
        ultimosErros = lido.erros;
        ultimaModificacao = mtime;
        cache(serializar(registros));
        marcarPendente(false);
        if (lido.normalizados) await gravar(); // mantém o .txt sempre em MAIÚSCULAS
        emitir('externo');
      }
    } catch (e) {
      if (!modoServidor) { arquivoSemPermissao = arquivo; arquivo = null; emitir('desconectado'); }
    } finally { verificando = false; }
  }

  /* ---------- Gravação imediata ---------- */
  async function gravar() {
    var texto = serializar(registros);
    cache(texto);
    ultimaFalha = '';

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

  /* Reautoriza um arquivo já vinculado (só um aviso de permissão, sem seletor) */
  async function reconectar() {
    if (modoServidor || arquivo) return true;
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
    mesclar(lido.registros);
    ultimosErros = lido.erros;
    await gravar();
    emitir('vinculado');
    return true;
  }

  async function desvincular() {
    arquivo = null;
    arquivoSemPermissao = null;
    await idbApagar();
    emitir('desvinculado');
  }

  function mesclar(novos) {
    var res = { novos: 0, atualizados: 0 };
    novos.forEach(function (n) {
      var i = registros.findIndex(function (r) { return r.id === n.id; });
      if (i === -1) { registros.push(n); res.novos++; }
      else if (n.atualizadoEm > registros[i].atualizadoEm) { registros[i] = n; res.atualizados++; }
    });
    return res;
  }

  /* ---------- Regras de integridade (sem datas retroativas) ----------
     • Não se lança nem se altera escala com data anterior a hoje.
     • Registro cujo período já começou fica bloqueado (sem editar/excluir).
     • RG Militar com 5 a 6 dígitos. */
  function bloqueado(r) { return !!r && r.inicio < U.hojeISO(); }

  /* ---------- CRUD ---------- */
  function todos() { return registros.slice().sort(comparar); }
  function obter(id) { return registros.find(function (r) { return r.id === id; }) || null; }

  function conflito(rec) {
    var nome = U.normalizar(rec.nome);
    return registros.find(function (r) {
      var mesmo = rec.rg && r.rg ? r.rg === rec.rg : U.normalizar(r.nome) === nome;
      return r.id !== rec.id && mesmo && r.inicio <= rec.termino && r.termino >= rec.inicio;
    }) || null;
  }

  async function salvar(rec) {
    var limpo = sanitizar(rec);
    if (!limpo) throw new Error('Registro inválido.');
    var hoje = U.hojeISO();
    var i = registros.findIndex(function (r) { return r.id === limpo.id; });
    if (i !== -1 && bloqueado(registros[i])) throw new Error('Este lançamento já começou e está bloqueado para alterações.');
    if (limpo.inicio < hoje || limpo.termino < hoje) throw new Error('Não é permitido lançar datas anteriores a hoje (' + U.br(hoje) + ').');
    if (!/^[0-9]{5,6}$/.test(limpo.rg)) throw new Error('O RG Militar deve ter de 5 a 6 dígitos.');

    var agora = Date.now();
    var novo = i === -1;
    limpo.atualizadoEm = agora;
    if (novo) { limpo.criadoEm = agora; registros.push(limpo); }
    else { limpo.criadoEm = registros[i].criadoEm; registros[i] = limpo; }
    var gravou = await gravar();
    emitir(novo ? 'incluido' : 'alterado');
    return { registro: limpo, novo: novo, gravouArquivo: gravou, falha: ultimaFalha };
  }

  async function remover(id) {
    if (bloqueado(obter(id))) throw new Error('Este lançamento já começou e não pode ser excluído.');
    registros = registros.filter(function (r) { return r.id !== id; });
    var gravou = await gravar();
    emitir('excluido');
    return { gravouArquivo: gravou, falha: ultimaFalha };
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

  async function importar(file) {
    if (!file || file.size > 5 * 1024 * 1024) throw new Error('Arquivo inválido ou maior que 5 MB.');
    var lido = interpretar(await file.text());
    var res = mesclar(lido.registros);
    res.erros = lido.erros;
    res.gravouArquivo = await gravar();
    emitir('importado');
    return res;
  }

  async function recarregarServidor() {
    var texto = modoServidor ? (await lerApi() || {}).texto : await lerServidorEstatico();
    if (texto == null) throw new Error('Não foi possível ler ' + C.dbPath + '.');
    var lido = interpretar(texto);
    var res = mesclar(lido.registros);
    res.erros = lido.erros;
    res.gravouArquivo = await gravar();
    emitir('importado');
    return res;
  }

  function texto() { return serializar(registros); }

  return {
    iniciar: iniciar, aoMudar: aoMudar, estado: estado,
    todos: todos, obter: obter, salvar: salvar, remover: remover,
    conflito: conflito, bloqueado: bloqueado, agrupar: agrupar,
    reconectar: reconectar, vincular: vincular, desvincular: desvincular,
    baixar: baixar, importar: importar, recarregarServidor: recarregarServidor, texto: texto
  };
})();
