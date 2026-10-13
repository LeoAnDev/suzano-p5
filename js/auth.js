/* =====================================================================
   Autenticação — usuário único (hard code) + sessão no navegador
   ===================================================================== */
"use strict";

P5.auth = (function () {
  var C = P5.config;
  var timerId = null;
  var ultimoToque = 0;
  var aoExpirar = null;

  /* PBKDF2-SHA-256 com salt aleatório e muitas iterações (padrão OWASP):
     torna inviável descobrir a senha por força bruta a partir do hash
     público no código-fonte. */
  function hexParaBytes(hex) {
    var b = new Uint8Array(hex.length / 2);
    for (var i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
    return b;
  }

  async function pbkdf2(texto) {
    var chave = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(texto),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    var bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: hexParaBytes(C.auth.salt), iterations: C.auth.iteracoes },
      chave,
      256,
    );
    return Array.from(new Uint8Array(bits))
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  /* Comparação em tempo constante (evita vazamento por tempo de resposta) */
  function iguais(a, b) {
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  function tokenAleatorio() {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  /* ---------- Bloqueio por tentativas ---------- */
  function lerBloqueio() {
    try {
      return (
        JSON.parse(localStorage.getItem(C.lockKey)) || { tentativas: 0, ate: 0 }
      );
    } catch (e) {
      return { tentativas: 0, ate: 0 };
    }
  }
  function gravarBloqueio(b) {
    try {
      localStorage.setItem(C.lockKey, JSON.stringify(b));
    } catch (e) {
      /* ignora */
    }
  }
  function segundosBloqueado() {
    var b = lerBloqueio();
    var resta = Math.ceil((b.ate - Date.now()) / 1000);
    return resta > 0 ? resta : 0;
  }

  /* ---------- Login ---------- */
  async function entrar(usuario, senha) {
    var bloqueado = segundosBloqueado();
    if (bloqueado)
      return {
        ok: false,
        motivo:
          "Muitas tentativas. Aguarde " +
          bloqueado +
          "s para tentar novamente.",
      };

    if (!window.crypto || !crypto.subtle) {
      return {
        ok: false,
        motivo:
          "Navegador sem suporte a criptografia. Abra o sistema via http://localhost (Live Server) ou HTTPS.",
      };
    }

    var hU = await pbkdf2("usuario:" + String(usuario).trim());
    var hS = await pbkdf2("senha:" + String(senha));
    var valido = iguais(hU, C.auth.userHash) & iguais(hS, C.auth.passHash);

    if (!valido) {
      var b = lerBloqueio();
      b.tentativas += 1;
      if (b.tentativas >= C.maxAttempts) {
        b.ate = Date.now() + C.lockSeconds * 1000;
        b.tentativas = 0;
      }
      gravarBloqueio(b);
      var restantes = C.maxAttempts - b.tentativas;
      return {
        ok: false,
        motivo:
          b.ate > Date.now()
            ? "Acesso bloqueado por " +
              C.lockSeconds +
              "s após " +
              C.maxAttempts +
              " tentativas inválidas."
            : "Usuário ou senha inválidos. Tentativas restantes: " +
              restantes +
              ".",
      };
    }

    gravarBloqueio({ tentativas: 0, ate: 0 });
    var agora = Date.now();
    var sessao = {
      token: tokenAleatorio(),
      usuario: String(usuario).trim(),
      criadaEm: agora,
      expiraEm: agora + C.sessionHours * 3600 * 1000,
      ultimaAtividade: agora,
    };
    sessionStorage.setItem(C.sessionKey, JSON.stringify(sessao));
    await liberarTokenGithub(String(senha));
    return { ok: true, sessao: sessao };
  }

  /* Token do GitHub guardado CIFRADO no código (AES-256-GCM, chave PBKDF2
     derivada da senha). Só é aberto com a senha correta e fica apenas na
     sessão da aba — assim o Pages grava no db.txt sem colar token. */
  function base64ParaBytes(b64) {
    var bin = atob(b64), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }

  async function liberarTokenGithub(senha) {
    var cif = C.auth.tokenCifrado;
    if (!cif || !C.github) return;
    try {
      var base = await crypto.subtle.importKey("raw", new TextEncoder().encode("chave:" + senha), "PBKDF2", false, ["deriveKey"]);
      var chave = await crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: hexParaBytes(cif.salt), iterations: C.auth.iteracoes },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      var claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexParaBytes(cif.iv) }, chave, base64ParaBytes(cif.dados));
      sessionStorage.setItem(C.github.tokenKey, new TextDecoder().decode(claro));
    } catch (e) {
      console.warn("Não foi possível abrir o token do GitHub cifrado.", e);
    }
  }

  /* ---------- Sessão ---------- */
  function sessaoAtual() {
    var s;
    try {
      s = JSON.parse(sessionStorage.getItem(C.sessionKey));
    } catch (e) {
      s = null;
    }
    if (!s || typeof s.token !== "string" || s.token.length !== 64) return null;
    var agora = Date.now();
    if (agora > s.expiraEm) return null;
    if (agora - s.ultimaAtividade > C.idleMinutes * 60 * 1000) return null;
    return s;
  }

  function tocar() {
    var agora = Date.now();
    if (agora - ultimoToque < 15000) return; // grava no máximo a cada 15s
    ultimoToque = agora;
    var s = sessaoAtual();
    if (!s) return;
    s.ultimaAtividade = agora;
    sessionStorage.setItem(C.sessionKey, JSON.stringify(s));
  }

  function vigiar(callbackExpirou) {
    aoExpirar = callbackExpirou;
    ["click", "keydown", "pointermove", "scroll", "touchstart"].forEach(
      function (ev) {
        window.addEventListener(ev, tocar, { passive: true });
      },
    );
    clearInterval(timerId);
    timerId = setInterval(function () {
      if (!sessaoAtual())
        sair("Sua sessão expirou por inatividade. Entre novamente.");
    }, 20000);
  }

  /* ---------- Logout: elimina sessão, tokens e cookies do site ---------- */
  function sair(mensagem) {
    clearInterval(timerId);
    try {
      sessionStorage.clear();
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf("p5.session") === 0 || k.indexOf("token") !== -1)
          localStorage.removeItem(k);
      });
    } catch (e) {
      /* ignora */
    }

    document.cookie.split(";").forEach(function (c) {
      var nome = c.split("=")[0].trim();
      if (nome)
        document.cookie =
          nome + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    });

    if (mensagem) {
      try {
        sessionStorage.setItem(C.flashKey, mensagem);
      } catch (e) {
        /* ignora */
      }
    }
    if (typeof aoExpirar === "function") aoExpirar();
    // Recarrega sem deixar o dashboard no histórico
    window.location.replace(
      window.location.pathname.replace(/index\.html?$/i, ""),
    );
  }

  function consumirAviso() {
    var m = null;
    try {
      m = sessionStorage.getItem(C.flashKey);
      sessionStorage.removeItem(C.flashKey);
    } catch (e) {
      /* ignora */
    }
    return m;
  }

  return {
    entrar: entrar,
    sessaoAtual: sessaoAtual,
    vigiar: vigiar,
    sair: sair,
    consumirAviso: consumirAviso,
    segundosBloqueado: segundosBloqueado,
  };
})();
