// Icones proprios em SVG. Sem biblioteca externa: sao poucos e assim o
// projeto nao ganha dependencia so por causa de desenho.
const base = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round'
};

export function IconeBusca(p) {
  return <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
export function IconeCadeado(p) {
  return <svg {...base} {...p}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}
export function IconeCheque(p) {
  return <svg {...base} {...p}><path d="m4 12.5 5 5L20 6.5" /></svg>;
}
export function IconeEscudo(p) {
  return <svg {...base} {...p}><path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" /></svg>;
}
export function IconeConversa(p) {
  return <svg {...base} {...p}><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" /></svg>;
}
export function IconeCarteira(p) {
  return <svg {...base} {...p}><path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" /><rect x="3" y="8" width="18" height="11" rx="2" /><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" /></svg>;
}
export function IconeEstrela(p) {
  return <svg {...base} {...p}><path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8L12 4Z" /></svg>;
}
export function IconeRelogio(p) {
  return <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></svg>;
}
export function IconeSeta(p) {
  return <svg {...base} {...p}><path d="M5 12h13" /><path d="m12.5 6 6 6-6 6" /></svg>;
}
export function IconeMenu(p) {
  return <svg {...base} {...p}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>;
}
export function IconeFechar(p) {
  return <svg {...base} {...p}><path d="m6 6 12 12" /><path d="m18 6-12 12" /></svg>;
}
