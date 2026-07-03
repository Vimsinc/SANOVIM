import type { QuizQuestion, ResultBand } from "@workspace/db";

type SeedQuiz = {
  slug: string;
  title: string;
  specialty: string;
  segment: string | null;
  description: string;
  whatsappNumber: string;
  questions: QuizQuestion[];
  resultBands: ResultBand[];
};

// Faixas de resultado padrão (score de 0 a ~10). Quanto maior, mais quente o lead.
const bands = (problema: string): ResultBand[] => [
  {
    min: 0,
    level: "frio",
    title: "Vale ficar de olho",
    message: `Pelas suas respostas, ${problema} ainda parece leve. O ideal é acompanhar e prevenir para não evoluir. Podemos te orientar sobre os próximos passos.`,
  },
  {
    min: 4,
    level: "morno",
    title: "Merece uma avaliação",
    message: `Suas respostas indicam sinais de ${problema} que costumam se cronificar quando ignorados. Uma avaliação identifica a causa antes que limite mais a sua rotina.`,
  },
  {
    min: 7,
    level: "quente",
    title: "Recomendamos avaliar o quanto antes",
    message: `Pelo que você descreveu, ${problema} já está impactando suas atividades. Quanto antes identificarmos a causa, mais rápida e simples tende a ser a recuperação. Vamos conversar?`,
  },
];

export const DEFAULT_QUIZZES: SeedQuiz[] = [
  {
    slug: "dor-no-joelho",
    title: "Descubra a causa da sua dor no joelho",
    specialty: "medicina-esportiva",
    segment: "corredor",
    description:
      "Responda 6 perguntas rápidas e entenda o que pode estar por trás da sua dor no joelho — e o próximo passo para resolver.",
    whatsappNumber: "5500000000000",
    questions: [
      {
        id: "tempo",
        question: "Há quanto tempo você sente essa dor no joelho?",
        options: [
          { label: "Menos de 2 semanas", points: 1 },
          { label: "De 2 semanas a 3 meses", points: 2 },
          { label: "Mais de 3 meses", points: 3 },
        ],
      },
      {
        id: "atividade",
        question: "O que a dor mais atrapalha hoje?",
        options: [
          { label: "Correr ou treinar", points: 2, tag: "corredor" },
          { label: "Subir/descer escadas e agachar", points: 2 },
          { label: "Atividades do dia a dia e trabalho", points: 1 },
          { label: "Dormir", points: 2 },
        ],
      },
      {
        id: "recorre",
        question: "A dor volta sempre que você tenta voltar a treinar?",
        options: [
          { label: "Sim, sempre volta", points: 2, tag: "corredor" },
          { label: "Às vezes", points: 1 },
          { label: "Não", points: 0 },
        ],
      },
      {
        id: "paliativo",
        question: "Você já usou anti-inflamatório e a dor retornou depois?",
        options: [
          { label: "Sim, várias vezes", points: 2 },
          { label: "Uma ou outra vez", points: 1 },
          { label: "Nunca usei", points: 0 },
        ],
      },
      {
        id: "evita",
        question: "Você tem evitado atividades que gostava por medo de piorar?",
        options: [
          { label: "Sim, com frequência", points: 2 },
          { label: "De vez em quando", points: 1 },
          { label: "Não", points: 0 },
        ],
      },
      {
        id: "urgencia",
        question: "O quão importante é resolver isso agora?",
        options: [
          { label: "Muito — quero voltar a treinar/viver sem dor", points: 2 },
          { label: "Importante, mas sem pressa", points: 1 },
          { label: "Só estou pesquisando", points: 0 },
        ],
      },
    ],
    resultBands: bands("a sua dor no joelho"),
  },
  {
    slug: "dor-no-ombro",
    title: "Entenda a sua dor no ombro",
    specialty: "ortopedia",
    segment: null,
    description:
      "6 perguntas rápidas para entender o que pode estar causando a sua dor no ombro e qual o melhor caminho.",
    whatsappNumber: "5500000000000",
    questions: [
      {
        id: "tempo",
        question: "Há quanto tempo você sente dor no ombro?",
        options: [
          { label: "Menos de 2 semanas", points: 1 },
          { label: "De 2 semanas a 3 meses", points: 2 },
          { label: "Mais de 3 meses", points: 3 },
        ],
      },
      {
        id: "movimento",
        question: "A dor aparece ao levantar o braço ou dormir de lado?",
        options: [
          { label: "Sim, nos dois", points: 3 },
          { label: "Em um deles", points: 2 },
          { label: "Não", points: 0 },
        ],
      },
      {
        id: "forca",
        question: "Você sente fraqueza ou dificuldade para carregar peso?",
        options: [
          { label: "Sim, bastante", points: 2 },
          { label: "Um pouco", points: 1 },
          { label: "Não", points: 0 },
        ],
      },
      {
        id: "treino",
        question: "Faz musculação ou esporte com uso dos ombros?",
        options: [
          { label: "Sim, regularmente", points: 1, tag: "atleta" },
          { label: "Às vezes", points: 1 },
          { label: "Não", points: 0 },
        ],
      },
      {
        id: "evita",
        question: "Está evitando movimentos por medo de piorar?",
        options: [
          { label: "Sim", points: 2 },
          { label: "Às vezes", points: 1 },
          { label: "Não", points: 0 },
        ],
      },
      {
        id: "urgencia",
        question: "O quão importante é resolver isso agora?",
        options: [
          { label: "Muito importante", points: 2 },
          { label: "Importante, sem pressa", points: 1 },
          { label: "Só pesquisando", points: 0 },
        ],
      },
    ],
    resultBands: bands("a sua dor no ombro"),
  },
];
