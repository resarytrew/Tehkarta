import { approvedValue } from '@tehkarta/domain';
import type { RequestContext } from '@tehkarta/ports';
import {
  ApplicationError,
  type CourseRepository,
  type LessonRepository
} from './index.js';
import type {
  LessonContentContextRepository,
  LessonCurriculumRequirement,
  LessonUmkEvidenceItem
} from './content-context.js';

export type ScenarioPrerequisiteCode =
  | 'GOAL'
  | 'PROBLEM_QUESTION'
  | 'OUTCOME'
  | 'METHOD'
  | 'CURRICULUM_CORE'
  | 'UMK_MAPPING'
  | 'CONTENT_SELECTION';

export interface ApprovedScenarioContext {
  course: {
    id: string;
    subject: string;
    grade: number;
    academicYear: string;
    title: string;
  };
  sourcePacks: {
    curriculum: { id: string; version: string; title: string };
    content: { id: string; version: string; title: string };
  };
  section: {
    id: string;
    title: string;
    plannedHours: number;
  };
  lesson: {
    id: string;
    version: number;
    title: string;
    order: number;
    durationMinutes: number;
    designFreedom: {
      mode: string;
      contentFreedom: string;
      methodFreedom: string;
    };
  };
  concept: {
    goal?: string;
    problemQuestion?: string;
    bigIdea?: string;
  };
  outcomes: string[];
  methodology: {
    methods: string[];
    techniques: string[];
    forms: string[];
  };
  content: {
    mandatoryRp: LessonCurriculumRequirement[];
    includedUmk: LessonUmkEvidenceItem[];
  };
  readiness: {
    canGenerateScenario: boolean;
    missing: ScenarioPrerequisiteCode[];
    undecidedUmkCount: number;
    excludedUmkCount: number;
  };
}

export interface ApprovedScenarioContextDependencies {
  lessons: LessonRepository;
  courses: CourseRepository;
  contentContext: LessonContentContextRepository;
}

function approvedList(fields: ReadonlyArray<{ value: string; meta: { status: string } }>): string[] {
  return fields
    .filter((field) => field.meta.status === 'APPROVED')
    .map((field) => field.value.trim())
    .filter(Boolean);
}

export class BuildApprovedScenarioContext {
  constructor(private readonly deps: ApprovedScenarioContextDependencies) {}

  async execute(context: RequestContext, lessonId: string): Promise<ApprovedScenarioContext> {
    const lesson = await this.deps.lessons.getById(context, lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${lessonId} was not found.`);
    }

    const [course, contentContext] = await Promise.all([
      this.deps.courses.getById(context, lesson.courseId),
      this.deps.contentContext.getForLesson(context, lesson.id)
    ]);
    if (!course || !contentContext) {
      throw new ApplicationError(
        'NOT_FOUND',
        `Course or content context for lesson ${lesson.id} was not found.`
      );
    }

    const section = course.sections.find((item) => item.id === lesson.sectionId);
    if (!section) {
      throw new ApplicationError(
        'NOT_FOUND',
        `Section ${lesson.sectionId} for lesson ${lesson.id} was not found.`
      );
    }

    const goal = approvedValue(lesson.goal)?.trim();
    const problemQuestion = approvedValue(lesson.problemQuestion)?.trim();
    const bigIdea = approvedValue(lesson.bigIdea)?.trim();
    const outcomes = approvedList(lesson.outcomes);
    const methods = approvedList(lesson.selectedMethods);
    const techniques = approvedList(lesson.selectedTechniques);
    const forms = approvedList(lesson.selectedForms);
    const mandatoryRp = contentContext.curriculumRequirements;
    const includedIds = new Set(contentContext.approvedContentSet.includedUmkMappingIds);
    const includedUmk = contentContext.umkEvidence.filter((item) => includedIds.has(item.mappingId));

    const missing: ScenarioPrerequisiteCode[] = [];
    if (!goal) missing.push('GOAL');
    if (!problemQuestion) missing.push('PROBLEM_QUESTION');
    if (outcomes.length === 0) missing.push('OUTCOME');
    if (methods.length === 0) missing.push('METHOD');
    if (mandatoryRp.length === 0) missing.push('CURRICULUM_CORE');
    if (contentContext.umkEvidence.length === 0) missing.push('UMK_MAPPING');
    if (contentContext.approvedContentSet.undecidedUmkMappingIds.length > 0) {
      missing.push('CONTENT_SELECTION');
    }

    return {
      course: {
        id: course.id,
        subject: course.subject,
        grade: course.grade,
        academicYear: course.academicYear,
        title: course.title
      },
      sourcePacks: {
        curriculum: contentContext.curriculumPack,
        content: contentContext.contentPack
      },
      section: {
        id: section.id,
        title: section.title,
        plannedHours: section.plannedHours
      },
      lesson: {
        id: lesson.id,
        version: lesson.version,
        title: lesson.title,
        order: lesson.order,
        durationMinutes: lesson.durationMinutes,
        designFreedom: lesson.designFreedom
      },
      concept: {
        ...(goal ? { goal } : {}),
        ...(problemQuestion ? { problemQuestion } : {}),
        ...(bigIdea ? { bigIdea } : {})
      },
      outcomes,
      methodology: {
        methods,
        techniques,
        forms
      },
      content: {
        mandatoryRp,
        includedUmk
      },
      readiness: {
        canGenerateScenario: missing.length === 0,
        missing,
        undecidedUmkCount: contentContext.approvedContentSet.undecidedUmkMappingIds.length,
        excludedUmkCount: contentContext.approvedContentSet.excludedUmkMappingIds.length
      }
    };
  }
}
