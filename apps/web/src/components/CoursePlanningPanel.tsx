import { useState } from 'react';
import type {
  Course,
  CourseLessonProgression,
  CoursePlanningSnapshot,
  CourseSourceRole,
  LessonSummary
} from '../types.js';

interface Props {
  course: Course;
  lessons: LessonSummary[];
  snapshot: CoursePlanningSnapshot;
  busyAction: string | null;
  onSave(input: {
    expectedRevision: number;
    goals: string[];
    plannedOutcomes: string[];
    contentSummary: string;
    lessons: CourseLessonProgression[];
  }): Promise<void>;
  onApprove(): Promise<void>;
  onUpload(input: {
    file: File;
    title: string;
    sourceRole: CourseSourceRole;
    rightsBasis: string;
  }): Promise<void>;
  onApproveSource(bindingId: string): Promise<void>;
  onOpenLesson(lessonId: string): void;
}

const sourceRoleLabels: Record<CourseSourceRole, string> = {
  WORKING_PROGRAM: 'Рабочая программа',
  TEXTBOOK: 'Учебник',
  METHOD_GUIDE: 'Методическое пособие',
  ATLAS: 'Атлас',
  WORKBOOK: 'Рабочая тетрадь',
  ASSESSMENT: 'Оценочные материалы',
  OTHER: 'Другой источник'
};

const progressLabels = {
  PLANNED: 'Запланирован',
  TAUGHT: 'Изучен',
  ASSESSED: 'Изучен и проверен'
} as const;

function lines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function csv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function initialLessons(snapshot: CoursePlanningSnapshot, lessons: LessonSummary[]): CourseLessonProgression[] {
  if (snapshot.plan) return snapshot.plan.lessons;
  return [...lessons]
    .sort((a, b) => a.order - b.order)
    .map((lesson) => ({
      lessonId: lesson.id,
      position: lesson.order,
      topic: lesson.title,
      contentSummary: '',
      concepts: [],
      dates: [],
      personalities: [],
      expectedOutcomes: [],
      progressStatus: 'PLANNED'
    }));
}

