import type { BlogPost } from './types.js';

// 월별 추천 카테고리 (1=Jan ~ 12=Dec). 우선순위가 높은 것을 앞에.
// 카테고리 키워드는 cateName에 부분 일치(contains)로 매칭됨.
const MONTHLY: Record<number, { keywords: string[]; reasonKo: string; reasonEn: string }[]> = {
  1: [
    { keywords: ['건조기', '의류관리기', '스타일러'], reasonKo: '겨울 의류 관리 수요', reasonEn: 'Winter clothing care' },
    { keywords: ['가습기', '에어케어', '공기청정기'], reasonKo: '건조한 실내 공기', reasonEn: 'Dry indoor air' },
    { keywords: ['보일러', '난방'], reasonKo: '한파/난방 시즌', reasonEn: 'Cold snap / heating' },
  ],
  2: [
    { keywords: ['가습기', '에어케어'], reasonKo: '환절기 진입 전 건조', reasonEn: 'End-of-winter dryness' },
    { keywords: ['김치냉장고'], reasonKo: '설 명절 음식 보관', reasonEn: 'Lunar New Year storage' },
    { keywords: ['오븐', '식기세척기'], reasonKo: '명절 요리/뒷정리', reasonEn: 'Holiday cooking & cleanup' },
  ],
  3: [
    { keywords: ['공기청정기', '에어케어'], reasonKo: '미세먼지/황사', reasonEn: 'Fine dust / yellow dust' },
    { keywords: ['의류관리기', '스타일러'], reasonKo: '환절기 의류 관리', reasonEn: 'Spring wardrobe rotation' },
  ],
  4: [
    { keywords: ['공기청정기', '에어케어'], reasonKo: '미세먼지 지속', reasonEn: 'Fine dust season' },
    { keywords: ['에어컨'], reasonKo: '에어컨 청소/시운전', reasonEn: 'AC cleaning & test run' },
  ],
  5: [
    { keywords: ['에어컨'], reasonKo: '에어컨 본격 사용 직전', reasonEn: 'Pre-summer AC prep' },
    { keywords: ['청소기'], reasonKo: '봄맞이 대청소', reasonEn: 'Spring cleaning' },
  ],
  6: [
    { keywords: ['에어컨'], reasonKo: '여름 본격 시작', reasonEn: 'Summer kicks in' },
    { keywords: ['제습기'], reasonKo: '장마 시즌', reasonEn: 'Monsoon season' },
    { keywords: ['김치냉장고', '냉장고'], reasonKo: '여름철 음식 보관', reasonEn: 'Summer food storage' },
  ],
  7: [
    { keywords: ['에어컨'], reasonKo: '폭염/전기료', reasonEn: 'Heat wave & electricity bills' },
    { keywords: ['제습기'], reasonKo: '장마 절정', reasonEn: 'Peak monsoon' },
    { keywords: ['건조기'], reasonKo: '장마철 빨래 건조', reasonEn: 'Laundry drying in monsoon' },
  ],
  8: [
    { keywords: ['에어컨'], reasonKo: '폭염 지속', reasonEn: 'Continued heat wave' },
    { keywords: ['냉장고', '김치냉장고'], reasonKo: '여름 음식 보관 지속', reasonEn: 'Summer food storage' },
  ],
  9: [
    { keywords: ['공기청정기', '에어케어'], reasonKo: '환절기 알레르기', reasonEn: 'Autumn allergies' },
    { keywords: ['김치냉장고'], reasonKo: '추석 명절 음식 보관', reasonEn: 'Chuseok food storage' },
    { keywords: ['오븐', '식기세척기'], reasonKo: '추석 요리/뒷정리', reasonEn: 'Chuseok cooking & cleanup' },
  ],
  10: [
    { keywords: ['의류관리기', '스타일러'], reasonKo: '가을 의류 관리', reasonEn: 'Autumn wardrobe' },
    { keywords: ['공기청정기'], reasonKo: '실내 공기질', reasonEn: 'Indoor air quality' },
  ],
  11: [
    { keywords: ['의류건조기', '건조기'], reasonKo: '겨울 빨래 건조', reasonEn: 'Winter laundry drying' },
    { keywords: ['가습기'], reasonKo: '건조한 실내', reasonEn: 'Dry indoors' },
  ],
  12: [
    { keywords: ['의류건조기', '건조기', '가습기', '의류관리기'], reasonKo: '겨울 가전 풀가동', reasonEn: 'Full winter usage' },
    { keywords: ['김치냉장고'], reasonKo: '김장철', reasonEn: 'Kimjang season' },
    { keywords: ['보일러', '난방'], reasonKo: '한파 대비', reasonEn: 'Cold snap prep' },
  ],
};

const HOLIDAY_NOTES: Record<number, { ko: string; en: string }[]> = {
  2: [{ ko: '설 연휴 (음력 1/1)', en: 'Lunar New Year' }],
  6: [{ ko: '장마 시작 (평년)', en: 'Monsoon starts (avg)' }],
  7: [{ ko: '장마 / 폭염', en: 'Monsoon / heat wave' }],
  9: [{ ko: '추석 (음력 8/15)', en: 'Chuseok' }],
  12: [{ ko: '김장철', en: 'Kimjang season' }],
};

export interface SeasonalRecommendation {
  keywords: string[];
  reasonKo: string;
  reasonEn: string;
  postsThisMonth: number;          // 이번 달에 이미 발행한 매칭 카테고리 글 수
  postsLast90Days: number;         // 최근 90일간 매칭 글 수
  recommendedMin: number;          // 이상적 최소 발행 수
  status: 'ok' | 'low' | 'critical'; // ok=충분, low=부족, critical=거의 없음
}

export interface SeasonalResponse {
  month: number;
  monthLabelKo: string;
  monthLabelEn: string;
  recommendations: SeasonalRecommendation[];
  notes: { ko: string; en: string }[];
}

const KO_MONTHS = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const EN_MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((k) => haystack.includes(k));
}

export function buildSeasonal(blogPosts: BlogPost[], today = new Date()): SeasonalResponse {
  const month = today.getMonth() + 1;
  const items = MONTHLY[month] ?? [];
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const ninetyAgo = new Date(today.getTime() - 90 * 86400 * 1000);

  const recommendations: SeasonalRecommendation[] = items.map((it) => {
    let postsThisMonth = 0;
    let postsLast90Days = 0;
    for (const p of blogPosts) {
      if (!matchesAny(p.title, it.keywords)) continue;
      const t = p.publishedAt ? Date.parse(p.publishedAt) : NaN;
      if (Number.isNaN(t)) continue;
      const d = new Date(t);
      if (d >= monthStart) postsThisMonth++;
      if (d >= ninetyAgo) postsLast90Days++;
    }
    // 권장 최소: 한 달에 4건 (주 1회 기준)
    const recommendedMin = 4;
    let status: SeasonalRecommendation['status'] = 'ok';
    if (postsThisMonth === 0) status = 'critical';
    else if (postsThisMonth < recommendedMin) status = 'low';
    return {
      keywords: it.keywords,
      reasonKo: it.reasonKo,
      reasonEn: it.reasonEn,
      postsThisMonth,
      postsLast90Days,
      recommendedMin,
      status,
    };
  });

  return {
    month,
    monthLabelKo: KO_MONTHS[month],
    monthLabelEn: EN_MONTHS[month],
    recommendations,
    notes: HOLIDAY_NOTES[month] ?? [],
  };
}
