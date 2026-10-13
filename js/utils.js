/* =====================================================================
   Utilitários: datas, texto, DOM seguro (sem innerHTML com dados)
   ===================================================================== */
'use strict';

P5.util = (function () {
  var C = P5.config;

  /* ---------- Datas (sempre em ISO AAAA-MM-DD, horário local) ---------- */
  function deISO(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null;
    var p = iso.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function paraISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function somarDias(iso, n) {
    var d = deISO(iso);
    if (!d) return '';
    d.setDate(d.getDate() + n);
    return paraISO(d);
  }
  function hojeISO() { return paraISO(new Date()); }
  function br(iso) {
    var d = deISO(iso);
    return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() : '—';
  }
  function brCurto(iso) {
    var d = deISO(iso);
    return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : '—';
  }
  function diaSemana(iso) { var d = deISO(iso); return d ? C.diasSemana[d.getDay()] : ''; }
  function diaCurto(iso) { var d = deISO(iso); return d ? C.diasCurtos[d.getDay()] : ''; }
  function ehDomingo(iso) { var d = deISO(iso); return !!d && d.getDay() === 0; }
  function diasEntre(a, b) {
    var da = deISO(a), db = deISO(b);
    if (!da || !db) return NaN;
    return Math.round((db - da) / 86400000);
  }
  function dataHoraBR(ms) {
    var d = new Date(ms);
    return br(paraISO(d)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------- Texto ---------- */
  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  function limpar(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max || 200);
  }
  function uid(prefixo) {
    var b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return (prefixo || 'id') + '-' + Array.from(b).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function nomeCompleto(p) { return ((p.grad ? p.grad + ' ' : '') + (p.nome || '')).trim(); }

  /* ---------- DOM seguro ---------- */
  var SVGNS = 'http://www.w3.org/2000/svg';

  function icone(nome, classe) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'icon' + (classe ? ' ' + classe : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(SVGNS, 'use');
    use.setAttribute('href', '#' + nome);
    svg.appendChild(use);
    return svg;
  }

  /* el('div', {class:'x', dataset:{a:1}, on:{click:fn}}, 'texto', outroNo) */
  function el(tag, attrs) {
    var no = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') no.className = v;
      else if (k === 'text') no.textContent = v;
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { no.dataset[d] = v[d]; });
      else if (k === 'on') Object.keys(v).forEach(function (ev) { no.addEventListener(ev, v[ev]); });
      else if (v === true) no.setAttribute(k, '');
      else no.setAttribute(k, String(v));
    });
    for (var i = 2; i < arguments.length; i++) anexar(no, arguments[i]);
    return no;
  }
  function anexar(pai, filho) {
    if (filho == null || filho === false) return;
    if (Array.isArray(filho)) { filho.forEach(function (f) { anexar(pai, f); }); return; }
    pai.appendChild(typeof filho === 'string' || typeof filho === 'number' ? document.createTextNode(String(filho)) : filho);
  }
  function esvaziar(no) { while (no.firstChild) no.removeChild(no.firstChild); return no; }

  /* Situação do período em relação a hoje */
  function situacao(r) {
    var h = hojeISO();
    if (r.inicio <= h && r.termino >= h) return { chave: 'vigente', rotulo: 'Vigente', icone: 'i-check-circle' };
    if (r.inicio > h) return { chave: 'futura', rotulo: 'Programada', icone: 'i-clock' };
    return { chave: 'encerrada', rotulo: 'Encerrada', icone: 'i-archive' };
  }
  function badgeSituacao(r) {
    var s = situacao(r);
    return el('span', { class: 'badge badge-' + s.chave }, icone(s.icone), s.rotulo);
  }
  function badgeTipo(chave) {
    var t = C.tipos[chave] || C.tipos.expediente;
    return el('span', { class: 'badge ' + t.badge }, icone(t.icon), t.label);
  }
  function badgeSemana(n) {
    return el('span', { class: 'badge badge-semana' + n }, icone('i-calendar-week'), 'Semana ' + n);
  }

  return {
    deISO: deISO, paraISO: paraISO, somarDias: somarDias, hojeISO: hojeISO, br: br, brCurto: brCurto,
    diaSemana: diaSemana, diaCurto: diaCurto, ehDomingo: ehDomingo, diasEntre: diasEntre, dataHoraBR: dataHoraBR,
    normalizar: normalizar, limpar: limpar, uid: uid, nomeCompleto: nomeCompleto,
    icone: icone, el: el, esvaziar: esvaziar, situacao: situacao, badgeSituacao: badgeSituacao, badgeSemana: badgeSemana, badgeTipo: badgeTipo
  };
})();
