// Languages offered in step 1, with default phrases to read aloud.
// `gen` is the Lithuanian genitive used in UI sentences ("lietuvių kalba").

export const LANGUAGES = [
  {
    code: 'lt', bcp47: 'lt-LT', name: 'Lietuvių', gen: 'lietuvių', english: 'Lithuanian',
    samples: [
      'Labas rytas, šiandien Vilniuje lyja, bet popiet žadama saulė.',
      'Prašau užsakyti du bilietus į Kauną rytojaus traukiniui.',
      'Lietuvių kalba yra viena seniausių gyvų indoeuropiečių kalbų.',
      'Šešios žąsys čiuožė per užšalusį ežerą prie seno ąžuolo.',
      'Ūkininkė pasėjo grūdus, o vakare visi kartu valgė šviežią duoną.',
    ],
  },
  {
    code: 'en', bcp47: 'en-US', name: 'English', gen: 'anglų', english: 'English',
    samples: [
      'It is raining in the city today, but the sun should come out this afternoon.',
      'Please book two train tickets to Boston for tomorrow morning.',
      'Our team will present the new version of the app next week.',
      'The quick brown fox jumps over the lazy dog near the river bank.',
      'She ordered a cup of coffee and a slice of apple pie.',
    ],
  },
  {
    code: 'de', bcp47: 'de-DE', name: 'Deutsch', gen: 'vokiečių', english: 'German',
    samples: [
      'Heute regnet es in Berlin, aber am Nachmittag soll die Sonne scheinen.',
      'Bitte buchen Sie zwei Zugfahrkarten nach München für morgen früh.',
      'Unser Team stellt nächste Woche die neue Version der App vor.',
      'Die Kinder spielen im Garten hinter dem alten Haus.',
      'Können Sie mir bitte sagen, wie spät es ist?',
    ],
  },
  {
    code: 'fr', bcp47: 'fr-FR', name: 'Français', gen: 'prancūzų', english: 'French',
    samples: [
      "Aujourd'hui il pleut à Paris, mais le soleil devrait revenir cet après-midi.",
      'Pouvez-vous réserver deux billets de train pour Lyon demain matin ?',
      "Notre équipe présentera la nouvelle version de l'application la semaine prochaine.",
      'Les enfants jouent dans le jardin derrière la vieille maison.',
      "Je voudrais un café et un croissant, s'il vous plaît.",
    ],
  },
  {
    code: 'es', bcp47: 'es-ES', name: 'Español', gen: 'ispanų', english: 'Spanish',
    samples: [
      'Hoy llueve en Madrid, pero por la tarde saldrá el sol.',
      '¿Puede reservar dos billetes de tren a Sevilla para mañana por la mañana?',
      'Nuestro equipo presentará la nueva versión de la aplicación la próxima semana.',
      'Los niños juegan en el jardín detrás de la casa vieja.',
      'Quisiera un café con leche y una tostada, por favor.',
    ],
  },
  {
    code: 'pl', bcp47: 'pl-PL', name: 'Polski', gen: 'lenkų', english: 'Polish',
    samples: [
      'Dzisiaj w Warszawie pada deszcz, ale po południu wyjdzie słońce.',
      'Proszę zarezerwować dwa bilety na pociąg do Krakowa na jutro rano.',
      'Nasz zespół zaprezentuje nową wersję aplikacji w przyszłym tygodniu.',
      'Dzieci bawią się w ogrodzie za starym domem.',
      'Poproszę kawę z mlekiem i kawałek szarlotki.',
    ],
  },
  {
    code: 'lv', bcp47: 'lv-LV', name: 'Latviešu', gen: 'latvių', english: 'Latvian',
    samples: [
      'Šodien Rīgā līst, bet pēcpusdienā spīdēs saule.',
      'Lūdzu, rezervējiet divas vilciena biļetes uz Siguldu rīt no rīta.',
      'Mūsu komanda nākamnedēļ prezentēs jauno lietotnes versiju.',
      'Bērni spēlējas dārzā aiz vecās mājas.',
      'Es vēlos tasi kafijas un gabaliņu ābolu pīrāga.',
    ],
  },
  {
    code: 'ru', bcp47: 'ru-RU', name: 'Русский', gen: 'rusų', english: 'Russian',
    samples: [
      'Сегодня в Москве идёт дождь, но после обеда выглянет солнце.',
      'Пожалуйста, забронируйте два билета на поезд до Казани на завтрашнее утро.',
      'Наша команда представит новую версию приложения на следующей неделе.',
      'Дети играют в саду за старым домом.',
      'Мне, пожалуйста, чашку кофе и кусок яблочного пирога.',
    ],
  },
];

export const languageByCode = (code) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
