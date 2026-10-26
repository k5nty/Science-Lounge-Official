// Loads the real content found in the Telegram export of the project chat (announcements of the lectures,
// posters, the conference). Texts are taken from the announcements; nothing is invented except where noted.
// Usage: node scripts/import-real.js "<path to ChatExport folder>"   (run `npm run seed:clear` first to drop demo data)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { ensureDirs } from '../src/config.js';
import { getDb } from '../src/db.js';
import { processImage } from '../src/lib/images.js';
import { insertMedia, saveLecturer, saveIssue, saveConference, saveTeamMember, saveNews, uniqueSlug } from '../src/models.js';
import { saveSettings } from '../src/settings.js';
import { slugify, issueSlug } from '../src/lib/slug.js';
import { mskToUtcIso } from '../src/lib/dates.js';
import { typo } from '../src/lib/typo.js';
import { importMaterials } from './import-materials.js';
import { importPortraits } from './import-portraits.js';

const SRC = process.argv[2] || path.join(os.homedir(), 'Downloads', 'ChatExport_вова назаров');
const PH = path.join(SRC, 'photos');
ensureDirs();
const db = getDb();

if (db.prepare('SELECT COUNT(*) c FROM issues').get().c > 0) {
  console.error('В базе уже есть выпуски. Сначала: npm run seed:clear');
  process.exit(1);
}

const CREDIT = 'Научные гостиные';

async function addImage(file, { alt, credit = '', crop = null, consent = 'general' }) {
  let buf = fs.readFileSync(path.join(PH, file));
  if (crop) {
    const m = await sharp(buf).metadata();
    buf = await sharp(buf)
      .extract({ left: Math.round(crop[0] * m.width), top: Math.round(crop[1] * m.height), width: Math.round((crop[2] - crop[0]) * m.width), height: Math.round((crop[3] - crop[1]) * m.height) })
      .toBuffer();
  }
  const img = await processImage(buf);
  return insertMedia({ kind: 'image', base: img.base, width: img.width, height: img.height, bytes: img.bytes, widths: img.widths, orig_name: file, alt, credit, consent });
}

