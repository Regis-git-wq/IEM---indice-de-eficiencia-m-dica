import { useEffect, useMemo, useRef, useState } from "react";
import { deleteItem, listBySubject, newId, saveItem, type Recording, type Subject } from "../db";
import { downloadBlob, formatDate, formatDuration } from "../format";

type RecorderState = "idle" | "recording" | "paused";

function preferredMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function readAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

function defaultTitle(subject: Subject) {
  return `Aula de ${subject.name} — ${new Date().toLocaleDateString("pt-BR")}`;
}

export function RecordingsTab({ subject }: { subject: Subject }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);

  const refresh = async () => setRecordings(await listBySubject("recordings", subject.id));

  useEffect(() => {
    void refresh();
  }, [subject.id]);

  // Interrompe a gravação se o usuário trocar de disciplina ou sair da aba.
  useEffect(() => () => recorderRef.current?.stop(), [subject.id]);

  const startTimer = () => {
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  };
  const stopTimer = () => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador não suporta gravação de áudio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
      return;
    }
    const mimeType = preferredMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stopTimer();
      stream.getTracks().forEach((t) => t.stop());
      setState("idle");
      setElapsed(0);
      recorderRef.current = null;
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size === 0) return;
      await saveItem("recordings", {
        id: newId(),
        subjectId: subject.id,
        title: defaultTitle(subject),
        blob,
        mimeType: type,
        durationSec: elapsedRef.current,
        notes: "",
        createdAt: Date.now(),
      });
      await refresh();
    };

    // Gera pedaços a cada 10s para não perder tudo se a aba travar no meio da aula.
    recorder.start(10_000);
    recorderRef.current = recorder;
    setState("recording");
    startTimer();
  };

  const pause = () => {
    recorderRef.current?.pause();
    stopTimer();
    setState("paused");
  };
  const resume = () => {
    recorderRef.current?.resume();
    startTimer();
    setState("recording");
  };
  const stop = () => recorderRef.current?.stop();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      await saveItem("recordings", {
        id: newId(),
        subjectId: subject.id,
        title: file.name.replace(/\.[^.]+$/, ""),
        blob: file,
        mimeType: file.type,
        durationSec: await readAudioDuration(file),
        notes: "",
        createdAt: Date.now(),
      });
    }
    await refresh();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recordings;
    return recordings.filter((r) => r.title.toLowerCase().includes(q) || r.notes.toLowerCase().includes(q));
  }, [recordings, query]);

  return (
    <section>
      <div className="card recorder">
        <div className={`rec-indicator ${state}`} aria-hidden />
        <div className="rec-time">{formatDuration(elapsed)}</div>
        <div className="grow muted small">
          {state === "idle" && "Pronto para gravar a aula."}
          {state === "recording" && "Gravando… mantenha esta aba aberta."}
          {state === "paused" && "Pausado."}
        </div>
        {state === "idle" && (
          <>
            <button className="primary" onClick={start}>
              ● Gravar aula
            </button>
            <label className="button">
              Enviar áudio
              <input
                type="file"
                accept="audio/*"
                multiple
                hidden
                onChange={(e) => void upload(e.target.files).then(() => (e.target.value = ""))}
              />
            </label>
          </>
        )}
        {state === "recording" && <button onClick={pause}>❚❚ Pausar</button>}
        {state === "paused" && <button onClick={resume}>▶ Continuar</button>}
        {state !== "idle" && (
          <button className="danger-solid" onClick={stop}>
            ■ Parar e salvar
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      {recordings.length > 0 && (
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título ou anotações…"
        />
      )}

      {recordings.length === 0 ? (
        <p className="muted">Nenhum áudio salvo ainda.</p>
      ) : (
        <ul className="list">
          {filtered.map((r) => (
            <RecordingItem key={r.id} recording={r} onChange={refresh} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordingItem({ recording, onChange }: { recording: Recording; onChange: () => Promise<void> }) {
  const url = useMemo(() => URL.createObjectURL(recording.blob), [recording.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const [title, setTitle] = useState(recording.title);
  const [notes, setNotes] = useState(recording.notes);

  const persist = async (patch: Partial<Recording>) => {
    await saveItem("recordings", { ...recording, ...patch });
    await onChange();
  };

  const remove = async () => {
    if (!confirm(`Excluir "${recording.title}"?`)) return;
    await deleteItem("recordings", recording.id);
    await onChange();
  };

  return (
    <li className="card">
      <div className="row">
        <input
          className="title-input grow"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== recording.title && void persist({ title: title.trim() || recording.title })}
          aria-label="Título da gravação"
        />
        <span className="muted small">
          {formatDuration(recording.durationSec)} · {formatDate(recording.createdAt)}
        </span>
      </div>
      <audio controls preload="metadata" src={url} className="player" />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== recording.notes && void persist({ notes })}
        placeholder="Anotações da aula (ex.: 12:30 — professor explicou a fórmula X)"
        rows={2}
      />
      <div className="row end">
        <button
          className="link"
          onClick={() => downloadBlob(recording.blob, `${recording.title}.${extensionFor(recording.mimeType)}`)}
        >
          Baixar
        </button>
        <button className="link danger" onClick={remove}>
          Excluir
        </button>
      </div>
    </li>
  );
}
