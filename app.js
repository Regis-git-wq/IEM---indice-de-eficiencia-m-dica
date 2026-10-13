(function () {
  const cfg = window.VAQUINHA;
  const $ = (id) => document.getElementById(id);
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBR = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "");

  // ---- Cabeçalho ----
  document.title = cfg.titulo;
  $("titulo").textContent = cfg.titulo;
  $("descricao").textContent = cfg.descricao;
  if (cfg.imagem) {
    $("imagem").src = cfg.imagem;
    $("imagem").hidden = false;
  }

  // ---- Progresso ----
  const doacoes = cfg.doacoes || [];
  const total =
    typeof cfg.totalManual === "number"
      ? cfg.totalManual
      : doacoes.reduce((soma, d) => soma + Number(d.valor || 0), 0);
  const pct = cfg.meta > 0 ? (total / cfg.meta) * 100 : 0;

  $("total").textContent = brl(total);
  $("meta").textContent = brl(cfg.meta);
  $("percentual").textContent = pct.toFixed(1).replace(".", ",") + "%";
  $("barra").setAttribute("aria-valuenow", Math.min(100, pct).toFixed(0));
  requestAnimationFrame(() => ($("preenchido").style.width = Math.min(100, pct) + "%"));
  if (cfg.atualizadoEm) $("atualizado").textContent = "Atualizado em " + dataBR(cfg.atualizadoEm);

  // ---- Doadores ----
  if (cfg.mostrarDoadores && doacoes.length) {
    $("secaoDoadores").hidden = false;
    doacoes
      .slice()
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))
      .forEach((d) => {
        const li = document.createElement("li");
        const nome = document.createElement("span");
        nome.textContent = d.nome || "Anônimo";
        const valor = document.createElement("strong");
        valor.textContent = brl(Number(d.valor || 0));
        const data = document.createElement("small");
        data.textContent = dataBR(d.data);
        li.append(nome, data, valor);
        $("doadores").appendChild(li);
      });
  }

  // ---- Pix ----
  $("chave").value = cfg.pix.chave;
  $("recebedor").textContent = cfg.titular || cfg.pix.nomeRecebedor;
  $("avisoTitular").textContent = cfg.titular || cfg.pix.nomeRecebedor;

  // ---- Transferência bancária ----
  if (cfg.banco) {
    $("secaoBanco").hidden = false;
    $("bancoTitular").textContent = cfg.titular || cfg.pix.nomeRecebedor;
    $("bancoNome").textContent = cfg.banco.nome;
    $("bancoAgencia").textContent = cfg.banco.agencia;
    $("bancoConta").textContent = cfg.banco.conta;
    $("bancoVariacao").textContent = cfg.banco.variacao;
  }

  function atualizarPix() {
    const payload = window.gerarPix({ ...cfg.pix, valor: $("valor").value });
    $("copiaCola").value = payload;
    const qr = qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    $("qrcode").innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }

  $("valoresRapidos").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#valoresRapidos button").forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
    $("valor").value = btn.dataset.valor;
    if (!btn.dataset.valor) $("valor").focus();
    atualizarPix();
  });
  $("valor").addEventListener("input", () => {
    document.querySelectorAll("#valoresRapidos button").forEach((b) =>
      b.classList.toggle("ativo", b.dataset.valor === "")
    );
    atualizarPix();
  });

  function copiar(texto) {
    const mostrar = () => {
      $("toast").hidden = false;
      clearTimeout(copiar.t);
      copiar.t = setTimeout(() => ($("toast").hidden = true), 1800);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(texto).then(mostrar, mostrar);
    else {
      const el = document.createElement("textarea");
      el.value = texto;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
      mostrar();
    }
  }
  $("btnCopiaCola").addEventListener("click", () => copiar($("copiaCola").value));
  $("btnChave").addEventListener("click", () => copiar($("chave").value));

  atualizarPix();
})();
