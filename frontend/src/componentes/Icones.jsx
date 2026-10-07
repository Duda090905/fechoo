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
export function IconeLocal(p) {
  return <svg {...base} {...p}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></svg>;
}
export function IconeCalendario(p) {
  return <svg {...base} {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16" /><path d="M8.5 3.5v4" /><path d="M15.5 3.5v4" /></svg>;
}
export function IconeImagem(p) {
  return <svg {...base} {...p}><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4.5 17.5 5-5 4 4 2.5-2.5 3.5 3.5" /></svg>;
}
export function IconeEnviar(p) {
  return <svg {...base} {...p}><path d="M20.5 3.5 10 14" /><path d="m20.5 3.5-6.5 17-4-6.5-6.5-4 17-6.5Z" /></svg>;
}
export function IconeVoltar(p) {
  return <svg {...base} {...p}><path d="M19 12H6" /><path d="m11.5 6-6 6 6 6" /></svg>;
}
export function IconeSelo(p) {
  return <svg {...base} {...p}><path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}
export function IconeMais(p) {
  return <svg {...base} {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
}
