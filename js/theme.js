/* =====================================================================
   Tema claro / escuro — carregado no <head> para evitar "piscar" de tema
   ===================================================================== */
'use strict';

(function () {
  var KEY = 'p5.theme';
  var root = document.documentElement;

  function preferido() {
    try {
      var salvo = localStorage.getItem(KEY);
      if (salvo === 'light' || salvo === 'dark') return salvo;
    } catch (e) { /* armazenamento indisponível */ }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function aplicar(tema) {
    root.setAttribute('data-theme', tema);
    var botoes = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < botoes.length; i++) {
      var escuro = tema === 'dark';
      botoes[i].setAttribute('aria-pressed', String(escuro));
      botoes[i].setAttribute('aria-label', escuro ? 'Ativar tema claro' : 'Ativar tema escuro');
      botoes[i].setAttribute('title', escuro ? 'Tema claro' : 'Tema escuro');
    }
  }

  aplicar(preferido());

  window.P5 = window.P5 || {};
  window.P5.theme = {
    atual: function () { return root.getAttribute('data-theme'); },
    alternar: function () {
      var novo = this.atual() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, novo); } catch (e) { /* ignora */ }
      aplicar(novo);
    },
    sincronizar: function () { aplicar(this.atual()); }
  };
})();
