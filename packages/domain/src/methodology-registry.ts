import type { MethodologyPack, MethodologyPhase, OrganizationalFormDefinition, OutcomeKind } from './methodology.js';
import { researchMethodologyPackV1, validateMethodologyPack } from './methodology.js';

export interface MethodologyPackRegistry {
  get(packId: string, version?: string): MethodologyPack | undefined;
  getByTechnology(technologyId: string, version?: string): MethodologyPack | undefined;
  listPublished(): MethodologyPack[];
}

export class StaticMethodologyPackRegistry implements MethodologyPackRegistry {
  private readonly byRef = new Map<string, MethodologyPack>();
  private readonly packs: MethodologyPack[];

  constructor(packs: readonly MethodologyPack[]) {
    for (const pack of packs) {
      const errors = validateMethodologyPack(pack);
      if (errors.length > 0) throw new Error(`Invalid methodology pack ${pack.id}@${pack.version}: ${errors.join(' ')}`);
      const key = `${pack.id}@${pack.version}`;
      if (this.byRef.has(key)) throw new Error(`Duplicate methodology pack: ${key}.`);
      this.byRef.set(key, pack);
    }
    this.packs = [...packs];
  }

  get(packId: string, version?: string): MethodologyPack | undefined {
    if (version) return this.byRef.get(`${packId}@${version}`);
    return this.packs.find((pack) => pack.id === packId && pack.status === 'PUBLISHED');
  }

  getByTechnology(technologyId: string, version?: string): MethodologyPack | undefined {
    return this.packs.find((pack) => pack.technology.id === technologyId && (!version || pack.version === version));
  }

  listPublished(): MethodologyPack[] {
    return this.packs.filter((pack) => pack.status === 'PUBLISHED');
  }
}

const allOutcomes: OutcomeKind[] = ['KNOWLEDGE', 'CAUSAL_EXPLANATION', 'SOURCE_ANALYSIS', 'COMPARISON', 'DATA_INTERPRETATION', 'CARTOGRAPHY', 'MODELING', 'ARGUMENTATION'];
const commonForms: OrganizationalFormDefinition[] = [
  { id: 'individual', name: 'Индивидуальная работа', participantPattern: 'Один ученик выполняет и представляет собственное решение', constraints: ['Подходит для личной диагностики и рефлексии.'] },
  { id: 'pair', name: 'Работа в паре', participantPattern: 'Два ученика совместно проверяют решение', constraints: ['Нужно распределить действия или задать общий продукт.'] },
  { id: 'small-group', name: 'Малая группа', participantPattern: '3–5 учеников создают общий продукт', constraints: ['Нужны роли и индивидуальная ответственность.'] },
  { id: 'whole-class', name: 'Работа всем классом', participantPattern: 'Класс и педагог ведут общий разбор', constraints: ['Педагог не подменяет интеллектуальную работу учеников.'] },
  { id: 'rotating-groups', name: 'Ротация групп', participantPattern: 'Группы проходят несколько учебных станций', constraints: ['Требует не менее 10 минут и заранее подготовленных материалов.'] }
];

function pack(input: {
  id: string;
  title: string;
  technology: MethodologyPack['technology'];
  phases: MethodologyPhase[];
  methods: MethodologyPack['methods'];
  techniques: MethodologyPack['techniques'];
}): MethodologyPack {
  return {
    id: input.id,
    version: '1.0.0',
    title: input.title,
    status: 'PUBLISHED',
    provenance: { kind: 'PLATFORM_CURATED', title: input.title, version: '1.0.0', notes: 'Проверенный платформенный пакет Tehkarta; технология, методы, приёмы и формы разделены.' },
    technology: input.technology,
    phases: input.phases,
    methods: input.methods,
    techniques: input.techniques,
    forms: commonForms
  };
}

