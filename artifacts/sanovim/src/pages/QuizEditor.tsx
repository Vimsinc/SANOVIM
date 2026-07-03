import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { TopBar } from "@/components/TopBar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Save, ArrowLeft } from "lucide-react";

interface Option {
  label: string;
  points: number;
  tag?: string;
}
interface Question {
  id: string;
  question: string;
  help?: string;
  options: Option[];
}
interface Band {
  min: number;
  level: "frio" | "morno" | "quente";
  title: string;
  message: string;
}

const SPECIALTIES = ["ortopedia", "medicina-esportiva", "capilar", "outro"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function newId(): string {
  return `q${Math.random().toString(36).slice(2, 8)}`;
}

const emptyQuestion = (): Question => ({
  id: newId(),
  question: "",
  options: [
    { label: "", points: 1 },
    { label: "", points: 0 },
  ],
});

export default function QuizEditor() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/quiz-editor/:id");
  const editingId = params?.id ? Number(params.id) : null;

  const [loading, setLoading] = useState(!!editingId);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [specialty, setSpecialty] = useState("ortopedia");
  const [segment, setSegment] = useState("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);
  const [bands, setBands] = useState<Band[]>([
    { min: 0, level: "frio", title: "Vale ficar de olho", message: "" },
    { min: 4, level: "morno", title: "Merece uma avaliação", message: "" },
    { min: 7, level: "quente", title: "Recomendamos avaliar o quanto antes", message: "" },
  ]);

  useEffect(() => {
    if (!editingId) return;
    fetch(`/api/sales/quizzes/${editingId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((q) => {
        setTitle(q.title);
        setSlug(q.slug);
        setSlugTouched(true);
        setSpecialty(q.specialty);
        setSegment(q.segment ?? "");
        setDescription(q.description ?? "");
        setWhatsapp(q.whatsappNumber);
        setQuestions(q.questions?.length ? q.questions : [emptyQuestion()]);
        setBands(q.resultBands?.length ? q.resultBands : bands);
      })
      .catch(() => toast({ title: "Não foi possível carregar o quiz", variant: "destructive" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function setTitleAndSlug(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  // question ops
  const updateQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const updateOption = (qi: number, oi: number, patch: Partial<Option>) =>
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : q,
      ),
    );

  async function save() {
    if (title.trim().length < 3) {
      toast({ title: "Dê um título ao quiz", variant: "destructive" });
      return;
    }
    if (whatsapp.replace(/\D/g, "").length < 10) {
      toast({ title: "Informe o WhatsApp da clínica", variant: "destructive" });
      return;
    }
    if (questions.some((q) => !q.question.trim() || q.options.some((o) => !o.label.trim()))) {
      toast({ title: "Preencha todas as perguntas e opções", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      slug: slug || slugify(title),
      title: title.trim(),
      specialty,
      segment: segment || null,
      description: description || null,
      whatsappNumber: whatsapp.replace(/\D/g, ""),
      questions,
      resultBands: bands.slice().sort((a, b) => a.min - b.min),
    };
    try {
      const res = editingId
        ? await fetch(`/api/sales/quizzes/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/sales/quizzes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });
      if (res.ok) {
        toast({ title: editingId ? "Quiz atualizado" : "Quiz criado" });
        navigate("/funil");
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || "Erro ao salvar", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Editor de quiz" />
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={editingId ? "Editar quiz" : "Novo quiz"}
        subtitle="Monte a isca de engajamento e a pontuação de qualificação"
        actions={
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        }
      />
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => navigate("/funil")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para o Funil
        </button>

        {/* Bloco: dados básicos */}
        <Section title="Dados do quiz">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Título">
              <input
                value={title}
                onChange={(e) => setTitleAndSlug(e.target.value)}
                placeholder="Ex: Descubra a causa da sua dor no joelho"
                className={inputCls}
              />
            </Field>
            <Field label="Link público (slug)">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">/q/</span>
                <input
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  placeholder="dor-no-joelho"
                  className={inputCls}
                />
              </div>
            </Field>
            <Field label="Especialidade">
              <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={inputCls}>
                {SPECIALTIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Segmento/persona (opcional)">
              <input
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="Ex: corredor"
                className={inputCls}
              />
            </Field>
            <Field label="WhatsApp da clínica">
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="5511999998888"
                className={inputCls}
              />
            </Field>
            <Field label="Descrição (opcional)">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Uma linha convidando a responder"
                className={inputCls}
              />
            </Field>
          </div>
        </Section>

        {/* Bloco: perguntas */}
        <Section
          title="Perguntas"
          action={
            <button
              onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar pergunta
            </button>
          }
        >
          <div className="space-y-4">
            {questions.map((q, qi) => (
              <div key={q.id} className="border border-border rounded-xl p-4 bg-background space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-muted-foreground mt-2.5">{qi + 1}</span>
                  <input
                    value={q.question}
                    onChange={(e) => updateQuestion(qi, { question: e.target.value })}
                    placeholder="Enunciado da pergunta"
                    className={inputCls}
                  />
                  {questions.length > 1 && (
                    <button
                      onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== qi))}
                      className="p-2 text-muted-foreground hover:text-red-500 mt-0.5"
                      title="Remover pergunta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-2 pl-5">
                  <div className="grid grid-cols-[1fr_70px_90px_32px] gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Opção</span>
                    <span>Pontos</span>
                    <span>Tag</span>
                    <span />
                  </div>
                  {q.options.map((o, oi) => (
                    <div key={oi} className="grid grid-cols-[1fr_70px_90px_32px] gap-2 items-center">
                      <input
                        value={o.label}
                        onChange={(e) => updateOption(qi, oi, { label: e.target.value })}
                        placeholder="Texto da alternativa"
                        className={inputSm}
                      />
                      <input
                        type="number"
                        value={o.points}
                        onChange={(e) => updateOption(qi, oi, { points: Number(e.target.value) || 0 })}
                        className={`${inputSm} tabular-nums`}
                      />
                      <input
                        value={o.tag ?? ""}
                        onChange={(e) => updateOption(qi, oi, { tag: e.target.value || undefined })}
                        placeholder="—"
                        className={inputSm}
                      />
                      {q.options.length > 2 ? (
                        <button
                          onClick={() =>
                            updateQuestion(qi, { options: q.options.filter((_, j) => j !== oi) })
                          }
                          className="p-1.5 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => updateQuestion(qi, { options: [...q.options, { label: "", points: 0 }] })}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="w-3 h-3" /> opção
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Bloco: faixas de resultado */}
        <Section title="Faixas de resultado">
          <p className="text-xs text-muted-foreground mb-3">
            Conforme o score somado, o paciente cai numa faixa (frio/morno/quente) que define a mensagem e a
            prioridade do lead. Ordene por pontuação mínima crescente.
          </p>
          <div className="space-y-3">
            {bands.map((b, bi) => (
              <div key={bi} className="border border-border rounded-xl p-3 bg-background space-y-2">
                <div className="grid grid-cols-[70px_100px_1fr_32px] gap-2 items-center">
                  <input
                    type="number"
                    value={b.min}
                    onChange={(e) =>
                      setBands((bs) => bs.map((x, i) => (i === bi ? { ...x, min: Number(e.target.value) || 0 } : x)))
                    }
                    title="Score mínimo"
                    className={`${inputSm} tabular-nums`}
                  />
                  <select
                    value={b.level}
                    onChange={(e) =>
                      setBands((bs) =>
                        bs.map((x, i) => (i === bi ? { ...x, level: e.target.value as Band["level"] } : x)),
                      )
                    }
                    className={inputSm}
                  >
                    <option value="frio">frio</option>
                    <option value="morno">morno</option>
                    <option value="quente">quente</option>
                  </select>
                  <input
                    value={b.title}
                    onChange={(e) =>
                      setBands((bs) => bs.map((x, i) => (i === bi ? { ...x, title: e.target.value } : x)))
                    }
                    placeholder="Título do resultado"
                    className={inputSm}
                  />
                  {bands.length > 1 ? (
                    <button
                      onClick={() => setBands((bs) => bs.filter((_, i) => i !== bi))}
                      className="p-1.5 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                <textarea
                  value={b.message}
                  onChange={(e) =>
                    setBands((bs) => bs.map((x, i) => (i === bi ? { ...x, message: e.target.value } : x)))
                  }
                  placeholder="Mensagem mostrada ao paciente (nomeia o problema + próximo passo)"
                  rows={2}
                  className={`${inputSm} resize-y`}
                />
              </div>
            ))}
            <button
              onClick={() => setBands((bs) => [...bs, { min: 0, level: "morno", title: "", message: "" }])}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar faixa
            </button>
          </div>
        </Section>
      </div>
    </>
  );
}

const inputCls =
  "w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:border-primary outline-none";
const inputSm =
  "w-full px-2.5 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:border-primary outline-none";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}
