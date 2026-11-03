// All user-facing Arabic strings live here so the reviewer can audit them in one place.
// Numbers/dates use Intl with ar-EG (Arabic-Indic numerals). No English reaches the UI.

const arNumbers = new Intl.NumberFormat('ar-EG')

export function num(value: number): string {
  return arNumbers.format(value)
}

export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function formatIsoTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : formatTime(d)
}

/** mm:ss rendered with Arabic-Indic digits. */
export function formatClockAr(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${num(m).padStart(2, '٠')}:${num(s).padStart(2, '٠')}`
}

export const copy = {
  classroomName: 'فصل الفراشات',
  appTitle: 'كيدارا — التقرير اليومي',

  allPresent: 'الكل حاضر',
  attendanceTitle: 'الحضور',
  bulkTitle: 'تسجيل جماعي',
  bulkHint: 'تنطبق على الأطفال الحاضرين فقط',

  mealAllFull: 'أكل الجميع',
  mealSectionTitle: 'الوجبة',
  napSectionTitle: 'القيلولة',
  moodSectionTitle: 'المزاج',
  napAllSlept: 'نام الجميع',
  napAlt: 'الجميع: لم ينم',
  moodAllCalm: 'مزاج الجميع: هادئ',
  moodAltHappy: 'مزاج الجميع: سعيد',
  moodAltTired: 'مزاج الجميع: متعب',
  moodAltUpset: 'مزاج الجميع: منزعج',
  mealAltPartial: 'الجميع: أكل جزئياً',
  mealAltRefused: 'الجميع: رفض الأكل',

  submitBar: 'تسليم التقرير',
  submitting: 'جارٍ التسليم…',
  submitConfirmTitle: 'مراجعة قبل التسليم',
  sendReport: 'إرسال التقرير',
  back: 'رجوع',

  successTitle: (classroom: string) => `تم تسليم تقرير ${classroom}`,
  successKicker: 'شكرًا، اكتمل التقرير.',
  elapsedLabel: 'زمن الإنجاز',
  submittedAtLabel: 'وقت التسليم',
  submittedReadOnly: 'التقرير مسلَّم، ولا تعديل في هذا النموذج.',

  countLabel: (attending: number, total: number) => `حاضر ${num(attending)} / ${num(total)}`,

  restoreToast: (time: string) => `تم استرجاع مسودة غير مسلَّمة من ${time}`,
  invalidDraftToast: 'تعذّر استرجاع المسودة؛ بدأنا تقريرًا جديدًا',
  saveError: 'تعذّر حفظ المسودة على هذا الجهاز',
  saveErrorShort: 'تعذّر حفظ المسودة',
  storageUnavailable: 'الحفظ على هذا الجهاز غير متاح؛ سيبقى التقرير في الذاكرة فقط حتى الإغلاق',
  saveRetry: 'إعادة المحاولة',
  saving: 'جارٍ الحفظ…',
  savedAt: (time: string) => `تم الحفظ ${time}`,

  emptyClassroom: 'لا يوجد أطفال في هذا الفصل',
  emptyClassroomHint: 'أضف أطفالًا إلى الفصل لعرض التقرير',
  submitDisabledHint: 'أضف حضورًا للأطفال أولًا',

  submitError: 'تعذَّر تسليم التقرير. حاول مرة أخرى.',
  submitRetry: 'إعادة المحاولة',

  attendance: { present: 'حاضر', absent: 'غائب', late: 'متأخر', early_leave: 'انصراف مبكر' },
  attendanceNone: 'لم يُحدَّد',
  meal: { full: 'أكل كامل', partial: 'أكل جزئياً', refused: 'رفض الأكل' },
  nap: { slept: 'نام', did_not_sleep: 'لم ينم' },
  mood: { happy: 'سعيد', calm: 'هادئ', tired: 'متعب', upset: 'منزعج' },
  toiletTitle: 'دورة المياه',
  toiletHint: 'اختياري',
  toiletType: { urine: 'بول', stool: 'تبرز', both: 'كلاهما' },
  toiletCountLabel: 'العدد',
  toiletClear: 'لا شيء',
  behaviorNoteTitle: 'ملاحظة سلوك',
  behaviorNoteHelper: 'لا تظهر لولي الأمر قبل اعتماد المدير',
  behaviorNotePlaceholder: 'اكتب ملاحظتك هنا…',
  done: 'تم',
  cancel: 'إلغاء',
  close: 'إغلاق',

  allergyTitle: 'تنبيه حساسية',
  allergyChip: 'حساسية',

  attendanceAbsentHint: 'الطفل غائب — لا تُسجَّل حقول اليوم',

  // Short, state-true exception badges for the roster rows.
  badgeMealPartial: 'قليل',
  badgeMealRefused: 'رفض',
  badgeNapNoSleep: 'لم ينم',
  badgeMoodTired: 'متعب',
  badgeMoodUpset: 'منزعج',

  confirmCountsTitle: 'الحضور',
  confirmExceptionsTitle: 'حالات تستحق الانتباه',
  confirmNone: 'لا يوجد',
  confirmNotesTitle: 'ملاحظات سلوك بانتظار اعتماد المدير',
  confirmWarningsTitle: 'تنبيهات اكتمال (لا تمنع التسليم)',
  warnField: { meal: 'وجبة', nap: 'نوم', mood: 'مزاج' },
  warnText: (field: string, missing: number, total: number) =>
    `${field}: ${childrenCountPhrase(missing)} بلا تسجيل من أصل ${num(total)} من الحاضرين`,

  remainingText: (n: number): string =>
    n <= 0 ? 'اكتمل الحضور، جاهز للتسليم' : `باقي ${childrenCountPhrase(n)} بدون حضور`,
} as const

export const facilitatorCopy = {
  toggle: 'الميسّر',
  title: 'لوحة الميسّر — للتقييم فقط',
  hint: 'أغلق اللوحة قبل تسليم الجهاز للمعلمة؛ لا تُعرض أمامها.',
  sessionTitle: 'الجلسة الحالية',
  waitingTimer: 'الزمن يبدأ عند أول تفاعل مع التقرير',
  timerLabel: 'الزمن',
  tapsLabel: 'النقرات',
  completenessLabel: 'الاكتمال',
  exceptionsLabel: 'الاستثناءات',
  passLabel: 'الهدف',
  passCriteria: 'أقل من ٥:٠٠ دقائق',
  passOk: 'ضمن الهدف',
  passLate: 'فوق الهدف',
  teacherLabelTitle: 'الجلسة مسجَّلة باسم',
  notesLabel: 'ملاحظات (شرح متكرر، صعوبات)',
  notesPlaceholder: 'سجّل ما كررت شرحه أو ما صعب على المعلمة…',

  startNew: 'بدء جلسة جديدة',
  confirmResetTitle: 'بدء جلسة جديدة؟',
  confirmResetBody: 'سيُمسح مسودة اليوم والجلسة الحالية. لا تُمسح جلسات المعلمات السابقة.',
  confirmYes: 'نعم، ابدأ',
  cancelButtonText: 'إلغاء',

  copyJson: 'نسخ النتيجة',
  copyDone: 'تم النسخ',
  copyFailed: 'تعذّر النسخ',
  exportCsv: 'تصدير CSV',
  downloadCsv: 'تنزيل CSV',

  aggregateTitle: 'ملخص جميع الجلسات',
  aggregateCount: 'عدد الجلسات',
  aggregateAverage: 'متوسط الزمن',
  aggregateMin: 'أقصر زمن',
  aggregateMax: 'أطول زمن',
  aggregatePassRate: 'نسبة النجاح',
  noSessions: 'لا توجد جلسات مسجَّلة بعد',

  errorSimTitle: 'محاكاة فشل التسليم',
  errorSimNote: 'التشغيل الأول للإرسال يفشل مرة واحدة للتجربة، ولا يمنع إعادة المحاولة.',

  resultTitle: 'الجلسة الأخيرة',
  resultSavedNote: 'حُفظت النتيجة في السجل.',
  resultNotSavedNote: 'تعذّر حفظ النتيجة في السجل؛ ستفقد عند إعادة تحميل الصفحة.',
  unsavedNote: (n: number): string =>
    n === 1
      ? 'جلسة واحدة غير محفوظة في السجل؛ ستُفقد عند إعادة تحميل الصفحة.'
      : n === 2
        ? 'جلستان غير محفوظتين في السجل؛ ستُفقدان عند إعادة تحميل الصفحة.'
        : `${num(n)} جلسات غير محفوظة في السجل؛ ستُفقد عند إعادة تحميل الصفحة.`,
} as const

/** Arabic plural for children; shared by the remaining/completeness warnings. */
export function childrenCountPhrase(n: number): string {
  if (n === 1) return 'طفل واحد'
  if (n === 2) return 'طفلان'
  if (n <= 10) return `${num(n)} أطفال`
  return `${num(n)} طفلاً`
}

/** Arabic plural for exception flags ("حالة"); mirrors childrenCountPhrase. */
export function flagsCountPhrase(n: number): string {
  if (n === 1) return 'حالة واحدة'
  if (n === 2) return 'حالتان'
  if (n <= 10) return `${num(n)} حالات`
  return `${num(n)} حالة`
}

// Parent day sheet (plan task 2, first half) — appended exactly as specified,
// then adjusted in the fix round (valid-link wording, neutral absent/note lines).
export const parentCopy = {
  kicker: 'كيدارا — تقرير اليوم',
  loading: 'جارٍ تحميل تقرير اليوم…',
  emptyNone: 'لا يوجد تقرير لهذا اليوم بعد',
  emptyUnpublished: 'لم يُنشر تقرير اليوم بعد',
  emptyFallback: 'يُرجى تحديث الصفحة لاحقًا، أو التواصل مع الحضانة إن لم يظهر حتى نهاية اليوم.',
  error: 'تعذّر تحميل تقرير اليوم',
  errorFallback: 'يُرجى التواصل مع الحضانة إن تكرر الخطأ.',
  retry: 'إعادة المحاولة',
  invalidLink: 'هذا الرابط غير صالح. يُرجى طلب رابط جديد من الحضانة.',
  unset: 'لم يُسجَّل',
  noBehaviorNote: 'لا توجد ملاحظة لهذا اليوم',
  absentLine: 'طفلك غائب اليوم، لذلك لم تُسجَّل الوجبة والقيلولة والمزاج.',
  allergyNote: 'معلومة مسجَّلة لدى الحضانة، وليست تقريرًا طبيًا.',
} as const
