const {
  getOrCreateUser,
  getUserByJid,
  updateUser,
  mergeUserData,
  clearUserFlow,
  createJob,
  getJobById,
  updateJobStatus,
  listCompanyJobs,
  countCompanyActiveJobs,
  listRecentJobs,
  listActiveJobsForMatching,
  listCandidatesForAlerts,
  createApplication,
  listApplicationsForJob,
  deleteUserAccount,
  logMessage,
  query
} = require('./db');
const {
  welcomeMessage,
  candidateMenu,
  companyMenu,
  supportMenu,
  jobCard,
  jobDetails,
  jobDraftSummary,
  noJobsMessage
} = require('./templates');

const TRIAL_DAYS = Number(process.env.CANDIDATE_TRIAL_DAYS || 60);
const PREMIUM_PRICE = process.env.CANDIDATE_PREMIUM_PRICE_BRL || '9,90';
const PREMIUM_DAYS = Number(process.env.CANDIDATE_PREMIUM_DAYS || 90);
const COMPANY_FREE_JOB_LIMIT = Number(process.env.COMPANY_FREE_JOB_LIMIT || 3);
const COMPANY_PREMIUM_PRICE = process.env.COMPANY_PREMIUM_PRICE_BRL || '34,90';
const BROADCAST_LIMIT_PER_JOB = Number(process.env.BROADCAST_LIMIT_PER_JOB || 80);
const BROADCAST_DELAY_MS = Number(process.env.BROADCAST_DELAY_MS || 700);

