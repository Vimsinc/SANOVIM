import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  RefreshCw,
  MessageCircle,
  Flame,
  Thermometer,
  Snowflake,
  Users,
  CalendarCheck,
  Trophy,
} from "lucide-react";

interface Lead {
  id: number;
  quizId: number | null;
  name: string;
  phone: string;
  email: string | null;
  specialty: string;
  segment: string | null;
  score: number;
  temperature: "frio" | "morno" | "quente";
  status: string;
  source: string | null;
  answers: { question: string; label: string }[];
  createdAt: string;
}

interface Stats {
  totalLeads: number;
  byStatus: Record<string, number>;
  byTemperature: Record<string, number>;
  conversion: { leadToAgendamento: number; leadToFechado: number };
}

const STATUSES = ["novo", "contatado", "agendado", "compareceu", "fechado", "perdido"];

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  agendado: "Agendado",
  compareceu: "Compareceu",
  fechado: "Fechado",
  perdido: "Perdido",
};

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  contatado: "bg-violet-500/15 text-violet-500 border-violet-500/30",
  agendado: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  compareceu: "bg-teal-500/15 text-teal-500 border-teal-500/30",
  fechado: "bg-green-500/15 text-green-500 border-green-500/30",
  perdido: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

function TempBadge({ t }: { t: Lead["temperature"] }) {
  const map = {
    quente: { icon: Flame, cls: "text-red-500 bg-red-500/10", label: "Quente" },
    morno: { icon: Thermometer, cls: "text-amber-500 bg-amber-500/10", label: "Morno" },
    frio: { icon: Snowflake, cls: "text-sky-500 bg-sky-500/10", label: "Frio" },
  } as const;
  const { icon: Icon, cls, label } = map[t];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

export default function Leads() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [tempFilter, setTempFilter] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter) qs.set("status", filter);
      if (tempFilter) qs.set("temperature", tempFilter);
      const [leadsRes, statsRes] = await Promise.all([
        fetch(`/api/sales/leads?${qs.toString()}`, { credentials: "include" }),
        fetch(`/api/sales/stats`, { credentials: "include" }),
      ]);
      if (leadsRes.ok) setLeads(await leadsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, tempFilter]);

  async function updateStatus(lead: Lead, status: string) {
    const res = await fetch(`/api/sales/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
      toast({ title: "Status atualizado", description: `${lead.name} → ${STATUS_LABELS[status]}` });
      load();
    } else {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  }

  function waLink(lead: Lead) {
    const num = lead.phone.replace(/\D/g, "");
    const withCc = num.length <= 11 ? `55${num}` : num;
    const msg = encodeURIComponent(`Olá ${lead.name.split(" ")[0]}, aqui é da clínica. Vi que você respondeu nosso quiz — posso te ajudar a agendar uma avaliação?`);
    return `https://wa.me/${withCc}?text=${msg}`;
  }

  const funnelCards = useMemo(() => {
    if (!stats) return [];
    const s = stats.byStatus;
    return [
      { label: "Total de leads", value: stats.totalLeads, icon: Users },
      { label: "Novos", value: s.novo ?? 0, icon: Flame },
      { label: "Agendados", value: (s.agendado ?? 0) + (s.compareceu ?? 0) + (s.fechado ?? 0), icon: CalendarCheck },
      { label: "Fechados", value: s.fechado ?? 0, icon: Trophy },
    ];
  }, [stats]);

  return (
    <>
      <TopBar
        title="Leads"
        subtitle="Funil de captação — do quiz ao agendamento"
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
        {/* Funil / stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {funnelCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {stats && (
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">
              Conversão lead → agendamento:{" "}
              <strong className="text-foreground">{stats.conversion.leadToAgendamento}%</strong>
            </span>
            <span className="text-muted-foreground">
              Lead → fechado:{" "}
              <strong className="text-foreground">{stats.conversion.leadToFechado}%</strong>
            </span>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={!filter} onClick={() => setFilter("")}>
            Todos os status
          </FilterChip>
          {STATUSES.map((s) => (
            <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
              {STATUS_LABELS[s]}
            </FilterChip>
          ))}
          <span className="w-px h-5 bg-border mx-1" />
          {["quente", "morno", "frio"].map((t) => (
            <FilterChip key={t} active={tempFilter === t} onClick={() => setTempFilter(tempFilter === t ? "" : t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </FilterChip>
          ))}
        </div>

        {/* Tabela */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Nenhum lead ainda</p>
            <p className="text-sm">Publique um quiz na aba Funil e compartilhe o link para começar a captar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-xl">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-4 py-3 font-medium">Paciente</th>
                  <th className="px-4 py-3 font-medium">Temperatura</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Segmento</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <TempBadge t={lead.temperature} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{lead.score}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.segment ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={lead.status}
                        onChange={(e) => updateStatus(lead, e.target.value)}
                        className={`text-xs font-medium rounded-lg border px-2 py-1 outline-none cursor-pointer ${STATUS_COLORS[lead.status]}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s} className="bg-background text-foreground">
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={waLink(lead)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700"
                      >
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