export const problemBasedMethodologyPackV1 = pack({
  id: 'methodology-problem-based-v1', title: 'Проблемное обучение · базовый пакет',
  technology: { id: 'problem-based-technology', name: 'Проблемное обучение', description: 'Ученики обнаруживают противоречие, формулируют проблему, проверяют версии и обосновывают решение.', canonicalPhaseIds: ['problem-situation', 'problem-formulation', 'versions', 'solution-search', 'verification', 'problem-conclusion', 'problem-reflection'], compatibleOutcomeKinds: allOutcomes, constraints: ['Проблема должна допускать несколько обоснованных версий.', 'Решение выводится учениками из доступных доказательств.'], antiPatterns: ['Педагог сообщает готовый ответ сразу после постановки вопроса.', 'Любой вопрос объявляется проблемной ситуацией без противоречия.'] },
  phases: [
    ['problem-situation', 'Проблемная ситуация', 'Обнаружить противоречие', 3, 5], ['problem-formulation', 'Формулировка проблемы', 'Назвать интеллектуальную трудность', 2, 4], ['versions', 'Гипотезы и версии', 'Предложить объяснения', 3, 6], ['solution-search', 'Поиск решения', 'Исследовать факты и способы', 10, 18], ['verification', 'Проверка', 'Сопоставить версии с доказательствами', 5, 8], ['problem-conclusion', 'Вывод', 'Обосновать решение проблемы', 3, 6], ['problem-reflection', 'Рефлексия', 'Оценить способ поиска', 2, 4]
  ].map(([id,title,purpose,min,max],i) => ({ id:id as string, ordinal:i+1, title:title as string, purpose:purpose as string, typicalMinutes:{min:min as number,max:max as number} })),
  methods: [
    { id:'heuristic-conversation', name:'Эвристическая беседа', description:'Система вопросов ведёт учеников к самостоятельному обнаружению связей.', compatibleTechnologyPhaseIds:['problem-situation','problem-formulation','verification'], compatibleOutcomeKinds:['KNOWLEDGE','CAUSAL_EXPLANATION','ARGUMENTATION'], typicalMinutes:{min:7,max:12}, preparation:['Подготовить цепочку вопросов и возможные ученические версии.'], constraints:['Вопросы не должны содержать готовый ответ.'], antiPatterns:['Фронтальный опрос на воспроизведение.'], focusSignals:['ENGAGEMENT','DEPTH'] },
    { id:'partial-search', name:'Частично-поисковый метод', description:'Ученики решают последовательность подзадач и собирают целостное решение.', compatibleTechnologyPhaseIds:['versions','solution-search','verification'], compatibleOutcomeKinds:['CAUSAL_EXPLANATION','SOURCE_ANALYSIS','MODELING'], typicalMinutes:{min:10,max:18}, preparation:['Разделить проблему на взаимосвязанные подзадачи.'], constraints:['Подзадачи должны вести к общему решению.'], antiPatterns:['Набор несвязанных упражнений.'], focusSignals:['ENGAGEMENT','META_SKILLS'] },
    { id:'problem-analysis', name:'Анализ проблемной ситуации', description:'Выделение условий, противоречий, интересов и ограничений проблемы.', compatibleTechnologyPhaseIds:['problem-situation','problem-formulation','solution-search'], compatibleOutcomeKinds:['CAUSAL_EXPLANATION','COMPARISON','ARGUMENTATION'], typicalMinutes:{min:8,max:14}, preparation:['Подготовить ситуацию и данные для анализа.'], constraints:['Все существенные условия доступны ученикам.'], antiPatterns:['Скрытые условия, известные только автору задания.'], focusSignals:['DEPTH','PRACTICAL_APPLICATION'] }
  ],
  techniques: [
    { id:'problem-tree', name:'Дерево проблемы', description:'Причины, проявления и последствия фиксируются в единой схеме.', methodIds:['problem-analysis','partial-search'], instructions:['Назвать центральную проблему.','Разделить причины и последствия.','Проверить связи фактами.'], typicalMinutes:{min:5,max:8} },
    { id:'version-board', name:'Доска версий', description:'Класс фиксирует версии и критерии их проверки.', methodIds:['heuristic-conversation','partial-search'], instructions:['Записать версии без оценки.','Назначить доказательства для проверки.','Вернуться к каждой версии.'], typicalMinutes:{min:4,max:7} },
    { id:'solution-criteria', name:'Критерии решения', description:'Ученики заранее определяют признаки обоснованного решения.', methodIds:['problem-analysis','partial-search'], instructions:['Определить ограничения.','Согласовать критерии.','Проверить решение по критериям.'], typicalMinutes:{min:3,max:6} }
  ]
});

