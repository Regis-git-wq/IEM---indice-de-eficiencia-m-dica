# Vaquinha online com Pix

Site estático (HTML/CSS/JS, sem servidor) para uma vaquinha com:

- **QR Code Pix** e **Pix Copia e Cola** gerados automaticamente a partir da sua chave
- Botões de valor rápido (R$ 10, 25, 50, 100) ou valor livre
- **Total arrecadado**, meta e barra de progresso
- Lista de quem já contribuiu (opcional)

## Como configurar

Edite **somente o arquivo `config.js`**:

| Campo | O que é |
|---|---|
| `titulo`, `descricao`, `imagem` | Texto e foto da vaquinha |
| `pix.chave` | Sua chave Pix (CPF, CNPJ, e-mail, telefone no formato `+5511999999999` ou chave aleatória) |
| `pix.nomeRecebedor` | Nome do titular da conta (até 25 caracteres) |
| `pix.cidade` | Cidade do titular (até 15 caracteres) |
| `titular`, `banco` | Nome completo e dados bancários mostrados no site (apague `banco` para esconder) |
| `meta` | Valor da meta em reais |
| `doacoes` | Lista das contribuições recebidas — o total é somado sozinho |
| `totalManual` | Use um número aqui se preferir informar só o total, sem lista |
| `atualizadoEm` | Data da última atualização (AAAA-MM-DD) |

## Como atualizar o total arrecadado

O Pix cai direto na sua conta, então o site não tem como "ver" os pagamentos sozinho.
Sempre que receber contribuições, abra o `config.js` (pode ser pelo próprio GitHub,
no ícone de lápis), adicione uma linha em `doacoes` e salve:

```js
{ nome: "Ana", valor: 30.00, data: "2026-10-14" },
```

O site soma tudo e atualiza a barra de progresso.

## Atualizar pelo Google Planilhas (opcional)

1. Crie uma planilha com as colunas **Data | Nome | Valor** na primeira linha.
2. Em **Arquivo → Compartilhar → Publicar na Web**, escolha a aba e o formato **CSV** e publique.
3. Cole o link gerado em `planilhaCSV` no `config.js`.

A partir daí o site soma a coluna Valor, mostra a lista e usa a data mais recente
como "Atualizado em". O Google pode levar alguns minutos para refletir as edições.

## Como publicar (GitHub Pages, grátis)

1. No GitHub, vá em **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, selecione a branch e a pasta `/ (root)`.
3. Salve. Em alguns minutos o site estará em `https://<seu-usuario>.github.io/<repositorio>/`.

Para testar no computador, basta abrir o `index.html` no navegador.

> **Importante:** antes de divulgar, faça um Pix de teste de R$ 0,01 lendo o QR Code
> com o app do seu banco para confirmar que a chave e o nome estão corretos.
