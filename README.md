# Resumi

App para estudantes organizarem os estudos por disciplina:

- **📚 Materiais** — anexe PDFs, fotos do caderno/quadro, slides exportados e anotações (`.txt`, `.md`). Abra ou baixe quando quiser.
- **📝 Resumos** — selecione um ou mais materiais e gere, com o Claude, um resumo em quatro formatos: resumo prático, tópicos rápidos, flashcards ou guia de revisão para prova. Os resumos ficam salvos e podem ser baixados em Markdown.
- **🎙️ Áudios** — grave a aula direto pelo navegador (com pausa) ou envie um áudio já gravado. Cada gravação tem player, título editável, anotações e busca.

Materiais, resumos e áudios ficam salvos **no próprio navegador** (IndexedDB), então não precisa de conta nem banco de dados. O servidor só existe para chamar a API do Claude sem expor a sua chave.

## Como rodar

Requisitos: Node.js 20.6+ e uma chave da API da Anthropic.

```bash
npm install
cp .env.example .env   # e preencha ANTHROPIC_API_KEY
npm run dev
```

Abra http://localhost:5173.

Para produção: `npm run build && npm start` (serve o app e a API na porta `PORT`, padrão 3001).

## Estrutura

```
server/
  index.ts       API Express (POST /api/summarize) e, em produção, serve o build
  summarize.ts   Monta a requisição ao Claude (PDF, imagem ou texto) e os estilos de resumo
src/
  db.ts          Armazenamento local (IndexedDB): disciplinas, materiais, resumos, gravações
  api.ts         Cliente da API de resumos
  App.tsx        Layout: disciplinas na lateral, abas Materiais / Resumos / Áudios
  components/    Uma aba por arquivo
```

## Limitações atuais e próximos passos

- Resumos aceitam PDF, imagens (PNG/JPG/WEBP/GIF) e texto. Arquivos `.docx`/`.pptx` podem ser anexados e baixados, mas precisam ser exportados para PDF antes de resumir.
- Requisições de resumo têm limite de ~32 MB por envio (limite da API).
- Os dados ficam só no navegador/dispositivo onde foram criados; limpar os dados do site apaga tudo.

Ideias para as próximas versões:
- Transcrição automática dos áudios e resumo a partir da transcrição.
- Login e sincronização na nuvem entre celular e computador.
- Instalar como app (PWA) e uso offline.
- Marcadores de tempo nas gravações e chat de dúvidas sobre o material.