export const criticalThinkingMethodologyPackV1 = pack({
  id:'methodology-critical-thinking-v1', title:'Развитие критического мышления · базовый пакет',
  technology:{ id:'critical-thinking-technology', name:'Технология развития критического мышления', description:'Вызов активирует исходные представления, осмысление организует работу с информацией, рефлексия перестраивает понимание.', canonicalPhaseIds:['challenge','meaning-construction','critical-reflection'], compatibleOutcomeKinds:allOutcomes, constraints:['Исходные представления учеников должны быть проявлены до предъявления нового содержания.','Рефлексия изменяет или уточняет первоначальную позицию.'], antiPatterns:['Фаза вызова превращена в сообщение темы.','Рефлексия сведена к эмоциональной оценке без работы со смыслом.'] },
  phases:[['challenge','Вызов','Актуализировать и проблематизировать исходное понимание',5,8],['meaning-construction','Осмысление','Критически обработать новые источники и аргументы',15,25],['critical-reflection','Рефлексия','Перестроить позицию и обосновать изменение',5,10]].map(([id,title,purpose,min,max],i)=>({id:id as string,ordinal:i+1,title:title as string,purpose:purpose as string,typicalMinutes:{min:min as number,max:max as number}})),
  methods:[
    { id:'contradictory-sources', name:'Анализ противоречивых источников', description:'Сопоставление свидетельств с различными позициями и основаниями.', compatibleTechnologyPhaseIds:['meaning-construction'], compatibleOutcomeKinds:['SOURCE_ANALYSIS','COMPARISON','ARGUMENTATION'], typicalMinutes:{min:12,max:20}, preparation:['Подобрать сопоставимые источники с установленным происхождением.'], constraints:['Различия позиций должны быть содержательными.'], antiPatterns:['Один источник объявлен заведомо правильным.'], focusSignals:['DEPTH'] },
    { id:'argumentative-discussion', name:'Аргументированная дискуссия', description:'Публичная проверка тезисов доказательствами и контраргументами.', compatibleTechnologyPhaseIds:['meaning-construction','critical-reflection'], compatibleOutcomeKinds:['ARGUMENTATION','CAUSAL_EXPLANATION'], typicalMinutes:{min:10,max:18}, preparation:['Задать предмет дискуссии и правила доказательства.'], constraints:['Оценивается аргумент, а не личность участника.'], antiPatterns:['Свободный обмен мнениями без доказательств.'], focusSignals:['ENGAGEMENT','META_SKILLS'] },
    { id:'cer-reasoning', name:'Тезис — доказательство — объяснение', description:'Построение проверяемого аргумента по структуре claim-evidence-reasoning.', compatibleTechnologyPhaseIds:['meaning-construction','critical-reflection'], compatibleOutcomeKinds:['ARGUMENTATION','SOURCE_ANALYSIS','DATA_INTERPRETATION'], typicalMinutes:{min:7,max:12}, preparation:['Подготовить набор допустимых доказательств.'], constraints:['Объяснение должно показывать связь тезиса и доказательства.'], antiPatterns:['Перечень фактов без объяснения.'], focusSignals:['DEPTH','META_SKILLS'] }
  ],
  techniques:[
    { id:'know-want-learned', name:'Знаю — хочу узнать — узнал', description:'Фиксация исходного знания, вопросов и изменения понимания.', methodIds:['contradictory-sources','cer-reasoning'], instructions:['Заполнить исходные колонки.','Вернуться после анализа.','Отметить изменения и новые вопросы.'], typicalMinutes:{min:4,max:7} },
    { id:'claim-evidence-reasoning', name:'CER-таблица', description:'Разделение тезиса, доказательства и объясняющей связи.', methodIds:['cer-reasoning','argumentative-discussion'], instructions:['Сформулировать тезис.','Выбрать релевантное доказательство.','Объяснить связь.'], typicalMinutes:{min:5,max:8} },
    { id:'double-entry-journal', name:'Двухчастный дневник', description:'Цитата или факт сопоставляется с интерпретацией и вопросом ученика.', methodIds:['contradictory-sources'], instructions:['Выбрать значимый фрагмент.','Записать интерпретацию.','Сформулировать вопрос или ограничение.'], typicalMinutes:{min:5,max:9} }
  ]
});

