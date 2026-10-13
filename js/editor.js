/* =====================================================================
   Editor de texto rico (similar ao TinyMCE) em JavaScript puro
   + sanitizador por lista branca: só formatação básica é aceita,
   nada de scripts, atributos, estilos ou links.
   ===================================================================== */
'use strict';

P5.rich = (function () {
  var PERMITIDAS = { P: 'p', BR: 'br', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', S: 's', STRIKE: 's', DEL: 's', UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote', DIV: 'p', H1: 'p', H2: 'p', H3: 'p', H4: 'p', H5: 'p', H6: 'p' };
  var DESCARTAR = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, TEMPLATE: 1, NOSCRIPT: 1, SVG: 1, MATH: 1, HEAD: 1, TITLE: 1, META: 1, LINK: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, FORM: 1, IMG: 1, VIDEO: 1, AUDIO: 1 };
  var BLOCOS = { p: 1, ul: 1, ol: 1, li: 1, blockquote: 1 };
  var LIMITE = 5000;

  /* Reconstrói o conteúdo nó a nó com createElement (nunca reaproveita nós de origem) */
  function copiar(origem, destino) {
    Array.prototype.forEach.call(origem.childNodes, function (n) {
      if (n.nodeType === 3) { destino.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.nodeName.toUpperCase();
      if (DESCARTAR[tag]) return;
      var nova = PERMITIDAS[tag];
      if (!nova) { copiar(n, destino); return; }           // desembrulha tags desconhecidas
      var el = document.createElement(nova);
      destino.appendChild(el);
      if (nova !== 'br') copiar(n, el);
    });
  }

  function fragmento(html) {
    var frag = document.createDocumentFragment();
    if (!html) return frag;
    var doc = new DOMParser().parseFromString('<body>' + String(html) + '</body>', 'text/html');
    copiar(doc.body, frag);
    return frag;
  }

  function sanitizar(html) {
    var div = document.createElement('div');
    div.appendChild(fragmento(html));
    // remove blocos vazios
    Array.prototype.slice.call(div.querySelectorAll('p, li, blockquote')).forEach(function (b) {
      if (!b.textContent.trim() && !b.querySelector('br')) b.remove();
    });
    var saida = div.innerHTML;
    if (!texto(saida)) return '';
    return saida.length > LIMITE ? texto(saida).slice(0, LIMITE) : saida;
  }

  /* Sanitiza e converte todo o texto para MAIÚSCULAS (preserva a formatação) */
  function maiusculas(html) {
    var div = document.createElement('div');
    div.appendChild(fragmento(sanitizar(html)));
    var w = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) w.currentNode.nodeValue = w.currentNode.nodeValue.toLocaleUpperCase('pt-BR');
    return div.innerHTML;
  }

  function maiusculasNoLugar(raiz) {
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      var up = w.currentNode.nodeValue.toLocaleUpperCase('pt-BR');
      if (up !== w.currentNode.nodeValue) w.currentNode.nodeValue = up;
    }
  }

  /* Converte HTML em texto puro (para o db.txt e resumos) */
  function texto(html) {
    var doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    var out = [];
    (function andar(no, lista) {
      Array.prototype.forEach.call(no.childNodes, function (n) {
        if (n.nodeType === 3) { out.push(n.nodeValue.replace(/\s+/g, ' ')); return; }
        if (n.nodeType !== 1) return;
        var t = n.nodeName.toLowerCase();
        if (t === 'br') { out.push('\n'); return; }
        if (t === 'li') out.push('\n' + (lista === 'ol' ? (Array.prototype.indexOf.call(n.parentNode.children, n) + 1) + '. ' : '• '));
        else if (BLOCOS[t] || PERMITIDAS[n.nodeName] === 'p') out.push('\n');
        andar(n, t === 'ul' || t === 'ol' ? t : lista);
        if (t === 'p' || t === 'blockquote') out.push('\n');
      });
    })(doc.body, null);
    return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function deTexto(t) {
    var div = document.createElement('div');
    String(t || '').split(/\r?\n/).forEach(function (l) {
      var p = document.createElement('p');
      p.textContent = l;
      div.appendChild(p);
    });
    return sanitizar(div.innerHTML);
  }

  /* Insere conteúdo sanitizado em um elemento */
  function renderizar(alvo, html) {
    while (alvo.firstChild) alvo.removeChild(alvo.firstChild);
    alvo.appendChild(fragmento(sanitizar(html)));
  }

  /* ---------- Editor ---------- */
  function criar(raiz, opcoes) {
    opcoes = opcoes || {};
    var area = raiz.querySelector('[data-rte-area]');
    var contador = raiz.querySelector('[data-rte-contador]');
    var botoes = Array.prototype.slice.call(raiz.querySelectorAll('[data-cmd]'));

    function cmd(nome, valor) {
      area.focus();
      try { document.execCommand('styleWithCSS', false, false); } catch (e) { /* ignora */ }
      if (nome === 'formatBlock') {
        var ativo = document.queryCommandValue('formatBlock').toLowerCase() === valor;
        document.execCommand('formatBlock', false, ativo ? 'p' : valor);
      } else {
        document.execCommand(nome, false, valor || null);
      }
      atualizar();
    }

    function atualizarBotoes() {
      if (!raiz.contains(document.activeElement) && document.activeElement !== area) return;
      botoes.forEach(function (b) {
        var c = b.dataset.cmd;
        if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].indexOf(c) === -1) return;
        var ativo = false;
        try { ativo = document.queryCommandState(c); } catch (e) { /* ignora */ }
        b.setAttribute('aria-pressed', String(ativo));
      });
    }

    function atualizar() {
      var n = texto(area.innerHTML).length;
      if (contador) contador.textContent = n + ' / ' + LIMITE;
      area.classList.toggle('rte-vazio', n === 0);
      atualizarBotoes();
      if (opcoes.aoMudar) opcoes.aoMudar();
    }

    botoes.forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); }); // mantém a seleção
      b.addEventListener('click', function () { cmd(b.dataset.cmd, b.dataset.valor); });
    });

    area.addEventListener('input', atualizar);
    area.addEventListener('keyup', atualizarBotoes);
    area.addEventListener('mouseup', atualizarBotoes);
    area.addEventListener('focus', function () {
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignora */ }
    });

    /* Colar: sempre limpo e sanitizado */
    area.addEventListener('paste', function (e) {
      e.preventDefault();
      var cd = e.clipboardData;
      var html = cd.getData('text/html');
      var limpo = maiusculas(html ? html : deTexto(cd.getData('text/plain')));
      document.execCommand('insertHTML', false, limpo);
    });
    area.addEventListener('drop', function (e) { e.preventDefault(); });

    /* Digitação sempre em MAIÚSCULAS (mantém cursor e histórico de desfazer) */
    area.addEventListener('beforeinput', function (e) {
      if ((e.inputType === 'insertText' || e.inputType === 'insertReplacementText') && e.data) {
        var up = e.data.toLocaleUpperCase('pt-BR');
        if (up !== e.data) { e.preventDefault(); document.execCommand('insertText', false, up); }
      }
    });
    area.addEventListener('compositionend', function () { maiusculasNoLugar(area); atualizar(); });

    /* Atalhos extras (Ctrl+B/I/U já são nativos) */
    area.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === '7' || e.key === '&')) { e.preventDefault(); cmd('insertOrderedList'); }
      if (e.ctrlKey && e.shiftKey && (e.key === '8' || e.key === '*')) { e.preventDefault(); cmd('insertUnorderedList'); }
    });

    atualizar();

    return {
      obter: function () { return maiusculas(area.innerHTML); },
      definir: function (html) { renderizar(area, maiusculas(html)); atualizar(); },
      limpar: function () { renderizar(area, ''); atualizar(); },
      focar: function () { area.focus(); },
      area: area
    };
  }

  return { sanitizar: sanitizar, maiusculas: maiusculas, texto: texto, deTexto: deTexto, renderizar: renderizar, fragmento: fragmento, criar: criar, LIMITE: LIMITE };
})();
