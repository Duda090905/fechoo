// Datas nas mensagens da API, sempre no horario de Campinas.
// Ex.: "sex., 7 de nov., às 14:00"
function formatarDataHora(data) {
  const d = new Date(data);
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: 'numeric', month: 'short' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia}, às ${hora}`;
}

module.exports = { formatarDataHora };
