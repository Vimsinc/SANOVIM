// Cadência de follow-up de valor (Cap. 11 do playbook).
// Cada toque tem um atraso (em horas) a partir da criação do lead, um canal,
// um título e uma mensagem sugerida. {{nome}} é substituído pelo 1º nome.
// A cadência é escolhida pela temperatura do lead: quente = rápida e curta;
// frio = nutrição mais longa e educativa.

export type CadenceStep = {
  order: number;
  offsetHours: number;
  channel: "whatsapp" | "email";
  title: string;
  message: string;
};

const QUENTE: CadenceStep[] = [
  {
    order: 1,
    offsetHours: 2,
    channel: "whatsapp",
    title: "Confirmar interesse e oferecer horário",
    message:
      "Oi {{nome}}, tudo bem? Vi que você respondeu nosso quiz e o resultado indica que vale avaliar logo. Consigo te encaixar um horário de avaliação ainda esta semana — prefere de manhã ou à tarde?",
  },
  {
    order: 2,
    offsetHours: 24,
    channel: "whatsapp",
    title: "Reforço com prova + próximo passo",
    message:
      "{{nome}}, muita gente com um quadro parecido com o seu voltou a treinar sem dor depois de identificar a causa certa. Quer que eu já reserve um horário de avaliação pra você?",
  },
  {
    order: 3,
    offsetHours: 72,
    channel: "whatsapp",
    title: "Pergunta aberta / remover objeção",
    message:
      "Oi {{nome}}, ficou alguma dúvida sobre a avaliação (valor, horário, como funciona)? Posso te explicar rapidinho por aqui pra você decidir com tranquilidade.",
  },
];

const MORNO: CadenceStep[] = [
  {
    order: 1,
    offsetHours: 24,
    channel: "whatsapp",
    title: "Conteúdo útil sobre a dor",
    message:
      "Oi {{nome}}! Separei uma dica rápida sobre o que costuma estar por trás desse tipo de dor e o que ajuda (e o que atrapalha) a recuperação. Quer que eu te envie?",
  },
  {
    order: 2,
    offsetHours: 72,
    channel: "whatsapp",
    title: "Caso parecido / prova social",
    message:
      "{{nome}}, atendi recentemente alguém com um quadro parecido com o seu — a chave foi tratar a causa, não só o sintoma. Se quiser, marco uma avaliação pra entender o seu caso.",
  },
  {
    order: 3,
    offsetHours: 168,
    channel: "whatsapp",
    title: "Pergunta aberta (dia 7)",
    message:
      "Oi {{nome}}, como está a dor desde que você fez o quiz? Se ainda estiver incomodando, a avaliação ajuda a identificar o que está causando isso.",
  },
  {
    order: 4,
    offsetHours: 336,
    channel: "whatsapp",
    title: "Janela de agenda (dia 14)",
    message:
      "{{nome}}, abriu um horário de avaliação aqui na clínica. Quer aproveitar pra finalmente resolver isso? Consigo reservar pra você.",
  },
];

const FRIO: CadenceStep[] = [
  {
    order: 1,
    offsetHours: 48,
    channel: "whatsapp",
    title: "Educar sobre o problema",
    message:
      "Oi {{nome}}! Mesmo quando a dor é leve, entender a causa cedo evita que ela vire um problema crônico. Posso te mandar uma orientação rápida sobre isso?",
  },
  {
    order: 2,
    offsetHours: 240,
    channel: "whatsapp",
    title: "Check-in genuíno (dia 10)",
    message:
      "{{nome}}, passando pra saber como você está. A dor melhorou, continua igual ou piorou? Dependendo da resposta, dá pra te orientar sobre o próximo passo.",
  },
  {
    order: 3,
    offsetHours: 720,
    channel: "whatsapp",
    title: "Reengajamento (dia 30)",
    message:
      "Oi {{nome}}! Se aquela questão que te trouxe até o nosso quiz ainda estiver aí, uma avaliação pode finalmente esclarecer a causa. Estou à disposição.",
  },
];

export const CADENCE_BY_TEMPERATURE: Record<string, CadenceStep[]> = {
  quente: QUENTE,
  morno: MORNO,
  frio: FRIO,
};

export function renderMessage(template: string, firstName: string): string {
  return template.replace(/\{\{nome\}\}/g, firstName || "tudo bem");
}
