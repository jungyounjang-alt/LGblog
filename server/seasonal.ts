import type { BlogPost } from './types.js';

export interface MonthEvent {
  event: string;        // e.g. "장마 시작"
  appliances: string[]; // e.g. ["제습기", "의류건조기"]
}

const MONTHLY: Record<number, MonthEvent[]> = {
  1: [
    { event: '한파 / 동파 위험', appliances: ['보일러', '가습기'] },
    { event: '건조한 실내 공기', appliances: ['가습기', '공기청정기'] },
    { event: '겨울 빨래 건조', appliances: ['의류건조기'] },
    { event: '전기요금 절약', appliances: ['난방 가전 효율'] },
  ],
  2: [
    { event: '설 명절 (음력 1/1)', appliances: ['김치냉장고', '오븐', '식기세척기'] },
    { event: '새학기 준비', appliances: ['노트북', '모니터'] },
    { event: '환절기 진입', appliances: ['공기청정기', '의류관리기'] },
    { event: '한파 말기 동파 예방', appliances: ['세탁기', '보일러'] },
  ],
  3: [
    { event: '미세먼지 / 황사', appliances: ['공기청정기', '의류관리기'] },
    { event: '새학기 시작', appliances: ['노트북', '모니터'] },
    { event: '환절기 의류 관리', appliances: ['의류관리기', '스타일러'] },
  ],
  4: [
    { event: '미세먼지 지속', appliances: ['공기청정기'] },
    { event: '환절기 알레르기', appliances: ['에어케어'] },
    { event: '에어컨 사전 점검 / 시운전', appliances: ['에어컨', '에어컨 청소'] },
    { event: '봄맞이 청소', appliances: ['청소기', '로봇청소기'] },
  ],
  5: [
    { event: '에어컨 본격 사용 직전', appliances: ['에어컨'] },
    { event: '봄맞이 대청소', appliances: ['청소기', '의류관리기'] },
    { event: '환기 시즌', appliances: ['공기청정기'] },
  ],
  6: [
    { event: '무더위 시작', appliances: ['에어컨'] },
    { event: '장마 시작 (평년)', appliances: ['제습기', '의류건조기'] },
    { event: '여름철 음식 보관', appliances: ['김치냉장고', '냉장고'] },
  ],
  7: [
    { event: '폭염 / 전기요금 급증', appliances: ['에어컨'] },
    { event: '장마 절정', appliances: ['제습기', '의류건조기'] },
    { event: '곰팡이 예방', appliances: ['제습기'] },
  ],
  8: [
    { event: '폭염 지속', appliances: ['에어컨'] },
    { event: '여름 음식 보관', appliances: ['냉장고', '김치냉장고'] },
    { event: '에어컨 청소 점검', appliances: ['에어컨'] },
  ],
  9: [
    { event: '추석 명절 (음력 8/15)', appliances: ['김치냉장고', '오븐', '식기세척기'] },
    { event: '무더위 종료 — 에어컨 세척', appliances: ['에어컨 청소'] },
    { event: '환절기 알레르기', appliances: ['공기청정기'] },
  ],
  10: [
    { event: '에어컨 보관 / 시즌 종료', appliances: ['에어컨 청소'] },
    { event: '가을 의류 관리', appliances: ['의류관리기', '스타일러'] },
    { event: '실내 공기질', appliances: ['공기청정기'] },
  ],
  11: [
    { event: '김장철 시작', appliances: ['김치냉장고'] },
    { event: '겨울 빨래 건조', appliances: ['의류건조기'] },
    { event: '건조한 실내', appliances: ['가습기'] },
  ],
  12: [
    { event: '김장철 절정', appliances: ['김치냉장고'] },
    { event: '한파 / 동파 대비', appliances: ['보일러', '가습기', '세탁기'] },
    { event: '연말 대청소', appliances: ['청소기', '로봇청소기'] },
    { event: '겨울 가전 풀가동', appliances: ['의류건조기', '의류관리기'] },
  ],
};

export interface SeasonalCalendar {
  currentMonth: number;
  months: { month: number; events: MonthEvent[] }[];
}

export function buildSeasonal(_blogPosts?: BlogPost[]): SeasonalCalendar {
  const currentMonth = new Date().getMonth() + 1;
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return { month: m, events: MONTHLY[m] ?? [] };
  });
  return { currentMonth, months };
}
