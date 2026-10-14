// =====================================================================
//  CONFIGURAÇÃO DA VAQUINHA — edite apenas este arquivo
// =====================================================================
window.VAQUINHA = {
  titulo: "Ajude a Paula a realizar um sonho",
  descricao:
    "Amigos(as), estou fazendo uma vaquinha on-line.\n" +
    "Todos que me conhecem sabem que uso uma prótese (perna direita) há 20 anos.\n\n" +
    "Nesse tempo, realizei muitas coisas que pareciam impossíveis, mas tem outras que ainda são um sonho. " +
    "Coisas simples, como: entrar no mar, tomar um banho de chuva, fazer uma trilha, entrar numa cachoeira, " +
    "um simples banho de mangueira, pegar uma bicicleta e sair pedalando... Hoje não consigo fazer isso como antes.\n\n" +
    "Bemmm... já lançaram no mercado uma prótese que pode me ajudar a voltar a viver esses momentos, " +
    "e ela custa R$ 280.000,00. Por esse motivo criei essa vaquinha.\n\n" +
    "Se puder doar, qualquer valor já ajuda. Se não puder, COMPARTILHE. " +
    "Me ajudem a chegar mais perto do meu sonho. 💛",
  imagem: "", // opcional: URL ou caminho de uma imagem (ex.: "foto.jpg")

  // ---- Dados do Pix ----
  pix: {
    chave: "paulagalvaofortes@hotmail.com",
    nomeRecebedor: "PAULA FERNANDA G A FORTES", // usado no QR Code (máx. 25 caracteres)
    cidade: "BRASIL", // usado no QR Code (máx. 15 caracteres); pode trocar pela sua cidade
    identificador: "***", // padrão do Banco Central para Pix sem identificador; não altere
  },
  titular: "Paula Fernanda Galvão Andrade Fortes", // nome completo mostrado no site

  // ---- Transferência bancária (opcional; apague o bloco para esconder) ----
  banco: {
    nome: "Banco do Brasil",
    agencia: "44-2",
    conta: "270169-3",
    variacao: "51",
  },

  // ---- Planilha do Google (opcional) ----
  // Link CSV da planilha publicada (Arquivo → Compartilhar → Publicar na Web → CSV).
  // Quando preenchido, o total, a lista e a data vêm da planilha e ignoram os campos abaixo.
  planilhaCSV: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRkCJ8rQOLAdUUBfzwDqMZNOF-znnl6iG2Oz0nxjxrT8tDd5lozXA6r4Y3kvdD8uN7yZcCzEyu7wjPw/pub?output=csv",

  // ---- Meta e arrecadação ----
  meta: 280000.0, // valor da meta em reais
  // Atualize esta lista conforme os Pix forem chegando. O total é somado automaticamente.
  // Exemplo: { nome: "Ana", valor: 30.00, data: "2026-10-14" },
  doacoes: [],
  // Se preferir informar só o total (sem lista), coloque um número aqui; ele substitui a soma.
  totalManual: null,

  mostrarDoadores: false, // true mostra a lista "Quem já ajudou" com os nomes
  atualizadoEm: "2026-10-13",
};
