import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { TopBar } from "@/components/TopBar";
import {
  Play, Loader2, Download, Copy, Check, RotateCcw,
  Sparkles, Palette, Clock, Type, Wand2,
} from "lucide-react";

interface Preset {
  key: string;
  description: string;
}

interface AnimationResult {
  title: string;
  description: string;
  html: string;
  css: string;
  fullPage: string;
}

const COLOR_PALETTES = [
  { name: "Neon Roxo", colors: ["#6366f1", "#8b5cf6", "#a855f7"] },
  { name: "Sunset", colors: ["#f97316", "#ef4444", "#ec4899"] },
  { name: "Ocean", colors: ["#06b6d4", "#3b82f6", "#6366f1"] },
  { name: "Emerald", colors: ["#10b981", "#34d399", "#6ee7b7"] },
  { name: "Gold", colors: ["#f59e0b", "#d97706", "#fbbf24"] },
  { name: "Rosé", colors: ["#f43f5e", "#fb7185", "#fda4af"] },
];

const DURATIONS = [
  { value: 1, label: "1s — Rápida" },
  { value: 2, label: "2s — Normal" },
  { value: 3, label: "3s — Suave" },
  { value: 5, label: "5s — Lenta" },
];

export default function Animations() {
  const { toast } = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [text, setText] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [duration, setDuration] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnimationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch("/api/animations/presets")
      .then((r) => r.json())
      .then((d) => setPresets(d.presets || []))
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (mode === "preset" && !selectedPreset) {
      toast({ title: "Escolha um preset de animação", variant: "destructive" });
      return;
    }
    if (mode === "custom" && !customPrompt.trim()) {
      toast({ title: "Descreva a animação desejada", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/animations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: mode === "preset" ? selectedPreset : undefined,
          customPrompt: mode === "custom" ? customPrompt : undefined,
          text: text || undefined,
          colors: COLOR_PALETTES[paletteIdx].colors,
          duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      toast({ title: `Animação "${data.title}" criada!` });
    } catch (e: unknown) {
      toast({
        title: (e as Error).message || "Erro ao gerar animação",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.fullPage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.fullPage], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.title.replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setResult(null);
    setSelectedPreset(null);
    setCustomPrompt("");
    setText("");
  };

  useEffect(() => {
    if (result?.fullPage && previewRef.current) {
      const doc = previewRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(result.fullPage);
        doc.close();
      }
    }
  }, [result]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <TopBar
        title="Animações"
        subtitle="Crie animações CSS prontas para Stories, Reels e posts — powered by IA"
      />

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {/* How it works */}
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 mb-6">
            <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wide">
              Como funciona
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  icon: Wand2,
                  label: "1. Escolha o estilo",
                  desc: "Preset pronto ou descreva livremente",
                },
                {
                  icon: Palette,
                  label: "2. Personalize",
                  desc: "Cores, texto e velocidade",
                },
                {
                  icon: Play,
                  label: "3. Gere e use",
                  desc: "Preview ao vivo + código HTML para baixar",
                },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="text-center">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT — Controls */}
            <div className="space-y-5">
              {/* Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("preset")}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
                    mode === "preset"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Presets
                </button>
                <button
                  onClick={() => setMode("custom")}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
                    mode === "custom"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Wand2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Personalizado
                </button>
              </div>

              {/* Preset Grid or Custom Input */}
              {mode === "preset" ? (
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setSelectedPreset(p.key)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        selectedPreset === p.key
                          ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                          : "bg-card border-border hover:border-primary/30 hover:bg-muted/30"
                      }`}
                    >
                      <p className="text-xs font-bold text-foreground">{p.key}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {p.description}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Descreva a animação que deseja... Ex: Texto neon pulsando com partículas flutuando ao redor"
                  rows={3}
                  className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                />
              )}

              {/* Text Input */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1.5">
                  <Type className="w-3.5 h-3.5" /> Texto (opcional)
                </label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ex: LEMO OPUSCAR"
                  className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
                />
              </div>

              {/* Color Palette */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
                  <Palette className="w-3.5 h-3.5" /> Paleta de Cores
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {COLOR_PALETTES.map((pal, i) => (
                    <button
                      key={pal.name}
                      onClick={() => setPaletteIdx(i)}
                      className={`p-2.5 rounded-xl border transition-all ${
                        paletteIdx === i
                          ? "border-primary/40 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="flex gap-1 mb-1.5">
                        {pal.colors.map((c) => (
                          <div
                            key={c}
                            className="w-5 h-5 rounded-md"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {pal.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
                  <Clock className="w-3.5 h-3.5" /> Duração
                </label>
                <div className="flex gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setDuration(d.value)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                        duration === d.value
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-card border border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-3.5 px-6 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando animação...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Gerar Animação
                  </>
                )}
              </button>
            </div>

            {/* RIGHT — Preview */}
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <p className="text-xs font-semibold text-foreground">
                    {result ? result.title : "Preview"}
                  </p>
                  {result && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleCopyCode}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copied ? "Copiado!" : "Copiar HTML"}
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Baixar
                      </button>
                      <button
                        onClick={handleReset}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Nova
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative" style={{ aspectRatio: "1 / 1" }}>
                  {result ? (
                    <iframe
                      ref={previewRef}
                      title="Animation Preview"
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#0f0f23] flex items-center justify-center">
                      <div className="text-center space-y-3">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                          <Play className="w-8 h-8 text-primary/40" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white/40">
                            Preview da Animação
                          </p>
                          <p className="text-xs text-white/20 mt-1">
                            Escolha um estilo e clique em Gerar
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {result && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold text-foreground mb-1">
                    {result.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {result.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
