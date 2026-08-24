export type OutcomeKind =
  | 'KNOWLEDGE'
  | 'CAUSAL_EXPLANATION'
  | 'SOURCE_ANALYSIS'
  | 'COMPARISON'
  | 'DATA_INTERPRETATION'
  | 'CARTOGRAPHY'
  | 'MODELING'
  | 'ARGUMENTATION';

export interface TimeRangeMinutes {
  min: number;
  max: number;
}

export interface MethodologyPackRef {
  id: string;
  version: string;
}

export interface MethodologyProvenance {
  kind: 'PLATFORM_CURATED';
  title: string;
  version: string;
  notes: string;
}

export interface MethodologyPhase {
  id: string;
  ordinal: number;
  title: string;
  purpose: string;
  typicalMinutes: TimeRangeMinutes;
}

export interface PedagogicalTechnologyDefinition {
  id: string;
  name: string;
  description: string;
  canonicalPhaseIds: string[];
  compatibleOutcomeKinds: OutcomeKind[];
  constraints: string[];
  antiPatterns: string[];
}

export interface MethodDefinition {
  id: string;
  name: string;
  description: string;
  compatibleTechnologyPhaseIds: string[];
  compatibleOutcomeKinds: OutcomeKind[];
  typicalMinutes: TimeRangeMinutes;
  preparation: string[];
  constraints: string[];
  antiPatterns: string[];
}

export interface TechniqueDefinition {
  id: string;
  name: string;
  description: string;
  methodIds: string[];
  instructions: string[];
  typicalMinutes: TimeRangeMinutes;
}

export interface OrganizationalFormDefinition {
  id: string;
  name: string;
  participantPattern: string;
  constraints: string[];
}

export interface MethodologyPack {
  id: string;
  version: string;
  title: string;
  status: 'PUBLISHED';
  provenance: MethodologyProvenance;
  technology: PedagogicalTechnologyDefinition;
  phases: MethodologyPhase[];
  methods: MethodDefinition[];
  techniques: TechniqueDefinition[];
  forms: OrganizationalFormDefinition[];
}

function positiveRange(range: TimeRangeMinutes): boolean {
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.min > 0 && range.max >= range.min;
}

export function validateMethodologyPack(pack: MethodologyPack): string[] {
  const errors: string[] = [];
  const phaseIds = new Set<string>();
  const methodIds = new Set<string>();
  const techniqueIds = new Set<string>();
  const formIds = new Set<string>();
  const ordinals = new Set<number>();

  for (const phase of pack.phases) {
    if (phaseIds.has(phase.id)) errors.push(`Duplicate methodology phase id: ${phase.id}.`);
    phaseIds.add(phase.id);
    if (ordinals.has(phase.ordinal)) errors.push(`Duplicate methodology phase ordinal: ${phase.ordinal}.`);
    ordinals.add(phase.ordinal);
    if (!Number.isInteger(phase.ordinal) || phase.ordinal < 1) errors.push(`Invalid phase ordinal: ${phase.id}.`);
    if (!positiveRange(phase.typicalMinutes)) errors.push(`Invalid phase time range: ${phase.id}.`);
  }

  for (const phaseId of pack.technology.canonicalPhaseIds) {
    if (!phaseIds.has(phaseId)) errors.push(`Technology references unknown phase: ${phaseId}.`);
  }

  for (const method of pack.methods) {
    if (methodIds.has(method.id)) errors.push(`Duplicate methodology method id: ${method.id}.`);
    methodIds.add(method.id);
    if (!positiveRange(method.typicalMinutes)) errors.push(`Invalid method time range: ${method.id}.`);
    for (const phaseId of method.compatibleTechnologyPhaseIds) {
      if (!phaseIds.has(phaseId)) errors.push(`Method ${method.id} references unknown phase: ${phaseId}.`);
    }
  }

  for (const technique of pack.techniques) {
    if (techniqueIds.has(technique.id)) errors.push(`Duplicate methodology technique id: ${technique.id}.`);
    techniqueIds.add(technique.id);
    if (!positiveRange(technique.typicalMinutes)) errors.push(`Invalid technique time range: ${technique.id}.`);
    for (const methodId of technique.methodIds) {
      if (!methodIds.has(methodId)) errors.push(`Technique ${technique.id} references unknown method: ${methodId}.`);
    }
  }

  for (const form of pack.forms) {
    if (formIds.has(form.id)) errors.push(`Duplicate organizational form id: ${form.id}.`);
    formIds.add(form.id);
    if (methodIds.has(form.id)) errors.push(`Organizational form ${form.id} must not also be a method.`);
  }

  return errors;
}

