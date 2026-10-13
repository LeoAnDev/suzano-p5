# Escala P5 • 29º BPM

Sistema web para **lançar, consultar e imprimir a escala** da **P5 – Seção de Comunicação Social (Relações Públicas)** do 29º Batalhão de Polícia Militar.

Feito em **HTML, CSS e JavaScript puros**: sem frameworks, sem bibliotecas externas e sem etapa de build. O banco de dados é um arquivo de texto (`db-local-txt/db.txt`), gravado **na hora** a cada operação:

- **no GitHub Pages:** cada inclusão, alteração ou exclusão vira um **commit** no `db.txt` do repositório, pela API do GitHub (protegida por token);
- **no computador:** o servidor local `servidor.js`, também em JavaScript puro e sem dependências, grava direto no arquivo.

A mesma pasta funciona nos dois ambientes sem nenhuma alteração.

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Estrutura do projeto](#estrutura-do-projeto)
3. [Como rodar no VS Code](#como-rodar-no-vs-code)
4. [Acesso ao sistema](#acesso-ao-sistema)
5. [Modo de usar](#modo-de-usar)
6. [Banco de dados `db.txt`](#banco-de-dados-dbtxt)
7. [Regras de integridade (datas)](#regras-de-integridade-datas)
8. [Publicar no GitHub Pages](#publicar-no-github-pages)
9. [Endereços (URL limpa)](#endereços-url-limpa)
10. [Segurança](#segurança)
11. [Visual, animações e acessibilidade](#visual-animações-e-acessibilidade)
12. [Impressão e PDF (A4)](#impressão-e-pdf-a4)
13. [Personalização](#personalização)
14. [Solução de problemas](#solução-de-problemas)

---

## Funcionalidades

| Área | O que faz |
| --- | --- |
| **Login** | Usuário único da seção (só os hashes PBKDF2 ficam no código), bloqueio após 5 tentativas e opção de mostrar/ocultar a senha |
| **Painel** | Escala do período vigente no layout original (brasão, faixa da semana, horário) com cartões dos policiais, navegação entre períodos e impressão |
| **Lançamentos** | **Um único formulário** ao lado da **tabela da escala**. Incluir, editar e excluir com gravação imediata no `db.txt` |
| **Consultas** | Filtros por data, semana, tipo de escala, policial e graduação. Impressão individual, da consulta ou geral |
| **Banco db.txt** | Vínculo com o arquivo, situação da gravação, download, importação e pré-visualização do `.txt` |
| **Modo de usar** | Guia passo a passo dentro do sistema |
| **Temas** | Claro e escuro, com contraste WCAG 2.1 AA |
| **Sessão** | Logout que elimina sessão, tokens e cookies. Expira após 30 min sem uso ou 8 h no máximo |

### Campos do formulário de lançamento

| Campo | Tipo | Observação |
| --- | --- | --- |
| **Semana** | Controle segmentado | **Calculada pelas datas** (ciclo quinzenal). Clicar em Semana 1 ou 2 leva as datas para a próxima semana daquele tipo |
| **Tipo de escala** | Select | Carga horária (Expediente, **12 horas**, **24 horas**, **48 horas**) ou situação (Feriado, Troca, Sobreaviso, Ponto facultativo, Folga) |
| **Data Início** | Calendário | Só aceita **de hoje em diante**. Ao mudar, a Semana se ajusta sozinha |
| **Data Término** | Calendário | Preenchida com o **domingo** da semana. Nunca antes da Data Início nem depois do domingo |
| **Graduação** | Select | SD PM, CB PM, 3º/2º/1º SGT PM, SUBTEN PM, ASP PM, 2º/1º TEN PM, CAP PM, MAJ PM, TEN CEL PM, CEL PM |
| **RG Militar** | Numérico | **5 a 6 dígitos**, só números (teclado numérico no celular). Um RG já usado **preenche graduação e nome** |
| **Nome Farda** | Texto com sugestões | Sempre em **MAIÚSCULAS**. Um nome já usado preenche graduação e RG |
| **Observações** | Editor de texto rico | Sempre em **MAIÚSCULAS**. Negrito, itálico, sublinhado, tachado, listas, citação, desfazer e refazer |

**Tudo em MAIÚSCULAS.** Os dados são convertidos para maiúsculas durante a digitação, ao colar, ao salvar e ao editar. Se alguém escrever em minúsculas direto no `db.txt`, o sistema normaliza o conteúdo e regrava o arquivo em maiúsculas. As credenciais de login são a exceção: não passam por essa conversão.

**Ciclo das semanas.** A escala alterna Semana 1 e Semana 2, de segunda a domingo, a partir de uma data de referência (`cicloInicio` em `js/config.js`, hoje 12/10/2026):

| Semana 1 | Semana 2 |
| --- | --- |
| 12/10 a 18/10/2026 | 19/10 a 25/10/2026 |
| 26/10 a 01/11/2026 | 02/11 a 08/11/2026 |

Cada lançamento fica dentro de **uma única semana**. Se alguém gravar um lançamento com a semana incoerente com as datas (por exemplo, editando o `db.txt`), o sistema corrige sozinho.

Para digitar o mínimo:

- Depois de **Incluir**, o formulário mantém semana, datas e tipo, para lançar o próximo policial do mesmo período.
- No painel, o botão **Lançar neste período** já preenche semana e datas (só aparece em períodos futuros).

---

## Estrutura do projeto

```text
suzano-p5/
├── index.html              # Somente HTML: telas, formulário, sprite de ícones e importações
├── README.md
├── servidor.js             # Servidor local (Node.js puro): entrega o site e grava o db.txt
├── gerar-credenciais.js    # Define usuário, senha e token (só hashes e token cifrado) e testa o token (--testar)
├── .vscode/
│   ├── tasks.json          # Liga o servidor local ao abrir a pasta (ou Ctrl+Shift+B)
│   └── settings.json       # Live Server ignora db-local-txt/ (caso seja usado)
├── css/
│   └── style.css           # Todo o CSS: temas, layout, animações, responsivo e impressão A4
├── js/
│   ├── theme.js            # Tema claro/escuro (carregado no <head>, sem "piscar")
│   ├── config.js           # Hashes, token cifrado, repositório, ciclo das semanas, graduações, tipos, horário
│   ├── utils.js            # Datas, texto, badges e criação segura de elementos
│   ├── editor.js           # Editor de texto rico + sanitizador por lista branca
│   ├── auth.js             # Login, sessão, inatividade e logout
│   ├── db.js               # Banco .txt: gravação (GitHub/servidor/arquivo), conflitos, monitor e regras
│   ├── report.js           # Relatórios A4 para impressão/PDF
│   └── app.js              # Interface: navegação, painel, lançamentos, consultas e banco
├── db-local-txt/
│   └── db.txt              # Banco de dados em texto
└── images/
    └── Logo29.PNG          # Brasão do 29º BPM
```

Ordem dos scripts: `config → utils → editor → auth → db → report → app`, todos com `defer`.

---

## Como rodar no VS Code

Para usar no computador, o sistema precisa de um servidor para gravar no `db.txt` local. O projeto traz o `servidor.js`, que usa só o Node.js instalado no computador: sem `npm install` e sem dependências.

### Opção 1: atalho do VS Code (recomendado)

1. Abra a pasta `suzano-p5` no VS Code.
2. O servidor liga sozinho ao abrir a pasta. Se não ligar, pressione **Ctrl+Shift+B** (tarefa *Escala P5: iniciar servidor local*).
3. Acesse `http://127.0.0.1:5510/` (ou continue usando o Live Server).

### Opção 2: terminal

```bash
node servidor.js
```

Para parar o servidor, pressione **Ctrl+C** no terminal. Para usar outra porta: `PORT=5511 node servidor.js` (no PowerShell: `$env:PORT=5511; node servidor.js`).

> **E o Live Server?** Também funciona, **desde que o `servidor.js` esteja rodando**: a página aberta pelo Live Server (porta 55xx) encontra o servidor local na porta 5510 e grava por ele. Se o servidor for ligado depois, a página se conecta sozinha em até 3 segundos e grava no `db.txt` o que estava pendente. Sem o servidor, os dados ficam só no navegador, porque o navegador não grava arquivos do computador sem que o usuário escolha o arquivo numa janela.

**Início automático:** o `.vscode/tasks.json` liga o servidor sozinho ao abrir a pasta no VS Code. Na primeira vez, o VS Code pergunta se pode executar tarefas automáticas: escolha **Permitir**. Se precisar, use **Ctrl+Shift+P → Tasks: Manage Automatic Tasks → Allow Automatic Tasks**.

O servidor só aceita conexões do próprio computador (`127.0.0.1`), só grava o arquivo `db-local-txt/db.txt` e recusa pedidos vindos de outros sites.

---

## Acesso ao sistema

O sistema tem **um único usuário** para toda a seção. **Usuário e senha não são publicados em nenhum arquivo** do projeto, nem nesta documentação: eles são repassados pelo responsável da seção, pessoalmente.

O código guarda apenas **hashes PBKDF2-SHA-256** (310 mil iterações, com salt aleatório), o que torna inviável descobrir a senha a partir do código público, desde que ela seja forte.

### Definir ou trocar usuário e senha

No terminal, na pasta do projeto:

```bash
node gerar-credenciais.js
```

O script pergunta o usuário, a senha (que não aparece na tela) e o token do GitHub (opcional, para gravar pelo Pages). Ele exige uma senha forte (12 ou mais caracteres, com maiúsculas, minúsculas, números e símbolos) e grava em `js/config.js` só os hashes e o token cifrado. Para ele criar uma senha aleatória forte:

```bash
node gerar-credenciais.js --gerar
```

Depois, faça commit e push para valer também no GitHub Pages.

> **Nunca** escreva usuário ou senha em README, issues, commits ou mensagens. Se a senha vazar, gere outra na hora com o script.

---

## Modo de usar

1. **Entre** com o usuário e a senha da seção.
2. Em **Lançamentos**, escolha a **Semana** e o **Tipo de escala**, e confira as datas sugeridas.
3. Selecione a **Graduação** e informe o **RG Militar** e o **Nome Farda**. Escreva as **Observações**, se houver.
4. Clique em **Incluir**. O lançamento é gravado **na hora** no `db.txt`, e um aviso (toast) confirma a gravação. No Pages, se a gravação automática ainda não estiver ativada, na primeira vez abre a janela **Conectar ao GitHub** para colar o token (veja [Gravação pelo GitHub Pages](#gravação-pelo-github-pages-token)).
5. Para **alterar**, clique no lápis na tabela: o lançamento sobe para o formulário. Clique em **Salvar alterações**.
6. Para **excluir**, clique na lixeira e confirme.
7. Em **Consultas**, filtre e imprima o relatório.
8. Clique em **Sair** ao terminar.

O indicador no topo mostra a situação do arquivo:

| Indicador | Significado |
| --- | --- |
| **db.txt gravando** (verde) | Cada operação é gravada na hora no `db.txt` (servidor local) |
| **GitHub gravando** (verde) | Cada operação vira um commit no `db.txt` do repositório |
| **Conectar GitHub** (laranja) | No GitHub Pages, sem token. Clique para conectar |
| **Só no navegador** | No computador, sem o `servidor.js` ligado. Os dados ficam só no navegador |
| **Pendente: db.txt** (laranja) | Há alterações só no navegador. Ao conectar ao GitHub ou ao servidor, elas são gravadas automaticamente |
| **Reconectar db.txt** (laranja) | Modo "arquivo vinculado": o navegador pede nova autorização. Clique para conceder |

---

## Banco de dados `db.txt`

### Gravação imediata

Cada **inclusão, alteração ou exclusão** é gravada **na hora** no `db.txt`, com um toast de confirmação. O sistema escolhe o modo sozinho:

| Modo | Quando | Como grava |
| --- | --- | --- |
| **Servidor** (recomendado) | Aberto por `node servidor.js` | Direto no `db-local-txt/db.txt`, **sem janelas**. Gravação atômica (arquivo temporário + troca), sem risco de corromper o arquivo |
| **GitHub** | GitHub Pages com o token da seção conectado | Cada operação vira um **commit** no `db.txt` do repositório, pela API do GitHub |
| **Arquivo vinculado** | Chrome/Edge, sem servidor, após **Banco db.txt → Vincular db.txt** | Direto no arquivo escolhido (o vínculo fica guardado no navegador) |
| **Navegador** | Nenhum dos anteriores | Só no cache do navegador. As alterações ficam **pendentes** e são gravadas no `db.txt` assim que houver servidor ou token conectado |

- **O arquivo manda:** se o `db.txt` for alterado fora do sistema (por exemplo, editado no VS Code), o sistema percebe em até 3 segundos e recarrega os dados na tela.
- **Nada se perde:** os dados também ficam em cache no navegador (`localStorage`). Se o servidor cair, a alteração fica pendente e o toast avisa.

### Gravação pelo GitHub Pages (token)

No GitHub Pages, o sistema grava no `db.txt` do repositório pela **API oficial do GitHub**. Cada inclusão, alteração ou exclusão vira um **commit**. A mensagem diz o que foi feito, por quem e quando, e o histórico de commits funciona como trilha de auditoria.

**Só grava quem tem o token.** Mesmo que alguém contorne a tela de login, sem o token o GitHub recusa a gravação: a verificação é feita pelos servidores do GitHub, não pelo navegador.

**Como criar o token da seção** (uma vez, pelo dono do repositório):

1. Acesse <https://github.com/settings/personal-access-tokens/new> (*Fine-grained token*).
2. **Token name:** `Escala P5`. **Expiration:** por exemplo, 90 dias.
3. **Repository access:** *Only select repositories* → `suzano-p5`.
4. Em **Permissions**, na caixa **Repositories**, clique em **+ Add permissions** → **Contents** → *Read and write*. A caixa **Account** fica vazia; não marque mais nada.
5. Clique em **Generate token** e copie o valor (começa com `github_pat_`).

**Testar o token antes (recomendado):** confere de verdade se o token lê e grava no repositório, sem alterar nada:

```bash
node gerar-credenciais.js --testar
```

O resultado esperado é `✔ Leitura do repositório: OK` e `✔ Escrita no repositório: OK`. Se algo faltar, o script diz exatamente o que mudar no token.

**Ativar a gravação automática (uma vez):** com o token copiado, rode na pasta do projeto:

```bash
node gerar-credenciais.js
```

Informe o usuário, a senha e, quando pedir, o token. O script confere se o token tem acesso ao repositório e grava em `js/config.js` **só o token cifrado** (AES-256-GCM, chave derivada da senha por PBKDF2 com 310 mil iterações). Depois, faça commit e push.

A partir daí, **quem entra no sistema no Pages com usuário e senha já fica conectado ao GitHub**, sem colar token nenhum. Cada inclusão, alteração ou exclusão vai direto para o `db.txt` do repositório. Sem a senha, o token cifrado publicado não serve para nada.

Se o token não estiver configurado ou expirar, o indicador **Conectar GitHub** no topo abre a janela para colar um token manualmente, que vale só para aquela sessão.

| Cuidado | Por quê |
| --- | --- |
| O token em texto puro **nunca** vai para o código, o README, issues ou commits; só a versão cifrada fica no `config.js` | Quem tiver o token consegue alterar o `db.txt` |
| O token expira (ex.: 90 dias) | Gere outro e rode `node gerar-credenciais.js` de novo |
| Ele fica só na aba aberta (`sessionStorage`) e é apagado ao clicar em **Sair** | Fechar a aba também apaga |
| Em caso de vazamento, revogue em **GitHub → Settings → Developer settings → Personal access tokens** | Gere outro em seguida |
| O `db.txt` do repositório público é **legível por qualquer pessoa** | A escrita é protegida, a leitura não. Veja [Limitações](#limitações-de-um-sistema-100-front-end) |

Se duas pessoas gravarem ao mesmo tempo, o sistema relê o `db.txt` do repositório, reaplica a operação e grava de novo, sem perder o lançamento do outro. A tela mostra a gravação na hora; a cópia publicada no Pages se atualiza em 1 a 2 minutos.

### Formato

Os registros ficam agrupados por **semana e período**. Cada registro tem uma parte **legível** e uma linha `@registro`, em JSON, que é a única parte que o sistema lê:

```text
########################################################################
#  DB-LOCAL-TXT • ESCALA P5 • COMUNICAÇÃO SOCIAL • 29º BPM
#  Atualizado em: 13/10/2026 14:05   |   Registros: 2   |   Períodos: 1
########################################################################

========================================================================
  SEMANA 2  •  19/10/2026 (Segunda-feira) a 25/10/2026 (Domingo)
  Efetivo: 2 policial(is)
========================================================================

  [0001]  3º SGT PM   RG 45123     SILVANA                Tipo: Expediente
          ID: e-…   |   Criado: 13/10/2026 14:01   |   Atualizado: 13/10/2026 14:01
          Observações:
            COBRIR EVENTO URGENTE
@registro {"id":"e-…","semana":2,"tipo":"expediente","inicio":"2026-10-19",…}
  ----------------------------------------------------------------------
```

> Se for editar o `db.txt` à mão, altere **apenas os valores dentro da linha `@registro`** e mantenha o JSON válido. Linhas inválidas são ignoradas, e o sistema avisa quantas foram.

### Na aba "Banco db.txt"

| Botão | Função |
| --- | --- |
| **Conectar ao GitHub / Trocar token do GitHub** | No Pages: abre a janela para colar o token da sessão |
| **Vincular / Reconectar / Trocar arquivo** | No computador, sem o servidor (Chrome/Edge): escolhe ou reautoriza o `db.txt` |
| **Desvincular** | Desconecta o GitHub ou o arquivo. As operações passam a ficar só no navegador |
| **Baixar db.txt** | Baixa uma cópia (útil no Firefox e no Safari) |
| **Importar .txt** | Mescla outro arquivo. Em cada registro, prevalece a versão mais recente |
| **Do servidor** | Mescla o `db.txt` publicado no site |

---

## Regras de integridade (datas)

Para garantir **segurança e transparência**, a escala não pode ser alterada retroativamente e segue o ciclo das semanas:

| Regra | Onde é aplicada |
| --- | --- |
| Os calendários só permitem datas **de hoje em diante** | Interface (`min` dos campos de data) |
| A Data Término nunca fica antes da Data Início | Interface e validação |
| Cada lançamento fica dentro de **uma única semana** (segunda a domingo) | Interface e camada de dados |
| A **Semana** (1 ou 2) é **calculada pelas datas**, nunca escolhida à mão | Interface e camada de dados, inclusive na leitura do `db.txt` |
| Lançar ou alterar com data anterior a hoje é **recusado** | Validação do formulário **e** camada de dados (`db.js`), inclusive se alguém tentar pelo console do navegador |
| Lançamento cujo período **já começou** fica **bloqueado** (cadeado): não pode ser editado nem excluído | Interface e camada de dados |
| Lançamentos bloqueados continuam visíveis e imprimíveis | Consultas e relatórios |
| RG Militar com **5 a 6 dígitos** | Interface e camada de dados |
| Nome Farda e Observações sempre em **MAIÚSCULAS** | Digitação, camada de dados e leitura do `db.txt` |
| Cada registro guarda **data/hora de criação e da última alteração** | `db.txt` |

> **Limite técnico:** as regras valem dentro do sistema. Quem tiver o token (ou acesso ao computador) pode alterar o `db.txt` por fora, sem passar por elas. O histórico de commits do GitHub registra qualquer alteração e funciona como trilha de auditoria.

---

## Publicar no GitHub Pages

Repositório: <https://github.com/LeoAnDev/suzano-p5> (já publicado). Os passos abaixo servem para publicar do zero.

```bash
git init
git add .
git commit -m "Escala P5: sistema de escala em HTML/CSS/JS puros"
git branch -M main
git remote add origin https://github.com/LeoAnDev/suzano-p5.git
git push -u origin main
```

No GitHub:

1. Abra **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Selecione a branch **main** e a pasta **/ (root)**, e clique em **Save**.
4. Em 1 a 2 minutos, o sistema estará em <https://leoandev.github.io/suzano-p5/>.

**Nenhuma alteração é necessária entre o localhost e o GitHub Pages.** Todos os caminhos são relativos e o endereço base é detectado automaticamente.

> No plano gratuito, o Pages só funciona com o repositório **público**. Se o repositório for tornado privado, o GitHub desliga o Pages, e ao voltar para público é preciso reativá-lo em **Settings → Pages**.
>
> O GitHub Pages diferencia maiúsculas de minúsculas. O brasão precisa continuar como `images/Logo29.PNG`.

---

## Endereços (URL limpa)

A barra de endereços mostra **somente o endereço base**, sem `#`, sem `index.html` e sem parâmetros:

| Ambiente | Endereço exibido |
| --- | --- |
| VS Code (`servidor.js`) | `http://127.0.0.1:5510/` |
| GitHub Pages | `https://leoandev.github.io/suzano-p5/` |

- A navegação entre telas funciona sem mudar a URL, e os botões **Voltar** e **Avançar** do navegador continuam funcionando.
- Ao recarregar, o sistema volta para a última tela aberta.
- Quem acessa `…/index.html` ou links antigos com `#/…` é redirecionado para a URL limpa.

> No GitHub Pages, o trecho `/suzano-p5/` vem do nome do repositório. Para removê-lo, configure um **domínio próprio** em **Settings → Pages → Custom domain**.

---

## Segurança

- **Credenciais em hash PBKDF2-SHA-256** (310 mil iterações, salt aleatório), comparadas em tempo constante. Usuário e senha não aparecem em nenhum arquivo nem na documentação.
- **Bloqueio por tentativas:** 5 erros bloqueiam o acesso por 60 segundos.
- **Sessão em `sessionStorage`**, com token aleatório de 256 bits, que morre ao fechar a aba.
- **Expiração** após 30 minutos sem uso ou 8 horas no máximo.
- **Logout completo:** apaga sessão, tokens e cookies, e o botão Voltar não reexibe o painel.
- **Content-Security-Policy** restrita: só recursos do próprio site, sem `inline` e sem `eval`.
- **Sem `innerHTML` com dados:** o texto é inserido via `textContent`.
- **Observações sanitizadas por lista branca:** só formatação básica (`p`, `strong`, `em`, `u`, `s`, listas, citação). Scripts, atributos, estilos e links são descartados ao salvar, ao colar e ao ler o `db.txt`.
- **Gravação no Pages protegida pelo GitHub:** só grava quem tem o token pessoal (escopo limitado ao repositório, só *Contents*, com validade). Em texto puro, o token fica apenas na sessão da aba. No código, só pode aparecer **cifrado com a senha** (AES-256-GCM).
- **Auditoria:** cada operação no Pages vira um commit, com o que foi feito, por quem e quando.
- **Regras de datas** aplicadas na camada de dados (veja [Regras de integridade](#regras-de-integridade-datas)).

### Limitações de um sistema 100% front-end

- O login da tela é uma barreira de interface. A proteção real da **escrita** no Pages é o token do GitHub.
- **A leitura do `db.txt` não é protegida.** No repositório público, qualquer pessoa vê **nomes, RG militar e dias de serviço** dos policiais, direto no GitHub ou no endereço do arquivo, e o histórico de commits guarda tudo o que já foi gravado. Para uma escala da PM, isso é risco operacional e pessoal (LGPD).
- **Recomendação:** não lance dados reais no repositório público. Para uso real, mantenha o `db.txt` num **repositório privado separado** (o sistema continua no Pages) ou use só o servidor local.

---

## Visual, animações e acessibilidade

- **Inspirado no macOS:** barra superior translúcida com desfoque, abas em controle segmentado com indicador deslizante, cartões com sombras suaves e fonte do sistema.
- **Transições entre telas** fluidas: a tela atual esmaece e a nova entra deslizando. A animação usa só opacidade e `transform`, aceleradas pela GPU e sem desfoque nem escala, o que evita tremedeiras. O indicador das abas desliza já no clique.
- **Modais em estilo "sheet"**, que crescem com efeito de mola e fundo desfocado, e **notificações** que deslizam pela lateral.
- **Responsivo:** no celular, a tabela vira lista de cartões e o formulário vem antes da tabela.
- **Temas claro e escuro** com contraste **WCAG 2.1 AA**: texto com pelo menos 4.5:1 e bordas de campos com pelo menos 3:1.
- Navegação completa por teclado, foco visível, `aria-live` nos avisos e erros de validação com links para o campo.
- Respeita `prefers-reduced-motion`: as animações são desligadas para quem prefere menos movimento.

---

## Impressão e PDF (A4)

- Papel **A4 retrato**, com margens fixas.
- **Cabeçalho** (brasão, PMERJ, 29º BPM, P5 e título) em **todas as páginas**.
- **Rodapé de auditoria** em **todas as páginas**, com **Gerado por** (usuário logado), **Data**, **Hora** (com segundos) e **Sessão iniciada** (data e hora do login), além de "Documento de uso interno".
- Numeração "Página X de Y" no Chrome e no Edge.
- Tabela por semana e período: Nº, Graduação, RG Militar, Nome farda, Tipo de escala e Observações (com a formatação).
- Campos de assinatura no final.

Na janela de impressão:

1. **Destino:** Salvar como PDF.
2. **Papel:** A4.
3. **Mais definições:** desmarque **Cabeçalhos e rodapés** e marque **Gráficos de plano de fundo**.

---

## Personalização

Tudo fica em [`js/config.js`](js/config.js):

| Item | Chave |
| --- | --- |
| Graduações | `graduacoes` |
| Tipos de escala (rótulo, grupo, ícone, cor) | `tipos` |
| Horário exibido no painel e nos relatórios | `horario` |
| Início do ciclo Semana 1 / Semana 2 | `cicloInicio` |
| Repositório e branch onde o `db.txt` é gravado pelo Pages | `github` |
| Tempo de sessão e de inatividade | `sessionHours`, `idleMinutes` |
| Tentativas e tempo de bloqueio | `maxAttempts`, `lockSeconds` |

### Trocar usuário ou senha

Veja [Definir ou trocar usuário e senha](#definir-ou-trocar-usuário-e-senha).

---

## Solução de problemas

| Sintoma | Causa provável e solução |
| --- | --- |
| No computador: indicador **Só no navegador** e o `db.txt` não muda | O sistema não foi aberto pelo servidor. Rode `node servidor.js` (ou Ctrl+Shift+B) e acesse `http://127.0.0.1:5510/` |
| "A porta 5510 já está em uso" | Já há um servidor aberto. Feche-o ou use outra porta (`PORT=5511`) |
| `node` não é reconhecido | Instale o Node.js LTS em <https://nodejs.org> |
| Indicador **Reconectar db.txt** | O navegador pede nova autorização. Clique no indicador |
| Botão **Vincular** desativado | Com o servidor ele não é necessário. Sem servidor, só o Chrome e o Edge permitem o vínculo |
| Não aparece o lápis ou a lixeira em um lançamento | O período já começou, então ele está bloqueado (cadeado) |
| Não consigo escolher data passada | É uma regra de integridade, não um erro |
| "Não foi possível ler db-local-txt/db.txt" | Página aberta via `file://`. Use o `servidor.js` |
| No Pages, o toast diz "Salvo apenas no navegador" | O GitHub não está conectado. Clique em **Conectar GitHub** no topo e cole o token, ou ative a gravação automática |
| Janela do token: "só tem permissão de leitura" | No GitHub, edite o token → caixa **Repositories** → **Contents: Read and write** → **Update** |
| Janela do token: "não tem acesso ao repositório" | Em **Repository access**, escolha **Only select repositories** → `suzano-p5` |
| Janela do token: "inválido ou expirado" | Gere outro token e rode `node gerar-credenciais.js` de novo |
| Quero saber se o token está certo | Rode `node gerar-credenciais.js --testar` |
| A tela do Pages não mostra uma mudança recente | Recarregue com **Ctrl+F5**. O site publicado leva de 1 a 2 minutos para atualizar |
| Erros de CSP no console citando `kaspersky-labs` | O antivírus está injetando scripts na página. A CSP os bloqueia, e isso não afeta o sistema |

---

29º BPM • P5 – Comunicação Social
