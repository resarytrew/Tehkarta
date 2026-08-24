BEGIN;

ALTER TABLE lesson_decisions
  ADD CONSTRAINT lesson_technology_selection_shape CHECK (
    semantic_key <> 'pedagogicalTechnology'
    OR (
      jsonb_typeof(value_json) = 'object'
      AND value_json ? 'technologyId'
      AND value_json ? 'name'
      AND value_json ? 'methodologyPackId'
      AND value_json ? 'methodologyPackVersion'
    )
  );

WITH converted AS (
  UPDATE lesson_decisions
  SET value_json = jsonb_build_object(
        'methodId', CASE value_json #>> '{}' 
          WHEN 'Анализ исторических источников' THEN 'source-analysis'
          WHEN 'Сравнительный метод' THEN 'comparative'
          WHEN 'Статистический метод' THEN 'statistical'
          WHEN 'Картографический метод' THEN 'cartographic'
          WHEN 'Моделирование' THEN 'modeling'
          WHEN 'Проверка гипотез' THEN 'hypothesis-testing'
        END,
        'name', value_json #>> '{}',
        'technologyId', 'research-technology',
        'methodologyPackId', 'methodology-research-v1',
        'methodologyPackVersion', '1.0.0',
        'targetOutcomeFieldId', 'system-migration-unknown',
        'targetOutcomeRevision', 0,
        'technologyRevision', 1,
        'pedagogicalProfileRevision', '0-0-0'
      ),
      revision = revision + 1,
      source = 'SYSTEM',
      updated_at = now()
  WHERE semantic_key = 'method'
    AND jsonb_typeof(value_json) = 'string'
    AND value_json #>> '{}' IN ('Анализ исторических источников','Сравнительный метод','Статистический метод','Картографический метод','Моделирование','Проверка гипотез')
  RETURNING *
)
INSERT INTO lesson_decision_revisions(id, workspace_id, decision_id, lesson_id, revision, value_json, source, status, actor_user_id, occurred_at, reason)
SELECT id || ':r' || revision, workspace_id, id, lesson_id, revision, value_json, source, status, updated_by, updated_at, 'SYSTEM_MIGRATION: attach semantic research methodology identity'
FROM converted
ON CONFLICT (decision_id, revision) DO NOTHING;

WITH converted AS (
  UPDATE lesson_decisions AS decision
  SET value_json = jsonb_build_object(
        'techniqueId', CASE decision.value_json #>> '{}'
          WHEN 'Формулировка гипотезы' THEN 'hypothesis'
          WHEN 'Паспорт источника' THEN 'source-passport'
          WHEN 'Таблица доказательств' THEN 'evidence-table'
          WHEN 'Факт → доказательство → вывод' THEN 'fact-evidence-conclusion'
          WHEN 'Конкурирующие гипотезы' THEN 'competing-hypotheses'
          WHEN 'Мини-вывод' THEN 'mini-conclusion'
          WHEN 'Перекрёстная проверка' THEN 'cross-check'
        END,
        'name', decision.value_json #>> '{}',
        'methodId', COALESCE((SELECT method.value_json->>'methodId' FROM lesson_decisions method WHERE method.lesson_id=decision.lesson_id AND method.semantic_key='method' AND jsonb_typeof(method.value_json)='object' ORDER BY method.ordinal LIMIT 1),'system-migration-unknown'),
        'methodologyPackId', 'methodology-research-v1',
        'methodologyPackVersion', '1.0.0'
      ), revision=revision+1, source='SYSTEM', updated_at=now()
  WHERE decision.semantic_key='technique' AND jsonb_typeof(decision.value_json)='string'
    AND decision.value_json #>> '{}' IN ('Формулировка гипотезы','Паспорт источника','Таблица доказательств','Факт → доказательство → вывод','Конкурирующие гипотезы','Мини-вывод','Перекрёстная проверка')
  RETURNING decision.*
)
INSERT INTO lesson_decision_revisions(id,workspace_id,decision_id,lesson_id,revision,value_json,source,status,actor_user_id,occurred_at,reason)
SELECT id||':r'||revision,workspace_id,id,lesson_id,revision,value_json,source,status,updated_by,updated_at,'SYSTEM_MIGRATION: attach semantic research technique identity' FROM converted
ON CONFLICT (decision_id,revision) DO NOTHING;

WITH converted AS (
  UPDATE lesson_decisions AS decision
  SET value_json = jsonb_build_object(
        'formId', CASE decision.value_json #>> '{}'
          WHEN 'Индивидуальная работа' THEN 'individual'
          WHEN 'Работа в паре' THEN 'pair'
          WHEN 'Групповая работа' THEN 'group'
          WHEN 'Фронтальная работа' THEN 'frontal'
          WHEN 'Ротация групп' THEN 'rotating-groups'
        END,
        'name', decision.value_json #>> '{}',
        'methodId', COALESCE((SELECT method.value_json->>'methodId' FROM lesson_decisions method WHERE method.lesson_id=decision.lesson_id AND method.semantic_key='method' AND jsonb_typeof(method.value_json)='object' ORDER BY method.ordinal LIMIT 1),'system-migration-unknown'),
        'methodologyPackId', 'methodology-research-v1',
        'methodologyPackVersion', '1.0.0'
      ), revision=revision+1, source='SYSTEM', updated_at=now()
  WHERE decision.semantic_key='form' AND jsonb_typeof(decision.value_json)='string'
    AND decision.value_json #>> '{}' IN ('Индивидуальная работа','Работа в паре','Групповая работа','Фронтальная работа','Ротация групп')
  RETURNING decision.*
)
INSERT INTO lesson_decision_revisions(id,workspace_id,decision_id,lesson_id,revision,value_json,source,status,actor_user_id,occurred_at,reason)
SELECT id||':r'||revision,workspace_id,id,lesson_id,revision,value_json,source,status,updated_by,updated_at,'SYSTEM_MIGRATION: attach semantic research form identity' FROM converted
ON CONFLICT (decision_id,revision) DO NOTHING;

WITH lessons_with_research AS (
  SELECT DISTINCT workspace_id, lesson_id
  FROM lesson_decisions
  WHERE semantic_key = 'method'
    AND value_json ->> 'technologyId' = 'research-technology'
), inserted AS (
  INSERT INTO lesson_decisions(id, workspace_id, lesson_id, semantic_key, item_key, ordinal, value_json, source, status, revision, updated_by, approved_by, approved_at, created_at, updated_at)
  SELECT 'technology_migration_' || lesson_id, workspace_id, lesson_id, 'pedagogicalTechnology', 'single', 0,
    jsonb_build_object('technologyId','research-technology','name','Исследовательская технология','methodologyPackId','methodology-research-v1','methodologyPackVersion','1.0.0'),
    'SYSTEM', 'APPROVED', 1, NULL, NULL, now(), now(), now()
  FROM lessons_with_research
  ON CONFLICT (lesson_id, semantic_key, item_key) DO NOTHING
  RETURNING *
)
INSERT INTO lesson_decision_revisions(id, workspace_id, decision_id, lesson_id, revision, value_json, source, status, actor_user_id, occurred_at, reason)
SELECT id || ':r1', workspace_id, id, lesson_id, 1, value_json, source, status, NULL, updated_at, 'SYSTEM_MIGRATION: inferred from known research pack method identity'
FROM inserted
ON CONFLICT (decision_id, revision) DO NOTHING;

COMMIT;
