import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type SummaryStyle = "pratico" | "topicos" | "flashcards" | "revisao";

export interface SummaryFile {
  name: string;
  mimeType: string;
  /** Conteúdo em base64 (PDF/imagens) ou texto puro (txt/md). */
  data: string;
  encoding: "base64" | "text";
}

export interface SummarizeRequest {
  subject?: string;
  style: SummaryStyle;
  instructions?: string;
  files: SummaryFile[];
}

const STYLE_PROMPTS: Record<SummaryStyle, string> = {
  pratico:
    "Escreva um resumo prático e direto: comece com uma visão geral de 2-3 frases, depois organize os conceitos principais em seções com títulos, destacando definições, fórmulas, exemplos e pontos que costumam cair em prova.",
  topicos:
    "Escreva um resumo em tópicos curtos (bullet points), agrupados por tema, priorizando o essencial para memorizar. Nada de parágrafos longos.",
  flashcards:
    "Crie flashcards de estudo no formato '**P:** pergunta' seguido de '**R:** resposta', um por item, cobrindo os conceitos mais importantes do material.",
  revisao:
    "Monte um guia de revisão para prova: lista dos conceitos-chave, um mini-resumo de cada um, erros comuns a evitar e, ao final, 5 questões de autoavaliação com gabarito.",
};

const SYSTEM_PROMPT = `Você é um assistente de estudos para estudantes universitários brasileiros.
Gere resumos fiéis ao material enviado, em português do Brasil, formatados em Markdown.
Não invente conteúdo que não esteja no material; se algo estiver ilegível ou incompleto, diga isso brevemente.`;

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function toContentBlock(file: SummaryFile): Anthropic.Beta.BetaContentBlockParam {
  if (file.encoding === "text") {
    return {
      type: "document",
      title: file.name,
      source: { type: "text", media_type: "text/plain", data: file.data },
    };
  }
  if (file.mimeType === "application/pdf") {
    return {
      type: "document",
      title: file.name,
      source: { type: "base64", media_type: "application/pdf", data: file.data },
    };
  }
  if ((SUPPORTED_IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
    return {
      type: "image",
      source: { type: "base64", media_type: file.mimeType as ImageMediaType, data: file.data },
    };
  }
  throw new UnsupportedFileError(file.name, file.mimeType);
}

export class UnsupportedFileError extends Error {
  constructor(name: string, mimeType: string) {
    super(`Tipo de arquivo não suportado para resumo: ${name} (${mimeType || "desconhecido"})`);
  }
}

export class RefusalError extends Error {}

export async function summarize(req: SummarizeRequest): Promise<string> {
  const instructions = [
    STYLE_PROMPTS[req.style] ?? STYLE_PROMPTS.pratico,
    req.subject ? `Disciplina: ${req.subject}.` : "",
    req.instructions ? `Pedido extra do estudante: ${req.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [...req.files.map(toContentBlock), { type: "text", text: instructions }],
      },
    ],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new RefusalError("Não foi possível gerar o resumo para este material.");
  }

  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}
