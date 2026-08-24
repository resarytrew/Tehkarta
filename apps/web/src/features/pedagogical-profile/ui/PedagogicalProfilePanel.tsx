import { useState } from 'react';
import type { CommunicationTone, PedagogicalFocus, PedagogicalStyle } from '@tehkarta/domain';
import type { Lesson } from '../../../entities/lesson/model.js';
import type { usePedagogicalProfile } from '../model/usePedagogicalProfile.js';
import type { PedagogicalProfileKey, PedagogicalProfileValue } from '../api/pedagogicalProfileApi.js';
import './pedagogical-profile.css';

const groups: Array<{ key:PedagogicalProfileKey; title:string; description:string; options:Array<{ id:PedagogicalProfileValue; name:string; effect:string }> }> = [
  { key:'pedagogicalStyle', title:'3.1 Педагогический стиль', description:'Определяет характер опоры, самостоятельности и взаимодействия.', options:[
    {id:'CLASSICAL' as PedagogicalStyle,name:'Классический',effect:'Чёткая структура, объяснение и последовательная тренировка.'},{id:'CONSTRUCTIVIST' as PedagogicalStyle,name:'Конструктивистский',effect:'Самостоятельный поиск, гипотезы и сборка знания.'},{id:'HUMANISTIC' as PedagogicalStyle,name:'Гуманистический',effect:'Выбор, поддержка, диалог и личностная рефлексия.'},{id:'GAME_BASED' as PedagogicalStyle,name:'Игровой',effect:'Роли, правила и содержательное игровое действие.'}
  ]},
  { key:'communicationTone', title:'3.2 Тон коммуникации', description:'Влияет на инструкции, обратную связь и материалы для учеников.', options:[
    {id:'ACADEMIC' as CommunicationTone,name:'Академический',effect:'Точные понятия и доказательные формулировки.'},{id:'SUPPORTIVE' as CommunicationTone,name:'Поддерживающий',effect:'Безопасная ошибка и развивающая обратная связь.'},{id:'DIRECT' as CommunicationTone,name:'Прямой',effect:'Краткие инструкции и прозрачные критерии.'},{id:'CREATIVE' as CommunicationTone,name:'Творческий',effect:'Образные формулировки и открытые продуктивные задания.'}
  ]},
  { key:'pedagogicalFocus', title:'3.3 Ключевой фокус', description:'Небольшой вес в ranking методов; совместимость технологии остаётся главной.', options:[
    {id:'ENGAGEMENT' as PedagogicalFocus,name:'Вовлечённость',effect:'Активное участие, выбор и взаимодействие.'},{id:'DEPTH' as PedagogicalFocus,name:'Глубина содержания',effect:'Источники, аргументация и сравнительный анализ.'},{id:'META_SKILLS' as PedagogicalFocus,name:'Метапредметные навыки',effect:'Планирование, сотрудничество и самооценка.'},{id:'PRACTICAL_APPLICATION' as PedagogicalFocus,name:'Практическое применение',effect:'Кейсы, моделирование и задачи применения.'}
  ]}
];

function currentValue(lesson:Lesson,key:PedagogicalProfileKey): PedagogicalProfileValue | undefined {
  if(key==='pedagogicalStyle') return lesson.pedagogicalProfile.style?.value;
  if(key==='communicationTone') return lesson.pedagogicalProfile.communicationTone?.value;
  return lesson.pedagogicalProfile.focus?.value;
}
function currentField(lesson:Lesson,key:PedagogicalProfileKey){ if(key==='pedagogicalStyle') return lesson.pedagogicalProfile.style; if(key==='communicationTone') return lesson.pedagogicalProfile.communicationTone; return lesson.pedagogicalProfile.focus; }

export function PedagogicalProfilePanel({ lesson, model }:{ lesson:Lesson; model:ReturnType<typeof usePedagogicalProfile> }) {
  const [drafts,setDrafts]=useState<Partial<Record<PedagogicalProfileKey,PedagogicalProfileValue>>>({});
  return <div className="pedagogy-profile">{groups.map((group)=>{const field=currentField(lesson,group.key);const selected=drafts[group.key] ?? currentValue(lesson,group.key);const dirty=selected!==currentValue(lesson,group.key);return <section className="pedagogy-decision" key={group.key}><div className="pedagogy-decision__heading"><div><span className="eyebrow">Педагогический профиль</span><h3>{group.title}</h3><p>{group.description}</p></div><span className={`status-badge status-${field?.meta.status.toLowerCase() ?? 'empty'}`}>{field?.meta.status === 'APPROVED' ? 'Утверждено' : field ? 'Черновик' : 'Не выбрано'}</span></div><div className="pedagogy-option-grid">{group.options.map((option)=><button type="button" key={option.id} className={`pedagogy-option ${selected===option.id?'is-selected':''}`} aria-pressed={selected===option.id} onClick={()=>setDrafts((current)=>({...current,[group.key]:option.id}))}><strong>{option.name}</strong><span>{option.effect}</span></button>)}</div><div className="pedagogy-actions"><button className="button button-ghost" type="button" disabled={!selected || !dirty || model.busyKey===group.key} onClick={()=>selected && void model.save(group.key,selected)}>Сохранить</button><button className="button button-primary" type="button" disabled={!field || field.meta.status==='APPROVED' || dirty || model.busyKey===group.key} onClick={()=>void model.approve(group.key)}>Утвердить</button></div></section>})}</div>;
}
