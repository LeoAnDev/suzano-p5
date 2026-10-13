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

  /* Segunda e domingo da semana (segunda a domingo) que contém a data */
  function segundaDaSemana(iso) {
    var d = deISO(iso);
    if (!d) return '';
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return paraISO(d);
  }
  function domingoDaSemana(iso) { return somarDias(segundaDaSemana(iso), 6); }

  /* Semana do mês (S1, S2, S3…): semanas de segunda a domingo contadas
     dentro do mês da data; ao virar o mês, recomeça em S1. */
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function semanaDoMes(iso) {
    var d = deISO(iso);
    if (!d) return 0;
    var desloc = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() + 6) % 7; // segunda = 0
    return Math.ceil((d.getDate() + desloc) / 7);
  }
  function mesDe(iso) { return /^\d{4}-\d{2}/.test(iso || '') ? iso.slice(0, 7) : ''; }
  function nomeMes(mes) { // 'AAAA-MM' -> 'outubro/2026'
    if (!/^\d{4}-\d{2}$/.test(mes || '')) return '';
    return MESES[Number(mes.slice(5, 7)) - 1] + '/' + mes.slice(0, 4);
  }
  /* Dias da semana (segunda a domingo) que contém a data */
  function diasDaSemana(iso) {
    var seg = segundaDaSemana(iso);
    if (!seg) return [];
    return [0, 1, 2, 3, 4, 5, 6].map(function (i) { return somarDias(seg, i); });
  }
  /* Todos os dias entre duas datas (inclusive) */
  function diasDoIntervalo(ini, fim) {
    var out = [];
    if (!deISO(ini) || !deISO(fim) || fim < ini) return out;
    for (var d = ini; d <= fim && out.length < 62; d = somarDias(d, 1)) out.push(d);
    return out;
  }
  /* 'SEG 19/10, QUA 21/10' */
  function rotuloDias(dias) {
    return (dias || []).map(function (d) { return diaCurto(d) + ' ' + brCurto(d); }).join(', ');
  }
  /* Mini-semana: 7 quadradinhos (S T Q Q S S D) com os dias trabalhados */
  function faixaDias(r) {
    var marcados = r.dias || [];
    var letras = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
    return el('span', { class: 'faixa-dias', role: 'img', 'aria-label': 'Dias: ' + rotuloDias(marcados), title: rotuloDias(marcados) },
      diasDaSemana(r.inicio).map(function (d, i) {
        var on = marcados.indexOf(d) !== -1;
        return el('span', { class: 'faixa-dia' + (on ? ' on' : ''), text: letras[i] });
      }));
  }
  function rotuloSemana(r) { // 'S3 • outubro/2026'
    return 'S' + r.semana + ' • ' + nomeMes(r.mes);
  }
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
  function badgeSemana(r) {
    return el('span', { class: 'badge badge-semana' + (r.semana % 2 ? 1 : 2), title: r.semana + 'ª semana de ' + nomeMes(r.mes) },
      icone('i-calendar-week'), rotuloSemana(r));
  }

  return {
    deISO: deISO, paraISO: paraISO, somarDias: somarDias, hojeISO: hojeISO, br: br, brCurto: brCurto,
    diaSemana: diaSemana, diaCurto: diaCurto, ehDomingo: ehDomingo, diasEntre: diasEntre, dataHoraBR: dataHoraBR,
    normalizar: normalizar, limpar: limpar, uid: uid, nomeCompleto: nomeCompleto,
    icone: icone, el: el, esvaziar: esvaziar, situacao: situacao, badgeSituacao: badgeSituacao, badgeSemana: badgeSemana, badgeTipo: badgeTipo,
    segundaDaSemana: segundaDaSemana, domingoDaSemana: domingoDaSemana,
    semanaDoMes: semanaDoMes, mesDe: mesDe, nomeMes: nomeMes, rotuloSemana: rotuloSemana,
    diasDaSemana: diasDaSemana, diasDoIntervalo: diasDoIntervalo, rotuloDias: rotuloDias, faixaDias: faixaDias
  };
})();