/* ---------- lecturers ---------- */
// Portraits of Ratushny, Surdin, Zubov, Volodyaev and Gorshunov come from assets/portraits/ (see import-portraits.js).
const LECTURERS = {
  ratushny: {
    name: 'Андрей Ратушный', en: 'Andrey Ratushny', area: 'Биология', area_en: 'Biology',
    role: 'Кандидат биологических наук, старший научный сотрудник', role_en: 'PhD in biology, senior researcher',
    org: 'Институт медико-биологических проблем РАН', org_en: 'Institute of Biomedical Problems, Russian Academy of Sciences',
    bio: 'Кандидат биологических наук, старший научный сотрудник Института медико-биологических проблем РАН, доцент Факультета космических исследований МГУ.',
    bio_en: 'PhD in biology, senior researcher at the Institute of Biomedical Problems of the Russian Academy of Sciences, associate professor at the Faculty of Space Research, Lomonosov Moscow State University.',
  },
  surdin: {
    name: 'Владимир Сурдин', en: 'Vladimir Surdin', area: 'Астрономия', area_en: 'Astronomy',
    role: 'Астроном, популяризатор науки', role_en: 'Astronomer, science communicator',
    org: 'ГАИШ МГУ имени П. К. Штернберга', org_en: 'Sternberg Astronomical Institute, Moscow State University',
    bio: 'Астроном, популяризатор науки, кандидат физико-математических наук, лауреат премии «Просветитель» и литературной премии имени А. Беляева, доцент физического факультета МГУ, старший научный сотрудник Государственного астрономического института имени П. К. Штернберга.',
    bio_en: 'Astronomer and science communicator, PhD in physics and mathematics, winner of the Enlightener prize and the A. Belyaev literary prize, associate professor at the Faculty of Physics of Moscow State University, senior researcher at the Sternberg State Astronomical Institute.',
  },
  zubov: {
    name: 'Андрей Зубов', en: 'Andrey Zubov', area: 'Технологии', area_en: 'Technology',
    role: 'Менеджер цифровых проектов', role_en: 'Digital projects manager',
    org: 'Русагро', org_en: 'Rusagro',
    bio: 'Выпускник школы «Летово», менеджер цифровых проектов в компании «Русагро», основатель Agrotech-стартапа, студент МФТИ и бизнес-школы «Сколково».',
    bio_en: 'Letovo School alumnus, digital projects manager at Rusagro, founder of an agrotech startup, student at MIPT and the Skolkovo business school.',
  },
  volodyaev: {
    name: 'Илья Володяев', en: 'Ilya Volodyaev', area: 'Биология', area_en: 'Biology',
    role: 'Эмбриолог, старший научный сотрудник', role_en: 'Embryologist, senior researcher',
    org: 'Институт биологии развития РАН', org_en: 'Koltsov Institute of Developmental Biology, Russian Academy of Sciences',
    bio: 'Кандидат биологических наук, эмбриолог, старший научный сотрудник Института биологии развития РАН, популяризатор науки и специалист в области клеточной организации и ранних этапов развития многоклеточных организмов.',
    bio_en: 'PhD in biology, embryologist, senior researcher at the Institute of Developmental Biology of the Russian Academy of Sciences, science communicator and specialist in the cellular organisation and early development of multicellular organisms.',
  },
  gorshunov: {
    name: 'Игорь Горшунов', en: 'Igor Gorshunov', area: 'Технологии', area_en: 'Technology',
    role: 'Операционный директор', role_en: 'Chief operating officer',
    org: 'инвестиционная компания АБ Капитал', org_en: 'AB Capital investment company',
    bio: 'Операционный директор инвестиционной компании АБ Капитал. Двадцать лет работал финансовым директором в компаниях разных отраслей. Сегодня перестраивает бизнес-процессы с помощью ИИ.',
    bio_en: 'Chief operating officer of the investment company AB Capital. Spent twenty years as a finance director in companies of different industries. Today he rebuilds business processes with the help of AI.',
  },
  namsaraev: {
    name: 'Зоригто Намсараев', en: 'Zorigto Namsaraev', area: 'Науки о Земле', area_en: 'Earth science',
    role: 'Начальник лаборатории синтетической биологии', role_en: 'Head of the synthetic biology laboratory',
    org: 'НИЦ «Курчатовский институт»', org_en: 'Kurchatov Institute',
    bio: 'Зоригто Баирович Намсараев. Кандидат биологических наук, начальник лаборатории синтетической биологии НИЦ «Курчатовский институт».',
    bio_en: 'Zorigto Bairovich Namsaraev. PhD in biology, head of the synthetic biology laboratory at the Kurchatov Institute.',
    portrait: { file: 'photo_1541961_0.jpg', alt: 'Портрет: Зоригто Намсараев', crop: [0.498, 0.3125, 0.962, 0.723] },
  },
};

