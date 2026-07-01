function moneyText(value) {
  return value || 'A combinar';
}

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'tudo bem';
}

function section(title) {
  return `╭─ ${title}\n`;
}

function footer(text = 'Digite *MENU* para voltar ao início.') {
  return `\n╰─ ${text}`;
}

function welcomeMessage() {
  return `${section('👋 ParanáPOP Empregos')}` +
    `Seu acesso rápido a vagas e candidatos pelo WhatsApp.\n\n` +
    `Escolha uma opção:\n\n` +
    `*1*  🔎 Quero arrumar emprego\n` +
    `*2*  🏢 Quero contratar\n` +
    `*3*  🧑‍💻 Falar com suporte` +
    footer('Responda com o número da opção.');
}

function candidateMenu(user) {
  const trial = user.trial_until ? new Date(user.trial_until).toLocaleDateString('pt-BR') : 'ativo';
  const alerts = user.alerts_enabled ? '🔔 Ativos' : '🔕 Pausados';

  return `${section('👤 Área do Candidato')}` +
    `Olá, *${firstName(user.name)}*!\n` +
    `Acesso grátis até: *${trial}*\n` +
    `Alertas: *${alerts}*\n\n` +
    `*1*  🎯 Vagas do meu perfil\n` +
    `*2*  📋 Todas as vagas\n` +
    `*3*  👤 Meu perfil\n` +
    `*4*  ✏️ Editar perfil\n` +
    `*5*  💳 Assinatura e premium\n` +
    `*6*  🔕 Pausar alertas\n` +
    `*7*  🔔 Ativar alertas\n` +
    `*8*  🧑‍💻 Suporte\n` +
    `*9*  🗑️ Excluir cadastro` +
    footer('Atalhos: *VAGA 12* para detalhes ou *CANDIDATAR 12* para se candidatar.');
}

function companyMenu(user) {
  return `${section('🏢 Área da Empresa')}` +
    `Empresa: *${user.company_name || user.name || 'não informado'}*\n\n` +
    `*1*  ➕ Cadastrar vaga\n` +
    `*2*  📋 Minhas vagas\n` +
    `*3*  ⏸️ Pausar vaga\n` +
    `*4*  ✅ Reativar vaga\n` +
    `*5*  📥 Ver candidatos\n` +
    `*6*  💼 Plano da empresa\n` +
    `*7*  🧑‍💻 Suporte\n` +
    `*8*  🗑️ Excluir cadastro` +
    footer('Responda com o número da opção.');
}

function supportMenu() {
  return `${section('🧑‍💻 Suporte ParanáPOP')}` +
    `Digite sua dúvida ou solicitação.\n` +
    `Nossa equipe poderá retornar por aqui.` +
    footer('Para voltar ao menu, envie *MENU*.');
}

function jobCard(job) {
  return `${section(`💼 Vaga #${job.id}`)}` +
    `*${job.title}*\n` +
    `🏢 ${job.company_name || 'Empresa cadastrada'}\n` +
    `📍 ${job.city || 'Cidade não informada'}\n` +
    `🧩 ${job.area || 'Área não informada'}\n` +
    `💼 ${job.modality || 'Modalidade não informada'}\n` +
    `💰 ${moneyText(job.salary)}\n\n` +
    `*Ações rápidas:*\n` +
    `• Envie *VAGA ${job.id}* para detalhes\n` +
    `• Envie *CANDIDATAR ${job.id}* para se candidatar` +
    `\n╰──────────────`;
}

function jobDetails(job) {
  return `${section(`📌 Detalhes da vaga #${job.id}`)}` +
    `*${job.title}*\n\n` +
    `🏢 Empresa: ${job.company_name || 'Empresa cadastrada'}\n` +
    `📍 Cidade: ${job.city || 'Não informada'}\n` +
    `🧩 Área: ${job.area || 'Não informada'}\n` +
    `💼 Modalidade: ${job.modality || 'Não informada'}\n` +
    `💰 Salário: ${moneyText(job.salary)}\n\n` +
    `✅ *Requisitos*\n${job.requirements || 'Não informado'}\n\n` +
    `🎁 *Benefícios*\n${job.benefits || 'Não informado'}\n\n` +
    `📲 *Como se candidatar*\n${job.contact_info || 'Envie CANDIDATAR ' + job.id + ' por aqui.'}` +
    footer(`Para se candidatar pelo bot, envie *CANDIDATAR ${job.id}*.`);
}

function jobDraftSummary(data) {
  return `${section('📝 Revisão da vaga')}` +
    `Confira antes de publicar:\n\n` +
    `Cargo: *${data.title || '-'}*\n` +
    `Cidade: ${data.city || '-'}\n` +
    `Área: ${data.area || '-'}\n` +
    `Modalidade: ${data.modality || '-'}\n` +
    `Salário: ${moneyText(data.salary)}\n` +
    `Requisitos: ${data.requirements || '-'}\n` +
    `Benefícios: ${data.benefits || '-'}\n` +
    `Contato/Instruções: ${data.contact_info || '-'}` +
    footer('Digite *PUBLICAR* para ativar ou *CANCELAR* para descartar.');
}

function noJobsMessage() {
  return `${section('🔎 Nenhuma vaga encontrada')}` +
    `Ainda não encontrei vagas ativas com esse filtro.\n\n` +
    `Você pode enviar *2* no menu do candidato para ver todas as vagas ou voltar mais tarde.` +
    footer();
}

module.exports = {
  welcomeMessage,
  candidateMenu,
  companyMenu,
  supportMenu,
  jobCard,
  jobDetails,
  jobDraftSummary,
  noJobsMessage
};
