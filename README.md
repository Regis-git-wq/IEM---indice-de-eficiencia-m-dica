# Resumi

App para estudantes organizarem os estudos por disciplina:

- **📚 Materiais** — anexe PDFs, fotos do caderno/quadro, slides exportados e anotações (`.txt`, `.md`). Abra ou baixe quando quiser.
- **📝 Resumos** — selecione um ou mais materiais e gere, com o Claude, um resumo em quatro formatos: resumo prático, tópicos rápidos, flashcards ou guia de revisão para prova. Os resumos ficam salvos e podem ser baixados em Markdown.
- **🎙️ Áudios** — grave a aula direto pelo navegador (com pausa) ou envie um áudio já gravado. Cada gravação tem player, título editável, anotações e busca.
- **👤 Conta e sincronização** — crie uma conta com e-mail e senha e acesse tudo no celular e no computador.

## Como funciona a sincronização

O app é *local-first*: tudo é salvo primeiro no aparelho (IndexedDB), então dá para gravar uma aula ou anexar material mesmo sem internet. Com a conta conectada, as alterações são enviadas ao servidor e as dos outros aparelhos são baixadas:

- ao abrir o app, a cada 30 s, ao voltar para a aba/reconectar e logo após cada alteração;
- se o mesmo item for editado em dois aparelhos, vale a edição mais recente;
- arquivos (PDFs, áudios) que vieram de outro aparelho só são baixados quando você abre/baixa o item — áudios tocam direto do servidor;
- quem já usava o app sem conta: ao entrar, o que estava no aparelho é enviado para a conta;
- ao sair, os dados do aparelho são apagados (continuam na conta). Se houver algo não sincronizado, o app avisa antes.

Gerar resumos exige estar logado, para que só usuários do app usem a chave da API.

No servidor, contas, sessões e metadados ficam em SQLite (`data/resumi.db`) e os arquivos em `data/blobs/<usuário>/`. Senhas são guardadas com hash scrypt; a sessão é um cookie `httpOnly` válido por 30 dias.

## Como rodar

Requisitos: Node.js 22.9+ e uma chave da API da Anthropic.

```bash
npm install
cp .env.example .env   # e preencha ANTHROPIC_API_KEY
npm run dev
```

Abra http://localhost:5173.

Para produção: `npm run build && npm start` (serve o app e a API na porta `PORT`, padrão 3001). Os dados ficam em `DATA_DIR` (padrão `./data`) — use um disco persistente e faça backup dessa pasta.

### Usar no celular

Para o celular acessar, o servidor precisa estar publicado na internet **com HTTPS** (ex.: Railway, Render, Fly.io ou uma VPS com disco persistente). Navegadores só liberam o microfone em páginas HTTPS (ou `localhost`), então sem HTTPS a gravação de aulas não funciona no celular.

Para testar na mesma rede Wi-Fi, rode `npm run dev -- --host` e acesse pelo IP do computador — tudo funciona, exceto a gravação pelo microfone.

## Estrutura

```
server/
  index.ts       Monta as rotas e, em produção, serve o build
  db.ts          SQLite: usuários, sessões, registros sincronizados, arquivos
  auth.ts        Cadastro, login, logout e sessão por cookie
  sync.ts        /api/sync/push, /api/sync/pull e upload/download de arquivos
  summarize.ts   Monta a requisição ao Claude (PDF, imagem ou texto) e os estilos de resumo
src/
  db.ts          Armazenamento local (IndexedDB) com controle de alterações pendentes
  sync.ts        Motor de sincronização (envia pendentes, baixa novidades, baixa arquivos sob demanda)
  account.tsx    Estado de login e agendamento da sincronização
  api.ts         Cliente da API de resumos
  App.tsx        Layout: disciplinas na lateral, abas Materiais / Resumos / Áudios
  components/    Uma aba por arquivo + painel da conta
```

## Limitações atuais e próximos passos

- Resumos aceitam PDF, imagens (PNG/JPG/WEBP/GIF) e texto. Arquivos `.docx`/`.pptx` podem ser anexados e baixados, mas precisam ser exportados para PDF antes de resumir.
- Requisições de resumo têm limite de ~32 MB por envio (limite da API).
- Sem conta, os dados ficam só no aparelho; limpar os dados do site apaga tudo.
- Ainda não há recuperação de senha por e-mail nem limite de tentativas de login.

Ideias para as próximas versões:
- Transcrição automática dos áudios e resumo a partir da transcrição.
- Recuperação de senha por e-mail e limite de tentativas de login.
- Instalar como app (PWA) e uso offline.
- Marcadores de tempo nas gravações e chat de dúvidas sobre o material.