/* ---------- issues (all are in the past on 19.10.2026) ---------- */
const ISSUES = [
  {
    n: 1, lecturer: 'ratushny', date: '2026-01-30', time: '16:10', place: 'Школа «Летово»', place_en: 'Letovo School',
    title: 'Межпланетные перелёты и их медико-биологические особенности', title_en: 'Interplanetary flights and their biomedical aspects',
    announce: 'Лекция о межпланетных перелётах и их медико-биологических особенностях. Будет интересно астрономам, биологам, физикам и химикам.',
    announce_en: 'A talk on interplanetary flights and their biomedical aspects. It will be interesting for astronomers, biologists, physicists and chemists.',
    tags: ['биология (biology)', 'космос (space)'],
  },
  {
    n: 2, lecturer: 'surdin', date: '2026-02-18', time: '19:20', place: 'Школа «Летово», лекторий', place_en: 'Letovo School, lecture hall',
    title: 'Путешествия к Луне', title_en: 'Journeys to the Moon',
    announce: 'В конце 1950-х советские роботы впервые отправились к Луне, а в начале 1970-х, когда американские астронавты завершили экспедиции к Луне, закончилась героическая эпоха пилотируемой космонавтики. С тех пор люди не удалялись от земной поверхности более чем на несколько сотен километров. Но роботы регулярно летают к Луне, трудятся на её поверхности и даже возвращаются на Землю.\n\nКакова перспектива пилотируемых экспедиций в далёкий космос? Вернутся ли люди на Луну? Для чего человечеству нужна Луна? Какие страны и зачем сегодня устремились к Луне? Ответив на эти вопросы, мы увидим новые направления в науке и технологиях.\n\nЛетовская среда, организована при содействии Научной гостиной кафедры естественных наук.',
    announce_en: 'In the late 1950s Soviet robots first went to the Moon, and in the early 1970s, when American astronauts finished their lunar expeditions, the heroic era of crewed spaceflight ended. Since then people have not travelled more than a few hundred kilometres from the Earth’s surface. But robots regularly fly to the Moon, work on its surface and even return to Earth.\n\nWhat are the prospects for crewed expeditions into deep space? Will people return to the Moon? What does humanity need the Moon for? Which countries are rushing to the Moon today, and why?\n\nA Letovo Wednesday, organised with the support of the Natural Sciences Department’s science salon.',
    tags: ['астрономия (astronomy)', 'космос (space)'],
    cover: { file: 'photo_1541956_0.jpg', alt: 'Афиша лекции Владимира Сурдина «Путешествия к Луне», 18 февраля' },
  },
  {
    n: 3, lecturer: 'zubov', date: '2026-03-13', time: '16:30', place: 'Школа «Летово», S02', place_en: 'Letovo School, S02',
    title: 'Навигация робота в агрессивной среде', title_en: 'How a robot finds its way in a hostile environment',
    announce: 'Представим ситуацию: робот оказывается в агрессивной, неструктурированной среде. Вокруг пыль и грязь, отсутствует дорожная разметка, а сигнал GPS либо недоступен, либо заглушён. Как в таких условиях определить своё положение в пространстве и продолжить движение?\n\nОб этом и многом другом расскажет Андрей Зубов, выпускник «Летово».',
    announce_en: 'Imagine a robot in a hostile, unstructured environment. There is dust and dirt around, no road markings, and the GPS signal is either unavailable or jammed. How can it determine its position and keep moving?\n\nAndrey Zubov, a Letovo alumnus, will talk about this and much more.',
    tags: ['робототехника (robotics)', 'технологии (technology)'],
    poster: { file: 'photo_1541958_0.jpg', alt: 'Афиша лекции Андрея Зубова, 13 марта' },
    video_full_url: 'https://rutube.ru/video/private/22b0b76aa8cb6596d7b52f9d4646fd69/?p=0jqOYZ7VXY5IxGGdelqI0Q',
    reads: [{ title: 'Папка с материалами лекции (Яндекс Диск)', url: 'https://disk.yandex.ru/d/KCu5O0UebziO6g' }],
  },
  {
    n: 4, lecturer: 'volodyaev', date: '2026-04-24', time: '16:20', place: 'Школа «Летово», S02', place_en: 'Letovo School, S02',
    title: 'Как зарождается жизнь? Нарушает ли эмбрион законы физики?', title_en: 'How does life begin? Does an embryo break the laws of physics?',
    announce: 'Почему одна-единственная клетка объёмом меньше нанолитра способна превратиться в сложнейший организм из триллионов клеток? Почему необратимое разрушение в термодинамике вдруг соседствует с необратимым усложнением, в момент, когда появляется жизнь?\n\nНарушает ли эмбрион законы физики? Как согласуются детерминизм физических законов со свободой и «самосогласованностью» развития живого? Почему «стрела времени» в биологии выглядит иначе, чем в механике?',
    announce_en: 'Why can a single cell with a volume of less than a nanolitre turn into a complex organism of trillions of cells? Why does irreversible destruction in thermodynamics suddenly coexist with irreversible complexification at the moment life appears?\n\nDoes an embryo break the laws of physics? How does the determinism of physical laws agree with the freedom and “self-consistency” of living development? Why does the “arrow of time” look different in biology than in mechanics?',
    tags: ['биология (biology)', 'физика (physics)'],
    poster: { file: 'photo_1541959_0.jpg', alt: 'Афиша лекции Ильи Володяева, 24 апреля' },
  },
  {
    n: 5, lecturer: 'gorshunov', date: '2026-09-18', time: '16:10', place: 'Школа «Летово», лекторий', place_en: 'Letovo School, lecture hall',
    title: 'ИИ всегда, ИИ везде', title_en: 'AI always, AI everywhere',
    announce: 'Как искусственный интеллект меняет работу, бизнес и нашу повседневную жизнь.\n\nКак устроены современные нейросети, в чём их главное слабое место, как нейросеть получает возможность работать с компьютером и выполнять действия, на что способен ИИ на обычном компьютере, зачем нужны токены и подписки, как ИИ уже используется в бизнесе и что означают слова «AI-агенты», «tools», «harness» и «MCP-серверы».',
    announce_en: 'How artificial intelligence is changing work, business and everyday life.\n\nHow modern neural networks work, what their main weakness is, how a neural network gets to work with a computer and perform actions, what AI can do on an ordinary computer, why tokens and subscriptions exist, how AI is already used in business and what “AI agents”, “tools”, “harness” and “MCP servers” mean.',
    tags: ['ИИ (AI)', 'технологии (technology)'],
    poster: { file: 'photo_1541960_0.jpg', alt: 'Афиша лекции Игоря Горшунова, 18 сентября' },
  },
  {
    n: 6, lecturer: 'namsaraev', date: '2026-10-02', time: '16:10', place: 'Школа «Летово», Зимний сад', place_en: 'Letovo School, Winter Garden',
    title: 'Антарктида: льды, жизнь и исследования', title_en: 'Antarctica: ice, life and research',
    announce: 'Как образовался ледяной континент, почему он так важен для науки и как сегодня живут и работают полярники.\n\nРечь пойдёт о микроорганизмах, выживающих в экстремальных условиях, об открытии Антарктиды российскими моряками, покорении Южного полюса и современном освоении материка. Также расскажем, как сегодня ведутся исследования, как полярники передвигаются, живут и работают на станциях, и о суровой природе Антарктиды. Лекция покажет этот континент как уникальную научную лабораторию и пример человеческого мужества.\n\nВидеозаписи лекции нет: лектор не давал согласия на съёмку.',
    announce_en: 'How the icy continent formed, why it matters so much for science and how polar explorers live and work today.\n\nThe talk covers microorganisms that survive in extreme conditions, the discovery of Antarctica by Russian sailors, the conquest of the South Pole and the modern exploration of the continent. We will also describe how research is done today, how polar explorers travel, live and work at stations, and about the harsh nature of Antarctica. The talk shows the continent as a unique scientific laboratory and an example of human courage.\n\nThere is no video recording: the speaker did not consent to filming.',
    tags: ['науки о Земле (earth science)', 'биология (biology)'],
    poster: { file: 'photo_1541961_0.jpg', alt: 'Афиша лекции Зоригто Намсараева, 2 октября' },
  },
];