export function CoursePlanningPanel({
  course,
  lessons,
  snapshot,
  busyAction,
  onSave,
  onApprove,
  onUpload,
  onApproveSource,
  onOpenLesson
}: Props) {
  const [goals, setGoals] = useState(() => snapshot.plan?.goals.join('\n') ?? '');
  const [plannedOutcomes, setPlannedOutcomes] = useState(
    () => snapshot.plan?.plannedOutcomes.join('\n') ?? ''
  );
  const [contentSummary, setContentSummary] = useState(() => snapshot.plan?.contentSummary ?? '');
  const [progressions, setProgressions] = useState(() => initialLessons(snapshot, lessons));
  const [dirty, setDirty] = useState(false);
  const [sourceRole, setSourceRole] = useState<CourseSourceRole>('WORKING_PROGRAM');
  const [sourceTitle, setSourceTitle] = useState('');
  const [rightsBasis, setRightsBasis] = useState('TEACHER_PROVIDED_FOR_EDUCATIONAL_USE');
  const [file, setFile] = useState<File | null>(null);

  function changeProgression(
    lessonId: string,
    change: (current: CourseLessonProgression) => CourseLessonProgression
  ): void {
    setProgressions((current) => current.map((item) => (item.lessonId === lessonId ? change(item) : item)));
    setDirty(true);
  }

  async function save(): Promise<void> {
    await onSave({
      expectedRevision: snapshot.plan?.revision ?? 0,
      goals: lines(goals),
      plannedOutcomes: lines(plannedOutcomes),
      contentSummary,
      lessons: progressions
    });
    setDirty(false);
  }

  async function upload(): Promise<void> {
    if (!file) return;
    await onUpload({
      file,
      title: sourceTitle.trim() || file.name,
      sourceRole,
      rightsBasis
    });
    setFile(null);
    setSourceTitle('');
  }

  const firstLessonId = [...lessons].sort((a, b) => a.order - b.order)[0]?.id;

  return (
    <div className="course-planning">
      <header className="course-planning__hero">
        <div>
          <span className="eyebrow">Системное проектирование · до урока</span>
          <h1>План учебного курса</h1>
          <p>{course.title} · {course.grade} класс · {course.academicYear}</p>
        </div>
        <div className={`course-plan-status ${snapshot.plan?.status === 'APPROVED' ? 'is-approved' : ''}`}>
          <span>{snapshot.plan?.status === 'APPROVED' ? 'Утверждён' : 'Черновик'}</span>
          <strong>редакция {snapshot.plan?.revision ?? 0}</strong>
        </div>
      </header>

      <section className="course-plan-readiness">
        <div>
          <strong>{snapshot.readiness.canDesignLessons ? 'Курс готов к проектированию уроков' : 'Сначала завершите план курса'}</strong>
          <p>AI получает только утверждённый план, отмеченные как изученные предыдущие уроки и разрешённые документы.</p>
        </div>
        <span>{snapshot.readiness.approvedSourceCount} источников разрешено</span>
      </section>
      {snapshot.readiness.missing.length > 0 ? (
        <ul className="course-plan-missing">
          {snapshot.readiness.missing.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}

      <div className="course-plan-grid">
        <section className="course-plan-card">
          <div className="course-plan-card__heading"><span>01</span><div><h2>Цели и результаты курса</h2><p>По одному утверждению на строку.</p></div></div>
          <label>Цели курса<textarea value={goals} onChange={(event) => { setGoals(event.target.value); setDirty(true); }} placeholder="Сформировать целостное понимание…" /></label>
          <label>Планируемые результаты<textarea value={plannedOutcomes} onChange={(event) => { setPlannedOutcomes(event.target.value); setDirty(true); }} placeholder="Ученик объясняет…" /></label>
          <label>Логика и содержание курса<textarea value={contentSummary} onChange={(event) => { setContentSummary(event.target.value); setDirty(true); }} placeholder="Ключевые содержательные линии и последовательность…" /></label>
        </section>

        <section className="course-plan-card">
          <div className="course-plan-card__heading"><span>02</span><div><h2>Документы и источники</h2><p>PDF, TXT или Markdown до 10 МБ. После загрузки явно разрешите использование.</p></div></div>
          <div className="source-upload-grid">
            <label>Тип документа<select value={sourceRole} onChange={(event) => setSourceRole(event.target.value as CourseSourceRole)}>{Object.entries(sourceRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Название<input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Можно оставить пустым" /></label>
            <label>Основание использования<select value={rightsBasis} onChange={(event) => setRightsBasis(event.target.value)}><option value="TEACHER_PROVIDED_FOR_EDUCATIONAL_USE">Предоставлено педагогом для учебной работы</option><option value="OPEN_LICENSE">Открытая лицензия</option><option value="PUBLIC_DOMAIN">Общественное достояние</option></select></label>
            <label className="file-picker">Файл<input type="file" accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
            <button className="button button-primary" type="button" disabled={!file || busyAction === 'upload'} onClick={() => void upload().catch(() => undefined)}>{busyAction === 'upload' ? 'Разбираем документ…' : 'Загрузить и извлечь текст'}</button>
          </div>
          <div className="course-source-list">
            {snapshot.sources.map((source) => (
              <article key={source.bindingId}>
                <div><span>{sourceRoleLabels[source.sourceRole]}</span><strong>{source.title}</strong><small>{source.pageCount ? `${source.pageCount} стр. · ` : ''}{source.fragmentCount} фрагм. · {(source.byteSize / 1024).toFixed(0)} КБ</small></div>
                {source.status === 'APPROVED' ? <span className="source-approved">✓ Разрешён AI</span> : <button className="button button-secondary" type="button" disabled={busyAction === source.bindingId} onClick={() => void onApproveSource(source.bindingId).catch(() => undefined)}>Разрешить использовать</button>}
              </article>
            ))}
            {snapshot.sources.length === 0 ? <p className="empty-copy">Документы ещё не загружены.</p> : null}
          </div>
        </section>
      </div>

      <section className="course-plan-card course-progression">
        <div className="course-plan-card__heading"><span>03</span><div><h2>Прогрессия по урокам</h2><p>Понятия и факты из уроков со статусом «Изучен» становятся памятью следующего урока.</p></div></div>
        <div className="course-progression-list">
          {progressions.map((item) => (
            <article key={item.lessonId}>
              <div className="course-progression__top"><span>{String(item.position).padStart(2, '0')}</span><input aria-label={`Тема урока ${item.position}`} value={item.topic} onChange={(event) => changeProgression(item.lessonId, (current) => ({ ...current, topic: event.target.value }))}/><select aria-label={`Статус урока ${item.position}`} value={item.progressStatus} onChange={(event) => changeProgression(item.lessonId, (current) => ({ ...current, progressStatus: event.target.value as CourseLessonProgression['progressStatus'] }))}>{Object.entries(progressLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <textarea aria-label={`Содержание урока ${item.position}`} value={item.contentSummary} onChange={(event) => changeProgression(item.lessonId, (current) => ({ ...current, contentSummary: event.target.value }))} placeholder="Краткое содержание и смысловой фокус" />
              <div className="course-progression__fields">
                <label>Понятия<input value={item.concepts.join(', ')} onChange={(event) => changeProgression(item.lessonId, (current) => ({ ...current, concepts: csv(event.target.value) }))} /></label>
                <label>Даты<input value={item.dates.join(', ')} onChange={(event) => changeProgression(item.lessonId, (current) => ({ ...current, dates: csv(event.target.value) }))} /></label>
                <label>Персоналии<input value={item.personalities.join(', ')} onChange={(event) => changeProgression(item.lessonId, (current) => ({ ...current, personalities: csv(event.target.value) }))} /></label>
                <label>Результаты урока<input value={item.expectedOutcomes.join(', ')} onChange={(event) => changeProgression(item.lessonId, (current) => ({ ...current, expectedOutcomes: csv(event.target.value) }))} /></label>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="course-plan-actions">
        <button className="button button-secondary" type="button" disabled={busyAction !== null} onClick={() => void save().catch(() => undefined)}>{busyAction === 'save' ? 'Сохраняем…' : 'Сохранить черновик'}</button>
        <button className="button button-primary" type="button" disabled={!snapshot.plan || dirty || busyAction !== null || snapshot.plan.status === 'APPROVED'} onClick={() => void onApprove().catch(() => undefined)}>{busyAction === 'approve' ? 'Утверждаем…' : 'Утвердить план курса'}</button>
        <button className="button button-primary" type="button" disabled={!snapshot.readiness.canDesignLessons || !firstLessonId} onClick={() => firstLessonId && onOpenLesson(firstLessonId)}>Перейти к проектированию уроков →</button>
      </footer>
    </div>
  );
}
