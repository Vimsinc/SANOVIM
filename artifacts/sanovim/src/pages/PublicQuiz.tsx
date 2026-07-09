import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Stethoscope,
  MessageCircle,
} from "lucide-react";

interface PublicOption {
  label: string;
}
interface PublicQuestion {
  id: string;
  question: string;
  help?: string;
  options: PublicOption[];
}
interface PublicQuizData {
  slug: string;
  title: string;
  specialty: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  questions: PublicQuestion[];
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}
interface SubmitResult {
  result: { title: string; message: string; temperature: string };
  whatsappUrl: string;
}

type Phase = "loading" | "notfound" | "loaderror" | "intro" | "questions" | "contact" | "submitting" | "done";

export default function PublicQuiz() {
  const [, params] = useRoute("/q/:slug");
  const slug = params?.slug;

  const [phase, setPhase] = useState<Phase>("loading");
  const [quiz, setQuiz] = useState<PublicQuizData | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    // Código de indicação (?ref=IND-XXXX): registra o clique e guarda para atribuir
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) {
      setRef(code);
      fetch(`/api/sales/public/referral/${encodeURIComponent(code)}`).catch(() => {});
    }
  }, []);

  useEffect(() => {
    loadQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function loadQuiz() {
    if (!slug) return;
    setPhase("loading");
    fetch(`/api/sales/public/quiz/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: PublicQuizData) => {
        setQuiz(data);
        setPhase("intro");
        // SEO client-side (complementa a injeção server-side)
        const title = data.metaTitle || data.title;
        const desc = data.metaDescription || data.description || "";
        document.title = title;
        if (desc) {
          setMeta("description", desc);
          setMeta("og:title", title, "property");
          setMeta("og:description", desc, "property");
        }
        if (data.keywords?.length) setMeta("keywords", data.keywords.join(", "));
      })
      .catch((e) => {
        // 404 = quiz inexistente/desativado; qualquer outra falha = transitória (retry)
        setPhase(e && typeof e === "object" && "status" in e && e.status === 404 ? "notfound" : "loaderror");
      });
  }

  function chooseOption(questionId: string, optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
    if (!quiz) return;
    // avança automaticamente
    setTimeout(() => {
      if (step < quiz.questions.length - 1) setStep((s) => s + 1);
      else setPhase("contact");
    }, 180);
  }

  async function submit() {
    if (!quiz || !slug) return;
    if (name.trim().length < 2 || phone.replace(/\D/g, "").length < 8) {
      setError("Preencha seu nome e um WhatsApp válido.");
      return;
    }
    setError(null);
    setPhase("submitting");
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        source: new URLSearchParams(window.location.search).get("utm_source") || undefined,
        ref: ref || undefined,
        answers: quiz.questions.map((q) => ({
          questionId: q.id,
          optionIndex: answers[q.id] ?? 0,
        })),
      };
      const res = await fetch(`/api/sales/public/quiz/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("submit failed");
      const data: SubmitResult = await res.json();
      setResult(data);
      setPhase("done");
    } catch {
      setError("Não foi possível enviar. Tente novamente.");
      setPhase("contact");
    }
  }

  // ---- render states ----
  if (phase === "loading") {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  if (phase === "loaderror") {
    return (
      <Shell>
        <div className="text-center py-16 space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Não foi possível carregar</h1>
          <p className="text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
          <button
            onClick={loadQuiz}
            className="inline-flex items-center gap-2 py-2.5 px-6 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90"
          >
            Tentar novamente
          </button>
        </div>
      </Shell>
    );
  }

  if (phase === "notfound" || !quiz) {
    return (
      <Shell>
        <div className="text-center py-16 space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Quiz não encontrado</h1>
          <p className="text-sm text-muted-foreground">O link pode estar incorreto ou desativado.</p>
        </div>
      </Shell>
    );
  }

  const progress =
    phase === "questions"
      ? Math.round(((step + 1) / (quiz.questions.length + 1)) * 100)
      : phase === "contact" || phase === "submitting"
        ? 100
        : 0;

  return (
    <Shell>
      {phase !== "intro" && phase !== "done" && (
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-8">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {phase === "intro" && (
        <div className="text-center space-y-6 py-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Stethoscope className="w-7 h-7 text-primary" />
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground text-balance">{quiz.title}</h1>
            {quiz.description && (
              <p className="text-muted-foreground max-w-md mx-auto">{quiz.description}</p>
            )}
          </div>
          <button
            onClick={() => setPhase(quiz.questions.length ? "questions" : "contact")}
            className="inline-flex items-center gap-2 py-3 px-7 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
          >
            Começar <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-muted-foreground">
            {quiz.questions.length} perguntas rápidas • leva menos de 1 minuto
          </p>
        </div>
      )}

      {phase === "questions" && quiz.questions[step] && (
        <div className="space-y-6">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
              Pergunta {step + 1} de {quiz.questions.length}
            </p>
            <h2 className="text-xl md:text-2xl font-semibold text-foreground text-balance">
              {quiz.questions[step].question}
            </h2>
            {quiz.questions[step].help && (
              <p className="text-sm text-muted-foreground mt-1">{quiz.questions[step].help}</p>
            )}
          </div>
          <div className="space-y-2.5">
            {quiz.questions[step].options.map((opt, i) => {
              const selected = answers[quiz.questions[step].id] === i;
              return (
                <button
                  key={i}
                  onClick={() => chooseOption(quiz.questions[step].id, i)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{opt.label}</span>
                    {selected && <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />}
                  </span>
                </button>
              );
            })}
          </div>
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
          )}
        </div>
      )}

      {(phase === "contact" || phase === "submitting") && (
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <h2 className="text-xl md:text-2xl font-semibold text-foreground">Quase lá!</h2>
            <p className="text-sm text-muted-foreground">
              Deixe seu contato para receber seu resultado e falar com a nossa equipe.
            </p>
          </div>
          <div className="space-y-3">
            <Field label="Seu nome">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome completo"
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground focus:border-primary outline-none"
              />
            </Field>
            <Field label="WhatsApp">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                inputMode="tel"
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground focus:border-primary outline-none"
              />
            </Field>
            <Field label="E-mail (opcional)">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                inputMode="email"
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground focus:border-primary outline-none"
              />
            </Field>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={submit}
            disabled={phase === "submitting"}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-7 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {phase === "submitting" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Ver meu resultado <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            Ao continuar, você concorda em ser contatado pela clínica. Seus dados não são compartilhados.
          </p>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-6 py-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7 text-green-500" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-foreground text-balance">{result.result.title}</h2>
            <p className="text-muted-foreground max-w-md mx-auto">{result.result.message}</p>
          </div>
          <a
            href={result.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 py-3.5 px-7 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
          >
            <MessageCircle className="w-5 h-5" /> Falar com a clínica no WhatsApp
          </a>
          <p className="text-xs text-muted-foreground">
            Nossa equipe já recebeu suas respostas e vai te ajudar a agendar.
          </p>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="bg-card/60 border border-border rounded-3xl p-6 md:p-8 shadow-sm">{children}</div>
        <p className="text-center text-[11px] text-muted-foreground mt-4">Powered by SANOVIM</p>
      </div>
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