const lecturerIds = {};
for (const [key, l] of Object.entries(LECTURERS)) {
  const portrait = l.portrait ? await addImage(l.portrait.file, { alt: l.portrait.alt, credit: CREDIT, crop: l.portrait.crop }) : null;
  lecturerIds[key] = saveLecturer(
    {
      slug: uniqueSlug('lecturers', slugify(l.name) || 'lektor'),
      name_ru: l.name, name_en: l.en,
      portrait_id: portrait?.id || null,
      role_ru: typo(l.role), role_en: l.role_en,
      org_ru: typo(l.org), org_en: l.org_en,
      area: l.area, area_en: l.area_en,
      bio_ru: typo(l.bio), bio_en: l.bio_en,
      facts_ru: [], facts_en: [], links: [],
    },
    null,
  );
}
await importPortraits();

for (const i of ISSUES) {
  const photoIds = [];
  let coverId = null;
  if (i.cover) coverId = (await addImage(i.cover.file, { alt: i.cover.alt, credit: CREDIT })).id;
  if (i.poster) photoIds.push((await addImage(i.poster.file, { alt: i.poster.alt, credit: CREDIT })).id);
  saveIssue(
    {
      number: i.n,
      slug: issueSlug(i.n, i.title),
      title_ru: typo(i.title), title_en: i.title_en,
      start_at: mskToUtcIso(i.date, i.time),
      place_ru: typo(i.place), place_en: i.place_en,
      announce_ru: typo(i.announce), announce_en: i.announce_en,
      cover_id: coverId,
      video_full_url: i.video_full_url || '',
      reads: i.reads || [],
      tags: i.tags,
      publish_state: 'published',
    },
    [lecturerIds[i.lecturer]],
    photoIds,
    null,
  );
}

