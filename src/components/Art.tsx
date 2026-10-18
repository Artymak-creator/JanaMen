import "./Art.css";

/** Панорама «город + холмы + растения» — декоративный баннер, подстраивается под светлую/тёмную тему. */
export function ScenicBanner() {
  const windows = [[60,86],[60,104],[78,86],[78,104],[150,66],[168,66],[150,84],[168,84],[150,102],[168,102],[286,92],[304,92],[286,110],[304,110],[520,76],[538,76],[520,94],[538,94],[520,112],[538,112],[640,98],[658,98],[640,116],[658,116]];
  return (
    <svg className="art-banner" viewBox="0 0 800 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ab-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--art-sky-top)" /><stop offset="1" stopColor="var(--art-sky-bot)" />
        </linearGradient>
      </defs>
      <rect width="800" height="170" fill="url(#ab-sky)" />
      <circle className="art-sun" cx="680" cy="48" r="26" fill="var(--art-sun)" />
      <g className="art-cloud"><ellipse cx="120" cy="34" rx="34" ry="9" fill="var(--art-cloud)" /><ellipse cx="146" cy="28" rx="22" ry="8" fill="var(--art-cloud)" /></g>
      <g className="art-cloud art-cloud-2"><ellipse cx="420" cy="22" rx="30" ry="8" fill="var(--art-cloud)" /><ellipse cx="442" cy="17" rx="18" ry="7" fill="var(--art-cloud)" /></g>
      <path d="M0 126 Q120 86 260 118 T520 112 T800 108 V170 H0Z" fill="var(--art-hill-back)" />
      <g fill="var(--art-building)">
        <rect x="48" y="70" width="54" height="70" rx="4" /><rect x="138" y="52" width="48" height="90" rx="4" />
        <rect x="274" y="76" width="48" height="66" rx="4" /><rect x="508" y="60" width="48" height="82" rx="4" /><rect x="628" y="82" width="48" height="60" rx="4" />
      </g>
      <g fill="var(--art-window)" className="art-windows">
        {windows.map(([x, y], i) => <rect key={i} x={x} y={y} width="10" height="10" rx="2" style={{ animationDelay: `${(i % 7) * 0.6}s` }} />)}
      </g>
      <path d="M0 146 Q150 118 320 142 T640 138 T800 134 V170 H0Z" fill="var(--art-hill-front)" />
      {[[210,138],[400,142],[580,138],[740,134]].map(([x, y], i) => (
        <g key={i} className="art-tree" style={{ animationDelay: `${i * 0.5}s`, transformOrigin: `${x}px ${y}px` }}>
          <rect x={x - 2} y={y - 14} width="4" height="16" fill="var(--art-trunk)" /><circle cx={x} cy={y - 24} r="13" fill="var(--art-leaf)" />
        </g>
      ))}
      {[[90,40],[360,60],[600,30]].map(([x, y], i) => (
        <path key={i} className="art-leaf-float" style={{ animationDelay: `${i * 1.7}s` }} d={`M${x} ${y} q8 -10 16 0 q-8 10 -16 0Z`} fill="var(--art-leaf)" />
      ))}
    </svg>
  );
}

/** Пустое состояние: бумажный самолётик и звёздочки. */
export function EmptyArt() {
  return (
    <svg className="art-empty" viewBox="0 0 160 110" aria-hidden="true">
      <ellipse cx="80" cy="96" rx="52" ry="8" fill="var(--primary-soft)" />
      <g className="art-plane">
        <path d="M24 56 L132 22 L98 84 L82 62 Z" fill="var(--surface-solid)" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M82 62 L132 22 L74 70 Z" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
      </g>
      <path d="M12 86 C30 80 40 92 58 84" stroke="var(--primary)" strokeWidth="2" fill="none" strokeDasharray="4 5" strokeLinecap="round" />
      {[[28,26],[140,64],[118,10]].map(([x, y], i) => <path key={i} className="art-star" style={{ animationDelay: `${i * .5}s`, transformOrigin: `${x}px ${y}px` }} d={`M${x} ${y-6} L${x+2} ${y-2} L${x+6} ${y} L${x+2} ${y+2} L${x} ${y+6} L${x-2} ${y+2} L${x-6} ${y} L${x-2} ${y-2}Z`} fill="var(--orange)" />)}
    </svg>
  );
}

/** Иллюстрации для курсов. */
export function CourseArt({ variant }: { variant: "shield" | "building" }) {
  return (
    <svg className="art-course" viewBox="0 0 120 90" aria-hidden="true">
      <rect width="120" height="90" rx="14" fill="var(--primary-soft)" />
      {variant === "shield" ? (
        <g>
          <path className="art-pulse" d="M60 14 L92 26 V46 C92 64 78 74 60 80 C42 74 28 64 28 46 V26Z" fill="var(--primary)" />
          <rect x="49" y="42" width="22" height="18" rx="4" fill="#fff" /><path d="M53 42 v-6 a7 7 0 0 1 14 0 v6" stroke="#fff" strokeWidth="4" fill="none" />
          <circle cx="60" cy="51" r="2.6" fill="var(--primary-dark)" />
        </g>
      ) : (
        <g>
          <rect x="30" y="30" width="26" height="46" rx="3" fill="var(--primary)" /><rect x="62" y="18" width="28" height="58" rx="3" fill="var(--primary-dark)" />
          {[[36,38],[46,38],[36,50],[46,50],[68,26],[80,26],[68,40],[80,40],[68,54],[80,54]].map(([x, y], i) => <rect key={i} x={x} y={y} width="6" height="6" rx="1.5" fill="#fff" opacity=".85" />)}
          <rect x="22" y="76" width="76" height="4" rx="2" fill="var(--primary)" opacity=".5" />
        </g>
      )}
    </svg>
  );
}
