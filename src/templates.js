function moneyText(value) {
  return value || 'A combinar';
}

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'tudo bem';
}

function welcomeMessage() {
  return `👋 Olá! Eu sou o *ParanáPOP Empregos*.

Para começar, me diga quem está falando:

*1* — Sou Candidato(a)
*2* — Sou Empresa
*3* — Quero falar com o suporte

Responda apenas com o número da opção.`;
}

function candidateMenu(user) {
  const trial = user.trial_until ? new Date(user.trial_until).toLocaleDateString('pt-BR') : 'ativo';
  return `👤 *Menu do Candidato — ParanáPOP Empregos*

Olá, ${firstName(user.name)}!
Seu acesso gratuito está ativo até: *${trial}*.

*1* — Ver vagas do meu perfil
*2* — Ver todas as vagas
*3* — Ver meu perfil
*4* — Editar meu perfil
*5* — Assinatura e premium
*6* — Pausar alertas
*7* — Ativar alertas
*8* — Falar com suporte

Você também pode enviar *VAGA 12* para ver detalhes ou *CANDIDATAR 12* para demonstrar interesse.`;
}

function companyMenu(user) {
  return `🏢 *Menu da Empresa — ParanáPOP Empregos*

Empresa: *${user.company_name || user.name || 'não informado'}*

*1* — Cadastrar vaga
*2* — Minhas vagas
*3* — Pausar/excluir vaga
*4* — Reativar vaga
*5* — Ver candidatos de uma vaga
*6* — Plano da empresa
*7* — Falar com suporte

Responda com o número da opção.`;
}

function supportMenu() {
  return `🧑‍💻 *Suporte ParanáPOP Empregos*

Digite sua dúvida ou solicitação. Nossa equipe poderá retornar por aqui.

Para voltar ao início, envie *MENU*.`;
}

function jobCard(job) {
  return `#${job.id} — *${job.title}*
🏢 ${job.company_name || 'Empresa cadastrada'}
📍 ${job.city || 'Cidade não informada'}
🧩 Área: ${job.area || 'Não informada'}
💼 Modalidade: ${job.modality || 'Não informada'}
💰 Salário: ${moneyText(job.salary)}

Envie *VAGA ${job.id}* para ver detalhes.
Envie *CANDIDATAR ${job.id}* para demonstrar interesse.`;
}

function jobDetails(job) {
  return `📌 *Vaga #${job.id} — ${job.title}*

🏢 Empresa: ${job.company_name || 'Empresa cadastrada'}
📍 Cidade: ${job.city || 'Não informada'}
🧩 Área: ${job.area || 'Não informada'}
💼 Modalidade: ${job.modality || 'Não informada'}
💰 Salário: ${moneyText(job.salary)}

✅ *Requisitos:*
${job.requirements || 'Não informado'}

🎁 *Benefícios:*
${job.benefits || 'Não informado'}

📲 *Como se candidatar:*
${job.contact_info || 'Envie CANDIDATAR ' + job.id + ' por aqui.'}

Para se candidatar pelo bot, envie: *CANDIDATAR ${job.id}*`;
}

function jobDraftSummary(data) {
  return `📝 *Revise a vaga antes de publicar:*

Título: *${data.title || '-'}*
Cidade: ${data.city || '-'}
Área: ${data.area || '-'}
Modalidade: ${data.modality || '-'}
Salário: ${moneyText(data.salary)}
Requisitos: ${data.requirements || '-'}
Benefícios: ${data.benefits || '-'}
Contato/Instruções: ${data.contact_info || '-'}

Digite *PUBLICAR* para ativar a vaga ou *CANCELAR* para descartar.`;
}

function noJobsMessage() {
  return `Ainda não encontrei vagas ativas com esse filtro.

Você pode enviar *2* no menu do candidato para ver todas as vagas ou voltar mais tarde.`;
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
