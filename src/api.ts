import type { Material, SummaryStyle } from "./db";

const TEXT_TYPES = ["text/plain", "text/markdown", "text/csv"];
const TEXT_EXTENSIONS = [".txt", ".md", ".csv"];

export const SUMMARIZABLE_ACCEPT =
  "application/pdf,image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv";

export function isTextMaterial(m: Pick<Material, "name" | "mimeType">) {
  return TEXT_TYPES.includes(m.mimeType) || TEXT_EXTENSIONS.some((ext) => m.name.toLowerCase().endsWith(ext));
}

export function canSummarize(m: Pick<Material, "name" | "mimeType">) {
  return isTextMaterial(m) || m.mimeType === "application/pdf" || m.mimeType.startsWith("image/");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function requestSummary(opts: {
  materials: Material[];
  style: SummaryStyle;
  subject: string;
  instructions: string;
}): Promise<string> {
  const files = await Promise.all(
    opts.materials.map(async (m) =>
      isTextMaterial(m)
        ? { name: m.name, mimeType: m.mimeType, data: await m.blob.text(), encoding: "text" as const }
        : { name: m.name, mimeType: m.mimeType, data: await blobToBase64(m.blob), encoding: "base64" as const },
    ),
  );

  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files, style: opts.style, subject: opts.subject, instructions: opts.instructions }),
  });
  const data = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };
  if (!res.ok || !data.summary) {
    throw new Error(data.error ?? `Falha ao gerar o resumo (HTTP ${res.status}).`);
  }
  return data.summary;
}
