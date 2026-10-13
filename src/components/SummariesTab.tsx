import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { useAccount } from "../account";
import { canSummarize, requestSummary } from "../api";
import {
  deleteItem,
  listBySubject,
  newId,
  onDataChange,
  saveItem,
  type Material,
  type Subject,
  type Summary,
  type SummaryStyle,
} from "../db";
import { downloadBlob, formatDate } from "../format";

const STYLES: { id: SummaryStyle; label: string }[] = [
  { id: "pratico", label: "Resumo prático" },
  { id: "topicos", label: "Tópicos rápidos" },
  { id: "flashcards", label: "Flashcards" },
  { id: "revisao", label: "Guia de revisão p/ prova" },
];

export function SummariesTab({ subject }: { subject: Subject }) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [style, setStyle] = useState<SummaryStyle>("pratico");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { user } = useAccount();

  const refresh = async () => {
    const [s, m] = await Promise.all([listBySubject("summaries", subject.id), listBySubject("materials", subject.id)]);
    setSummaries(s);
    setMaterials(m.filter(canSummarize));
  };

  useEffect(() => {
    setSelected(new Set());
    setOpenId(null);
    setError(null);
    void refresh();
    return onDataChange(() => void refresh());
  }, [subject.id]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = async () => {
    const chosen = materials.filter((m) => selected.has(m.id));
    if (chosen.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const content = await requestSummary({ materials: chosen, style, subject: subject.name, instructions });
      const summary = {
        id: newId(),
        subjectId: subject.id,
        title: `${STYLES.find((s) => s.id === style)?.label} — ${chosen.map((m) => m.name).join(", ")}`,
        style,
        content,
        materialIds: chosen.map((m) => m.id),
        createdAt: Date.now(),
      };
      await saveItem("summaries", summary);
      setOpenId(summary.id);
      setSelected(new Set());
      setInstructions("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const remove = async (s: Summary) => {
    if (!confirm("Excluir este resumo?")) return;
    await deleteItem("summaries", s.id);
  };

  return (
    <section>
      <div className="card">
        <h3>Gerar novo resumo</h3>
        {!user ? (
          <p className="muted">Entre na sua conta (barra lateral) para gerar resumos com IA.</p>
        ) : materials.length === 0 ? (
          <p className="muted">Anexe um PDF, imagem ou arquivo de texto na aba Materiais para poder resumir.</p>
        ) : (
          <>
            <p className="muted small">Escolha os materiais:</p>
            <ul className="checklist">
              {materials.map((m) => (
                <li key={m.id}>
                  <label>
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} /> {m.name}
                  </label>
                </li>
              ))}
            </ul>
            <div className="form-row">
              <select value={style} onChange={(e) => setStyle(e.target.value as SummaryStyle)} aria-label="Estilo do resumo">
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                className="grow"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Pedido extra (opcional): ex. foque no capítulo 3"
              />
              <button className="primary" disabled={loading || selected.size === 0} onClick={generate}>
                {loading ? "Gerando…" : "Gerar resumo"}
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </div>

      {summaries.length === 0 ? (
        <p className="muted">Nenhum resumo ainda.</p>
      ) : (
        <ul className="list">
          {summaries.map((s) => (
            <li key={s.id} className="card">
              <div className="row">
                <button className="link grow left title" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                  {openId === s.id ? "▾" : "▸"} {s.title}
                </button>
                <span className="muted small">{formatDate(s.createdAt)}</span>
                <button
                  className="link"
                  onClick={() => downloadBlob(new Blob([s.content], { type: "text/markdown" }), `resumo-${subject.name}.md`)}
                >
                  Baixar .md
                </button>
                <button className="link danger" onClick={() => remove(s)}>
                  Excluir
                </button>
              </div>
              {openId === s.id && (
                <article className="markdown">
                  <Markdown>{s.content}</Markdown>
                </article>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
