import { approvedPedagogicalProfile, approvedValue, methodologyPackRegistry, type ApprovedPedagogicalProfile, type MethodSelection, type OrganizationalFormSelection, type PedagogicalTechnologySelection, type TechniqueSelection } from '@tehkarta/domain';
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
import type { ApprovedCourseLessonContext, CoursePlanningRepository } from './course-planning.js';

export type ScenarioPrerequisiteCode =
  | 'GOAL'
  | 'PROBLEM_QUESTION'
  | 'BIG_IDEA'
  | 'OUTCOME'
  | 'PEDAGOGICAL_PROFILE'
  | 'TECHNOLOGY'
  | 'METHOD'
  | 'FORM'
  | 'CURRICULUM_CORE'
  | 'UMK_MAPPING'
  | 'CONTENT_SELECTION'
  | 'COURSE_PLAN';

export interface ApprovedScenarioContext {
  course: {
    id: string;
    subject: string;
    grade: number;
    academicYear: string;
    title: string;
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
  pedagogicalProfile?: ApprovedPedagogicalProfile;
  methodology: {
    technology?: PedagogicalTechnologySelection;
    technologyRevision?: number;
    pedagogicalProfileRevision?: string;
    canonicalPhases: Array<{ id: string; title: string; purpose: string }>;
    methods: string[];
    techniques: string[];
    forms: string[];
    methodSelections: MethodSelection[];
    techniqueSelections: TechniqueSelection[];
    formSelections: OrganizationalFormSelection[];
  };
  content: {
    mandatoryRp: LessonCurriculumRequirement[];
    includedUmk: LessonUmkEvidenceItem[];
  };
  coursePlanning?: ApprovedCourseLessonContext;
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
  coursePlanning?: CoursePlanningRepository;
}

function approvedList(fields: ReadonlyArray<{ value: string; meta: { status: string } }>): string[] {
  return fields
    .filter((field) => field.meta.status === 'APPROVED')
    .map((field) => field.value.trim())
    .filter(Boolean);
}

function currentMethodology(lesson: import('@tehkarta/domain').Lesson) {
  const technology = approvedValue(lesson.pedagogicalTechnology);
  const technologyRevision = lesson.pedagogicalTechnology?.meta.revision;
  const profileRevision = [lesson.pedagogicalProfile.style?.meta.revision ?? 0, lesson.pedagogicalProfile.communicationTone?.meta.revision ?? 0, lesson.pedagogicalProfile.focus?.meta.revision ?? 0].join('-');
  const methods = lesson.selectedMethods.filter((field) => field.meta.status === 'APPROVED' && technology && field.value.technologyId === technology.technologyId && field.value.methodologyPackId === technology.methodologyPackId && field.value.methodologyPackVersion === technology.methodologyPackVersion && field.value.technologyRevision === technologyRevision && field.value.pedagogicalProfileRevision === profileRevision).map((field) => field.value);
  const methodIds = new Set(methods.map((item) => item.methodId));
  const techniques = lesson.selectedTechniques.filter((field) => field.meta.status === 'APPROVED' && methodIds.has(field.value.methodId) && technology && field.value.methodologyPackId === technology.methodologyPackId && field.value.methodologyPackVersion === technology.methodologyPackVersion).map((field) => field.value);
  const forms = lesson.selectedForms.filter((field) => field.meta.status === 'APPROVED' && methodIds.has(field.value.methodId) && technology && field.value.methodologyPackId === technology.methodologyPackId && field.value.methodologyPackVersion === technology.methodologyPackVersion).map((field) => field.value);
  const pack = technology ? methodologyPackRegistry.get(technology.methodologyPackId, technology.methodologyPackVersion) : undefined;
  return { technology, technologyRevision, methods, techniques, forms, phases: pack?.phases.map(({ id, title, purpose }) => ({ id, title, purpose })) ?? [] };
}

export class BuildApprovedScenarioContext {
  constructor(private readonly deps: ApprovedScenarioContextDependencies) {}

  async execute(context: RequestContext, lessonId: string): Promise<ApprovedScenarioContext> {
    const lesson = await this.deps.lessons.getById(context, lessonId);
    if (!lesson) {
      throw new ApplicationError('NOT_FOUND', `Lesson ${lessonId} was not found.`);
    }

    const [course, contentContext, coursePlanning] = await Promise.all([
      this.deps.courses.getById(context, lesson.courseId),
      this.deps.contentContext.getForLesson(context, lesson.id),
      this.deps.coursePlanning
        ? this.deps.coursePlanning.getApprovedLessonContext(context, lesson.courseId, lesson.id)
        : Promise.resolve(null)
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
    const profile = approvedPedagogicalProfile(lesson.pedagogicalProfile);
    const methodology = currentMethodology(lesson);
    const mandatoryRp = contentContext.curriculumRequirements;
    const includedIds = new Set(contentContext.approvedContentSet.includedUmkMappingIds);
    const includedUmk = contentContext.umkEvidence.filter((item) => includedIds.has(item.mappingId));

    const missing: ScenarioPrerequisiteCode[] = [];
    if (!coursePlanning) missing.push('COURSE_PLAN');
    if (!goal) missing.push('GOAL');
    if (!problemQuestion) missing.push('PROBLEM_QUESTION');
    if (!bigIdea) missing.push('BIG_IDEA');
    if (outcomes.length === 0) missing.push('OUTCOME');
    if (!profile) missing.push('PEDAGOGICAL_PROFILE');
    if (!methodology.technology) missing.push('TECHNOLOGY');
    if (methodology.methods.length === 0) missing.push('METHOD');
    if (methodology.forms.length === 0) missing.push('FORM');
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
      ...(profile ? { pedagogicalProfile: profile } : {}),
      methodology: {
        ...(methodology.technology && methodology.technologyRevision !== undefined ? { technology: methodology.technology, technologyRevision: methodology.technologyRevision } : {}),
        ...(profile ? { pedagogicalProfileRevision: [lesson.pedagogicalProfile.style?.meta.revision ?? 0, lesson.pedagogicalProfile.communicationTone?.meta.revision ?? 0, lesson.pedagogicalProfile.focus?.meta.revision ?? 0].join('-') } : {}),
        canonicalPhases: methodology.phases,
        methods: methodology.methods.map((item) => item.name),
        techniques: methodology.techniques.map((item) => item.name),
        forms: methodology.forms.map((item) => item.name),
        methodSelections: methodology.methods,
        techniqueSelections: methodology.techniques,
        formSelections: methodology.forms
      },
      content: {
        mandatoryRp,
        includedUmk
      },
      ...(coursePlanning ? { coursePlanning } : {}),
      readiness: {
        canGenerateScenario: missing.length === 0,
        missing,
        undecidedUmkCount: contentContext.approvedContentSet.undecidedUmkMappingIds.length,
        excludedUmkCount: contentContext.approvedContentSet.excludedUmkMappingIds.length
      }
    };
  }
}