/* ---------- conference ---------- */
const logo = await addImage('photo_1541957_0.jpg', { alt: 'Логотип конференции «Летово.Инженеры»', credit: 'Конференция «Летово.Инженеры»' });
saveConference(
  {
    year: 2026,
    title_ru: 'Летово.Инженеры',
    title_en: 'National Letovo Engineers',
    date_start: mskToUtcIso('2026-04-08', '00:00'),
    date_end: mskToUtcIso('2026-04-08', '00:00'),
    place_ru: 'Школа «Летово», 1 этаж',
    place_en: 'Letovo School, ground floor',
    intro_ru: typo('II конференция «Летово.Инженеры»: ежегодная научная, инженерная и IT-конференция для учеников 8–11 классов. Участники представляют инженерные, научные и IT-проекты экспертам ведущих вузов России.\n\nТри трека: инженерия, наука, IT. Формат: постерная сессия с возможностью демонстрации продуктов для инженерного и IT-треков. Всем участникам: сертификаты, публикация тезисов, опыт выступления. Победителям: грамоты и публикация статей в рецензируемом научном журнале.\n\n[Телеграм-канал конференции](https://t.me/letovo_engineers)'),
    intro_en: 'The II “Letovo Engineers” conference: an annual science, engineering and IT conference for students in grades 8–11. Participants present engineering, science and IT projects to experts from leading Russian universities.\n\nThree tracks: engineering, science, IT. Format: a poster session with product demonstrations for the engineering and IT tracks. Every participant gets a certificate, published abstracts and experience; winners get diplomas and the chance to publish articles in a peer-reviewed journal.\n\n[Conference Telegram channel](https://t.me/letovo_engineers)',
    program: [{ title: '8 апреля', date: '', items: [{ time: '', text: 'Постерная сессия: инженерия, наука, IT' }] }],
    regions: [],
    posters: [],
    cover_id: null,
    published: true,
  },
  [],
  [logo.id],
  null,
);

/* ---------- team + settings ---------- */
saveTeamMember({ kind: 'founder', name_ru: 'Михаил Качай', name_en: 'Mikhail Kachay', role_ru: 'Сооснователь', role_en: 'Co-founder', position: 1 }, null);
saveTeamMember({ kind: 'founder', name_ru: 'Владимир Назаров', name_en: 'Vladimir Nazarov', role_ru: 'Сооснователь', role_en: 'Co-founder', position: 2 }, null);
// Two places kept for the people who run the project now (names and photos to be added in the admin; hidden until then).
saveTeamMember({ kind: 'helper', name_ru: 'Организатор', name_en: 'Organiser', role_ru: 'Организатор', role_en: 'Organiser', position: 1, active: false }, null);
saveTeamMember({ kind: 'helper', name_ru: 'Организатор', name_en: 'Organiser', role_ru: 'Организатор', role_en: 'Organiser', position: 2, active: false }, null);

