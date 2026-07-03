import { useEffect, useState } from "react";
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
} from "lucide-react";

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
      <TopBar title="Funil" subtitle="Quizzes de engajamento e captação de leads" />
      <div className="p-4 md:p-6 space-y-6">
        {/* Seed / criação rápida */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="font-semibold text-foreground">Comece com os quizzes de ortopedia</h3>
                <p className="text-sm text-muted-foreground">
                  Cria automaticamente os quizzes "Dor no joelho" e "Dor no ombro" do playbook, já com
                  perguntas e pontuação. Informe o WhatsApp da clínica que receberá os leads.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <MessageCircle className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={wa}
                    onChange={(e) => setWa(e.target.value)}
                    placeholder="WhatsApp da clínica (ex: 5511999998888)"
                    inputMode="tel"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:border-primary outline-none"
                  />
                </div>
                <button
                  onClick={seed}
                  disabled={seeding}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-60"
                >
                  {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Criar quizzes padrão
                </button>
              </div>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
