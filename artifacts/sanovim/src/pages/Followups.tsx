import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { useToast } from "@/hooks/use-toast";
import { waLink } from "@/lib/utils";
import {
  Loader2,
  RefreshCw,
  MessageCircle,
  Check,
  X,
  Clock,
  Flame,
  Thermometer,
  Snowflake,
  CalendarClock,
} from "lucide-react";

interface Followup {
  id: number;
  leadId: number;
  stepOrder: number;
  channel: string;
  title: string;
  message: string;
  dueAt: string;
  status: string;
  leadName: string;
  leadPhone: string;
  leadTemperature: "frio" | "morno" | "quente";
  leadStatus: string;
}

const TEMP_ICON = {
  quente: { icon: Flame, cls: "text-red-500" },
  morno: { icon: Thermometer, cls: "text-amber-500" },
  frio: { icon: Snowflake, cls: "text-sky-500" },
} as const;

function dueLabel(dueAt: string): { text: string; overdue: boolean } {
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffH = Math.round((due - now) / 3600000);
  if (diffH < -24) return { text: `Atrasado ${Math.round(-diffH / 24)}d`, overdue: true };
  if (diffH < 0) return { text: `Atrasado ${-diffH}h`, overdue: true };
  if (diffH < 1) return { text: "Agora", overdue: true };
  if (diffH < 24) return { text: `Em ${diffH}h`, overdue: false };
  return { text: `Em ${Math.round(diffH / 24)}d`, overdue: false };
}

export default function Followups() {
  const { toast } = useToast();
  const [items, setItems] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"due" | "all">("due");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/followups?scope=${scope}`, { credentials: "include" });
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function resolve(f: Followup, status: "done" | "skipped") {
    const res = await fetch(`/api/sales/followups/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((x) => x.id !== f.id));
      toast({ title: status === "done" ? "Follow-up concluído" : "Follow-up pulado" });
    }
  }

  function followupWa(f: Followup) {
    return waLink(f.leadPhone, f.message);
  }

  return (
    <>
      <TopBar
        title="Retornos"
        subtitle="Cadência de follow-up — mensagens de valor no momento certo"
        actions={
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        }
      />
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setScope("due")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                scope === "due"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Para hoje
            </button>
            <button
              onClick={() => setScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                scope === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos os pendentes
            </button>
          </div>
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground tabular-nums">{items.length}</strong> retorno(s) na fila
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarClock className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground mb-1">Fila vazia</p>
            <p className="text-sm">
              Nenhum follow-up {scope === "due" ? "para hoje" : "pendente"}. Os retornos aparecem aqui
              automaticamente conforme novos leads entram pelo quiz.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((f) => {
              const { icon: TIcon, cls } = TEMP_ICON[f.leadTemperature] ?? TEMP_ICON.frio;
              const due = dueLabel(f.dueAt);
              return (
                <div key={f.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <TIcon className={`w-4 h-4 shrink-0 ${cls}`} />
                      <span className="font-medium text-foreground truncate">{f.leadName}</span>
                      <span className="text-xs text-muted-foreground">• toque {f.stepOrder}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        due.overdue ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Clock className="w-3 h-3" /> {due.text}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-primary mt-2">{f.title}</p>
                  <p className="text-sm text-muted-foreground mt-1 bg-muted/40 rounded-lg p-2.5 border border-border">
                    {f.message}
                  </p>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <a
                      href={followupWa(f)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => resolve(f, "done")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                    >
                      <MessageCircle className="w-4 h-4" /> Enviar no WhatsApp
                    </a>
                    <button
                      onClick={() => resolve(f, "done")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Check className="w-4 h-4" /> Feito
                    </button>
                    <button
                      onClick={() => resolve(f, "skipped")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" /> Pular
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
