/* =====================================================================
   ESCALA P5 • 29º BPM — Aplicação
   Login • Painel • Lançamentos (formulário + tabela) • Consultas •
   Banco db.txt • Modo de usar
   ===================================================================== */
'use strict';

(function () {
  var C = P5.config;
  var U = P5.util;
  var el = U.el;
  var $ = function (s, ctx) { return (ctx || document).querySelector(s); };
  var $$ = function (s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); };
  var reduzMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =================================================================
     URL LIMPA — sem "#", sem "index.html", sem parâmetros.
     Funciona em qualquer endereço base:
       http://127.0.0.1:5500/                  (Live Server)
       https://leoandev.github.io/suzano-p5/   (GitHub Pages)
     ================================================================= */
  var BASE = window.location.pathname.replace(/index\.html?$/i, '');
  var rotaLegada = (window.location.hash.match(/^#\/?([a-z-]+)/) || [])[1];
  if (window.location.hash || window.location.search || BASE !== window.location.pathname) {
    history.replaceState(history.state, '', BASE);
  }

  /* =================================================================
     COMPONENTES GERAIS
     ================================================================= */
  function toast(msg, tipo) {
    var icones = { sucesso: 'i-check-circle', erro: 'i-alert', aviso: 'i-alert', info: 'i-info' };
    tipo = tipo || 'info';
    var t = el('div', { class: 'toast toast-' + tipo, role: tipo === 'erro' ? 'alert' : 'status' },
      el('span', { class: 'toast-icone' }, U.icone(icones[tipo])),
      el('span', { class: 'toast-texto', text: msg }),
      el('button', { type: 'button', class: 'toast-fechar', 'aria-label': 'Fechar notificação', on: { click: function () { sair(); } } }, U.icone('i-x'))
    );
    function sair() {
      if (t.classList.contains('saindo')) return;
      t.classList.add('saindo');
      setTimeout(function () { t.remove(); }, reduzMovimento ? 0 : 320);
    }
    $('#toasts').appendChild(t);
    // avisos e erros ficam mais tempo; o mouse em cima pausa o fechamento
    var duracao = tipo === 'erro' || tipo === 'aviso' ? 10000 : 4500;
    var timer = setTimeout(sair, duracao);
    t.addEventListener('mouseenter', function () { clearTimeout(timer); });
    t.addEventListener('mouseleave', function () { timer = setTimeout(sair, 2500); });
  }

  /* Modal no estilo "sheet" do macOS: entra e sai com animação */
  var dialogo = $('#dialogo');
  function fecharDialogo(valor) {
    if (!dialogo.open || dialogo.classList.contains('fechando')) return;
    dialogo.classList.add('fechando');
    setTimeout(function () {
      dialogo.classList.remove('fechando');
      dialogo.close(valor);
    }, reduzMovimento ? 0 : 200);
  }
  $('form', dialogo).addEventListener('submit', function (e) {
    e.preventDefault();
    fecharDialogo(e.submitter ? e.submitter.value : 'cancelar');
  });
  dialogo.addEventListener('cancel', function (e) { e.preventDefault(); fecharDialogo('cancelar'); });
  dialogo.addEventListener('click', function (e) { if (e.target === dialogo) fecharDialogo('cancelar'); });

  function confirmar(titulo, texto, rotuloOk, perigo) {
    $('#dialogo-titulo').textContent = titulo;
    $('#dialogo-texto').textContent = texto;
    var ok = $('#dialogo-ok');
    $('[data-texto]', ok).textContent = rotuloOk || 'Confirmar';
    ok.className = 'btn ' + (perigo === false ? 'btn-primary' : 'btn-danger');
    dialogo.returnValue = '';
    dialogo.showModal();
    ok.focus();
    return new Promise(function (resolve) {
      dialogo.addEventListener('close', function fim() {
        dialogo.removeEventListener('close', fim);
        resolve(dialogo.returnValue === 'ok');
      });
    });
  }

  /* ---------- Janela "Conectar ao GitHub" ---------- */
  var dlgGh = $('#dialogo-github');
  $('#gh-link').href = C.github.criarToken;
  function fecharGh(valor) {
    if (!dlgGh.open || dlgGh.classList.contains('fechando')) return;
    dlgGh.classList.add('fechando');
    setTimeout(function () { dlgGh.classList.remove('fechando'); dlgGh.close(valor); }, reduzMovimento ? 0 : 200);
  }
  $('form', dlgGh).addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!e.submitter || e.submitter.value !== 'ok') { fecharGh('cancelar'); return; }
    var erro = $('#gh-erro'), btn = $('#gh-ok'), campo = $('#gh-token');
    erro.hidden = true;
    btn.disabled = true;
    $('[data-texto]', btn).textContent = 'Conectando…';
    try {
      await P5.db.conectarGithub(campo.value);
      campo.value = '';
      fecharGh('ok');
    } catch (err) {
      erro.textContent = err.message;
      erro.hidden = false;
      campo.focus();
    } finally {
      btn.disabled = false;
      $('[data-texto]', btn).textContent = 'Conectar';
    }
  });
  dlgGh.addEventListener('cancel', function (e) { e.preventDefault(); fecharGh('cancelar'); });
  dlgGh.addEventListener('click', function (e) { if (e.target === dlgGh) fecharGh('cancelar'); });

  /* Abre a janela e resolve true se conectou */
  function abrirGithub() {
    $('#gh-erro').hidden = true;
    $('#gh-token').value = '';
    dlgGh.returnValue = '';
    dlgGh.showModal();
    $('#gh-token').focus();
    return new Promise(function (resolve) {
      dlgGh.addEventListener('close', function fim() {
        dlgGh.removeEventListener('close', fim);
        resolve(dlgGh.returnValue === 'ok');
      });
    });
  }

  function popularSelects(raiz) {
    $$('select[data-graduacoes]', raiz).forEach(function (s) {
      C.graduacoes.forEach(function (g) { s.appendChild(el('option', { value: g, text: g })); });
    });
    $$('select[data-tipos]', raiz).forEach(function (s) {
      var grupos = {};
      Object.keys(C.tipos).forEach(function (k) {
        var t = C.tipos[k];
        if (!grupos[t.grupo]) { grupos[t.grupo] = el('optgroup', { label: t.grupo }); s.appendChild(grupos[t.grupo]); }
        grupos[t.grupo].appendChild(el('option', { value: k, text: t.label }));
      });
    });
  }

  /* Campos de texto sempre em MAIÚSCULAS durante a digitação (cursor preservado) */
  function maiusculo(t) { return t.toLocaleUpperCase('pt-BR'); }
  $$('[data-maiusculas]').forEach(function (inp) {
    inp.addEventListener('beforeinput', function (e) {
      if (e.inputType !== 'insertText' || !e.data || maiusculo(e.data) === e.data) return;
      e.preventDefault();
      inp.setRangeText(maiusculo(e.data), inp.selectionStart, inp.selectionEnd, 'end');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    inp.addEventListener('input', function () {
      var up = maiusculo(inp.value);
      if (up === inp.value) return;
      var s = inp.selectionStart, f = inp.selectionEnd;
      inp.value = up;
      try { inp.setSelectionRange(s, f); } catch (err) { /* ignora */ }
    });
  });

  /* Abre o calendário nativo ao clicar em qualquer parte do campo de data */
  document.addEventListener('click', function (e) {
    var inp = e.target.closest('input[type="date"]');
    if (inp && typeof inp.showPicker === 'function') { try { inp.showPicker(); } catch (err) { /* ignora */ } }
    if (e.target.closest('[data-theme-toggle]')) trocarComTransicao(function () { P5.theme.alternar(); });
  });

  /* Troca de tema: esmaecimento suave da página inteira */
  function trocarComTransicao(fn) {
    if (!document.startViewTransition || reduzMovimento) { fn(); return; }
    document.startViewTransition(fn);
  }

  /* Transição entre páginas: o bloco atual esmaece e o novo entra deslizando.
     Só opacidade + transform (acelerados pela GPU) — sem desfoque, sem escala. */
  var trocaSeq = 0;
  function animarTroca(alvoAtual, fn, obterNovo) {
    var seq = ++trocaSeq;
    if (reduzMovimento || !alvoAtual) { fn(); return; }
    alvoAtual.classList.remove('anim-entra');
    alvoAtual.classList.add('anim-sai');
    setTimeout(function () {
      if (seq !== trocaSeq) return;
      alvoAtual.classList.remove('anim-sai');
      fn();
      var novo = obterNovo ? obterNovo() : alvoAtual;
      if (!novo) return;
      novo.classList.remove('anim-entra');
      void novo.offsetWidth;
      novo.classList.add('anim-entra');
      novo.addEventListener('animationend', function fim() { novo.classList.remove('anim-entra'); novo.removeEventListener('animationend', fim); });
    }, 130);
  }

  /* =================================================================
     LOGIN
     ================================================================= */
  function mostrarLogin() {
    $('#tela-app').hidden = true;
    $('#tela-login').hidden = false;
    P5.theme.sincronizar();
    var aviso = P5.auth.consumirAviso();
    var erro = $('#login-erro');
    if (aviso) { erro.textContent = aviso; erro.className = 'alert alert-info'; erro.hidden = false; }
    $('#login-usuario').focus();
  }

  $('#btn-ver-senha').addEventListener('click', function () {
    var inp = $('#login-senha');
    var mostrar = inp.type === 'password';
    inp.type = mostrar ? 'text' : 'password';
    this.setAttribute('aria-pressed', String(mostrar));
    this.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    $('use', this).setAttribute('href', mostrar ? '#i-eye-off' : '#i-eye');
  });

  $('#form-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    var erro = $('#login-erro');
    var btn = $('#btn-entrar');
    var usuario = $('#login-usuario').value;
    var senha = $('#login-senha').value;
    erro.hidden = true;

    if (!usuario.trim() || !senha) {
      erro.textContent = 'Informe usuário e senha.';
      erro.className = 'alert alert-danger';
      erro.hidden = false;
      return;
    }

    btn.disabled = true;
    var r = await P5.auth.entrar(usuario, senha);
    btn.disabled = false;
    $('#login-senha').value = '';

    if (!r.ok) {
      erro.textContent = r.motivo;
      erro.className = 'alert alert-danger';
      erro.hidden = false;
      var card = $('.login-card');
      card.classList.remove('tremer');
      void card.offsetWidth;
      card.classList.add('tremer');
      $('#login-senha').focus();
      return;
    }
    this.reset();
    $('#tela-login').classList.add('saindo');
    setTimeout(function () { $('#tela-login').classList.remove('saindo'); iniciarApp(); }, reduzMovimento ? 0 : 280);
  });

  /* =================================================================
     APLICAÇÃO
     ================================================================= */
  var appIniciado = false;
  var editor = null;

  async function iniciarApp() {
    var sessao = P5.auth.sessaoAtual();
    if (!sessao) { mostrarLogin(); return; }

    $('#tela-login').hidden = true;
    $('#tela-app').hidden = false;
    $('#tela-app').classList.add('entrando');
    setTimeout(function () { $('#tela-app').classList.remove('entrando'); }, 600);
    $('#usuario-logado').textContent = sessao.usuario;
    P5.theme.sincronizar();
    P5.auth.vigiar();

    if (!appIniciado) {
      appIniciado = true;
      popularSelects(document);
      editor = P5.rich.criar($('#editor-obs'));
      P5.db.aoMudar(aoMudarBanco);
      novoFormulario();
      await P5.db.iniciar();
    }

    var inicial = null;
    var legado = { painel: 'painel', lancamento: 'lancar', consultas: 'consultas', banco: 'banco', 'modo-de-usar': 'ajuda' };
    if (rotaLegada && legado[rotaLegada]) inicial = legado[rotaLegada];
    if (!inicial) { try { inicial = sessionStorage.getItem(C.viewKey); } catch (e) { /* ignora */ } }
    irPara(inicial || 'painel', { historico: 'substituir', focar: false, animar: false });
  }

  function aoMudarBanco(est) {
    atualizarStatusDb(est);
    atualizarNomes();
    popularFiltros();
    renderPainel();
    renderTabela();
    renderConsultas();
    renderBanco(est);

    if (editandoId && !P5.db.obter(editandoId)) {
      novoFormulario();
      toast('O lançamento em edição foi removido do db.txt.', 'aviso');
    }
    if (est.evento === 'externo') toast('O db.txt foi alterado fora do sistema. Dados recarregados.' + (est.erros ? ' ' + est.erros + ' linha(s) inválida(s) ignorada(s).' : ''), est.erros ? 'aviso' : 'info');
    if (est.evento === 'github') toast('Conectado ao GitHub. Cada operação vira um commit no db.txt do repositório.', 'sucesso');
    if (est.evento === 'inicio' && est.falha) toast(est.falha + ' Conecte de novo ao GitHub.', 'aviso');
    if (est.evento === 'servidor') toast('Servidor local conectado. ' + (est.pendente ? 'Há alterações pendentes.' : 'Os lançamentos foram gravados no db.txt.'), est.pendente ? 'aviso' : 'sucesso');
    if (est.evento === 'desconectado') toast('O vínculo com o db.txt foi perdido. Clique no indicador do topo para reconectar.', 'aviso');
  }

  /* ---------- Navegação ---------- */
  var VIEWS = ['painel', 'lancar', 'consultas', 'banco', 'ajuda'];
  var viewAtual = null;

  function irPara(view, opcoes) {
    opcoes = opcoes || {};
    if (VIEWS.indexOf(view) === -1) view = 'painel';
    if (opcoes.historico === 'substituir') history.replaceState({ view: view }, '', BASE);
    else if (opcoes.historico !== 'nenhum' && view !== viewAtual) history.pushState({ view: view }, '', BASE);
    try { sessionStorage.setItem(C.viewKey, view); } catch (e) { /* ignora */ }

    var aplicar = function () {
      $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + view; });
      $$('.tab').forEach(function (t) {
        if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
        else t.removeAttribute('aria-current');
      });
      moverIndicador();
    };

    var focar = function () {
      if (opcoes.focar === false) return;
      window.scrollTo({ top: 0, behavior: 'instant' });
      $('#conteudo').focus({ preventScroll: true });
    };
    if (viewAtual && view !== viewAtual && opcoes.animar !== false) {
      moverIndicadorPara(view);
      animarTroca($('#view-' + viewAtual), function () { aplicar(); focar(); }, function () { return $('#view-' + view); });
    } else { aplicar(); focar(); }
    viewAtual = view;
  }

  /* O indicador das abas desliza já no clique, sem esperar a troca de conteúdo */
  function moverIndicadorPara(view) {
    $$('.tab').forEach(function (t) {
      if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    moverIndicador();
  }

  function moverIndicador() {
    var ativo = $('.tab[aria-current="page"]');
    var ind = $('.tabs-indicador');
    if (!ativo || !ind) return;
    ind.style.width = ativo.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + ativo.offsetLeft + 'px)';
  }
  window.addEventListener('resize', moverIndicador);

  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { irPara(t.dataset.view); }); });

  window.addEventListener('popstate', function (e) {
    if ($('#tela-app').hidden || !P5.auth.sessaoAtual()) return;
    irPara((e.state && e.state.view) || 'painel', { historico: 'nenhum' });
  });

  /* ---------- Logout ---------- */
  $('#btn-sair').addEventListener('click', async function () {
    var est = P5.db.estado();
    var texto = est.pendente
      ? 'Há alterações ainda não gravadas no db.txt (elas continuam no cache deste navegador). Deseja sair mesmo assim?'
      : 'A sessão e os tokens deste navegador serão eliminados.';
    if (await confirmar('Sair do sistema?', texto, 'Sair')) P5.auth.sair('Sessão encerrada com segurança.');
  });

  /* ---------- Indicador do banco no topo ---------- */
  function atualizarStatusDb(est) {
    var pill = $('#status-db');
    var txt = $('[data-texto]', pill);
    pill.classList.remove('pill-ok', 'pill-aviso');
    if (est.vinculado && !est.pendente) { pill.classList.add('pill-ok'); txt.textContent = 'db.txt gravando'; pill.title = 'Cada operação é gravada imediatamente em ' + est.nomeArquivo; }
    else if (est.reconectar) { pill.classList.add('pill-aviso'); txt.textContent = 'Reconectar db.txt'; pill.title = 'Clique para autorizar novamente a gravação no db.txt'; }
    else if (est.pendente) { pill.classList.add('pill-aviso'); txt.textContent = 'Pendente: db.txt'; pill.title = est.falha || 'Há alterações salvas só no navegador'; }
    else if (est.podeGithub) { pill.classList.add('pill-aviso'); txt.textContent = 'Conectar GitHub'; pill.title = 'Clique para informar o token e gravar no db.txt do repositório'; }
    else { txt.textContent = 'Só no navegador'; pill.title = 'Abra o sistema pelo servidor local (node servidor.js) para gravar direto no db.txt'; }
    if (est.modo === 'github' && !est.pendente) { txt.textContent = 'GitHub gravando'; }
  }

  $('#status-db').addEventListener('click', async function () {
    var est = P5.db.estado();
    if (est.modo === 'navegador' && est.podeGithub) { await abrirGithub(); return; }
    if (est.reconectar) {
      try { if (await P5.db.reconectar()) toast('db.txt reconectado. As operações serão gravadas imediatamente.', 'sucesso'); }
      catch (e) { toast(e.message, 'erro'); }
      return;
    }
    irPara('banco');
  });

  /* Antes de gravar: só reautoriza um arquivo já vinculado (nunca abre seletor de arquivo) */
  async function prepararArquivo() {
    var est = P5.db.estado();
    if (est.modo === 'navegador' && est.podeGithub) { await abrirGithub(); return; }
    if (!est.reconectar) return;
    try { await P5.db.reconectar(); } catch (e) { /* segue gravando no navegador */ }
  }

  var AVISO_SEM_ARQUIVO = 'Salvo apenas no navegador. Para gravar direto no db.txt, abra o sistema pelo servidor local: node servidor.js';
  function avisoGravacao(r, acao) {
    if (r.gravouArquivo) toast(acao + (r.modo === 'github' ? ' e gravado no db.txt do repositório (commit no GitHub).' : ' e gravado no db.txt.'), 'sucesso');
    else toast(acao + '. ' + (r.falha || (P5.db.estado().podeGithub
      ? 'Salvo apenas no navegador. Conecte ao GitHub (indicador no topo) para gravar no db.txt do repositório.'
      : AVISO_SEM_ARQUIVO)), r.falha ? 'erro' : 'aviso');
  }

  /* =================================================================
     TABELA DE REGISTROS (usada em Lançamentos e Consultas)
     ================================================================= */
  function resumoObs(html) {
    var t = P5.rich.texto(html).replace(/\s*\n\s*/g, ' • ');
    return t.length > 140 ? t.slice(0, 137) + '…' : t;
  }

  function botaoAcao(icone, rotulo, classe, fn) {
    return el('button', { type: 'button', class: 'btn-acao ' + (classe || ''), title: rotulo, 'aria-label': rotulo, on: { click: fn } }, U.icone(icone));
  }

  function tabelaRegistros(lista, opcoes) {
    opcoes = opcoes || {};
    if (!lista.length) {
      return el('div', { class: 'vazio' }, U.icone(opcoes.iconeVazio || 'i-calendar-week', 'icon-xl'),
        el('h4', { text: opcoes.tituloVazio || 'Nenhum lançamento' }),
        el('p', { text: opcoes.textoVazio || 'Use o formulário para incluir o primeiro lançamento.' }));
    }

    var grupos = P5.db.agrupar(lista).reverse(); // mais recentes primeiro
    var tbody = el('tbody');
    grupos.forEach(function (g) {
      tbody.appendChild(el('tr', { class: 'linha-grupo' },
        el('th', { colspan: '6', scope: 'colgroup' },
          el('div', { class: 'grupo-info' },
            U.badgeSemana(g.semana),
            el('span', { class: 'grupo-periodo' }, U.icone('i-calendar'), U.br(g.inicio) + ' a ' + U.br(g.termino)),
            el('span', { class: 'grupo-dias', text: U.diaCurto(g.inicio) + '–' + U.diaCurto(g.termino) + ' • ' + g.itens.length + ' policial(is)' }),
            U.badgeSituacao(g)
          )
        )
      ));
      g.itens.forEach(function (r) {
        var acoes = el('div', { class: 'acoes' },
          opcoes.imprimir ? botaoAcao('i-printer', 'Imprimir lançamento de ' + r.nome, '', function () {
            P5.report.imprimir({ titulo: r.grad + ' ' + r.nome + ' — Semana ' + r.semana, filtros: ['Lançamento individual'], registros: [r] });
          }) : null,
          P5.db.bloqueado(r)
            ? el('span', { class: 'cadeado', title: 'Período já iniciado: bloqueado para alteração e exclusão', 'aria-label': 'Bloqueado: período já iniciado' }, U.icone('i-lock'))
            : [
                botaoAcao('i-edit', 'Editar lançamento de ' + r.nome, '', function () { editar(r.id); }),
                botaoAcao('i-trash', 'Excluir lançamento de ' + r.nome, 'btn-acao-perigo', function () { excluir(r.id); })
              ]
        );
        var obs = resumoObs(r.observacoes);
        tbody.appendChild(el('tr', { class: 'linha-registro' + (r.id === editandoId ? ' em-edicao' : '') + (r.id === destaqueId ? ' destaque' : ''), 'data-id': r.id },
          el('td', { 'data-label': 'Graduação' }, el('span', { class: 'grad', text: r.grad })),
          el('td', { 'data-label': 'RG Militar', class: 'col-rg', text: r.rg || '—' }),
          el('td', { 'data-label': 'Nome farda' }, el('strong', { text: r.nome })),
          el('td', { 'data-label': 'Tipo' }, U.badgeTipo(r.tipo)),
          el('td', { 'data-label': 'Observações', class: 'col-obs' }, obs ? el('span', { class: 'obs-resumo', title: P5.rich.texto(r.observacoes), text: obs }) : el('span', { class: 'texto-suave', text: '—' })),
          el('td', { 'data-label': 'Ações', class: 'col-acoes' }, acoes)
        ));
      });
    });

    return el('div', { class: 'tabela-wrap' },
      el('table', { class: 'tabela tabela-responsiva' },
        el('caption', { class: 'sr-only', text: opcoes.legenda || 'Lançamentos da escala' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Graduação' }),
          el('th', { scope: 'col', text: 'RG Militar' }),
          el('th', { scope: 'col', text: 'Nome farda' }),
          el('th', { scope: 'col', text: 'Tipo' }),
          el('th', { scope: 'col', text: 'Observações' }),
          el('th', { scope: 'col', class: 'col-acoes', text: 'Ações' }))),
        tbody
      )
    );
  }

  /* =================================================================
     PAINEL
     ================================================================= */
  var painelIdx = null;

  function indiceVigente(grupos) {
    var hoje = U.hojeISO();
    var i = grupos.findIndex(function (g) { return g.inicio <= hoje && g.termino >= hoje; });
    if (i !== -1) return i;
    i = grupos.findIndex(function (g) { return g.inicio > hoje; });
    return i !== -1 ? i : grupos.length - 1;
  }

  function renderPainel() {
    var todos = P5.db.todos();
    var grupos = P5.db.agrupar(todos);
    var est = P5.db.estado();
    var hoje = U.hojeISO();
    var nomes = {};
    todos.forEach(function (r) { nomes[U.normalizar(r.nome)] = 1; });

    var stats = U.esvaziar($('#painel-stats'));
    [
      { icone: 'i-clipboard', rotulo: 'Lançamentos', valor: todos.length },
      { icone: 'i-users', rotulo: 'Policiais', valor: Object.keys(nomes).length },
      { icone: 'i-check-circle', rotulo: 'Em escala hoje', valor: todos.filter(function (r) { return r.inicio <= hoje && r.termino >= hoje; }).length },
      { icone: 'i-database', rotulo: 'Arquivo db.txt', valor: est.vinculado && !est.pendente ? 'Gravando' : est.reconectar ? 'Reconectar' : est.pendente ? 'Pendente' : 'Não vinculado' }
    ].forEach(function (s) {
      stats.appendChild(el('div', { class: 'stat card' },
        el('span', { class: 'stat-icone' }, U.icone(s.icone)),
        el('div', null, el('span', { class: 'stat-valor', text: String(s.valor) }), el('span', { class: 'stat-rotulo', text: s.rotulo }))
      ));
    });

    var alvo = U.esvaziar($('#painel-escala'));
    if (!grupos.length) {
      alvo.appendChild(el('div', { class: 'card vazio' },
        U.icone('i-calendar-week', 'icon-xl'),
        el('h3', { text: 'Nenhuma escala lançada ainda' }),
        el('p', { text: 'Inclua o primeiro lançamento ou vincule um db.txt existente.' }),
        el('div', { class: 'btn-group btn-group-center' },
          el('button', { type: 'button', class: 'btn btn-primary', on: { click: function () { irPara('lancar'); } } }, U.icone('i-plus'), 'Novo lançamento'),
          el('button', { type: 'button', class: 'btn btn-outline', on: { click: function () { irPara('banco'); } } }, U.icone('i-folder-open'), 'Abrir db.txt')
        )
      ));
      return;
    }

    var vig = indiceVigente(grupos);
    if (painelIdx == null || painelIdx >= grupos.length) painelIdx = vig;
    var g = grupos[painelIdx];
    var sit = U.situacao(g);

    alvo.appendChild(el('header', { class: 'escala-hero' },
      el('div', { class: 'escala-nav' },
        el('button', { type: 'button', class: 'btn-icon btn-vidro', 'aria-label': 'Período anterior', disabled: painelIdx === 0,
          on: { click: function () { painelIdx--; animarTroca($('#painel-escala'), renderPainel); } } }, U.icone('i-chevron-left')),
        el('button', { type: 'button', class: 'btn btn-sm btn-vidro', disabled: painelIdx === vig,
          on: { click: function () { painelIdx = vig; animarTroca($('#painel-escala'), renderPainel); } } }, U.icone('i-calendar'), 'Atual'),
        el('button', { type: 'button', class: 'btn-icon btn-vidro', 'aria-label': 'Próximo período', disabled: painelIdx === grupos.length - 1,
          on: { click: function () { painelIdx++; animarTroca($('#painel-escala'), renderPainel); } } }, U.icone('i-chevron-right'))
      ),
      el('img', { src: 'images/Logo29.PNG', alt: 'Brasão do 29º BPM', class: 'escala-brasao', width: '80', height: '92' }),
      el('span', { class: 'badge badge-hero' }, U.icone(sit.icone), sit.rotulo),
      el('h3', { class: 'escala-titulo', text: 'ESCALA' }),
      el('p', { class: 'escala-sub', text: 'P5 • Comunicação Social • 29º BPM' }),
      el('p', { class: 'escala-periodo' }, U.icone('i-calendar-week'), 'SEMANA ' + g.semana + ': ' + U.br(g.inicio) + ' A ' + U.br(g.termino))
    ));

    alvo.appendChild(el('div', { class: 'card horario' },
      el('h4', { class: 'card-titulo' }, U.icone('i-clock'), 'Horário'),
      el('p', null, C.horario.dias, el('br'), C.horario.inicio + ' às ' + C.horario.fim)
    ));

    alvo.appendChild(el('div', { class: 'equipes' }, g.itens.map(function (r) {
      var obs = el('div', { class: 'obs-rica' });
      if (r.observacoes) obs.appendChild(P5.rich.fragmento(r.observacoes));
      return el('div', { class: 'card pm-card' },
        el('div', { class: 'pm-topo' },
          el('span', { class: 'pm-avatar', 'aria-hidden': 'true', text: r.nome.charAt(0).toUpperCase() }),
          el('div', null, el('span', { class: 'grad', text: r.grad + (r.rg ? ' • RG ' + r.rg : '') }), el('strong', { class: 'pm-nome', text: r.nome })),
          U.badgeTipo(r.tipo)
        ),
        r.observacoes ? obs : null
      );
    })));

    alvo.appendChild(el('div', { class: 'btn-group btn-group-center' },
      el('button', { type: 'button', class: 'btn btn-primary', on: { click: function () {
        P5.report.imprimir({ titulo: 'Semana ' + g.semana + ' — ' + U.br(g.inicio) + ' a ' + U.br(g.termino), filtros: ['Período individual'], registros: g.itens });
      } } }, U.icone('i-printer'), 'Imprimir PDF deste período'),
      g.inicio < U.hojeISO() ? null : el('button', { type: 'button', class: 'btn btn-outline', on: { click: function () {
        novoFormulario({ semana: g.semana, inicio: g.inicio, termino: g.termino });
        irPara('lancar');
        $('#r-grad').focus();
      } } }, U.icone('i-user-plus'), 'Lançar neste período')
    ));
  }

  /* =================================================================
     LANÇAMENTOS — formulário único + tabela
     ================================================================= */
  var form = $('#form-registro');
  var editandoId = null;
  var destaqueId = null;
  var dataAutomatica = true;

  /* Próxima segunda-feira a partir de hoje (hoje, se for segunda) — nunca no passado */
  function proximaSegunda(offsetSemanas) {
    var d = new Date();
    var dia = d.getDay();
    d.setDate(d.getDate() + (dia === 1 ? 0 : (8 - dia) % 7) + 7 * offsetSemanas);
    return U.paraISO(d);
  }

  /* Calendários: só permitem de hoje em diante */
  function aplicarMinimos() {
    var hoje = U.hojeISO();
    var ini = $('#r-inicio');
    ini.min = hoje;
    $('#r-termino').min = ini.value && ini.value > hoje ? ini.value : hoje;
  }

  function semanaSelecionada() { return Number($('input[name="semana"]:checked', form).value); }
  function definirSemana(n) { $('input[name="semana"][value="' + n + '"]', form).checked = true; }

  function sugerirDatas() {
    var ini = proximaSegunda(semanaSelecionada() === 2 ? 1 : 0);
    $('#r-inicio').value = ini;
    $('#r-termino').value = U.somarDias(ini, 6);
    dataAutomatica = true;
    atualizarPeriodo();
  }

  function atualizarPeriodo() {
    aplicarMinimos();
    var ini = $('#r-inicio').value, fim = $('#r-termino').value;
    var hint = U.esvaziar($('#r-periodo'));
    if (!ini || !fim) return;
    if (ini < U.hojeISO() || fim < U.hojeISO()) { hint.className = 'hint hint-periodo hint-erro'; hint.appendChild(U.icone('i-lock')); hint.appendChild(document.createTextNode('Datas anteriores a hoje (' + U.br(U.hojeISO()) + ') não são permitidas.')); return; }
    var dias = U.diasEntre(ini, fim) + 1;
    if (dias < 1) { hint.className = 'hint hint-periodo hint-erro'; hint.appendChild(U.icone('i-alert')); hint.appendChild(document.createTextNode('A Data Término deve ser igual ou posterior à Data Início.')); return; }
    hint.className = 'hint hint-periodo';
    hint.appendChild(U.icone('i-info'));
    hint.appendChild(document.createTextNode(dias + ' dia(s) • ' + U.diaSemana(ini) + ' a ' + U.diaSemana(fim)));
  }

  function atualizarIconeTipo() {
    var t = C.tipos[$('#r-tipo').value] || C.tipos.expediente;
    $('#r-tipo-icone use').setAttribute('href', '#' + t.icon);
  }

  function modoEdicao(ativo) {
    $('[data-texto]', $('#form-titulo')).textContent = ativo ? 'Editar lançamento' : 'Novo lançamento';
    $('#form-titulo use').setAttribute('href', ativo ? '#i-edit' : '#i-user-plus');
    $('#badge-edicao').hidden = !ativo;
    $('[data-texto]', $('#btn-salvar')).textContent = ativo ? 'Salvar alterações' : 'Incluir';
    $('[data-texto]', $('#btn-limpar')).textContent = ativo ? 'Cancelar edição' : 'Limpar';
    form.classList.toggle('editando', ativo);
  }

  /* Novo formulário. "manter" preserva semana/datas/tipo para lançar vários seguidos */
  function novoFormulario(manter) {
    editandoId = null;
    limparErros();
    modoEdicao(false);
    $('#r-grad').value = '';
    $('#r-rg').value = '';
    $('#r-nome').value = '';
    editor.limpar();
    if (manter) {
      if (manter.semana) definirSemana(manter.semana);
      if (manter.tipo) $('#r-tipo').value = manter.tipo;
      if (manter.inicio) { $('#r-inicio').value = manter.inicio; $('#r-termino').value = manter.termino; dataAutomatica = false; atualizarPeriodo(); }
      else sugerirDatas();
    } else {
      definirSemana(1);
      $('#r-tipo').value = 'expediente';
      sugerirDatas();
    }
    atualizarIconeTipo();
    renderTabela();
  }

  function editar(id) {
    var r = P5.db.obter(id);
    if (!r) return;
    if (P5.db.bloqueado(r)) { toast('Este lançamento já começou e está bloqueado para alterações.', 'aviso'); return; }
    editandoId = id;
    limparErros();
    definirSemana(r.semana);
    $('#r-tipo').value = r.tipo;
    $('#r-inicio').value = r.inicio;
    $('#r-termino').value = r.termino;
    $('#r-grad').value = r.grad;
    $('#r-rg').value = r.rg || '';
    $('#r-nome').value = r.nome;
    editor.definir(r.observacoes);
    dataAutomatica = false;
    atualizarPeriodo();
    atualizarIconeTipo();
    modoEdicao(true);
    irPara('lancar', { focar: false });
    renderTabela();
    form.classList.remove('pulso'); void form.offsetWidth; form.classList.add('pulso');
    form.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
    $('#r-grad').focus({ preventScroll: true });
  }

  async function excluir(id) {
    var r = P5.db.obter(id);
    if (!r) return;
    if (P5.db.bloqueado(r)) { toast('Este lançamento já começou e não pode ser excluído.', 'aviso'); return; }
    var ok = await confirmar('Excluir lançamento?',
      r.grad + ' ' + r.nome + ' — Semana ' + r.semana + ' (' + U.br(r.inicio) + ' a ' + U.br(r.termino) + '). O registro será removido do db.txt. Esta ação não pode ser desfeita.', 'Excluir');
    if (!ok) return;
    await prepararArquivo();
    var linha = $('tr[data-id="' + id + '"]');
    if (linha && !reduzMovimento) { linha.classList.add('removendo'); await new Promise(function (res) { setTimeout(res, 260); }); }
    try {
      var res = await P5.db.remover(id);
      if (editandoId === id) novoFormulario();
      avisoGravacao(res, 'Lançamento excluído');
    } catch (e) { toast('Falha ao excluir: ' + e.message, 'erro'); }
  }

  /* ---------- Eventos do formulário ---------- */
  $$('input[name="semana"]', form).forEach(function (r) {
    r.addEventListener('change', function () { if (dataAutomatica && !editandoId) sugerirDatas(); });
  });
  $('#r-inicio').addEventListener('change', function () {
    dataAutomatica = false;
    var ini = this.value, fim = $('#r-termino').value;
    if (ini && (!fim || fim < ini)) $('#r-termino').value = U.somarDias(ini, 6);
    atualizarPeriodo();
  });
  $('#r-termino').addEventListener('change', function () { dataAutomatica = false; atualizarPeriodo(); });
  ['#r-inicio', '#r-termino'].forEach(function (s) { $(s).addEventListener('focus', aplicarMinimos); });
  $('#r-tipo').addEventListener('change', atualizarIconeTipo);

  /* RG ou nome já conhecidos → preenche os demais campos (mínimo de digitação) */
  function realcar(campo) { campo.classList.remove('auto'); void campo.offsetWidth; campo.classList.add('auto'); }
  function autoPreencher(achado) {
    if (!achado) return;
    [['#r-grad', achado.grad], ['#r-rg', achado.rg], ['#r-nome', achado.nome]].forEach(function (par) {
      var campo = $(par[0]);
      if (!campo.value && par[1]) { campo.value = par[1]; campo.removeAttribute('aria-invalid'); realcar(campo); }
    });
  }
  $('#r-rg').addEventListener('input', function () {
    var limpo = this.value.replace(/\D/g, '').slice(0, 6);
    if (limpo !== this.value) this.value = limpo;
    if (limpo.length < 5) return;
    autoPreencher(P5.db.todos().reverse().find(function (r) { return r.rg === limpo; }));
  });
  $('#r-nome').addEventListener('input', function () {
    var n = U.normalizar(this.value);
    if (!n) return;
    autoPreencher(P5.db.todos().reverse().find(function (r) { return U.normalizar(r.nome) === n; }));
  });

  form.addEventListener('input', function (e) { if (e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); });

  $('#btn-limpar').addEventListener('click', function () {
    var editando = !!editandoId;
    novoFormulario();
    toast(editando ? 'Edição cancelada.' : 'Formulário limpo.', 'info');
  });

  function limparErros() {
    var box = $('#form-erros');
    box.hidden = true;
    U.esvaziar(box);
    $$('[aria-invalid="true"]', form).forEach(function (x) { x.removeAttribute('aria-invalid'); });
  }

  function lerFormulario() {
    return {
      id: editandoId || U.uid('e'),
      semana: semanaSelecionada(),
      tipo: $('#r-tipo').value,
      inicio: $('#r-inicio').value,
      termino: $('#r-termino').value,
      grad: $('#r-grad').value,
      rg: $('#r-rg').value.replace(/\D/g, ''),
      nome: $('#r-nome').value.trim().replace(/\s+/g, ' '),
      observacoes: editor.obter()
    };
  }

  function validar(r) {
    var erros = [];
    function marcar(campo, msg) { campo.setAttribute('aria-invalid', 'true'); erros.push({ campo: campo, msg: msg }); }
    if (!C.tipos[r.tipo]) marcar($('#r-tipo'), 'Selecione o tipo de escala.');
    if (!r.inicio) marcar($('#r-inicio'), 'Informe a Data Início.');
    if (!r.termino) marcar($('#r-termino'), 'Informe a Data Término.');
    var hoje = U.hojeISO();
    if (r.inicio && r.inicio < hoje) marcar($('#r-inicio'), 'A Data Início não pode ser anterior a hoje (' + U.br(hoje) + ').');
    if (r.termino && r.termino < hoje) marcar($('#r-termino'), 'A Data Término não pode ser anterior a hoje (' + U.br(hoje) + ').');
    if (r.inicio && r.termino && r.termino < r.inicio) marcar($('#r-termino'), 'A Data Término deve ser igual ou posterior à Data Início.');
    if (r.inicio && r.termino && U.diasEntre(r.inicio, r.termino) > 62) marcar($('#r-termino'), 'O período não pode passar de 63 dias.');
    if (!r.grad) marcar($('#r-grad'), 'Selecione a graduação.');
    if (!r.rg) marcar($('#r-rg'), 'Informe o RG Militar.');
    else if (r.rg.length < 5 || r.rg.length > 6) marcar($('#r-rg'), 'O RG Militar deve ter de 5 a 6 dígitos.');
    if (!r.nome) marcar($('#r-nome'), 'Informe o Nome Farda.');
    return erros;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    limparErros();
    var r = lerFormulario();
    var erros = validar(r);

    if (erros.length) {
      var box = $('#form-erros');
      box.appendChild(el('p', { class: 'alert-titulo' }, U.icone('i-alert'), 'Corrija ' + erros.length + ' pendência(s):'));
      box.appendChild(el('ul', null, erros.map(function (er) {
        return el('li', null, el('a', { href: '#', on: { click: function (ev) { ev.preventDefault(); er.campo.focus(); } } }, er.msg));
      })));
      box.hidden = false;
      erros[0].campo.focus();
      return;
    }

    // Ainda dentro do gesto do clique: garante o vínculo com o db.txt
    await prepararArquivo();

    var conflito = P5.db.conflito(r);
    if (conflito && !(await confirmar('Período sobreposto',
      conflito.grad + ' ' + conflito.nome + ' já tem lançamento de ' + U.br(conflito.inicio) + ' a ' + U.br(conflito.termino) + ' (Semana ' + conflito.semana + '). Deseja salvar mesmo assim?', 'Salvar mesmo assim', false))) return;

    var btn = $('#btn-salvar');
    btn.disabled = true;
    try {
      var res = await P5.db.salvar(r);
      destaqueId = res.registro.id;
      setTimeout(function () { destaqueId = null; }, 2500);
      if (res.novo) {
        // mantém semana, datas e tipo para lançar o próximo policial com o mínimo de digitação
        novoFormulario({ semana: r.semana, inicio: r.inicio, termino: r.termino, tipo: r.tipo });
        $('#r-grad').focus();
      } else {
        novoFormulario();
      }
      avisoGravacao(res, res.novo ? 'Lançamento incluído' : 'Alterações salvas');
    } catch (err) {
      toast('Não foi possível salvar: ' + err.message, 'erro');
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- Tabela ao lado do formulário ---------- */
  function renderTabela() {
    var busca = U.normalizar($('#t-busca').value);
    var semana = ($('input[name="t-semana"]:checked') || {}).value || '';
    var todos = P5.db.todos();
    var lista = todos.filter(function (r) {
      if (semana && String(r.semana) !== semana) return false;
      if (busca && U.normalizar(r.grad + ' ' + r.rg + ' ' + r.nome + ' ' + C.tipos[r.tipo].label).indexOf(busca) === -1) return false;
      return true;
    });
    $('#tabela-contagem').textContent = lista.length === todos.length ? String(todos.length) : lista.length + ' de ' + todos.length;
    var alvo = U.esvaziar($('#tabela-escala'));
    alvo.appendChild(tabelaRegistros(lista, {
      tituloVazio: todos.length ? 'Nada encontrado' : 'Nenhum lançamento',
      textoVazio: todos.length ? 'Ajuste a busca ou o filtro de semana.' : 'Use o formulário para incluir o primeiro lançamento.'
    }));
  }
  $('#t-busca').addEventListener('input', renderTabela);
  $$('input[name="t-semana"]').forEach(function (r) { r.addEventListener('change', renderTabela); });

  function atualizarNomes() {
    var vistos = {}, vistosRg = {};
    var dl = U.esvaziar($('#lista-nomes'));
    var dlRg = U.esvaziar($('#lista-rgs'));
    P5.db.todos().reverse().forEach(function (r) {
      var k = U.normalizar(r.nome);
      if (!vistos[k]) { vistos[k] = 1; dl.appendChild(el('option', { value: r.nome, label: r.grad + (r.rg ? ' • RG ' + r.rg : '') })); }
      if (r.rg && !vistosRg[r.rg]) { vistosRg[r.rg] = 1; dlRg.appendChild(el('option', { value: r.rg, label: r.grad + ' ' + r.nome })); }
    });
  }

  /* =================================================================
     CONSULTAS
     ================================================================= */
  function popularFiltros() {
    var sel = $('#f-policial');
    var atual = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    var vistos = {};
    P5.db.todos().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).forEach(function (r) {
      var k = U.normalizar(r.nome);
      if (vistos[k]) return;
      vistos[k] = 1;
      sel.appendChild(el('option', { value: k, text: r.nome + (r.rg ? ' — RG ' + r.rg : '') }));
    });
    sel.value = vistos[atual] ? atual : '';
  }

  function lerFiltros() {
    return { de: $('#f-de').value, ate: $('#f-ate').value, semana: $('#f-semana').value, tipo: $('#f-tipo').value, policial: $('#f-policial').value, grad: $('#f-grad').value };
  }

  function descreverFiltros(f) {
    var d = [];
    if (f.de) d.push('De ' + U.br(f.de));
    if (f.ate) d.push('Até ' + U.br(f.ate));
    if (f.semana) d.push('Semana ' + f.semana);
    if (f.tipo) d.push('Tipo: ' + C.tipos[f.tipo].label);
    if (f.policial) d.push('Policial: ' + $('#f-policial').selectedOptions[0].textContent);
    if (f.grad) d.push('Graduação: ' + f.grad);
    return d;
  }

  function filtrar(f) {
    return P5.db.todos().filter(function (r) {
      if (f.de && r.termino < f.de) return false;
      if (f.ate && r.inicio > f.ate) return false;
      if (f.semana && String(r.semana) !== f.semana) return false;
      if (f.tipo && r.tipo !== f.tipo) return false;
      if (f.policial && U.normalizar(r.nome) !== f.policial) return false;
      if (f.grad && r.grad !== f.grad) return false;
      return true;
    });
  }

  function renderConsultas() {
    var f = lerFiltros();
    var alvo = U.esvaziar($('#resultados'));
    if (f.de && f.ate && f.ate < f.de) {
      $('#consulta-resumo').textContent = 'A data final deve ser igual ou posterior à data inicial.';
      return;
    }
    var res = filtrar(f);
    var total = P5.db.todos().length;
    $('#consulta-resumo').textContent = res.length + ' de ' + total + ' lançamento(s) encontrado(s).';
    alvo.appendChild(tabelaRegistros(res, {
      imprimir: true, iconeVazio: 'i-search', legenda: 'Resultado da consulta',
      tituloVazio: total ? 'Nenhum resultado' : 'Banco vazio',
      textoVazio: total ? 'Ajuste os filtros para ampliar a busca.' : 'Inclua lançamentos para consultar.'
    }));
  }

  var formFiltros = $('#form-filtros');
  formFiltros.addEventListener('input', renderConsultas);
  formFiltros.addEventListener('change', renderConsultas);
  formFiltros.addEventListener('submit', function (e) { e.preventDefault(); renderConsultas(); });
  formFiltros.addEventListener('reset', function () { setTimeout(renderConsultas, 0); });

  $('#btn-print-consulta').addEventListener('click', function () {
    var f = lerFiltros();
    var regs = filtrar(f);
    if (!regs.length) { toast('Nenhum resultado para imprimir.', 'aviso'); return; }
    var desc = descreverFiltros(f);
    P5.report.imprimir({ titulo: desc.length ? 'Consulta filtrada' : 'Consulta (todos)', filtros: desc, registros: regs });
  });

  $('#btn-print-geral').addEventListener('click', function () {
    var regs = P5.db.todos();
    if (!regs.length) { toast('O banco está vazio.', 'aviso'); return; }
    P5.report.imprimir({ titulo: 'Relatório geral', filtros: [], registros: regs });
  });

  /* =================================================================
     BANCO db.txt
     ================================================================= */
  function renderBanco(est) {
    var dl = U.esvaziar($('#banco-estado'));
    var modos = {
      servidor: 'Servidor local — gravação direta, sem janelas',
      github: 'GitHub — cada operação vira um commit no repositório',
      arquivo: 'Arquivo vinculado no navegador',
      navegador: 'Somente no navegador (sem gravação no arquivo)'
    };
    [
      ['Registros', String(est.registros)],
      ['Modo', modos[est.modo]],
      ['Arquivo', est.nomeArquivo || 'Nenhum'],
      ['Gravação', est.vinculado ? 'Imediata, a cada inclusão, alteração ou exclusão' : est.reconectar ? 'Aguardando nova autorização' : '—'],
      ['Situação', est.pendente ? (est.falha || 'Há alterações salvas só no navegador') : est.vinculado ? 'Sincronizado' : '—']
    ].forEach(function (kv) { dl.appendChild(el('dt', { text: kv[0] })); dl.appendChild(el('dd', { text: kv[1] })); });

    $('[data-texto]', $('#btn-vincular')).textContent = est.podeGithub
      ? (est.modo === 'github' ? 'Trocar token do GitHub' : 'Conectar ao GitHub')
      : est.modo === 'arquivo' ? 'Trocar arquivo' : est.reconectar ? 'Reconectar db.txt' : 'Vincular db.txt';
    $('#btn-vincular').disabled = !est.suportaArquivo && !est.podeGithub;
    $('#btn-desvincular').disabled = est.modo !== 'arquivo' && est.modo !== 'github' && !est.reconectar;
    $('#banco-suporte').textContent = est.modo === 'servidor'
      ? 'Tudo certo: o servidor local grava cada operação direto em db-local-txt/db.txt.'
      : est.modo === 'github' ? 'Tudo certo: cada inclusão, alteração e exclusão é gravada como commit no db.txt do repositório. O token fica só nesta aba e é apagado ao sair.'
      : est.podeGithub ? 'No GitHub Pages, conecte ao GitHub com o token da seção para gravar no db.txt do repositório.'
      : 'Recomendado: no terminal do VS Code, rode "node servidor.js" e abra http://127.0.0.1:5510/ para gravar direto no db.txt, sem janelas. Alternativa (Chrome/Edge): "Vincular db.txt".';
    $('#banco-preview').textContent = P5.db.texto();
  }

  function relatarMescla(r) {
    toast('Sincronizado: ' + r.novos + ' novo(s), ' + r.atualizados + ' atualizado(s)' + (r.erros ? ', ' + r.erros + ' linha(s) inválida(s) ignorada(s)' : '') + '.', r.erros ? 'aviso' : 'sucesso');
  }

  $('#btn-vincular').addEventListener('click', async function () {
    try {
      var est = P5.db.estado();
      if (est.podeGithub) { await abrirGithub(); return; }
      if (est.reconectar) await P5.db.reconectar();
      else await P5.db.vincular();
      toast('db.txt vinculado. As operações serão gravadas imediatamente.', 'sucesso');
    } catch (e) { if (e.name !== 'AbortError') toast('Falha ao vincular: ' + e.message, 'erro'); }
  });

  $('#btn-desvincular').addEventListener('click', async function () {
    if (await confirmar('Desvincular o db.txt?', 'As próximas operações ficarão só no navegador até você vincular o arquivo de novo.', 'Desvincular')) {
      await P5.db.desvincular();
      toast('db.txt desvinculado.', 'info');
    }
  });

  $('#btn-baixar').addEventListener('click', function () { P5.db.baixar(); toast('db.txt baixado.', 'info'); });

  $('#input-importar').addEventListener('change', async function () {
    var file = this.files[0];
    this.value = '';
    if (!file) return;
    await prepararArquivo();
    try { relatarMescla(await P5.db.importar(file)); } catch (e) { toast(e.message, 'erro'); }
  });

  $('#btn-recarregar').addEventListener('click', async function () {
    await prepararArquivo();
    try { relatarMescla(await P5.db.recarregarServidor()); } catch (e) { toast(e.message, 'erro'); }
  });

  /* =================================================================
     INÍCIO
     ================================================================= */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && !P5.auth.sessaoAtual()) window.location.reload();
  });

  if (P5.auth.sessaoAtual()) iniciarApp();
  else mostrarLogin();
})();
