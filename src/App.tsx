import { useEffect, useState } from "react";
import { deleteSubject, listSubjects, newId, onDataChange, saveSubject, type Subject } from "./db";
import { AccountPanel } from "./components/AccountPanel";
import { MaterialsTab } from "./components/MaterialsTab";
import { SummariesTab } from "./components/SummariesTab";
import { RecordingsTab } from "./components/RecordingsTab";

const COLORS = ["#4f46e5", "#0891b2", "#16a34a", "#ca8a04", "#dc2626", "#db2777", "#7c3aed"];

type Tab = "materiais" | "resumos" | "audios";
const TABS: { id: Tab; label: string }[] = [
  { id: "materiais", label: "📚 Materiais" },
  { id: "resumos", label: "📝 Resumos" },
  { id: "audios", label: "🎙️ Áudios" },
];

export default function App() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("materiais");
  const [newName, setNewName] = useState("");

  const refresh = async () => {
    const list = await listSubjects();
    setSubjects(list);
    setSelectedId((cur) => (cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null)));
  };

  useEffect(() => {
    void refresh();
    return onDataChange(() => void refresh());
  }, []);

  const addSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const subject = { id: newId(), name, color: COLORS[subjects.length % COLORS.length], createdAt: Date.now() };
    setSelectedId(subject.id);
    setNewName("");
    await saveSubject(subject);
  };

  const removeSubject = async (s: Subject) => {
    if (!confirm(`Excluir "${s.name}" com todos os materiais, resumos e áudios?`)) return;
    await deleteSubject(s.id);
  };

  const selected = subjects.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="logo">Resumi</h1>
        <p className="tagline">Seus estudos, organizados.</p>
        <h2 className="sidebar-title">Disciplinas</h2>
        <ul className="subject-list">
          {subjects.map((s) => (
            <li key={s.id}>
              <button
                className={`subject ${s.id === selectedId ? "active" : ""}`}
                onClick={() => setSelectedId(s.id)}
              >
                <span className="dot" style={{ background: s.color }} />
                {s.name}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addSubject} className="add-subject">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova disciplina…"
            aria-label="Nome da nova disciplina"
          />
          <button type="submit" disabled={!newName.trim()}>
            +
          </button>
        </form>
        <AccountPanel />
      </aside>

      <main className="content">
        {selected ? (
          <>
            <header className="content-header">
              <h2>
                <span className="dot" style={{ background: selected.color }} /> {selected.name}
              </h2>
              <button className="link danger" onClick={() => removeSubject(selected)}>
                Excluir disciplina
              </button>
            </header>
            <nav className="tabs">
              {TABS.map((t) => (
                <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </nav>
            {tab === "materiais" && <MaterialsTab subject={selected} />}
            {tab === "resumos" && <SummariesTab subject={selected} />}
            {tab === "audios" && <RecordingsTab subject={selected} />}
          </>
        ) : (
          <div className="empty">
            <h2>Bem-vindo ao Resumi 👋</h2>
            <p>Crie uma disciplina na barra lateral para começar a anexar materiais, gerar resumos e gravar aulas.</p>
          </div>
        )}
      </main>
    </div>
  );
}