const allOutcomeKinds: OutcomeKind[] = [
  'KNOWLEDGE',
  'CAUSAL_EXPLANATION',
  'SOURCE_ANALYSIS',
  'COMPARISON',
  'DATA_INTERPRETATION',
  'CARTOGRAPHY',
  'MODELING',
  'ARGUMENTATION'
];

export const researchMethodologyPackV1: MethodologyPack = {
  id: 'methodology-research-v1',
  version: '1.0.0',
  title: 'Исследовательская технология · базовый пакет',
  status: 'PUBLISHED',
  provenance: {
    kind: 'PLATFORM_CURATED',
    title: 'Методический пакет Tehkarta: исследовательская технология',
    version: '1.0.0',
    notes: 'Платформенный методический справочник. Метод, приём и форма организации моделируются раздельно.'
  },
  technology: {
    id: 'research-technology',
    name: 'Исследовательская технология',
    description: 'Ученик проходит путь от проблемы и гипотезы к анализу доказательств, интерпретации и собственному проверяемому выводу.',
    canonicalPhaseIds: [
      'problem-framing',
      'research-question',
      'hypotheses',
      'evidence-plan',
      'evidence-analysis',
      'interpretation',
      'conclusion',
      'reflection'
    ],
    compatibleOutcomeKinds: allOutcomeKinds,
    constraints: [
      'Исследовательский цикл должен укладываться в реальное время урока.',
      'Источники и данные должны иметь понятное происхождение и быть доступны ученику.',
      'Вывод должен следовать из исследованных доказательств, а не быть заранее задан педагогом.'
    ],
    antiPatterns: [
      'Псевдоисследование: вывод заранее сообщён, а ученику остаётся только воспроизвести его.',
      'Групповая работа названа методом вместо формы организации.',
      'AI-реконструкция предъявлена как подлинный исторический источник.',
      'Задания перегружены действиями и не укладываются в отведённое время.'
    ]
  },
  phases: [
    { id: 'problem-framing', ordinal: 1, title: 'Проблематизация', purpose: 'Обнаружить противоречие или интеллектуальную трудность.', typicalMinutes: { min: 2, max: 4 } },
    { id: 'research-question', ordinal: 2, title: 'Исследовательский вопрос', purpose: 'Сформулировать вопрос, ответ на который требует доказательств.', typicalMinutes: { min: 2, max: 4 } },
    { id: 'hypotheses', ordinal: 3, title: 'Гипотезы', purpose: 'Предложить проверяемые объяснения до анализа полного набора доказательств.', typicalMinutes: { min: 3, max: 5 } },
    { id: 'evidence-plan', ordinal: 4, title: 'План и критерии доказательства', purpose: 'Определить, какие данные подтвердят или опровергнут гипотезу.', typicalMinutes: { min: 2, max: 4 } },
    { id: 'evidence-analysis', ordinal: 5, title: 'Анализ источников и данных', purpose: 'Извлечь факты, признаки, связи и ограничения доказательств.', typicalMinutes: { min: 8, max: 15 } },
    { id: 'interpretation', ordinal: 6, title: 'Интерпретация', purpose: 'Связать доказательства с вопросом и сопоставить объяснения.', typicalMinutes: { min: 5, max: 8 } },
    { id: 'conclusion', ordinal: 7, title: 'Вывод', purpose: 'Сформулировать аргументированный ответ и указать его доказательную основу.', typicalMinutes: { min: 3, max: 6 } },
    { id: 'reflection', ordinal: 8, title: 'Рефлексия способа исследования', purpose: 'Оценить качество доказательств и ход рассуждения.', typicalMinutes: { min: 2, max: 4 } }
  ],
  methods: [
    {
      id: 'source-analysis', name: 'Анализ исторических источников',
      description: 'Систематическое извлечение и проверка информации из исторического источника с учётом происхождения, позиции автора и контекста.',
      compatibleTechnologyPhaseIds: ['evidence-plan', 'evidence-analysis', 'interpretation'],
      compatibleOutcomeKinds: ['SOURCE_ANALYSIS', 'ARGUMENTATION', 'KNOWLEDGE', 'CAUSAL_EXPLANATION'],
      typicalMinutes: { min: 8, max: 15 }, preparation: ['Подобрать источник с установленным происхождением.', 'Подготовить вопрос или схему анализа.'],
      constraints: ['Объём и язык источника должны соответствовать возрасту и времени урока.'],
      antiPatterns: ['Не выдавать AI-реконструкцию за первичный исторический источник.', 'Не сводить анализ к поиску одной заранее известной цитаты.']
    },
    {
      id: 'comparative', name: 'Сравнительный метод',
      description: 'Сопоставление объектов по заранее определённым основаниям для выявления сходств, различий и объясняющих факторов.',
      compatibleTechnologyPhaseIds: ['evidence-plan', 'evidence-analysis', 'interpretation'],
      compatibleOutcomeKinds: ['COMPARISON', 'CAUSAL_EXPLANATION', 'ARGUMENTATION'],
      typicalMinutes: { min: 7, max: 12 }, preparation: ['Определить сопоставимые объекты и критерии.'],
      constraints: ['Критерии сравнения должны быть явными и одинаковыми для объектов.'],
      antiPatterns: ['Не подменять сравнение двумя независимыми пересказами.']
    },
    {
      id: 'statistical', name: 'Статистический метод',
      description: 'Анализ числовых рядов, динамики, долей и соотношений для проверки исторического объяснения.',
      compatibleTechnologyPhaseIds: ['evidence-plan', 'evidence-analysis', 'interpretation'],
      compatibleOutcomeKinds: ['DATA_INTERPRETATION', 'CAUSAL_EXPLANATION', 'ARGUMENTATION'],
      typicalMinutes: { min: 6, max: 12 }, preparation: ['Подготовить небольшую таблицу или график с указанием источника данных.'],
      constraints: ['Числа должны быть читаемы и достаточны для вывода без избыточных вычислений.'],
      antiPatterns: ['Не использовать статистику как декоративную иллюстрацию без вопроса к данным.']
    },
    {
      id: 'cartographic', name: 'Картографический метод',
      description: 'Анализ пространственного распределения, маршрутов, границ и изменений по карте как доказательству.',
      compatibleTechnologyPhaseIds: ['evidence-analysis', 'interpretation'],
      compatibleOutcomeKinds: ['CARTOGRAPHY', 'CAUSAL_EXPLANATION', 'COMPARISON'],
      typicalMinutes: { min: 6, max: 10 }, preparation: ['Подготовить карту с легендой, масштабом и понятным временным срезом.'],
      constraints: ['Карта должна отвечать исследовательскому вопросу, а не быть фоном.'],
      antiPatterns: ['Не считать простое нахождение объекта на карте полноценным картографическим анализом.']
    },
    {
      id: 'modeling', name: 'Моделирование',
      description: 'Построение упрощённой схемы процесса или системы для проверки связей между факторами.',
      compatibleTechnologyPhaseIds: ['hypotheses', 'evidence-plan', 'interpretation', 'conclusion'],
      compatibleOutcomeKinds: ['MODELING', 'CAUSAL_EXPLANATION', 'ARGUMENTATION'],
      typicalMinutes: { min: 8, max: 14 }, preparation: ['Задать элементы модели и правила связи между ними.'],
      constraints: ['Ученик должен понимать, что модель упрощает реальность и имеет границы применимости.'],
      antiPatterns: ['Не выдавать красивую схему без проверяемых связей за модель.']
    },
    {
      id: 'hypothesis-testing', name: 'Проверка гипотез',
      description: 'Выдвижение конкурирующих причинных объяснений и их проверка по источникам, данным или фактам.',
      compatibleTechnologyPhaseIds: ['hypotheses', 'evidence-plan', 'evidence-analysis', 'interpretation', 'conclusion'],
      compatibleOutcomeKinds: ['CAUSAL_EXPLANATION', 'ARGUMENTATION'],
      typicalMinutes: { min: 10, max: 16 }, preparation: ['Подготовить набор доказательств, позволяющий различать минимум две гипотезы.'],
      constraints: ['Нужен вопрос, допускающий проверку объяснений, а не только воспроизведение факта.'],
      antiPatterns: ['Не сообщать правильную гипотезу до анализа доказательств.']
    }
  ],
  techniques: [
    { id: 'hypothesis', name: 'Формулировка гипотезы', description: 'Краткое проверяемое предположение до полного анализа доказательств.', methodIds: ['hypothesis-testing', 'modeling'], instructions: ['Сформулировать предположение.', 'Указать, какое доказательство его поддержит или ослабит.'], typicalMinutes: { min: 2, max: 4 } },
    { id: 'source-passport', name: 'Паспорт источника', description: 'Фиксация автора, времени, типа, адресата и возможной позиции источника.', methodIds: ['source-analysis'], instructions: ['Определить происхождение.', 'Отметить позицию/ограничения.', 'Только затем извлекать доказательства.'], typicalMinutes: { min: 2, max: 4 } },
    { id: 'evidence-table', name: 'Таблица доказательств', description: 'Разделение фактов, их интерпретации и связи с гипотезой.', methodIds: ['source-analysis', 'comparative', 'statistical', 'hypothesis-testing'], instructions: ['Записать факт/данные.', 'Указать, что они доказывают.', 'Связать с вопросом или гипотезой.'], typicalMinutes: { min: 4, max: 7 } },
    { id: 'fact-evidence-conclusion', name: 'Факт → доказательство → вывод', description: 'Трёхшаговая конструкция аргумента, не позволяющая перескочить от мнения к выводу.', methodIds: ['source-analysis', 'statistical', 'cartographic', 'hypothesis-testing'], instructions: ['Назвать факт.', 'Объяснить его доказательную роль.', 'Сделать ограниченный вывод.'], typicalMinutes: { min: 3, max: 5 } },
    { id: 'competing-hypotheses', name: 'Конкурирующие гипотезы', description: 'Сопоставление двух или более объяснений по общему набору доказательств.', methodIds: ['hypothesis-testing', 'comparative'], instructions: ['Зафиксировать альтернативные объяснения.', 'Проверить каждое одинаковыми доказательствами.', 'Обосновать выбор или сочетание.'], typicalMinutes: { min: 4, max: 7 } },
    { id: 'mini-conclusion', name: 'Мини-вывод', description: 'Короткий промежуточный вывод после смыслового блока анализа.', methodIds: ['source-analysis', 'comparative', 'statistical', 'cartographic', 'modeling', 'hypothesis-testing'], instructions: ['Ответить одним-двумя предложениями: что уже доказано и чего пока недостаточно.'], typicalMinutes: { min: 1, max: 3 } },
    { id: 'cross-check', name: 'Перекрёстная проверка', description: 'Сопоставление вывода минимум по двум независимым типам доказательств.', methodIds: ['source-analysis', 'statistical', 'cartographic', 'hypothesis-testing'], instructions: ['Найти второе независимое доказательство.', 'Проверить, подтверждает ли оно тот же вывод или вводит ограничение.'], typicalMinutes: { min: 3, max: 6 } }
  ],
  forms: [
    { id: 'individual', name: 'Индивидуальная работа', participantPattern: '1 ученик → собственный анализ и ответ', constraints: ['Подходит для диагностики личного результата; сложные источники требуют опор.'] },
    { id: 'pair', name: 'Работа в паре', participantPattern: '2 ученика → совместная проверка доказательств', constraints: ['Нужна явная роль каждого или общий продукт.'] },
    { id: 'group', name: 'Групповая работа', participantPattern: '3–5 учеников → распределённый анализ и общий вывод', constraints: ['Группа — форма организации, а не метод.', 'Нужны роли или разделение доказательств; иначе часть учеников может выпадать из деятельности.'] },
    { id: 'frontal', name: 'Фронтальная работа', participantPattern: 'Класс + педагог → общий разбор', constraints: ['Педагог не должен выполнять интеллектуальную работу вместо учеников.'] },
    { id: 'rotating-groups', name: 'Ротация групп', participantPattern: 'Группы последовательно работают с разными наборами доказательств', constraints: ['Требует заметных переходов и подготовки материалов; не использовать при жёстком дефиците времени.'] }
  ]
};
