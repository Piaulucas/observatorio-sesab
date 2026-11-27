/** Símbolos SVG originais do Sprint 02.1: ambulância e bandeira da Bahia (desenho geométrico próprio). */
export function Simbolos() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="ambulancia" viewBox="0 0 64 40">
        <rect x="10" y="3.5" width="9" height="3.5" rx="1.2" fill="#eda100" />
        <rect x="3" y="7" width="36" height="23" rx="3" fill="#fff" stroke="#0B2545" strokeWidth="2" />
        <path d="M39 13h11.5l8.5 8.5V30H39z" fill="#fff" stroke="#0B2545" strokeWidth="2" strokeLinejoin="round" />
        <path d="M42 16h7.6l5.4 5.4H42z" fill="#cde2fb" stroke="#0B2545" strokeWidth="1.4" strokeLinejoin="round" />
        <rect x="3" y="23.5" width="56" height="2.4" fill="#2a78d6" />
        <rect x="18" y="10.5" width="5" height="11" rx=".8" fill="#1c5cab" />
        <rect x="15" y="13.5" width="11" height="5" rx=".8" fill="#1c5cab" />
        <circle cx="14" cy="31" r="5" fill="#0B2545" />
        <circle cx="14" cy="31" r="1.9" fill="#fff" />
        <circle cx="49" cy="31" r="5" fill="#0B2545" />
        <circle cx="49" cy="31" r="1.9" fill="#fff" />
      </symbol>
      <symbol id="bandeira-ba" viewBox="0 0 30 20">
        <rect width="30" height="20" fill="#fff" />
        <rect y="5" width="30" height="5" fill="#d31920" />
        <rect y="15" width="30" height="5" fill="#d31920" />
        <rect width="10" height="10" fill="#003087" />
        <path d="M1.08 8.2h7.84L5 1.4z" fill="#fff" />
      </symbol>
    </svg>
  );
}
