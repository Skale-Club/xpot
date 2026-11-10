// Development content for exercising the Academy without Notion (ACADEMY_FIXTURES=1, never in production).

import { ACADEMY_APP, type CatalogCourse, type CatalogLesson } from "#shared/academy.js";
import type { ContentSource } from "./source.js";

const COURSE = "fixture-course-1";
// Portuguese translation of the sample course (same Group), to test the language switch.
const COURSE_PT = "fixture-course-1-pt";
const GROUP = "fixture-group-getting-started";

const courses: CatalogCourse[] = [
  {
    id: COURSE,
    title: "Getting started with Xpot",
    description: "A short tour of the app: check in at a business, record what happened and follow up.",
    apps: [ACADEMY_APP],
    published: true,
    order: 1,
    language: "en",
    group: GROUP,
  },
  {
    id: COURSE_PT,
    title: "Primeiros passos com o Xpot",
    description: "Um tour curto pelo app: faça check-in em um negócio, registre o que aconteceu e acompanhe.",
    apps: [ACADEMY_APP],
    published: true,
    order: 1,
    language: "pt",
    group: GROUP,
  },
];

// Any public YouTube video will do for the player; Format is set explicitly so the two shapes can be seen.
const PUBLIC_VIDEO = "dQw4w9WgXcQ";

const lessons: CatalogLesson[] = [
  {
    id: "fixture-lesson-1",
    courseId: COURSE,
    title: "Your first visit (vertical video)",
    summary: "Check in, record a voice note and finish a visit from your phone.",
    published: true,
    order: 1,
    video: `https://www.youtube.com/watch?v=${PUBLIC_VIDEO}`,
    expectedMinutes: null,
    format: "Vertical",
  },
  {
    id: "fixture-lesson-2",
    courseId: COURSE,
    title: "The dashboard (horizontal video)",
    summary: "What the numbers on your dashboard mean.",
    published: true,
    order: 2,
    video: `https://www.youtube.com/watch?v=${PUBLIC_VIDEO}`,
    expectedMinutes: 6,
    format: "Horizontal",
  },
  {
    id: "fixture-lesson-3",
    courseId: COURSE,
    title: "Tips and house rules (text only)",
    summary: "Reading only: a callout, a toggle, a list, a table and an image.",
    published: true,
    order: 3,
    video: null,
    expectedMinutes: null,
    format: "Auto",
  },
  {
    id: "fixture-lesson-3-pt",
    courseId: COURSE_PT,
    title: "Dicas e regras da casa (somente texto)",
    summary: "Só leitura: um destaque, uma lista e uma tabela.",
    published: true,
    order: 1,
    video: null,
    expectedMinutes: null,
    format: "Auto",
  },
];

const body: Record<string, string> = {
  "fixture-lesson-1": "Open **Route**, pick a business and tap *Check in*.\n\n1. Say what you see.\n2. Tap finish.\n",
  "fixture-lesson-2": "Your dashboard shows today's visits, tasks and sales.\n\n## Reading it\n\nStart from the top tiles.\n",
  "fixture-lesson-3": [
    "Read this once before your first week.",
    "",
    '<callout icon="💡" color="gray_bg">',
    "\tAlways check in **before** you walk in. The visit clock starts at check-in.",
    "</callout>",
    "",
    "<details>",
    "<summary>What if I have no signal?</summary>",
    "\tThe app keeps your note on the phone and sends it when you are back online.",
    "</details>",
    "",
    "- Be kind",
    "- Be brief",
    "- Follow up within a day",
    "",
    '<table header-row="true">',
    "\t<tr>",
    "\t\t<td>Step</td>",
    "\t\t<td>Where</td>",
    "\t</tr>",
    "\t<tr>",
    "\t\t<td>Check in</td>",
    "\t\t<td>Route</td>",
    "\t</tr>",
    "\t<tr>",
    "\t\t<td>Follow up</td>",
    "\t\t<td>Tasks</td>",
    "\t</tr>",
    "</table>",
    "",
    "![A sample picture](https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800)",
    "",
  ].join("\n"),
};

body["fixture-lesson-3-pt"] = [
  "Leia isto uma vez antes da sua primeira semana.",
  "",
  '<callout icon="💡" color="gray_bg">',
  "\tFaça sempre o check-in **antes** de entrar. O relógio da visita começa no check-in.",
  "</callout>",
  "",
  "- Seja gentil",
  "- Seja breve",
  "- Faça o acompanhamento em até um dia",
  "",
  '<table header-row="true">',
  "\t<tr>",
  "\t\t<td>Passo</td>",
  "\t\t<td>Onde</td>",
  "\t</tr>",
  "\t<tr>",
  "\t\t<td>Check-in</td>",
  "\t\t<td>Rota</td>",
  "\t</tr>",
  "</table>",
  "",
].join("\n");

export const fixtureSource: ContentSource = {
  kind: "fixture",
  listCourses: async () => courses,
  listLessons: async () => lessons,
  lessonMarkdown: async (id) => body[id] ?? "",
};
