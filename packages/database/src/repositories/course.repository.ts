import { ApplicationError, type CourseRepository } from '@tehkarta/application';
import type { Course, Section } from '@tehkarta/domain';
import type { OptimisticWriteOptions, RequestContext } from '@tehkarta/ports';
import type { Pool } from 'pg';

interface CourseRow {
  id: string;
  workspace_id: string;
  version: number;
  subject: string;
  grade: number;
  academic_year: string;
  title: string;
  curriculum_pack_id: string;
  curriculum_pack_version: string;
  content_pack_id: string;
  content_pack_version: string;
}

interface SectionRow {
  id: string;
  title: string;
  planned_hours: number;
  curriculum_section_id: string | null;
}

interface LessonIdRow {
  section_id: string;
  id: string;
}

interface RequirementRow {
  curriculum_section_id: string;
  requirement_id: string;
}

export class PostgresCourseRepository implements CourseRepository {
  constructor(private readonly pool: Pool) {}

  async getById(context: RequestContext, courseId: string): Promise<Course | null> {
    const courseResult = await this.pool.query<CourseRow>(
      `SELECT id, workspace_id, version, subject, grade, academic_year, title,
              curriculum_pack_id, curriculum_pack_version,
              content_pack_id, content_pack_version
       FROM courses
       WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
      [courseId, context.workspaceId]
    );

    const courseRow = courseResult.rows[0];
    if (!courseRow) return null;

    const sectionsResult = await this.pool.query<SectionRow>(
      `SELECT id, title, planned_hours::float8 AS planned_hours, curriculum_section_id
       FROM course_sections
       WHERE course_id = $1 AND workspace_id = $2 AND archived_at IS NULL
       ORDER BY position`,
      [courseId, context.workspaceId]
    );

    const lessonsResult = await this.pool.query<LessonIdRow>(
      `SELECT section_id, id
       FROM lessons
       WHERE course_id = $1 AND workspace_id = $2 AND archived_at IS NULL
       ORDER BY section_id, position`,
      [courseId, context.workspaceId]
    );

    const curriculumSectionIds = sectionsResult.rows
      .map((section) => section.curriculum_section_id)
      .filter((id): id is string => Boolean(id));

    let requirementRows: RequirementRow[] = [];
    if (curriculumSectionIds.length > 0) {
      const requirementsResult = await this.pool.query<RequirementRow>(
        `SELECT curriculum_section_id, requirement_id
         FROM curriculum_requirement_allocations
         WHERE curriculum_section_id = ANY($1::text[])`,
        [curriculumSectionIds]
      );
      requirementRows = requirementsResult.rows;
    }

    const lessonIdsBySection = new Map<string, string[]>();
    for (const lesson of lessonsResult.rows) {
      const list = lessonIdsBySection.get(lesson.section_id) ?? [];
      list.push(lesson.id);
      lessonIdsBySection.set(lesson.section_id, list);
    }

    const requirementIdsByTemplate = new Map<string, string[]>();
    for (const requirement of requirementRows) {
      const list = requirementIdsByTemplate.get(requirement.curriculum_section_id) ?? [];
      list.push(requirement.requirement_id);
      requirementIdsByTemplate.set(requirement.curriculum_section_id, list);
    }

    const sections: Section[] = sectionsResult.rows.map((section) => ({
      id: section.id,
      title: section.title,
      plannedHours: section.planned_hours,
      lessonIds: lessonIdsBySection.get(section.id) ?? [],
      requirementIds: section.curriculum_section_id
        ? requirementIdsByTemplate.get(section.curriculum_section_id) ?? []
        : []
    }));

    return {
      id: courseRow.id,
      workspaceId: courseRow.workspace_id,
      version: courseRow.version,
      subject: courseRow.subject,
      grade: courseRow.grade,
      academicYear: courseRow.academic_year,
      title: courseRow.title,
      curriculumPackId: courseRow.curriculum_pack_id,
      curriculumPackVersion: courseRow.curriculum_pack_version,
      contentPackId: courseRow.content_pack_id,
      contentPackVersion: courseRow.content_pack_version,
      sections
    };
  }

  async save(
    context: RequestContext,
    course: Course,
    options: OptimisticWriteOptions
  ): Promise<Course> {
    if (course.workspaceId !== context.workspaceId) {
      throw new ApplicationError('FORBIDDEN', 'Course belongs to another workspace.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ version: number }>(
        `UPDATE courses
         SET title = $1,
             subject = $2,
             grade = $3,
             academic_year = $4,
             version = version + 1,
             updated_at = now()
         WHERE id = $5 AND workspace_id = $6 AND version = $7 AND archived_at IS NULL
         RETURNING version`,
        [
          course.title,
          course.subject,
          course.grade,
          course.academicYear,
          course.id,
          context.workspaceId,
          options.expectedVersion
        ]
      );

      const nextVersion = updated.rows[0]?.version;
      if (nextVersion === undefined) {
        const exists = await client.query(
          'SELECT 1 FROM courses WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL',
          [course.id, context.workspaceId]
        );
        throw new ApplicationError(
          exists.rowCount ? 'STALE_VERSION' : 'NOT_FOUND',
          exists.rowCount
            ? `Course ${course.id} was modified by another request.`
            : `Course ${course.id} was not found.`
        );
      }

      for (const [position, section] of course.sections.entries()) {
        await client.query(
          `INSERT INTO course_sections (
             id, workspace_id, course_id, position, title, planned_hours, version,
             created_at, updated_at, archived_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 1, now(), now(), NULL)
           ON CONFLICT (id) DO UPDATE SET
             position = EXCLUDED.position,
             title = EXCLUDED.title,
             planned_hours = EXCLUDED.planned_hours,
             version = course_sections.version + 1,
             updated_at = now(),
             archived_at = NULL
           WHERE course_sections.workspace_id = EXCLUDED.workspace_id
             AND course_sections.course_id = EXCLUDED.course_id`,
          [section.id, context.workspaceId, course.id, position + 1, section.title, section.plannedHours]
        );
      }

      const activeSectionIds = course.sections.map((section) => section.id);
      if (activeSectionIds.length === 0) {
        await client.query(
          `UPDATE course_sections SET archived_at = now(), updated_at = now()
           WHERE course_id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
          [course.id, context.workspaceId]
        );
      } else {
        await client.query(
          `UPDATE course_sections SET archived_at = now(), updated_at = now()
           WHERE course_id = $1 AND workspace_id = $2 AND archived_at IS NULL
             AND NOT (id = ANY($3::text[]))`,
          [course.id, context.workspaceId, activeSectionIds]
        );
      }

      await client.query('COMMIT');
      return { ...course, version: nextVersion };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
