/**
 * CertificateSeal — the official LearnAfrica certification seal.
 *
 * A real, detailed emblem instead of the previous plain text-in-a-circle:
 * a scalloped gold rim, a green band carrying the platform name and
 * "Official Certification" in circular type, a laurel wreath, and the LA
 * monogram. Every colour is a literal hex value on purpose — CSS custom
 * properties and `currentColor` do not resolve predictably inside a printed
 * page, so the seal renders identically on screen and in the saved PDF.
 */

// Scalloped outer rim: alternate the radius between each pair of points so the
// edge reads as milled metal rather than a smooth circle.
const RIM_POINTS = (() => {
  const teeth = 60;
  const outer = 100;
  const inner = 88.5;
  const pts = [];
  for (let i = 0; i < teeth * 2; i += 1) {
    const angle = (i * Math.PI) / teeth - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(`${(100 + r * Math.cos(angle)).toFixed(2)},${(100 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
})();

// Laurel leaves along a bottom arc, plus their mirrored counterparts.
const LAUREL_LEAVES = (() => {
  const leaves = [];
  for (let deg = 30; deg <= 150; deg += 20) {
    const a = (deg * Math.PI) / 180;
    const x = 100 + 50 * Math.cos(a);
    const y = 100 + 50 * Math.sin(a);
    leaves.push({ x, y, deg });
    leaves.push({ x: 200 - x, y, deg: 180 - deg });
  }
  return leaves;
})();

export function CertificateSeal({ size = 118, className = '' }) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="LearnAfrica official certification seal"
    >
      <defs>
        <radialGradient id="la-seal-disc" cx="50%" cy="40%" r="68%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="58%" stopColor="#f5faf7" />
          <stop offset="100%" stopColor="#e6f3ea" />
        </radialGradient>
        {/* Text baselines: top arc runs left→right, bottom arc right→left so
            both read upright around the band. */}
        <path id="la-seal-arc-top" d="M 25 100 A 75 75 0 0 1 175 100" />
        <path id="la-seal-arc-bottom" d="M 175 100 A 75 75 0 0 1 25 100" />
      </defs>

      {/* Milled gold rim */}
      <polygon points={RIM_POINTS} fill="#c9a227" stroke="#0f4d34" strokeWidth="1" />

      {/* Green band + its gold guard rings */}
      <circle cx="100" cy="100" r="88" fill="#0f4d34" />
      <circle cx="100" cy="100" r="80.5" fill="none" stroke="#c9a227" strokeWidth="1.1" />
      <circle cx="100" cy="100" r="70" fill="none" stroke="#c9a227" strokeWidth="1.1" />

      {/* Circular type */}
      <text
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="12"
        fontWeight="700"
        letterSpacing="2.4"
        fill="#f7fbf8"
      >
        <textPath href="#la-seal-arc-top" startOffset="50%" textAnchor="middle">
          LEARNAFRICA LITE
        </textPath>
      </text>
      <text
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="9.5"
        fontWeight="700"
        letterSpacing="1.6"
        fill="#e8d8a8"
      >
        <textPath href="#la-seal-arc-bottom" startOffset="50%" textAnchor="middle">
          OFFICIAL CERTIFICATION
        </textPath>
      </text>

      {/* Inner disc */}
      <circle cx="100" cy="100" r="67" fill="url(#la-seal-disc)" stroke="#0f4d34" strokeWidth="2" />
      <circle cx="100" cy="100" r="61.5" fill="none" stroke="#0f4d34" strokeWidth="0.6" opacity="0.45" />

      {/* Laurel wreath */}
      <g fill="#2f7a52">
        {LAUREL_LEAVES.map(({ x, y, deg }) => (
          <ellipse
            key={`${x}-${deg}`}
            cx={x}
            cy={y}
            rx="5.4"
            ry="2.5"
            transform={`rotate(${deg} ${x} ${y})`}
          />
        ))}
      </g>

      {/* LA monogram + legend */}
      <text
        x="100"
        y="99"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="34"
        fontWeight="700"
        fill="#0f4d34"
      >
        LA
      </text>
      <line x1="84" y1="108" x2="116" y2="108" stroke="#c9a227" strokeWidth="1.2" />
      <text
        x="100"
        y="121"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="8"
        fontWeight="700"
        letterSpacing="1.8"
        fill="#0f4d34"
      >
        CERTIFIED
      </text>
    </svg>
  );
}

export default CertificateSeal;
