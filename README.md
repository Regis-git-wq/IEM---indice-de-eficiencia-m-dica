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

### Segurança da conta

- **Esqueci minha senha:** o app envia um link por e-mail, válido por 1 hora e de uso único. Ao trocar a senha, todos os aparelhos são desconectados.
- **Limite de tentativas:** 10 erros de senha por e-mail a cada 15 min (e 50 por IP); pedidos de recuperação e cadastros também têm limite.
- A tela de recuperação não revela se um e-mail tem conta.

## Como rodar

Requisitos: Node.js 22.9+ e uma chave da API da Anthropic.

```bash
npm install
cp .env.example .env   # e preencha ANTHROPIC_API_KEY
npm run dev
```

Abra http://localhost:5173.

Em desenvolvimento, sem `SMTP_URL`, o link de "Esqueci minha senha" aparece no terminal.

Para testar no celular na mesma rede Wi-Fi, rode `npm run dev -- --host` e acesse pelo IP do computador — tudo funciona, exceto a gravação pelo microfone (navegadores só liberam o microfone em HTTPS ou `localhost`).

## Publicar na internet

Para usar no celular de qualquer lugar, publique o app em um serviço com **HTTPS** e **disco persistente** (é onde ficam o banco e os arquivos). O repositório já tem um `Dockerfile` pronto e configurações para Render e Railway.

### Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | sim | Gerar os resumos ([console.anthropic.com](https://console.anthropic.com)) |
| `DATA_DIR` | sim (já vem como `/data`) | Pasta do disco persistente |
| `SMTP_URL` | recomendada | Enviar o e-mail de "Esqueci minha senha" |
| `MAIL_FROM` | recomendada | Remetente dos e-mails, ex.: `Resumi <nao-responda@seudominio.com>` |
| `APP_URL` | só fora do Render/Railway | Endereço público usado no link do e-mail |

**E-mail (`SMTP_URL`)** — o jeito mais simples para começar é o Gmail: ative a verificação em duas etapas, crie uma [senha de app](https://myaccount.google.com/apppasswords) e use `smtps://seuemail@gmail.com:SENHA_DE_APP@smtp.gmail.com:465` (com `MAIL_FROM` igual ao seu Gmail). Para volume maior, use um serviço como Resend, Brevo ou Mailgun, que também fornecem um endereço SMTP.

### Opção 1 — Render

1. Crie uma conta em [render.com](https://render.com) e conecte o GitHub.
2. **New + → Blueprint** e escolha este repositório (ele lê o `render.yaml`: serviço Docker, plano Starter e disco de 5 GB em `/data`).
3. Preencha `ANTHROPIC_API_KEY`, `SMTP_URL` e `MAIL_FROM` quando pedir.
4. Ao terminar, o app fica em `https://resumi-xxxx.onrender.com`. O plano gratuito não tem disco persistente, por isso o blueprint usa o Starter.

### Opção 2 — Railway

1. Crie uma conta em [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo** e escolha este repositório (ele usa o `Dockerfile` via `railway.json`).
2. No serviço, **Settings → Volumes → Add Volume** com mount path `/data`.
3. Em **Variables**, adicione `ANTHROPIC_API_KEY`, `SMTP_URL` e `MAIL_FROM`.
4. Em **Settings → Networking → Generate Domain** para ter o endereço `https://….up.railway.app`.

### Opção 3 — Qualquer servidor com Docker

```bash
docker build -t resumi .
docker run -d --name resumi -p 3001:3001 -v resumi-data:/data \
  -e ANTHROPIC_API_KEY=... -e SMTP_URL=... -e MAIL_FROM=... \
  -e APP_URL=https://resumi.seudominio.com resumi
```

Coloque um proxy com HTTPS na frente (Caddy, Nginx + Let's Encrypt, Cloudflare Tunnel).

### Backup

Tudo fica no disco montado em `/data` (`resumi.db` + pasta `blobs/`). Faça cópias periódicas — no Render e no Railway há snapshots do disco/volume nas configurações.

> O app roda como **uma única instância** (SQLite e o limite de tentativas ficam no próprio servidor). Isso aguenta tranquilamente uma turma ou uma faculdade inteira; para escalar além disso, seria preciso migrar para Postgres e armazenamento de arquivos como S3.

## Estrutura

```
server/
  index.ts       Monta as rotas e, em produção, serve o build
  db.ts          SQLite: usuários, sessões, registros sincronizados, arquivos
  auth.ts        Cadastro, login, logout, recuperação de senha e limite de tentativas
  mail.ts        Envio de e-mails (SMTP)
  rateLimit.ts   Limitador de tentativas em memória
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

Ideias para as próximas versões:
- Transcrição automática dos áudios e resumo a partir da transcrição.
- Instalar como app (PWA) e uso offline.
- Marcadores de tempo nas gravações e chat de dúvidas sobre o material.
