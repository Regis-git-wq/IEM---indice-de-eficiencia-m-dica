import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { authRouter, loadUser, requireUser } from "./auth.js";
import { RefusalError, summarize, UnsupportedFileError, type SummarizeRequest } from "./summarize.js";
import { syncRouter } from "./sync.js";

const app = express();
app.set("trust proxy", 1);
app.use("/api", loadUser);
app.use("/api/auth", express.json(), authRouter);
app.use("/api", requireUser, syncRouter);

// PDFs chegam em base64; o limite acompanha o máximo de 32 MB por requisição da API.
app.post("/api/summarize", requireUser, express.json({ limit: "45mb" }), async (req, res) => {
  const body = req.body as SummarizeRequest;
  if (!Array.isArray(body?.files) || body.files.length === 0) {
    res.status(400).json({ error: "Envie pelo menos um material para resumir." });
    return;
  }
  try {
    const summary = await summarize(body);
    res.json({ summary });
  } catch (err) {
    if (err instanceof UnsupportedFileError || err instanceof RefusalError) {
      res.status(422).json({ error: err.message });
    } else if (err instanceof Anthropic.AuthenticationError) {
      res.status(500).json({ error: "Chave da API da Anthropic inválida ou ausente no servidor." });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: "Muitas requisições. Tente novamente em instantes." });
    } else if (err instanceof Anthropic.BadRequestError) {
      res.status(400).json({ error: `Requisição inválida: ${err.message}` });
    } else if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: "O serviço de resumos está indisponível no momento." });
    } else if (err instanceof Anthropic.AnthropicError) {
      console.error(err.message);
      res.status(500).json({ error: "Servidor sem acesso à API da Anthropic. Configure ANTHROPIC_API_KEY no arquivo .env." });
    } else {
      console.error(err);
      res.status(500).json({ error: "Erro inesperado ao gerar o resumo." });
    }
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Resumi API ouvindo em http://localhost:${port}`));
