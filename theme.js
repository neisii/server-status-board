// 테마(테두리·제목 색) 정의. index.js는 config의 THEME 값으로 아래 중 하나만 골라 쓴다.
// named color('red'/'blue' 등)는 터미널 커스텀 색상표가 재정의할 수 있어서(실측: 테두리·제목이
// 엉뚱한 색으로 보임) 전부 hex로 적는다 — hex는 터미널 테마 재정의를 안 탄다.
export const THEMES = {
  cherry: { border: '#D946EF', title: '#3B82F6' },
  ocean: { border: '#06B6D4', title: '#0EA5E9' },
  emerald: { border: '#10B981', title: '#22C55E' },
  amber: { border: '#F59E0B', title: '#FBBF24' },
  slate: { border: '#94A3B8', title: '#E2E8F0' },
  indigo: { border: '#6366F1', title: '#8B5CF6' },
  rose: { border: '#FB7185', title: '#FDBA74' },
  navy: { border: '#1E40AF', title: '#93C5FD' },
  sunset: { border: '#FB923C', title: '#FDE68A' },
  mint: { border: '#34D399', title: '#A3E635' },
  plum: { border: '#A855F7', title: '#E9D5FF' },
  tealGold: { border: '#0D9488', title: '#FACC15' },
  silver: { border: '#D1D5DB', title: '#F9FAFB' },
  violetPink: { border: '#7C3AED', title: '#F472B6' },
  copper: { border: '#B45309', title: '#FEF3C7' },
  forestNight: { border: '#166534', title: '#BBF7D0' },
  iceBlue: { border: '#BAE6FD', title: '#38BDF8' },
  wine: { border: '#881337', title: '#FDA4AF' },
  charcoalNeon: { border: '#374151', title: '#39FF14' },
  peacock: { border: '#0E7490', title: '#67E8F9' },
  royalGold: { border: '#581C87', title: '#FACC15' },
  warmStone: { border: '#57534E', title: '#D6D3D1' },
  midnightTeal: { border: '#042F2E', title: '#2DD4BF' },
  blushMauve: { border: '#D8B4FE', title: '#FBCFE8' },
  electricBlue: { border: '#2563EB', title: '#FFFFFF' },
  olive: { border: '#4D7C0F', title: '#FEF9C3' },
  obsidianIce: { border: '#111827', title: '#A5F3FC' },
  candy: { border: '#F9A8D4', title: '#C4B5FD' },
};

export const DEFAULT_THEME = 'peacock';

// 포트 상태·기본 글자색은 테마와 무관하게 의미가 고정된 색(에러=빨강, 경고=노랑, 정상=초록 등)이라
// 테마 객체 밖에 따로 둔다 — 테마를 바꿔도 이 색들은 안 바뀐다.
export const STATUS_COLORS = {
  text: '#F9FAFB',
  suffix: '#6B7280',
  stopped: '#6B7280',
  error: '#EF4444',
  warn: '#EAB308',
  ok: '#22C55E',
};

export function resolveTheme(name) {
  return THEMES[name] || THEMES[DEFAULT_THEME];
}
