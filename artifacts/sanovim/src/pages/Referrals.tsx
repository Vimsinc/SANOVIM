import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useToast } from "@/hooks/use-toast";
import { quizPublicUrl, copyToClipboard } from "@/lib/utils";
import {
  Loader2,
  Gift,
  Copy,
  Check,
  Users,
  Trophy,
  MousePointerClick,
  Power,
  Plus,
} from "lucide-react";

interface Referral {
  id: number;
  code: string;
  patientName: string;
  patientPhone: string | null;
  specialty: string;
  quizSlug: string | null;
  rewardNote: string | null;
  clicks: number;
  active: boolean;
  leadsGenerated: number;
  conversions: number;
}

interface QuizLite {
  id: number;
  slug: string;
  title: string;
  active: boolean;
}

export default function Referrals() {
  const { toast } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [quizzes, setQuizzes] = useState<QuizLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [quizSlug, setQuizSlug] = useState("");
  const [reward, setReward] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rRes, qRes] = await Promise.all([
        fetch("/api/sales/referrals", { credentials: "include" }),
        fetch("/api/sales/quizzes", { credentials: "include" }),
      ]);
      if (rRes.ok) setReferrals(await rRes.json());
      if (qRes.ok) setQuizzes(await qRes.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (name.trim().length < 2) {
      toast({ title: "Informe o nome de quem indica", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/sales/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          patientName: name,
          patientPhone: phone || undefined,
          quizSlug: quizSlug || undefined,
          rewardNote: reward || undefined,
        }),
      });
      if (res.ok) {
        setName("");
        setPhone("");
        setReward("");
        setQuizSlug("");
        toast({ title: "Código de indicação criado" });
        load();
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: e.error || "Erro ao criar código", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao criar código", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  function resolveSlug(r: Referral): string | null {
    if (r.quizSlug) return r.quizSlug;
    // preferir um quiz ATIVO como destino padrão
    return quizzes.find((q) => q.active)?.slug ?? quizzes[0]?.slug ?? null;
  }

  function link(r: Referral) {
    const slug = resolveSlug(r) ?? "";
    return `${quizPublicUrl(slug)}?ref=${r.code}`;
  }

  async function copy(r: Referral) {
    if (!resolveSlug(r)) {
      toast({
        title: "Crie um quiz primeiro",
        description: "A indicação precisa apontar para um quiz ativo. Crie um na aba Funil.",
        variant: "destructive",
      });
      return;
    }
    const ok = await copyToClipboard(link(r));
    if (ok) {
      setCopied(r.code);
      setTimeout(() => setCopied(null), 1500);
      toast({ title: "Link copiado", description: link(r) });
    } else {
      toast({ title: "Não foi possível copiar", description: link(r), variant: "destructive" });
    }
  }

  async function toggle(r: Referral) {
    try {
      const res = await fetch(`/api/sales/referrals/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: !r.active }),
      });
      if (res.ok) setReferrals((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
      else toast({ title: "Não foi possível alterar", variant: "destructive" });
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    }
  }

  return (
    <>
      <TopBar title="Indicações" subtitle="Programa de indicação — cada paciente vira um canal" />
      <div className="p-4 md:p-6 space-y-6">
        {/* criar */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Gift className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Novo código de indicação</h3>
              <p className="text-xs text-muted-foreground">
                Gere um link pessoal para o paciente compartilhar. Cada lead que vier por ele é atribuído
                automaticamente.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Nome de quem indica" value={name} onChange={setName} placeholder="Ex: Maria Silva" />
            <Input label="WhatsApp (opcional)" value={phone} onChange={setPhone} placeholder="(00) 00000-0000" />
            <label className="block">
              <span className="block text-xs font-medium text-muted-foreground mb-1.5">Quiz de destino</span>
              <select
                value={quizSlug}
                onChange={(e) => setQuizSlug(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:border-primary outline-none"
              >
                <option value="">Primeiro quiz ativo</option>
                {quizzes.map((q) => (
                  <option key={q.id} value={q.slug}>
                    {q.title}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Vantagem para quem indica (opcional)"
              value={reward}
              onChange={setReward}
              placeholder="Ex: 1 reavaliação de cortesia"
            />
          </div>
          <button
            onClick={create}
            disabled={creating}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-60"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Gerar código
          </button>
        </div>

        {/* lista */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : referrals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Gift className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground mb-1">Nenhuma indicação ainda</p>
            <p className="text-sm">Crie o primeiro código acima e entregue ao seu paciente embaixador.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {referrals.map((r) => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{r.patientName}</h3>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          r.active ? "bg-green-500/15 text-green-500" : "bg-zinc-500/15 text-zinc-400"
                        }`}
                      >
                        {r.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <code className="text-xs text-primary font-medium">{r.code}</code>
                    {r.rewardNote && (
                      <p className="text-xs text-muted-foreground mt-1">🎁 {r.rewardNote}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggle(r)}
                    title={r.active ? "Desativar" : "Ativar"}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      r.active
                        ? "border-green-500/30 text-green-500 hover:bg-green-500/10"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <Metric icon={MousePointerClick} label="Cliques" value={r.clicks} />
                  <Metric icon={Users} label="Leads" value={r.leadsGenerated} />
                  <Metric icon={Trophy} label="Fechados" value={r.conversions} />
                </div>

                <button
                  onClick={() => copy(r)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {copied === r.code ? (
                    <>
                      <Check className="w-4 h-4 text-green-500" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copiar link de indicação
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:border-primary outline-none"
      />
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-muted/40 rounded-lg py-2 border border-border">
      <Icon className="w-4 h-4 mx-auto text-muted-foreground mb-0.5" />
      <p className="text-lg font-bold text-foreground tabular-nums leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