/* ---------- science news: own summaries of the official Nobel Prize 2026 press releases ---------- */
const NOBEL = 'https://www.nobelprize.org/prizes';
const NEWS = [
  {
    date: '2026-10-07', source: 'NobelPrize.org', url: `${NOBEL}/chemistry/2026/press-release/`,
    title: 'Нобелевская премия по химии: почему жизнь выбрала одну «руку»', title_en: 'Nobel Prize in Chemistry: why life chose one “hand”',
    summary: 'Премию разделили Анри Каган (Франция) и Кенсо Соай (Япония) «за открытие нелинейных эффектов и автокатализа в асимметричном органическом синтезе». Молекулы вроде аминокислот бывают в двух зеркальных вариантах, а живые организмы используют только один. Каган в 1986 году нашёл, как получать избыток одного из вариантов, а Соай в 2003 году добился реакции, в которой образуется только один. Это важно для создания лекарств.',
    summary_en: 'The prize is shared by Henri Kagan (France) and Kenso Soai (Japan) “for the discovery of non-linear effects and autocatalysis in asymmetric organic synthesis”. Molecules such as amino acids come in two mirror-image forms, yet living organisms use only one. In 1986 Kagan found a way to get an excess of one form, and in 2003 Soai achieved a reaction that produces only one. This matters for making medicines.',
  },
  {
    date: '2026-10-06', source: 'NobelPrize.org', url: `${NOBEL}/physics/2026/press-release/`,
    title: 'Нобелевская премия по физике: нейтрино, пойманные во льдах Антарктиды', title_en: 'Nobel Prize in Physics: neutrinos caught in Antarctic ice',
    summary: 'Премию получил Фрэнсис Хальцен (Университет Висконсина в Мэдисоне, США) за решающий вклад в нейтринную обсерваторию IceCube и открытие нейтрино высоких энергий астрофизического происхождения. IceCube — кубический километр льда у Южного полюса с датчиками света: в нём ловят редкие вспышки от столкновений нейтрино, пришедших из далёкого космоса. Идею Хальцен впервые представил в 1988 году.',
    summary_en: 'The prize goes to Francis Halzen (University of Wisconsin–Madison, USA) for decisive contributions to the IceCube Neutrino Observatory and the discovery of high-energy neutrinos of astrophysical origin. IceCube is a cubic kilometre of ice at the South Pole fitted with light sensors that catch the rare flashes from neutrino collisions. Halzen first presented the idea in 1988.',
  },
  {
    date: '2026-10-05', source: 'NobelPrize.org', url: `${NOBEL}/medicine/2026/press-release/`,
    title: 'Нобелевская премия по медицине: нервные клетки, которыми управляет свет', title_en: 'Nobel Prize in Medicine: nerve cells controlled by light',
    summary: 'Премию разделили Карл Дайссерот (США), Петер Хегеман и Георг Нагель (Германия) «за открытия, связанные со светочувствительными ионными каналами и оптогенетикой». Хегеман и Нагель нашли у одноклеточной водоросли белок канальный родопсин, а Дайссерот превратил его в переключатель нервных клеток, который работает от света. Оптогенетика позволяет увидеть, как нейроны формируют память, эмоции и поведение в живом мозге.',
    summary_en: 'The prize is shared by Karl Deisseroth (USA), Peter Hegemann and Georg Nagel (Germany) “for their discoveries concerning light-gated ion channels and optogenetics”. Hegemann and Nagel found the protein channelrhodopsin in a single-celled alga, and Deisseroth turned it into a light-controlled switch for nerve cells. Optogenetics shows how neurons shape memories, feelings and behaviour in the living brain.',
  },
];
for (const n of NEWS) {
  saveNews({ slug: slugify(n.title_en) || 'news', title_ru: typo(n.title), title_en: n.title_en, summary_ru: typo(n.summary), summary_en: n.summary_en, source_name: n.source, source_url: n.url, published_at: mskToUtcIso(n.date, '12:00'), published: true }, null);
}
saveSettings({
  channel_url: 'https://t.me/LetovoScienceLounge',
  stat_listeners: '300+',
  about_story_ru: typo('Научные гостиные (Science Lounge) — проект учеников школы «Летово». Мы приглашаем учёных и преподавателей вузов выступить перед школьниками и публикуем здесь анонсы, конспекты и записи лекций.\n\nВместе с лекторием мы проводим конференцию «Летово.Инженеры».'),
  about_story_en: 'Science Lounge (“Nauchnye gostinye”) is a project by Letovo School students. We invite researchers and university teachers to speak to school students, and publish announcements, write-ups and recordings of the talks here.\n\nTogether with the lecture series we run the “Letovo Engineers” conference.',
});

const materials = importMaterials();

console.log(`Импортировано: лекторов ${Object.keys(LECTURERS).length}, выпусков ${ISSUES.length}, новостей ${NEWS.length}, материалов по темам лекций ${materials.length}, конференция 2026.`);
