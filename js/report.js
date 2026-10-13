/* =====================================================================
   Relatórios para impressão / PDF — formato A4 com cabeçalho e rodapé
   (cabeçalho e rodapé se repetem em todas as páginas via thead/tfoot)
   ===================================================================== */
'use strict';

P5.report = (function () {
  var C = P5.config;
  var U = P5.util;
  var el = U.el;

  function cabecalho(titulo) {
    return el('div', { class: 'pr-header' },
      el('img', { src: 'images/Logo29.PNG', alt: '', class: 'pr-brasao' }),
      el('div', { class: 'pr-org' },
        el('strong', { text: 'POLÍCIA MILITAR DO ESTADO DO RIO DE JANEIRO' }),
        el('span', { text: '29º BATALHÃO DE POLÍCIA MILITAR' }),
        el('span', { text: 'P5 — Seção de Comunicação Social / Relações Públicas' })
      ),
      el('div', { class: 'pr-doc' },
        el('strong', { text: 'RELATÓRIO DE ESCALA' }),
        el('span', { text: titulo })
      )
    );
  }

  function hora(d) {
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }

  /* Rodapé de auditoria: quem gerou, data e hora (repetido em todas as páginas) */
  function rodape(sessao) {
    var agora = new Date();
    var inicioSessao = sessao ? new Date(sessao.criadaEm) : null;
    return el('div', { class: 'pr-footer' },
      el('div', { class: 'pr-footer-linha' },
        el('span', null, el('strong', { text: 'Gerado por: ' }), sessao ? sessao.usuario : 'não identificado'),
        el('span', null, el('strong', { text: 'Data: ' }), U.br(U.paraISO(agora))),
        el('span', null, el('strong', { text: 'Hora: ' }), hora(agora)),
        inicioSessao ? el('span', null, el('strong', { text: 'Sessão iniciada: ' }), U.br(U.paraISO(inicioSessao)) + ' ' + hora(inicioSessao)) : null
      ),
      el('div', { class: 'pr-footer-linha pr-footer-sub' },
        el('span', { text: '29º BPM • P5 – Comunicação Social' }),
        el('span', { text: 'Documento de uso interno — gerado pelo sistema Escala P5' })
      )
    );
  }

  /* Escala dia a dia: quem trabalha em cada dia da semana */
  function tabelaPorDia(g) {
    var dias = U.diasDaSemana(g.inicio).filter(function (d) {
      return g.itens.some(function (r) { return r.dias.indexOf(d) !== -1; });
    });
    return el('table', { class: 'pr-tabela pr-tabela-dias' },
      el('thead', null, el('tr', null, el('th', { class: 'pr-col-dia', text: 'Dia' }), el('th', { text: 'Policiais escalados' }))),
      el('tbody', null, dias.map(function (d) {
        var nomes = g.itens.filter(function (r) { return r.dias.indexOf(d) !== -1; })
          .map(function (r) { return r.grad + ' ' + r.nome + ' (' + C.tipos[r.tipo].label + ')'; });
        return el('tr', null, el('td', null, el('strong', { text: U.diaSemana(d) }), ' ' + U.br(d)), el('td', { text: nomes.join(' • ') }));
      })));
  }

  function blocoGrupo(g) {
    return el('section', { class: 'pr-semana' },
      el('div', { class: 'pr-semana-head' },
        el('h3', { text: 'S' + g.semana + ' — ' + g.semana + 'ª SEMANA DE ' + U.nomeMes(g.mes).toUpperCase() + ' — ' + U.br(g.inicio) + ' a ' + U.br(g.termino) }),
        el('span', { text: U.diaSemana(g.inicio) + ' a ' + U.diaSemana(g.termino) + '  •  ' + C.horario.dias + ', ' + C.horario.inicio + ' às ' + C.horario.fim })
      ),
      tabelaPorDia(g),
      el('table', { class: 'pr-tabela' },
        el('thead', null, el('tr', null,
          el('th', { class: 'pr-col-n', text: 'Nº' }),
          el('th', { class: 'pr-col-grad', text: 'Graduação' }),
          el('th', { class: 'pr-col-rg', text: 'RG Militar' }),
          el('th', { class: 'pr-col-nome', text: 'Nome farda' }),
          el('th', { class: 'pr-col-tipo', text: 'Tipo de escala' }),
          el('th', { class: 'pr-col-dias', text: 'Dias' }),
          el('th', { text: 'Observações' }))),
        el('tbody', null, g.itens.map(function (r, i) {
          var obs = el('td', { class: 'pr-obs' });
          if (r.observacoes) obs.appendChild(P5.rich.fragmento(r.observacoes));
          else obs.textContent = '—';
          return el('tr', null,
            el('td', { text: String(i + 1).padStart(2, '0') }),
            el('td', { text: r.grad }),
            el('td', { text: r.rg || '—' }),
            el('td', null, el('strong', { text: r.nome })),
            el('td', null, el('span', { class: 'pr-tag pr-' + r.tipo, text: C.tipos[r.tipo].label })),
            el('td', { class: 'pr-dias', text: U.rotuloDias(r.dias) }),
            obs);
        }))
      )
    );
  }

  /* opcoes: { titulo, filtros: ['texto', ...], registros: [...] } */
  function imprimir(opcoes) {
    var area = document.getElementById('print-area');
    U.esvaziar(area);

    var grupos = P5.db.agrupar(opcoes.registros);
    var nomes = {};
    opcoes.registros.forEach(function (r) { nomes[U.normalizar(r.nome)] = 1; });
    var datas = opcoes.registros.map(function (r) { return r.inicio; }).concat(opcoes.registros.map(function (r) { return r.termino; })).sort();

    var resumo = el('div', { class: 'pr-resumo' },
      el('div', null, el('span', { text: 'Período abrangido' }),
        el('strong', { text: datas.length ? U.br(datas[0]) + ' a ' + U.br(datas[datas.length - 1]) : '—' })),
      el('div', null, el('span', { text: 'Lançamentos' }), el('strong', { text: String(opcoes.registros.length) })),
      el('div', null, el('span', { text: 'Policiais' }), el('strong', { text: String(Object.keys(nomes).length) })),
      el('div', null, el('span', { text: 'Filtros' }), el('strong', { text: opcoes.filtros && opcoes.filtros.length ? opcoes.filtros.join(' • ') : 'Nenhum (geral)' }))
    );

    var corpo = el('div', { class: 'pr-corpo' },
      resumo,
      grupos.length ? grupos.map(blocoGrupo) : el('p', { class: 'pr-vazio', text: 'Nenhum registro encontrado.' }),
      el('div', { class: 'pr-assinatura' },
        el('div', null, el('span', { class: 'pr-linha' }), el('span', { text: 'Chefe da P5 – Comunicação Social' })),
        el('div', null, el('span', { class: 'pr-linha' }), el('span', { text: 'Visto do Comandante' }))
      )
    );

    area.appendChild(el('table', { class: 'pr-layout' },
      el('thead', null, el('tr', null, el('td', null, cabecalho(opcoes.titulo)))),
      el('tfoot', null, el('tr', null, el('td', null, rodape(P5.auth.sessaoAtual())))),
      el('tbody', null, el('tr', null, el('td', null, corpo)))
    ));

    var tituloOriginal = document.title;
    document.title = 'Escala P5 - ' + opcoes.titulo.replace(/[\\/:*?"<>|]/g, '-');

    var limpar = function () {
      document.title = tituloOriginal;
      U.esvaziar(area);
      window.removeEventListener('afterprint', limpar);
    };
    window.addEventListener('afterprint', limpar);

    var img = area.querySelector('.pr-brasao');
    var disparar = function () { window.print(); };
    if (img && !img.complete) { img.addEventListener('load', disparar, { once: true }); img.addEventListener('error', disparar, { once: true }); }
    else disparar();
  }

  return { imprimir: imprimir };
})();
