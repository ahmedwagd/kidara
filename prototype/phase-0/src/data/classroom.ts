import type { Classroom, Child } from '../domain/types'

// 20 fake Egyptian Arabic children, alphabetical, stable order. No photos, no real data.
// Two fake allergies power the static red banner.

function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  return (words[0]?.charAt(0) ?? '') + (words[1]?.charAt(0) ?? '')
}

const raw: Array<Pick<Child, 'id' | 'fullName'> & { allergyLabel?: string }> = [
  { id: 'c01', fullName: 'آدم خالد فاروق' },
  { id: 'c02', fullName: 'أحمد مصطفى سالم' },
  { id: 'c03', fullName: 'بسمة عمر حسن' },
  { id: 'c04', fullName: 'جنى محمود عوض' },
  { id: 'c05', fullName: 'دانية أيمن رشاد' },
  { id: 'c06', fullName: 'رنينة حسام الدين' },
  { id: 'c07', fullName: 'زين السيد إبراهيم' },
  { id: 'c08', fullName: 'سليم عمرو الشناوي' },
  { id: 'c09', fullName: 'سيلا هاني فؤاد' },
  { id: 'c10', fullName: 'شهد يعقوب سليم' },
  { id: 'c11', fullName: 'طه إبراهيم عرفة' },
  { id: 'c12', fullName: 'عائشة عبد الله مكرم' },
  { id: 'c13', fullName: 'غزل أمين عز' },
  { id: 'c14', fullName: 'فريدة أشرف بدوي' },
  { id: 'c15', fullName: 'قمر محمد سيد' },
  { id: 'c16', fullName: 'كنزي هشام عزت' },
  { id: 'c17', fullName: 'لينا سامح منصور' },
  { id: 'c18', fullName: 'ملك طارق شعبان', allergyLabel: 'حساسية الحليب (بروتين أبقار)' },
  { id: 'c19', fullName: 'نور وليد البنا' },
  { id: 'c20', fullName: 'يوسف أحمد شاهين', allergyLabel: 'حساسية الفول السوداني' },
]

const children: Child[] = raw.map(({ id, fullName, allergyLabel }) => {
  const child: Child = { id, fullName, initials: initialsOf(fullName) }
  if (allergyLabel) child.allergy = { label: allergyLabel }
  return child
})

export const mockClassroom: Classroom = {
  name: 'فصل الفراشات',
  template: 'preschool',
  children,
}

export function emptyClassroom(): Classroom {
  return { name: 'فصل الفراشات', template: 'preschool', children: [] }
}
