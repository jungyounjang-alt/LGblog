import { useEffect, useState } from 'react';

interface MonthEvent {
  event: string;
  appliances: string[];
}
interface MonthCard {
  month: number;
  events: MonthEvent[];
}
interface SeasonalCalendarData {
  currentMonth: number;
  months: MonthCard[];
}

interface Props {
  refreshKey: number;
}

const KO_MONTHS = ['', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export function SeasonalCalendar({ refreshKey }: Props) {
  const [data, setData] = useState<SeasonalCalendarData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    void fetch('/api/seasonal')
      .then((r) => r.json())
      .then(setData);
  }, [refreshKey]);

  if (!data) return null;

  const cur = data.currentMonth;
  const prev = cur === 1 ? 12 : cur - 1;
  const next = cur === 12 ? 1 : cur + 1;

  // Pick 3 cards in [prev, cur, next] order
  const monthByNum = new Map(data.months.map((m) => [m.month, m]));
  const threeMonths = [prev, cur, next]
    .map((n) => monthByNum.get(n))
    .filter((m): m is MonthCard => !!m);

  const visible = expanded ? data.months : threeMonths;
  const labelFor = (m: number): string => {
    if (m === prev) return '지난 달';
    if (m === cur) return '이번 달';
    if (m === next) return '다음 달';
    return '';
  };

  return (
    <section className="seasonal-cal">
      <header className="seasonal-cal-head">
        <h2>월별 가전 이벤트 캘린더</h2>
        <button
          type="button"
          className="cal-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '◢ 접기' : '◣ 1~12월 전체 보기'}
        </button>
      </header>
      <div className={'seasonal-cal-grid' + (expanded ? ' expanded' : ' compact')}>
        {visible.map((m) => {
          const tag = !expanded ? labelFor(m.month) : '';
          return (
            <div
              key={m.month}
              className={
                'month-card' + (m.month === cur ? ' current' : '')
              }
            >
              <div className="month-card-head">
                <span className="month-num">
                  {KO_MONTHS[m.month]}
                  {tag && <span className="month-tag muted small"> · {tag}</span>}
                </span>
                {m.month === cur && <span className="now-badge">이번 달</span>}
              </div>
              <ul className="event-list">
                {m.events.map((e, i) => (
                  <li key={i}>
                    <div className="event-name">{e.event}</div>
                    <div className="event-appliances">
                      {e.appliances.map((a) => (
                        <span key={a} className="appliance-chip">{a}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
