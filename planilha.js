// Lê as doações de uma planilha do Google publicada como CSV.
// Colunas esperadas: Data | Nome | Valor (o cabeçalho pode estar em qualquer linha/coluna)
// e, opcionalmente, "Total a ser arrecadado" com a meta na linha abaixo.
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
    // O cabeçalho pode estar em qualquer linha/coluna: procura a linha que tem "Valor"
    const norm = (c) => String(c || "").trim().toLowerCase();
    const iCab = linhas.findIndex((l) => l.some((c) => norm(c) === "valor"));
    if (iCab < 0) throw new Error('Coluna "Valor" não encontrada na planilha');
    const cab = linhas[iCab].map(norm);
    const iData = cab.indexOf("data"), iNome = cab.indexOf("nome"), iValor = cab.indexOf("valor");
    // Meta opcional: coluna "Total a ser arrecadado" (ou "Meta"), valor na linha logo abaixo
    const iMeta = cab.findIndex((c) => c === "meta" || c.startsWith("total a ser arrecadado"));
    const meta = iMeta >= 0 ? lerValor((linhas[iCab + 1] || [])[iMeta]) : 0;
    const doacoes = linhas
      .slice(iCab + 1)
      .map((l) => ({
        data: iData >= 0 ? lerData(l[iData]) : "",
        nome: iNome >= 0 ? (l[iNome] || "").trim() : "",
        valor: lerValor(l[iValor]),
      }))
      .filter((d) => d.valor > 0);
    return { doacoes, meta };
  };
})();