export const gameBasedMethodologyPackV1 = pack({
  id:'methodology-game-based-v1', title:'Игровая технология · базовый пакет',
  technology:{ id:'game-based-technology', name:'Игровая технология', description:'Учебная задача воплощается в цели, правилах, ролях и действиях, после которых проводится содержательный разбор.', canonicalPhaseIds:['game-goal','rules','roles','game-action','game-result','debriefing'], compatibleOutcomeKinds:allOutcomes, constraints:['Игровая цель обслуживает учебный результат.','После действия обязателен содержательный разбор.'], antiPatterns:['Соревнование ради баллов без предметного действия.','Роли закрепляют пассивность части учеников.'] },
  phases:[['game-goal','Игровая и учебная цель','Понять задачу и критерии результата',3,5],['rules','Правила','Установить ограничения и честные условия',2,4],['roles','Роли','Распределить ответственность участников',2,4],['game-action','Игровое действие','Решать предметную задачу в заданной модели',15,25],['game-result','Результат','Зафиксировать продукт и последствия решений',3,6],['debriefing','Дебрифинг','Перенести игровой опыт в предметный вывод',5,10]].map(([id,title,purpose,min,max],i)=>({id:id as string,ordinal:i+1,title:title as string,purpose:purpose as string,typicalMinutes:{min:min as number,max:max as number}})),
  methods:[
    { id:'role-simulation', name:'Ролевая симуляция', description:'Участники принимают решения из позиции исторических или социальных ролей.', compatibleTechnologyPhaseIds:['roles','game-action','debriefing'], compatibleOutcomeKinds:['CAUSAL_EXPLANATION','ARGUMENTATION','MODELING'], typicalMinutes:{min:15,max:25}, preparation:['Подготовить роли, ресурсы и ограничения.'], constraints:['Роли основаны на источниках и не превращаются в карикатуру.'], antiPatterns:['Отыгрыш без предметного выбора.'], focusSignals:['ENGAGEMENT','PRACTICAL_APPLICATION'] },
    { id:'case-game', name:'Игровой кейс', description:'Команды решают ограниченную практическую ситуацию и сравнивают последствия решений.', compatibleTechnologyPhaseIds:['game-goal','game-action','game-result'], compatibleOutcomeKinds:['CAUSAL_EXPLANATION','MODELING','ARGUMENTATION'], typicalMinutes:{min:12,max:20}, preparation:['Подготовить кейс, данные и критерии.'], constraints:['У решений должны быть проверяемые последствия.'], antiPatterns:['Единственный скрытый правильный ход.'], focusSignals:['PRACTICAL_APPLICATION','ENGAGEMENT'] },
    { id:'learning-quest', name:'Учебный квест', description:'Последовательность взаимозависимых предметных задач ведёт к общему результату.', compatibleTechnologyPhaseIds:['rules','game-action','game-result'], compatibleOutcomeKinds:['KNOWLEDGE','SOURCE_ANALYSIS','COMPARISON'], typicalMinutes:{min:15,max:25}, preparation:['Проверить маршрут, подсказки и доступность материалов.'], constraints:['Каждая станция содержит предметное действие.'], antiPatterns:['Поиск кодов без осмысления содержания.'], focusSignals:['ENGAGEMENT','META_SKILLS'] }
  ],
  techniques:[
    { id:'role-card', name:'Карточка роли', description:'Позиция, интересы, ресурсы и ограничения участника.', methodIds:['role-simulation','case-game'], instructions:['Прочитать позицию.','Выделить интересы и ограничения.','Обосновывать решения из роли.'], typicalMinutes:{min:3,max:5} },
    { id:'decision-token', name:'Жетон решения', description:'Ограниченный ресурс требует выбора приоритетного действия.', methodIds:['role-simulation','case-game'], instructions:['Оценить варианты.','Потратить ресурс на одно решение.','Объяснить отказ от альтернатив.'], typicalMinutes:{min:3,max:6} },
    { id:'debrief-circle', name:'Круг дебрифинга', description:'Участники отделяют игровой результат от предметного вывода.', methodIds:['role-simulation','case-game','learning-quest'], instructions:['Назвать принятое решение.','Объяснить последствия.','Связать опыт с учебным результатом.'], typicalMinutes:{min:5,max:8} }
  ]
});

export const methodologyPackRegistry = new StaticMethodologyPackRegistry([
  researchMethodologyPackV1,
  problemBasedMethodologyPackV1,
  criticalThinkingMethodologyPackV1,
  gameBasedMethodologyPackV1
]);
