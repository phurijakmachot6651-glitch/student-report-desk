export function thaiToArabicNumerals(text: string): string {
  const thaiToArabic: Record<string, string> = {
    '๐': '0',
    '๑': '1',
    '๒': '2',
    '๓': '3',
    '๔': '4',
    '๕': '5',
    '๖': '6',
    '๗': '7',
    '๘': '8',
    '๙': '9',
  };

  return text.replace(/[๐-๙]/g, (match) => thaiToArabic[match] || match);
}
