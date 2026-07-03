import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import {
  Loader2,
  RefreshCw,
  Users,
  CalendarCheck,
  Trophy,
  Percent,
  Gift,
  CalendarClock,
  TrendingUp,
} from "lucide-react";

interface Kpis {
  totalLeads: number;
  funnel: { stage: string; count: number }[];
  byTemperature: Record<string, number>;
  bySpecialty: { specialty: string; total: number }[];
  bySource: { source: string; total: number }[];
  timeline: { day: string; total: number }[];
  topQuizzes: { title: string; slug: string; total: number }[];
  referrals: { leads: number; conversions: number; activeCodes: number };
  followups: { done: number; pending: number; cancelled: number; overdue: number };
  conversion: { leadToAgendamento: number; agendamentoToFechado: number; leadToFechado: number };
}

const STAGE_LABELS: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  agendado: "Agendado",
  compareceu: "Compareceu",
  fechado: "Fechado",
  perdido: "Perdido",
};

const TEMP_COLORS: Record<string, string> = {
  quente: "bg-red-500",
  morno: "bg-amber-500",
  frio: "bg-sky-500",
};

export default function Kpis() {
  const [data, setData] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  // Inputs de CAC/LTV (persistidos localmente)
  const [ticket, setTicket] = useState(() => Number(localStorage.getItem("kpi-ticket")) || 0);
  const [custo, setCusto] = useState(() => Number(localStorage.getItem("kpi-custo")) || 0);
  const [recorrencia, setRecorrencia] = useState(() => Number(localStorage.getItem("kpi-recorrencia")) || 1);

  useEffect(() => localStorage.setItem("kpi-ticket", String(ticket)), [ticket]);
  useEffect(() => localStorage.setItem("kpi-custo", String(custo)), [custo]);
  useEffect(() => localStorage.setItem("kpi-recorrencia", String(recorrencia)), [recorrencia]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/kpis", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const fechados = useMemo(
    () => data?.funnel.find((f) => f.stage === "fechado")?.count ?? 0,
    [data],
  );
  const cac = custo > 0 && fechados > 0 ? custo / fechados : 0;
  const ltv = ticket * recorrencia;
  const ratio = cac > 0 ? ltv / cac : 0;

  if (loading || !data) {
    return (
      <>
        <TopBar title="KPIs" subtitle="Painel de indicadores do funil" />
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </>
    );
  }

  const maxFunnel = Math.max(...data.funnel.map((f) => f.count), 1);
  const tempTotal = Object.values(data.byTemperature).reduce((a, b) => a + b, 0) || 1;
  const maxTimeline = Math.max(...data.timeline.map((t) => t.total), 1);

  return (
    <>
      <TopBar
        title="KPIs"
        subtitle="Indicadores do funil, verticais, indicação e CAC/LTV"
        actions={
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-6">
        {/* Tiles de topo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile icon={Users} label="Total de leads" value={data.totalLeads} />
          <Tile icon={CalendarCheck} label="Conversão → agendamento" value={`${data.conversion.leadToAgendamento}%`} />
          <Tile icon={Trophy} label="Conversão → fechado" value={`${data.conversion.leadToFechado}%`} />
          <Tile icon={Percent} label="Agendado → fechado" value={`${data.conversion.agendamentoToFechado}%`} />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Funil */}
          <Card title="Funil por etapa">
            <div className="space-y-2.5">
              {data.funnel.map((f) => (
                <div key={f.stage} className="flex items-center gap-3">
                  <span className="w-24 text-xs text-muted-foreground shrink-0">{STAGE_LABELS[f.stage]}</span>
                  <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                    <div
                      className="h-full bg-primary/80 rounded-md flex items-center justify-end px-2"
                      style={{ width: `${Math.max((f.count / maxFunnel) * 100, f.count ? 8 : 0)}%` }}
                    >
                      {f.count > 0 && <span className="text-[10px] font-bold text-white tabular-nums">{f.count}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Temperatura */}
          <Card title="Qualidade dos leads (temperatura)">
            <div className="flex h-4 rounded-full overflow-hidden mb-4">
              {(["quente", "morno", "frio"] as const).map((t) =>
                data.byTemperature[t] ? (
                  <div
                    key={t}
                    className={TEMP_COLORS[t]}
                    style={{ width: `${(data.byTemperature[t] / tempTotal) * 100}%` }}
                    title={`${t}: ${data.byTemperature[t]}`}
                  />
                ) : null,
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(["quente", "morno", "frio"] as const).map((t) => (
                <div key={t} className="bg-muted/40 rounded-lg py-2 border border-border">
                  <p className="text-lg font-bold text-foreground tabular-nums">{data.byTemperature[t] ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{t}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Timeline */}
        <Card title="Leads por dia (últimos 30 dias)">
          {data.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
          ) : (
            <div className="flex items-end gap-1 h-28">
              {data.timeline.map((t) => (
                <div key={t.day} className="flex-1 group relative flex flex-col justify-end">
                  <div
                    className="bg-primary/70 hover:bg-primary rounded-t transition-colors"
                    style={{ height: `${(t.total / maxTimeline) * 100}%`, minHeight: t.total ? "4px" : "0" }}
                    title={`${new Date(t.day).toLocaleDateString("pt-BR")}: ${t.total}`}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Verticais */}
          <Card title="Leads por vertical">
            <BreakdownList items={data.bySpecialty.map((s) => ({ label: s.specialty, total: s.total }))} />
          </Card>
          {/* Fontes */}
          <Card title="Origem dos leads">
            <BreakdownList items={data.bySource.map((s) => ({ label: s.source, total: s.total }))} />
          </Card>
        </div>

        {/* Top quizzes */}
        <Card title="Quizzes que mais captam">
          <BreakdownList items={data.topQuizzes.map((q) => ({ label: q.title, total: q.total }))} />
        </Card>

        {/* Indicação + follow-ups */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Programa de indicação" icon={Gift}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Códigos ativos" value={data.referrals.activeCodes} />
              <MiniStat label="Leads gerados" value={data.referrals.leads} />
              <MiniStat label="Fechados" value={data.referrals.conversions} />
            </div>
          </Card>
          <Card title="Adesão aos follow-ups" icon={CalendarClock}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Concluídos" value={data.followups.done} />
              <MiniStat label="Pendentes" value={data.followups.pending} />
              <MiniStat label="Atrasados" value={data.followups.overdue} accent={data.followups.overdue > 0} />
            </div>
          </Card>
        </div>

        {/* CAC / LTV */}
        <Card title="CAC & LTV (estimativa)" icon={TrendingUp}>
          <p className="text-xs text-muted-foreground mb-4">
            Informe seus números para estimar o Custo de Aquisição (CAC) e o Valor no Tempo de Vida (LTV). Guardado
            só no seu navegador.
          </p>
          <div className="grid md:grid-cols-3 gap-3 mb-5">
            <NumField label="Ticket médio (R$)" value={ticket} onChange={setTicket} />
            <NumField label="Custo de tráfego no período (R$)" value={custo} onChange={setCusto} />
            <NumField label="Fator de recorrência (x ticket)" value={recorrencia} onChange={setRecorrencia} step={0.5} />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <BigStat label="CAC" value={cac > 0 ? `R$ ${cac.toFixed(0)}` : "—"} />
            <BigStat label="LTV" value={ltv > 0 ? `R$ ${ltv.toFixed(0)}` : "—"} />
            <BigStat
              label="LTV / CAC"
              value={ratio > 0 ? `${ratio.toFixed(1)}x` : "—"}
              good={ratio >= 3}
              warn={ratio > 0 && ratio < 3}
            />
          </div>
          {ratio > 0 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {ratio >= 3
                ? "Saudável: cada real investido volta com folga. Dá para escalar o tráfego."
                : "Abaixo de 3x. Antes de escalar, melhore conversão, ticket ou recorrência."}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="w-4 h-4 text-primary" />}
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function BreakdownList({ items }: { items: { label: string; total: number }[] }) {
  const max = Math.max(...items.map((i) => i.total), 1);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sem dados ainda.</p>;
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={`${it.label ?? "—"}-${i}`} className="flex items-center gap-3">
          <span className="w-32 text-xs text-foreground truncate shrink-0">{it.label || "—"}</span>
          <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
            <div className="h-full bg-primary/60 rounded" style={{ width: `${(it.total / max) * 100}%` }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums w-8 text-right">{it.total}</span>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-muted/40 rounded-lg py-2.5 border border-border">
      <p className={`text-xl font-bold tabular-nums ${accent ? "text-red-500" : "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function BigStat({
  label,
  value,
  good,
  warn,
}: {
  label: string;
  value: string;
  good?: boolean;
  warn?: boolean;
}) {
  const color = good ? "text-green-500" : warn ? "text-amber-500" : "text-foreground";
  return (
    <div className="bg-muted/40 rounded-xl py-4 border border-border">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>
      <input
        type="number"
        value={value || ""}
        step={step ?? 1}
        min={0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm tabular-nums focus:border-primary outline-none"
      />
    </label>
  );
}
