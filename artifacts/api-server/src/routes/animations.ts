import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANIMATION_PRESETS = {
  "text-reveal": "Texto aparecendo letra por letra com efeito typewriter",
  "slide-in": "Elemento deslizando de um lado para o centro",
  "fade-bounce": "Fade in com leve bounce no final",
  "pulse-glow": "Pulsação com brilho neon animado",
  "rotate-3d": "Rotação 3D com perspectiva",
  "particle-burst": "Explosão de partículas ao redor do elemento",
  "gradient-shift": "Gradiente animado que muda de cores suavemente",
  "shake-attention": "Tremida rápida para chamar atenção",
  "zoom-blur": "Zoom in com desfoque que vai ficando nítido",
  "wave-text": "Texto com efeito de onda letra por letra",
  "counter-up": "Número contando de 0 até o valor final",
  "morph-shape": "Forma geométrica que se transforma em outra",
} as const;

type PresetKey = keyof typeof ANIMATION_PRESETS;

router.get("/animations/presets", (_req, res): void => {
  const presets = Object.entries(ANIMATION_PRESETS).map(([key, description]) => ({
    key,
    description,
  }));
  res.json({ presets });
});

router.post("/animations/generate", async (req, res): Promise<void> => {
  const { preset, customPrompt, text, colors, duration } = req.body as {
    preset?: PresetKey;
    customPrompt?: string;
    text?: string;
    colors?: string[];
    duration?: number;
  };

  if (!preset && !customPrompt) {
    res.status(400).json({ error: "Escolha um preset ou descreva a animação desejada" });
    return;
  }

  const presetDesc = preset ? ANIMATION_PRESETS[preset] : "";
  const colorPalette = colors?.length ? colors.join(", ") : "#6366f1, #8b5cf6, #a855f7";
  const dur = duration || 2;

  const prompt = `Você é um especialista em CSS animations e motion design para redes sociais.

${preset ? `Preset escolhido: "${preset}" — ${presetDesc}` : ""}
${customPrompt ? `Descrição personalizada: "${customPrompt}"` : ""}
${text ? `Texto para animar: "${text}"` : ""}
Paleta de cores: ${colorPalette}
Duração: ${dur}s

Crie uma animação HTML/CSS completa e autossuficiente. Regras:
1. O HTML deve ser um bloco COMPLETO com <style> embutido — sem dependências externas
2. Use APENAS CSS puro para animações (keyframes, transitions, transforms)
3. Fundo escuro (#0f0f23) para destaque visual
4. Design moderno, clean, inspirado em motion graphics de Instagram/TikTok
5. Responsivo (funciona em 1080x1350 para stories e 1080x1080 para feed)
6. A animação deve rodar em loop infinito
7. Inclua comentários breves no CSS explicando cada keyframe

Retorne APENAS o JSON no formato:
{
  "html": "<div style=\\"...\\" >conteúdo completo com style embutido</div>",
  "css": "@keyframes ... { } .anim { ... }",
  "fullPage": "<!DOCTYPE html><html>...</html>",
  "title": "nome curto da animação",
  "description": "o que ela faz em 1 linha"
}

IMPORTANTE: O campo "fullPage" deve ser uma página HTML completa e funcional que mostra a animação. Não use JavaScript — apenas HTML e CSS.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (msg.content[0] as { text: string }).text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Não foi possível gerar a animação" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    logger.info({ preset, customPrompt }, "Animation generated");
    res.json({
      title: parsed.title || "Animação",
      description: parsed.description || "",
      html: parsed.html || "",
      css: parsed.css || "",
      fullPage: parsed.fullPage || "",
    });
  } catch (err) {
    logger.error(err, "Animation generation error");
    res.status(500).json({ error: "Erro ao gerar animação" });
  }
});

export default router;
