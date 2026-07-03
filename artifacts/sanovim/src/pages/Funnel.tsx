import { useEffect, useState } from "react";
import { Link } from "wouter";
import { TopBar } from "@/components/TopBar";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Users,
  Power,
  MessageCircle,
  Plus,
  Pencil,
  Wand2,
  Search,
} from "lucide-react";

const THEME_OPTIONS = [
  { key: "medicina-esportiva", label: "Medicina Esportiva", emoji: "🏃" },
  { key: "ortopedia", label: "Ortopedia", emoji: "🦴" },
  { key: "tricologia", label: "Tricologia", emoji: "🔬" },
  { key: "terapia-capilar", label: "Terapia Capilar", emoji: "💇" },
];

interface Quiz {
  id: number;
  slug: string;
  title: string;
  specialty: string;
  segment: string | null;
  description: string | null;
  whatsappNumber: string;
  active: boolean;
  leadCount: number;
  questions: { id: string }[];
}

export default function Funnel() {
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [wa, setWa] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [theme, setTheme] = useState("");
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/quizzes", { credentials: "include" });
      if (res.ok) setQuizzes(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function seed() {
    if (wa.replace(/\D/g, "").length < 10) {
      toast({
        title: "Informe o WhatsApp da clínica",
        description: "Ex: 5511999998888 (com DDI 55 e DDD).",
        variant: "destructive",
      });
      return;
    }
    setSeeding(true);
    try {
      const res = await fetch("/api/sales/quizzes/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ whatsappNumber: wa }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        toast({ title: e.error || "Erro ao criar quizzes", variant: "destructive" });
        return;
      }
      const data = await res.json();
      toast({
        title: data.created > 0 ? `${data.created} quiz(zes) criado(s)` : "Nada a criar",
        description: data.message || "Quizzes de ortopedia prontos para uso.",
      });
      load();
    } finally {
      setSeeding(false);
    }
  }

  async function generateAI() {
    if (!theme) {
      toast({ title: "Escolha um tema", variant: "destructive" });
      return;
    }
    if (wa.replace(/\D/g, "").length < 10) {
      toast({ title: "Informe o WhatsApp da clínica", description: "Ex: 5511999998888", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/sales/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ theme, whatsappNumber: wa }),
      });
      if (res.ok) {
        const d = await res.json();
        const b = d.basedOn ?? {};
        const parts: string[] = [];
        if (b.google) parts.push(`${b.google} do Google`);
        if (b.googleTrends) parts.push(`${b.googleTrends} do Google Trends`);
        if (b.instagram) parts.push(`${b.instagram} do Instagram`);
        toast({
          title: "Quiz gerado com IA",
          description: `"${d.quiz.title}"${parts.length ? ` — baseado em ${parts.join(", ")}` : ""}`,
        });
        load();
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: e.error || "Erro ao gerar o quiz", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao gerar o quiz", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function toggleActive(quiz: Quiz) {
    const res = await fetch(`/api/sales/quizzes/${quiz.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ active: !quiz.active }),
    });
    if (res.ok) {
      setQuizzes((prev) => prev.map((q) => (q.id === quiz.id ? { ...q, active: !q.active } : q)));
    }
  }

  function publicUrl(slug: string) {
    return `${window.location.origin}/q/${slug}`;
  }

  function copy(slug: string) {
    navigator.clipboard.writeText(publicUrl(slug));
    setCopied(slug);
    setTimeout(() => setCopied(null), 1500);
    toast({ title: "Link copiado", description: publicUrl(slug) });
  }

  return (
    <>
      <TopBar
        title="Funil"
        subtitle="Quizzes de engajamento e captação de leads"
        actions={
          <Link href="/quiz-editor">
            <a className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90">
              <Plus className="w-4 h-4" /> Novo quiz
            </a>
          </Link>
        }
      />
      <div className="p-4 md:p-6 space-y-6">
        {/* WhatsApp da clínica (compartilhado) */}
        <div className="bg-card border border-border rounded-xl p-4">
          <label className="block">
            <span className="block text-xs font-medium text-muted-foreground mb-1.5">
              WhatsApp da clínica (recebe os leads)
            </span>
            <div className="relative max-w-md">
              <MessageCircle className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={wa}
                onChange={(e) => setWa(e.target.value)}
                placeholder="5511999998888 (com DDI 55 e DDD)"
                inputMode="tel"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:border-primary outline-none"
              />
            </div>
          </label>
        </div>

        {/* Gerar quiz com IA por tema */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Wand2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">Gerar quiz com IA por tema</h3>
                <p className="text-sm text-muted-foreground">
                  A IA cruza o que o público mais busca e engaja — <strong>Google</strong>, <strong>Google
                  Trends</strong> e <strong>Instagram</strong> — e monta um quiz completo (perguntas, pontuação e
                  SEO) pronto para captar.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTheme(t.key)}
                    className={`px-3 py-3 rounded-xl border text-sm font-medium transition-all text-left ${
                      theme === t.key
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <span className="text-lg block mb-0.5">{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={generateAI}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-60"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Pesquisando e gerando…
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" /> Gerar quiz do tema
                    </>
                  )}
                </button>
                {generating && (
                  <span className="text-xs text-muted-foreground">Pode levar alguns segundos.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Seed / criação rápida */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="font-semibold text-foreground">Ou comece com os quizzes prontos de ortopedia</h3>
                <p className="text-sm text-muted-foreground">
                  Cria os quizzes "Dor no joelho" e "Dor no ombro" do playbook, já com perguntas e pontuação.
                  Usa o WhatsApp informado acima.
                </p>
              </div>
              <button
                onClick={seed}
                disabled={seeding}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg font-medium text-sm text-foreground hover:bg-muted disabled:opacity-60"
              >
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Criar quizzes padrão
              </button>
            </div>
          </div>
        </div>

        {/* Lista de quizzes */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : quizzes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Nenhum quiz ainda</p>
            <p className="text-sm">Use o botão acima para criar seus primeiros quizzes.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{quiz.title}</h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          quiz.active
                            ? "bg-green-500/15 text-green-500"
                            : "bg-zinc-500/15 text-zinc-400"
                        }`}
                      >
                        {quiz.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {quiz.specialty}
                      {quiz.segment ? ` • ${quiz.segment}` : ""} • {quiz.questions.length} perguntas
                    </p>
                  </div>
                  <button
                    onClick={() => toggleActive(quiz)}
                    title={quiz.active ? "Desativar" : "Ativar"}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      quiz.active
                        ? "border-green-500/30 text-green-500 hover:bg-green-500/10"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span className="tabular-nums font-medium text-foreground">{quiz.leadCount}</span> leads captados
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <code className="flex-1 text-xs bg-muted px-2.5 py-2 rounded-lg text-muted-foreground truncate">
                    /q/{quiz.slug}
                  </code>
                  <button
                    onClick={() => copy(quiz.slug)}
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                    title="Copiar link público"
                  >
                    {copied === quiz.slug ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <a
                    href={publicUrl(quiz.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                    title="Abrir quiz"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <Link href={`/quiz-editor/${quiz.id}`}>
                    <a
                      className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                      title="Editar quiz"
                    >
                      <Pencil className="w-4 h-4" />
                    </a>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