function normalize(text) {
  return String(text || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function compact(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function splitList(text) {
  const value = compact(text);
  if (!value) return [];
  if (normalize(value).includes('todas') || normalize(value).includes('todos')) return ['Todas'];
  return value
    .split(/[,;\/]| e /i)
    .map((item) => compact(item))
    .filter(Boolean)
    .slice(0, 8);
}

function includesAny(text, words) {
  const n = normalize(text);
  return words.some((word) => n.includes(normalize(word)));
}

function parseIdCommand(text, prefix) {
  const regex = new RegExp(`^${prefix}\\s*#?\\s*(\\d+)`, 'i');
  const match = compact(text).match(regex);
  return match ? Number(match[1]) : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function send(client, jid, text, userId = null) {
  await client.sendText(jid, text);
  await logMessage({ userId, whatsappJid: jid, direction: 'out', body: text });
}

function isDeleteRequest(text) {
  const n = normalize(text);
  return [
    'excluir cadastro',
    'apagar cadastro',
    'deletar cadastro',
    'remover cadastro',
    'excluir minha conta',
    'apagar minha conta'
  ].some((term) => n.includes(term));
}

function deleteConfirmationMessage(user) {
  const roleText = user.role === 'company' ? 'empresa' : 'candidato';
  const extra = user.role === 'company'
    ? '\n\n⚠️ As vagas cadastradas por esta empresa serão marcadas como excluídas e não aparecerão mais para candidatos.'
    : '\n\n⚠️ Suas candidaturas vinculadas a este cadastro também serão removidas.';

  return `╭─ 🗑️ *Excluir cadastro*\n` +
    `Você está prestes a excluir seu cadastro de *${roleText}* no ParanáPOP Empregos.${extra}\n\n` +
    `Para confirmar, digite exatamente:\n*CONFIRMAR EXCLUSÃO*\n\n` +
    `Para desistir, envie *CANCELAR*.\n` +
    `╰─ Essa ação não pode ser desfeita.`;
}

async function startAccountDeleteFlow(client, jid, user) {
  user = await updateUser(user.id, { onboarding_step: 'account_delete_confirm', onboarding_data: {} });
  await send(client, jid, deleteConfirmationMessage(user), user.id);
}

async function handleAccountDeleteConfirmation(client, jid, user, body) {
  const n = normalize(body);

  if (n === 'cancelar' || n === 'menu' || n === 'voltar') {
    user = await clearUserFlow(user.id, `${user.role}_menu`);
    await send(client, jid, `Exclusão cancelada.\n\n${user.role === 'company' ? companyMenu(user) : candidateMenu(user)}`, user.id);
    return;
  }

  if (n !== 'confirmar exclusao') {
    await send(client, jid, `Para excluir o cadastro, digite exatamente *CONFIRMAR EXCLUSÃO*.\n\nPara desistir, envie *CANCELAR*.`, user.id);
    return;
  }

  const result = await deleteUserAccount(user.id);
  const companyJobsText = user.role === 'company' && result.deletedJobs
    ? `\n\n${result.deletedJobs} vaga(s) da empresa foram marcadas como excluídas.`
    : '';

  await send(client, jid, `✅ Seu cadastro foi excluído do ParanáPOP Empregos.${companyJobsText}\n\nPara começar novamente no futuro, envie *OI*.`, null);
}

function candidateIsActive(user) {
  const now = Date.now();
  const trial = user.trial_until ? new Date(user.trial_until).getTime() : 0;
  const premium = user.premium_until ? new Date(user.premium_until).getTime() : 0;
  return trial >= now || premium >= now || user.subscription_status === 'active';
}

function matchesCandidate(job, candidate) {
  if (!job || !candidate) return false;
  if (candidate.receive_mode === 'all') return true;

  const jobCity = normalize(job.city || '');
  const candidateCity = normalize(candidate.city || '');
  const jobArea = normalize(job.area || '');
  const areas = (candidate.area_preferences || []).map(normalize);
  const modalities = (candidate.modality_preferences || []).map(normalize);
  const jobModality = normalize(job.modality || '');

  const cityOk = !candidateCity || !jobCity || jobCity.includes(candidateCity) || candidateCity.includes(jobCity) || jobModality.includes('remoto');
  const areaOk = areas.length === 0 || areas.includes('todas') || areas.some((area) => jobArea.includes(area) || area.includes(jobArea));
  const modalityOk = modalities.length === 0 || modalities.includes('tanto faz') || modalities.includes('todas') || modalities.some((m) => jobModality.includes(m) || m.includes(jobModality));

  return cityOk && areaOk && modalityOk;
}

function scoreJob(job, candidate) {
  let score = 0;
  const jobCity = normalize(job.city || '');
  const candidateCity = normalize(candidate.city || '');
  const jobArea = normalize(job.area || '');
  const areas = (candidate.area_preferences || []).map(normalize);
  const modalities = (candidate.modality_preferences || []).map(normalize);
  const jobModality = normalize(job.modality || '');

  if (candidate.receive_mode === 'all') score += 10;
  if (candidateCity && jobCity && (jobCity.includes(candidateCity) || candidateCity.includes(jobCity))) score += 5;
  if (jobModality.includes('remoto')) score += 3;
  if (areas.includes('todas') || areas.some((area) => jobArea.includes(area) || area.includes(jobArea))) score += 5;
  if (modalities.includes('tanto faz') || modalities.includes('todas') || modalities.some((m) => jobModality.includes(m) || m.includes(jobModality))) score += 2;
  return score;
}

async function findJobsForCandidate(candidate, all = false, limit = 8) {
  const jobs = await listActiveJobsForMatching(80);
  if (all || candidate.receive_mode === 'all') return jobs.slice(0, limit);

  return jobs
    .map((job) => ({ job, score: scoreJob(job, candidate) }))
    .filter((item) => item.score > 0 && matchesCandidate(item.job, candidate))
    .sort((a, b) => b.score - a.score || new Date(b.job.published_at || b.job.created_at) - new Date(a.job.published_at || a.job.created_at))
    .map((item) => item.job)
    .slice(0, limit);
}

async function notifyMatchingCandidates(client, job) {
  const candidates = await listCandidatesForAlerts(1000);
  let sent = 0;

  for (const candidate of candidates) {
    if (sent >= BROADCAST_LIMIT_PER_JOB) break;
    if (!candidateIsActive(candidate)) continue;
    if (!matchesCandidate(job, candidate)) continue;

    const text = `🚨 *Nova vaga no ParanáPOP Empregos!*

${jobCard(job)}

Para parar alertas, envie *PAUSAR*. Para voltar ao menu, envie *MENU*.`;
    try {
      await send(client, candidate.whatsapp_jid, text, candidate.id);
      sent += 1;
      await delay(BROADCAST_DELAY_MS);
    } catch (error) {
      console.error('Erro ao enviar alerta para candidato:', candidate.whatsapp_jid, error.message);
    }
  }
  return sent;
}

async function handleIncomingMessage(client, message) {
  const jid = message.from;
  const body = compact(message.body || message.caption || '');
  if (!jid || !body || message.isGroupMsg || message.fromMe) return;

  let user = await getOrCreateUser(jid);
  await logMessage({ userId: user.id, whatsappJid: jid, direction: 'in', body, raw: message });

  const normalized = normalize(body);

  if (['oi', 'ola', 'olá', 'inicio', 'comecar', 'começar'].includes(normalized) && !user.role) {
    await send(client, jid, welcomeMessage(), user.id);
    return;
  }

  if (['resetar', '/resetar', 'recomecar', 'recomeçar'].includes(normalized)) {
    user = await updateUser(user.id, { role: null, onboarding_step: 'role_selection', onboarding_data: {} });
    await send(client, jid, `Cadastro reiniciado.\n\n${welcomeMessage()}`, user.id);
    return;
  }

  if (['menu', '/menu', 'voltar'].includes(normalized)) {
    if (!user.role) {
      await send(client, jid, welcomeMessage(), user.id);
      return;
    }
    user = await clearUserFlow(user.id, `${user.role}_menu`);
    await send(client, jid, user.role === 'candidate' ? candidateMenu(user) : user.role === 'company' ? companyMenu(user) : supportMenu(), user.id);
    return;
  }

  if (normalized === 'pausar') {
    user = await updateUser(user.id, { alerts_enabled: false });
    await send(client, jid, '🔕 Alertas pausados. Para ativar novamente, envie *ATIVAR* ou vá no menu.', user.id);
    return;
  }

  if (normalized === 'ativar') {
    user = await updateUser(user.id, { alerts_enabled: true });
    await send(client, jid, '🔔 Alertas ativados novamente.', user.id);
    return;
  }

  if (user.onboarding_step === 'account_delete_confirm' && ['candidate', 'company'].includes(user.role)) {
    await handleAccountDeleteConfirmation(client, jid, user, body);
    return;
  }

  if (isDeleteRequest(body) && ['candidate', 'company'].includes(user.role)) {
    await startAccountDeleteFlow(client, jid, user);
    return;
  }

  const detailsId = parseIdCommand(body, 'vaga');
  if (detailsId) {
    await sendJobDetails(client, jid, user, detailsId);
    return;
  }

  const applyId = parseIdCommand(body, 'candidatar');
  if (applyId) {
    await applyToJob(client, jid, user, applyId);
    return;
  }

  if (!user.role || user.onboarding_step === 'role_selection') {
    await handleRoleSelection(client, jid, user, body);
    return;
  }

  if (user.role === 'candidate') {
    await handleCandidate(client, jid, user, body);
    return;
  }

  if (user.role === 'company') {
    await handleCompany(client, jid, user, body);
    return;
  }

  await handleSupport(client, jid, user, body);
}

async function handleRoleSelection(client, jid, user, body) {
  const n = normalize(body);

  if (n === '1' || includesAny(n, ['candidato', 'emprego', 'vaga'])) {
    const result = await query(
      `UPDATE users
       SET role = 'candidate', onboarding_step = 'candidate_name', trial_until = NOW() + ($2 || ' days')::interval,
           subscription_status = 'trial', updated_at = NOW(), last_interaction_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [user.id, TRIAL_DAYS]
    );
    await send(client, jid, `╭─ 🔎 *Cadastro de candidato*\nPerfeito! Você escolheu *Candidato(a)*.\n\nSeu acesso gratuito terá *${TRIAL_DAYS} dias*.\n\nPara começar, me diga seu *nome completo*.\n╰─ Responda com seu nome.`, result.rows[0].id);
    return;
  }

  if (n === '2' || includesAny(n, ['empresa', 'contratar', 'empregador'])) {
    const updated = await updateUser(user.id, { role: 'company', onboarding_step: 'company_name' });
    await send(client, jid, '╭─ 🏢 *Cadastro da empresa*\nÓtimo! Você escolheu *Empresa*.\n\nQual é o *nome da empresa*?\n╰─ Responda com o nome comercial.', updated.id);
    return;
  }

  if (n === '3' || includesAny(n, ['suporte', 'atendente', 'ajuda'])) {
    const updated = await updateUser(user.id, { role: 'support', onboarding_step: 'support_name' });
    await send(client, jid, '╭─ 🧑‍💻 *Suporte*\nCerto, vou direcionar seu atendimento.\n\nQual é o seu nome?\n╰─ Responda aqui mesmo.', updated.id);
    return;
  }

  await send(client, jid, welcomeMessage(), user.id);
}

async function handleCandidate(client, jid, user, body) {
  const n = normalize(body);

  if (user.onboarding_step === 'candidate_name') {
    if (body.length < 3) {
      await send(client, jid, '╭─ 👤 *Nome completo*\nMe envie seu nome completo para continuar.\n╰─ Ex.: Maria Aparecida Silva', user.id);
      return;
    }
    user = await updateUser(user.id, { name: body, onboarding_step: 'candidate_city' });
    await send(client, jid, `╭─ 📍 *Cidade de busca*\nPrazer, *${body}*!\n\nEm qual cidade você quer buscar vagas?\n╰─ Ex.: Cascavel, Foz do Iguaçu, Curitiba.`, user.id);
    return;
  }

  if (user.onboarding_step === 'candidate_city') {
    user = await updateUser(user.id, { city: body, onboarding_step: 'candidate_area' });
    await send(client, jid, `╭─ 🧩 *Áreas de interesse*\nLegal. Agora me diga as áreas separadas por vírgula.\n\nEx.: Vendas, Atendimento, Administrativo, Motorista, Cozinha, Limpeza, Tecnologia.\n\n╰─ Se quiser receber tudo, escreva *Todas*.`, user.id);
    return;
  }

  if (user.onboarding_step === 'candidate_area') {
    const areas = splitList(body);
    user = await updateUser(user.id, { area_preferences: areas, onboarding_step: 'candidate_modality' });
    await send(client, jid, `╭─ 💼 *Modalidade*\nQual modalidade você prefere?\n\n*1*  Presencial\n*2*  Remoto\n*3*  Híbrido\n*4*  Tanto faz\n╰─ Responda com o número.`, user.id);
    return;
  }

  if (user.onboarding_step === 'candidate_modality') {
    const modalityMap = { '1': ['Presencial'], '2': ['Remoto'], '3': ['Híbrido'], '4': ['Tanto faz'] };
    const modalities = modalityMap[n] || splitList(body);
    user = await updateUser(user.id, { modality_preferences: modalities, onboarding_step: 'candidate_experience' });
    await send(client, jid, `╭─ 🧾 *Experiência*\nAgora envie um resumo rápido da sua experiência.\n\nEx.: "2 anos com atendimento ao público e caixa".\n\n╰─ Se não tiver experiência, escreva *Primeiro emprego*.`, user.id);
    return;
  }

  if (user.onboarding_step === 'candidate_experience') {
    user = await updateUser(user.id, { experience: body, onboarding_step: 'candidate_receive_mode' });
    await send(client, jid, `╭─ 🔔 *Preferência de alertas*\nCadastro quase pronto!\n\nComo você quer receber vagas?\n\n*1*  Todas as vagas publicadas\n*2*  Apenas vagas compatíveis com meu perfil\n╰─ Responda com o número.`, user.id);
    return;
  }

  if (user.onboarding_step === 'candidate_receive_mode') {
    const receiveMode = n === '1' || includesAny(n, ['todas', 'todos']) ? 'all' : 'profile';
    user = await updateUser(user.id, { receive_mode: receiveMode, onboarding_step: 'candidate_menu' });
    await send(client, jid, `✅ *Cadastro concluído!*\n\nVocê ganhou *${TRIAL_DAYS} dias grátis*. Futuramente o premium de *R$ ${PREMIUM_PRICE}* vai liberar *${PREMIUM_DAYS} dias* de assinatura com prioridade de alertas e recursos extras.\n\n${candidateMenu(user)}`, user.id);
    return;
  }

  if (user.onboarding_step === 'candidate_edit_choice') {
    await handleCandidateEdit(client, jid, user, body);
    return;
  }

  if (n === '9') {
    await startAccountDeleteFlow(client, jid, user);
    return;
  }

  if (!candidateIsActive(user)) {
    await send(client, jid, `Seu período gratuito terminou.\n\nEm breve você poderá assinar o premium por *R$ ${PREMIUM_PRICE}* para liberar mais ${PREMIUM_DAYS} dias. Enquanto o pagamento não estiver ativo no sistema, chame o suporte enviando *8* no menu.`, user.id);
    return;
  }

  if (n === '1') {
    await sendCandidateJobs(client, jid, user, false);
    return;
  }
  if (n === '2') {
    await sendCandidateJobs(client, jid, user, true);
    return;
  }
  if (n === '3') {
    await sendCandidateProfile(client, jid, user);
    return;
  }
  if (n === '4') {
    user = await updateUser(user.id, { onboarding_step: 'candidate_edit_choice' });
    await send(client, jid, `O que você quer editar?\n\n*1* — Nome\n*2* — Cidade\n*3* — Áreas de interesse\n*4* — Modalidade\n*5* — Experiência\n*6* — Preferência de alertas`, user.id);
    return;
  }
  if (n === '5') {
    await send(client, jid, `💳 *Assinatura*\n\nAgora você está no acesso gratuito de ${TRIAL_DAYS} dias.\n\nPlano premium em breve: *R$ ${PREMIUM_PRICE}* por *${PREMIUM_DAYS} dias*, com alertas personalizados e prioridade.\n\nO Mercado Pago ainda não foi ativado neste projeto, mas a estrutura já está preparada.`, user.id);
    return;
  }
  if (n === '6') {
    user = await updateUser(user.id, { alerts_enabled: false });
    await send(client, jid, '🔕 Alertas pausados. Você ainda pode consultar vagas pelo menu.', user.id);
    return;
  }
  if (n === '7') {
    user = await updateUser(user.id, { alerts_enabled: true });
    await send(client, jid, '🔔 Alertas ativados.', user.id);
    return;
  }
  if (n === '8') {
    user = await updateUser(user.id, { onboarding_step: 'support_message' });
    await send(client, jid, supportMenu(), user.id);
    return;
  }
  await send(client, jid, candidateMenu(user), user.id);
}

async function handleCandidateEdit(client, jid, user, body) {
  const data = user.onboarding_data || {};
  const n = normalize(body);

  if (!data.editing) {
    const map = {
      '1': { key: 'name', question: 'Envie seu novo nome completo.' },
      '2': { key: 'city', question: 'Envie a nova cidade de busca.' },
      '3': { key: 'area_preferences', question: 'Envie as novas áreas separadas por vírgula, ou *Todas*.' },
      '4': { key: 'modality_preferences', question: 'Envie a modalidade: Presencial, Remoto, Híbrido ou Tanto faz.' },
      '5': { key: 'experience', question: 'Envie o novo resumo de experiência.' },
      '6': { key: 'receive_mode', question: 'Digite *1* para todas as vagas ou *2* para vagas do perfil.' }
    };
    if (!map[n]) {
      await send(client, jid, 'Opção inválida. Envie um número de 1 a 6.', user.id);
      return;
    }
    await mergeUserData(user, { editing: map[n].key });
    await send(client, jid, map[n].question, user.id);
    return;
  }

  const fields = { onboarding_step: 'candidate_menu', onboarding_data: {} };
  if (data.editing === 'area_preferences' || data.editing === 'modality_preferences') {
    fields[data.editing] = splitList(body);
  } else if (data.editing === 'receive_mode') {
    fields.receive_mode = n === '1' || includesAny(n, ['todas', 'todos']) ? 'all' : 'profile';
  } else {
    fields[data.editing] = body;
  }

  user = await updateUser(user.id, fields);
  await send(client, jid, `✅ Perfil atualizado.\n\n${candidateMenu(user)}`, user.id);
}

async function sendCandidateProfile(client, jid, user) {
  const text = `╭─ 👤 *Meu perfil*
Nome: *${user.name || '-'}*
Cidade: ${user.city || '-'}
Áreas: ${(user.area_preferences || []).join(', ') || '-'}
Modalidade: ${(user.modality_preferences || []).join(', ') || '-'}
Experiência: ${user.experience || '-'}
Recebimento: ${user.receive_mode === 'all' ? 'Todas as vagas' : 'Vagas do perfil'}
Alertas: ${user.alerts_enabled ? 'Ativos' : 'Pausados'}
╰─ Para editar, envie *4* no menu.`;
  await send(client, jid, text, user.id);
}

async function sendCandidateJobs(client, jid, user, all) {
  const jobs = all ? await listRecentJobs(8) : await findJobsForCandidate(user, false, 8);
  if (!jobs.length) {
    await send(client, jid, noJobsMessage(), user.id);
    return;
  }

  await send(client, jid, `╭─ 🔎 *Vagas encontradas*\nEncontrei *${jobs.length}* vaga(s) para você.\n╰─ Use os atalhos de cada card.\n\n${jobs.map(jobCard).join('\n\n')}`, user.id);
}

async function sendJobDetails(client, jid, user, jobId) {
  const job = await getJobById(jobId);
  if (!job || job.status !== 'active') {
    await send(client, jid, 'Não encontrei essa vaga ativa. Verifique o número e tente novamente.', user.id);
    return;
  }
  await send(client, jid, jobDetails(job), user.id);
}

async function applyToJob(client, jid, user, jobId) {
  if (user.role !== 'candidate') {
    await send(client, jid, 'Para se candidatar, você precisa estar cadastrado como candidato. Envie *RESETAR* para começar novamente.', user.id);
    return;
  }
  const job = await getJobById(jobId);
  if (!job || job.status !== 'active') {
    await send(client, jid, 'Não encontrei essa vaga ativa. Verifique o número e tente novamente.', user.id);
    return;
  }
  await createApplication(job.id, user.id, `Candidato demonstrou interesse pelo WhatsApp em ${new Date().toLocaleString('pt-BR')}`);
  await send(client, jid, `✅ Interesse registrado na vaga *#${job.id} — ${job.title}*.\n\nA empresa poderá visualizar seu nome, cidade, telefone e resumo de experiência.`, user.id);

  if (job.company_user_id) {
    const company = await query('SELECT * FROM users WHERE id = $1', [job.company_user_id]);
    const companyUser = company.rows[0];
    if (companyUser?.whatsapp_jid) {
      await send(client, companyUser.whatsapp_jid, `📥 Novo candidato na vaga *#${job.id} — ${job.title}*\n\nNome: ${user.name || '-'}\nCidade: ${user.city || '-'}\nTelefone: ${user.phone || '-'}\nExperiência: ${user.experience || '-'}\n\nNo menu da empresa, envie *5* para ver candidatos de uma vaga.`, companyUser.id);
    }
  }
}

async function handleCompany(client, jid, user, body) {
  const n = normalize(body);

  if (user.onboarding_step === 'company_name') {
    user = await updateUser(user.id, { company_name: body, onboarding_step: 'company_responsible' });
    await send(client, jid, '╭─ 👤 *Responsável*\nQual é o nome do responsável pelo cadastro?\n╰─ Ex.: Ana Souza', user.id);
    return;
  }

  if (user.onboarding_step === 'company_responsible') {
    user = await updateUser(user.id, { responsible_name: body, name: body, onboarding_step: 'company_city' });
    await send(client, jid, '╭─ 📍 *Cidade da empresa*\nQual é a cidade principal da empresa?\n╰─ Ex.: Foz do Iguaçu', user.id);
    return;
  }

  if (user.onboarding_step === 'company_city') {
    user = await updateUser(user.id, { city: body, onboarding_step: 'company_menu' });
    await send(client, jid, `✅ *Empresa cadastrada!*\n\nNo plano inicial você pode cadastrar até *${COMPANY_FREE_JOB_LIMIT} vagas*. Futuramente o plano de *R$ ${COMPANY_PREMIUM_PRICE}* vai liberar mais vagas e gestão avançada.\n\n${companyMenu(user)}`, user.id);
    return;
  }

  if (user.onboarding_step === 'job_delete_id') {
    await handleJobPauseOrDelete(client, jid, user, body);
    return;
  }

  if (user.onboarding_step === 'job_reactivate_id') {
    await handleJobReactivate(client, jid, user, body);
    return;
  }

  if (user.onboarding_step === 'job_candidates_id') {
    await handleJobCandidates(client, jid, user, body);
    return;
  }

  if (user.onboarding_step?.startsWith('job_')) {
    await handleJobCreation(client, jid, user, body);
    return;
  }

  if (n === '1') {
    const activeCount = await countCompanyActiveJobs(user.id);
    if (user.company_plan === 'free' && activeCount >= COMPANY_FREE_JOB_LIMIT) {
      await send(client, jid, `Seu plano gratuito permite até *${COMPANY_FREE_JOB_LIMIT} vagas*.\n\nEm breve o plano empresa de *R$ ${COMPANY_PREMIUM_PRICE}* vai liberar mais cadastros. Por enquanto, pause/exclua uma vaga antiga ou chame o suporte.`, user.id);
      return;
    }
    user = await updateUser(user.id, { onboarding_step: 'job_title', onboarding_data: {} });
    await send(client, jid, '╭─ ➕ *Nova vaga*\nVamos cadastrar uma vaga.\n\nQual é o *título da vaga*?\n╰─ Ex.: Atendente, Vendedor(a), Auxiliar Administrativo.', user.id);
    return;
  }

  if (n === '2') {
    await sendCompanyJobs(client, jid, user);
    return;
  }

  if (n === '3') {
    user = await updateUser(user.id, { onboarding_step: 'job_delete_id' });
    await send(client, jid, '╭─ ⏸️ *Pausar vaga*\nEnvie o número da vaga que deseja pausar.\n\nEx.: *12*\n\n╰─ Se não souber o número, envie *2* para ver suas vagas.', user.id);
    return;
  }

  if (n === '4') {
    user = await updateUser(user.id, { onboarding_step: 'job_reactivate_id' });
    await send(client, jid, '╭─ ✅ *Reativar vaga*\nEnvie o número da vaga que deseja reativar.\n╰─ Ex.: *12*', user.id);
    return;
  }

  if (n === '5') {
    user = await updateUser(user.id, { onboarding_step: 'job_candidates_id' });
    await send(client, jid, '╭─ 📥 *Candidatos da vaga*\nEnvie o número da vaga para ver os candidatos.\n╰─ Ex.: *12*', user.id);
    return;
  }

  if (n === '6') {
    await send(client, jid, `💼 *Plano da empresa*\n\nPlano inicial: até *${COMPANY_FREE_JOB_LIMIT} vagas*.\n\nFuturo plano empresa: *R$ ${COMPANY_PREMIUM_PRICE}*, com mais vagas, gestão avançada, destaque e relatórios.\n\nPagamento via Mercado Pago ficará conectado depois.`, user.id);
    return;
  }

  if (n === '7') {
    user = await updateUser(user.id, { onboarding_step: 'support_message' });
    await send(client, jid, supportMenu(), user.id);
    return;
  }

  if (n === '8') {
    await startAccountDeleteFlow(client, jid, user);
    return;
  }

  await send(client, jid, companyMenu(user), user.id);
}

async function handleJobCreation(client, jid, user, body) {
  const n = normalize(body);
  const data = user.onboarding_data || {};
  const draft = data.draftJob || {};

  if (n === 'cancelar') {
    user = await clearUserFlow(user.id, 'company_menu');
    await send(client, jid, `Cadastro de vaga cancelado.\n\n${companyMenu(user)}`, user.id);
    return;
  }

  if (user.onboarding_step === 'job_title') {
    user = await updateUser(user.id, { onboarding_step: 'job_city', onboarding_data: { draftJob: { title: body } } });
    await send(client, jid, '╭─ 📍 *Cidade da vaga*\nQual é a cidade da vaga?\n╰─ Se for remoto, escreva *Remoto*.', user.id);
    return;
  }

  if (user.onboarding_step === 'job_city') {
    user = await updateUser(user.id, { onboarding_step: 'job_area', onboarding_data: { draftJob: { ...draft, city: body } } });
    await send(client, jid, '╭─ 🧩 *Área da vaga*\nQual é a área da vaga?\n╰─ Ex.: Vendas, Atendimento, Administrativo, Tecnologia, Serviços Gerais.', user.id);
    return;
  }

  if (user.onboarding_step === 'job_area') {
    user = await updateUser(user.id, { onboarding_step: 'job_modality', onboarding_data: { draftJob: { ...draft, area: body } } });
    await send(client, jid, '╭─ 💼 *Modalidade*\nQual é a modalidade?\n\n*1*  Presencial\n*2*  Remoto\n*3*  Híbrido\n╰─ Responda com o número.', user.id);
    return;
  }

  if (user.onboarding_step === 'job_modality') {
    const map = { '1': 'Presencial', '2': 'Remoto', '3': 'Híbrido' };
    user = await updateUser(user.id, { onboarding_step: 'job_salary', onboarding_data: { draftJob: { ...draft, modality: map[n] || body } } });
    await send(client, jid, '╭─ 💰 *Salário*\nInforme o salário ou escreva *A combinar*.\n╰─ Ex.: R$ 1.800 + comissão', user.id);
    return;
  }

  if (user.onboarding_step === 'job_salary') {
    user = await updateUser(user.id, { onboarding_step: 'job_requirements', onboarding_data: { draftJob: { ...draft, salary: body } } });
    await send(client, jid, '╭─ ✅ *Requisitos*\nEnvie os principais requisitos da vaga.\n╰─ Ex.: experiência com atendimento, disponibilidade sábado.', user.id);
    return;
  }

  if (user.onboarding_step === 'job_requirements') {
    user = await updateUser(user.id, { onboarding_step: 'job_benefits', onboarding_data: { draftJob: { ...draft, requirements: body } } });
    await send(client, jid, '╭─ 🎁 *Benefícios*\nEnvie os benefícios da vaga.\n╰─ Se não houver, escreva *Não informado*.', user.id);
    return;
  }

  if (user.onboarding_step === 'job_benefits') {
    user = await updateUser(user.id, { onboarding_step: 'job_contact', onboarding_data: { draftJob: { ...draft, benefits: body } } });
    await send(client, jid, '╭─ 📲 *Candidatura*\nComo o candidato deve se candidatar?\n\nEx.: enviar currículo por e-mail, chamar no WhatsApp ou escrever *Pelo bot*.\n╰─ Essa informação aparecerá para os candidatos.', user.id);
    return;
  }

  if (user.onboarding_step === 'job_contact') {
    const finalDraft = { ...draft, contact_info: body };
    user = await updateUser(user.id, { onboarding_step: 'job_confirm', onboarding_data: { draftJob: finalDraft } });
    await send(client, jid, jobDraftSummary(finalDraft), user.id);
    return;
  }

  if (user.onboarding_step === 'job_confirm') {
    if (n !== 'publicar') {
      await send(client, jid, 'Digite *PUBLICAR* para ativar a vaga ou *CANCELAR* para descartar.', user.id);
      return;
    }

    const job = await createJob({
      ...draft,
      company_user_id: user.id,
      company_name: user.company_name,
      status: 'active'
    });
    user = await clearUserFlow(user.id, 'company_menu');
    await send(client, jid, `✅ Vaga publicada com sucesso!\n\n${jobCard(job)}\n\nVou avisar candidatos compatíveis agora.`, user.id);
    const sent = await notifyMatchingCandidates(client, job);
    await send(client, jid, `📣 Alerta enviado para ${sent} candidato(s) compatíveis.\n\n${companyMenu(user)}`, user.id);
  }
}

async function sendCompanyJobs(client, jid, user) {
  const jobs = await listCompanyJobs(user.id);
  if (!jobs.length) {
    await send(client, jid, 'Você ainda não tem vagas cadastradas. Envie *1* no menu da empresa para cadastrar.', user.id);
    return;
  }
  const text = jobs.map((job) => `#${job.id} — *${job.title}*\nStatus: ${job.status}\nCidade: ${job.city || '-'}\nCriada em: ${new Date(job.created_at).toLocaleDateString('pt-BR')}`).join('\n\n— — —\n\n');
  await send(client, jid, `📋 *Suas vagas*\n\n${text}`, user.id);
}

async function handleJobPauseOrDelete(client, jid, user, body) {
  const id = Number(String(body).replace(/\D/g, ''));
  if (!id) {
    await send(client, jid, 'Envie apenas o número da vaga. Ex.: *12*', user.id);
    return;
  }
  const job = await getJobById(id);
  if (!job || job.company_user_id !== user.id || job.status === 'deleted') {
    await send(client, jid, 'Não encontrei essa vaga entre as suas vagas ativas.', user.id);
    return;
  }
  await updateJobStatus(id, 'paused');
  user = await clearUserFlow(user.id, 'company_menu');
  await send(client, jid, `⏸️ Vaga *#${id}* pausada. Ela não aparecerá mais para candidatos.\n\n${companyMenu(user)}`, user.id);
}

async function handleJobReactivate(client, jid, user, body) {
  const id = Number(String(body).replace(/\D/g, ''));
  if (!id) {
    await send(client, jid, 'Envie apenas o número da vaga. Ex.: *12*', user.id);
    return;
  }
  const job = await getJobById(id);
  if (!job || job.company_user_id !== user.id || job.status === 'deleted') {
    await send(client, jid, 'Não encontrei essa vaga entre as suas vagas.', user.id);
    return;
  }
  const updatedJob = await updateJobStatus(id, 'active');
  user = await clearUserFlow(user.id, 'company_menu');
  await send(client, jid, `✅ Vaga *#${id}* reativada.\n\n${companyMenu(user)}`, user.id);
  await notifyMatchingCandidates(client, updatedJob);
}

async function handleJobCandidates(client, jid, user, body) {
  const id = Number(String(body).replace(/\D/g, ''));
  if (!id) {
    await send(client, jid, 'Envie apenas o número da vaga. Ex.: *12*', user.id);
    return;
  }
  const job = await getJobById(id);
  if (!job || job.company_user_id !== user.id) {
    await send(client, jid, 'Não encontrei essa vaga entre as suas vagas.', user.id);
    return;
  }
  const apps = await listApplicationsForJob(id);
  user = await clearUserFlow(user.id, 'company_menu');
  if (!apps.length) {
    await send(client, jid, `Ainda não há candidatos registrados na vaga *#${id}*.\n\n${companyMenu(user)}`, user.id);
    return;
  }

  const text = apps.slice(0, 15).map((app, index) => `${index + 1}. *${app.name || 'Sem nome'}*\nCidade: ${app.city || '-'}\nTelefone: ${app.phone || '-'}\nExperiência: ${app.experience || '-'}`).join('\n\n');
  await send(client, jid, `📥 *Candidatos da vaga #${id}*\n\n${text}\n\n${companyMenu(user)}`, user.id);
}

async function handleSupport(client, jid, user, body) {
  if (user.onboarding_step === 'support_name') {
    user = await updateUser(user.id, { name: body, onboarding_step: 'support_message' });
    await send(client, jid, supportMenu(), user.id);
    return;
  }

  await query('INSERT INTO admin_notes (user_id, note) VALUES ($1, $2)', [user.id, `Suporte via WhatsApp: ${body}`]);
  await send(client, jid, '✅ Recebi sua solicitação. A equipe do ParanáPOP poderá responder por aqui em breve.\n\nPara voltar ao menu, envie *MENU*.', user.id);
}

module.exports = {
  handleIncomingMessage,
  notifyMatchingCandidates,
  matchesCandidate,
  findJobsForCandidate
};
