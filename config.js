// =====================================================================
//  CONFIGURAÇÃO DA VAQUINHA — edite apenas este arquivo
// =====================================================================
window.VAQUINHA = {
  titulo: "Ajude nossa causa",
  descricao:
    "Conte aqui a história da vaquinha: para que serve o dinheiro, quem será ajudado " +
    "e por que cada contribuição faz diferença. Obrigado por apoiar! 💛",
  imagem: "", // opcional: URL ou caminho de uma imagem (ex.: "foto.jpg")

  // ---- Dados do Pix ----
  pix: {
    chave: "seuemail@exemplo.com", // CPF, CNPJ, e-mail, telefone (+5511999999999) ou chave aleatória
    nomeRecebedor: "NOME DO RECEBEDOR", // até 25 caracteres, sem acentos de preferência
    cidade: "SAO PAULO", // até 15 caracteres
    identificador: "VAQUINHA", // txid: só letras e números, até 25 caracteres
  },

  // ---- Meta e arrecadação ----
  meta: 10000.0, // valor da meta em reais
  // Atualize esta lista conforme os Pix forem chegando. O total é somado automaticamente.
  doacoes: [
    { nome: "Maria", valor: 50.0, data: "2026-10-10" },
    { nome: "Anônimo", valor: 100.0, data: "2026-10-11" },
    { nome: "João", valor: 25.5, data: "2026-10-12" },
  ],
  // Se preferir informar só o total (sem lista), coloque um número aqui; ele substitui a soma.
  totalManual: null,

  mostrarDoadores: true,
  atualizadoEm: "2026-10-13",
};
