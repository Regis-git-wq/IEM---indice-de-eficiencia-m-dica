// Lê as doações de uma planilha do Google publicada como CSV.
// Colunas esperadas (1ª linha = cabeçalho): Data | Nome | Valor
(function () {
  function lerCSV(texto) {
    const linhas = [];
    let linha = [], campo = "", aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === ",") { linha.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = "";
      } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  // Aceita "R$ 1.234,56", "1234,56", "1234.56", "50"
  function lerValor(s) {
    s = String(s || "").replace(/R\$|\s/g, "");
    if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return isFinite(n) && n > 0 ? n : 0;
  }

  // Aceita "14/10/2026" ou "2026-10-14"; devolve "2026-10-14"
  function lerData(s) {
    s = String(s || "").trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : "";
  }

  window.carregarPlanilha = async function (url) {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) throw new Error("Planilha indisponível (" + resp.status + ")");
    const linhas = lerCSV(await resp.text());
    const cab = (linhas.shift() || []).map((c) => c.trim().toLowerCase());
    const col = (nome, padrao) => (cab.indexOf(nome) >= 0 ? cab.indexOf(nome) : padrao);
    const iData = col("data", 0), iNome = col("nome", 1), iValor = col("valor", 2);
    return linhas
      .map((l) => ({ data: lerData(l[iData]), nome: (l[iNome] || "").trim(), valor: lerValor(l[iValor]) }))
      .filter((d) => d.valor > 0);
  };
})();
