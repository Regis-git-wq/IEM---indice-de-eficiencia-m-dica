import { useEffect, useState } from "react";
import { canSummarize } from "../api";
import { deleteItem, listBySubject, newId, onDataChange, saveItem, type Material, type Subject } from "../db";
import { getBlob } from "../sync";
import { downloadBlob, formatBytes, formatDate } from "../format";

export function MaterialsTab({ subject }: { subject: Subject }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [dragging, setDragging] = useState(false);

  const refresh = async () => setMaterials(await listBySubject("materials", subject.id));

  useEffect(() => {
    void refresh();
    return onDataChange(() => void refresh());
  }, [subject.id]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      await saveItem("materials", {
        id: newId(),
        subjectId: subject.id,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        blob: file,
        createdAt: Date.now(),
      });
    }
  };

  const remove = async (m: Material) => {
    if (!confirm(`Excluir "${m.name}"?`)) return;
    await deleteItem("materials", m.id);
  };

  const withBlob = async (m: Material, use: (blob: Blob) => void) => {
    try {
      use(await getBlob("materials", m));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const open = (m: Material) => {
    // Abre a aba já no clique (antes do download) para o navegador não bloquear como pop-up.
    const tab = window.open("", "_blank");
    void withBlob(m, (blob) => {
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  };

  return (
    <section>
      <label
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <input type="file" multiple hidden onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))} />
        <strong>Arraste arquivos aqui ou clique para anexar</strong>
        <span>PDFs, slides exportados, fotos do caderno, anotações em .txt/.md…</span>
      </label>

      {materials.length === 0 ? (
        <p className="muted">Nenhum material anexado ainda.</p>
      ) : (
        <ul className="list">
          {materials.map((m) => (
            <li key={m.id} className="card row">
              <div className="grow">
                <div className="title">{m.name}</div>
                <div className="muted small">
                  {formatBytes(m.size)} · {formatDate(m.createdAt)}
                  {!m.blob && " · na nuvem"}
                  {!canSummarize(m) && " · não pode ser resumido (use PDF, imagem ou texto)"}
                </div>
              </div>
              <button className="link" onClick={() => open(m)}>
                Abrir
              </button>
              <button className="link" onClick={() => void withBlob(m, (blob) => downloadBlob(blob, m.name))}>
                Baixar
              </button>
              <button className="link danger" onClick={() => remove(m)}>
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
