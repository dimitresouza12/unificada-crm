// Global Error Handler for Debugging
window.addEventListener('error', function(e) {
    const tb = document.getElementById('tableBodyAtendimentos');
    if(tb) tb.innerHTML = `<tr><td colspan="7" style="color:red; padding: 2rem;">Erro de Código: ${e.message}</td></tr>`;
});
window.addEventListener('unhandledrejection', function(e) {
    const tb = document.getElementById('tableBodyAtendimentos');
    if(tb) tb.innerHTML = `<tr><td colspan="7" style="color:red; padding: 2rem;">Erro de Banco/Conexão: ${e.reason}</td></tr>`;
});

// Inicialização usando config.js (carregado antes deste arquivo)
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const supabaseN8N = window.supabase.createClient(CONFIG.N8N_SUPABASE_URL, CONFIG.N8N_SUPABASE_KEY);

// Dados da clínica logada (carregados pelo auth.js no sessionStorage)
const CLINIC = {
    id: sessionStorage.getItem('clinic_id'),
    name: sessionStorage.getItem('clinic_name') || 'My Clinica',
    type: sessionStorage.getItem('clinic_type') || 'odonto',
    logo: sessionStorage.getItem('clinic_logo') || 'logo.png',
    address: sessionStorage.getItem('clinic_address') || '',
    phone: sessionStorage.getItem('clinic_phone') || '',
    color: sessionStorage.getItem('clinic_color') || '#7C3AED',
    userRole: sessionStorage.getItem('user_role') || 'recepcao',
    userName: sessionStorage.getItem('user_display_name') || 'Recepção'
};

// Verifica Autenticação
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
    }
}
checkAuth();

// Aplicar branding dinâmico
document.addEventListener('DOMContentLoaded', () => {
    const logoEl = document.querySelector('.brand-logo');
    if (logoEl && CLINIC.logo) logoEl.src = CLINIC.logo;
    const nameEl = document.querySelector('.user-info .name');
    if (nameEl) nameEl.textContent = CLINIC.userName;
    const titleEl = document.querySelector('.page-header h2');
    if (titleEl) titleEl.textContent = CLINIC.name;
    document.title = CLINIC.name + ' - Painel';
});

// Logout
document.addEventListener('DOMContentLoaded', () => {
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        });
    }
});

// DOM Elements
const tableBody = document.getElementById('tableBodyAtendimentos');
const resultsCount = document.getElementById('resultsCount');
const searchInput = document.getElementById('searchInput');

let allPatients = [];
let activeTab = 'atendimentos';

// Helper function to format dates (short version: xx/xx/xx)
function formatDate(dateString) {
    if (!dateString) return 'Não definida';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// Helper function to format phones
function formatPhone(phoneStr) {
    if (!phoneStr) return '-';
    let str = String(phoneStr);
    
    if (str.includes('@')) str = str.split('@')[0];
    
    const digits = str.replace(/\D/g, '');
    
    if (digits.length >= 10) {
        if (digits.startsWith('55') && digits.length >= 12) {
            return `(${digits.substring(2, 4)}) ${digits.substring(4, 9)}-${digits.substring(9, 13)}`;
        } else {
            return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7, 11)}`;
        }
    }
    
    if (digits.length > 5) return digits;
    return '-';
}

// Helper function to get status badge class
function getStatusClass(status) {
    if (!status) return 'status-pendente';
    const s = String(status).toLowerCase().trim();
    if (s.includes('agendado') || s.includes('confirmado')) return 'status-agendado';
    if (s.includes('concluído') || s.includes('finalizado') || s === 'true' || s === 'ativo') return 'status-concluido';
    if (s.includes('cancelado') || s.includes('pausado') || s === 'false') return 'status-cancelado';
    return 'status-pendente'; // default
}

// Helper function to extract dentist name from context
function getDentistName(patient) {
    if (patient.nome_dentista) return patient.nome_dentista; // Se ja tiver coluna propria
    if (!patient.memoria_contexto) return 'Não definida';
    
    // Captura o que vem depois de "Profissional Identificado:"
    const match = patient.memoria_contexto.match(/Profissional Identificado:\s*(.+)/i);
    if (!match || !match[1]) return 'Não definida';
    
    let name = match[1].trim();
    
    // Limpeza: remove colchetes, aspas e pontos finais extras
    name = name.replace(/[\[\]"]/g, '').replace(/\.$/, '');
    
    // Se por acaso capturou uma linha de data (bug comum da IA) ou texto muito longo, ignoramos
    if (name.toLowerCase().includes('data/hora') || name.toLowerCase().includes('horário') || name.length > 50) {
        return 'Não definida';
    }
    
    return name;
}

// Fetch data from Supabase (tabelas do SaaS)
let allAppointments = [];

async function fetchPatients() {
    try {
        // Buscar pacientes da clínica logada (RLS filtra automaticamente)
        const { data: patientsData, error: pError } = await supabaseClient
            .from('patients')
            .select('*')
            .order('created_at', { ascending: false });

        if (pError) throw pError;

        // Buscar agendamentos com dados do paciente
        const { data: apptData, error: aError } = await supabaseClient
            .from('appointments')
            .select('*, patients(name, phone)')
            .order('scheduled_at', { ascending: false });

        if (aError) throw aError;

        allPatients = patientsData || [];
        allAppointments = apptData || [];
        renderTable(allPatients);
        
        // Subscribe to real-time changes
        supabaseClient
            .channel('public:patients')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => fetchPatients())
            .subscribe();

        supabaseClient
            .channel('public:appointments')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => fetchPatients())
            .subscribe();

    } catch (err) {
        console.error('Error fetching data:', err.message);
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-state" style="color: #B91C1C;">
                    Erro ao buscar dados: ${err.message}. Verifique a sua conexão e a estrutura da tabela.
                </td>
            </tr>
        `;
    }
}

// Render Table Rows
function renderTable(data, shouldPopulateDentists = true) {
    if (data.length === 0 && allAppointments.length === 0) {
        document.getElementById('tableBodyAtendimentos').innerHTML = `<tr><td colspan="7" class="loading-state">Nenhum agendamento encontrado.</td></tr>`;
        document.getElementById('tableBodyPacientes').innerHTML = `<tr><td colspan="6" class="loading-state">Nenhum paciente encontrado.</td></tr>`;
        resultsCount.textContent = 'Mostrando 0 resultados';
        return;
    }

    // ABA ATENDIMENTOS → Mostra Agendamentos
    const htmlAtendimentos = allAppointments.map(appt => {
        const patientName = (appt.patients?.name || 'Desconhecido').replace(/"/g, '&quot;');
        const cleanPhone = formatPhone(appt.patients?.phone);
        const procedure = appt.procedure_name || 'Não informado';
        const status = appt.status || 'Pendente';

        return `
        <tr>
            <td class="col-name" title="${patientName}" style="font-weight: 500;">${patientName}</td>
            <td class="col-phone" title="${cleanPhone}">${cleanPhone}</td>
            <td class="col-proc" title="${procedure}">${procedure}</td>
            <td class="col-dentist"><span style="color: var(--primary); font-weight: 600; background: var(--primary-light); padding: 4px 10px; border-radius: 999px; font-size: 0.75rem;">-</span></td>
            <td class="col-status">
                <span class="status-badge ${getStatusClass(status)}">
                    ${status}
                </span>
            </td>
            <td class="col-date" title="${formatDate(appt.created_at)}">${formatDate(appt.created_at)}</td>
            <td class="col-date" title="${formatDate(appt.scheduled_at)}">${formatDate(appt.scheduled_at)}</td>
        </tr>
        `;
    }).join('');
    document.getElementById('tableBodyAtendimentos').innerHTML = htmlAtendimentos || `<tr><td colspan="7" class="loading-state">Nenhum agendamento encontrado.</td></tr>`;

    // ABA PACIENTES → Mostra todos os pacientes com botão Prontuário
    if (data.length === 0) {
        document.getElementById('tableBodyPacientes').innerHTML = `<tr><td colspan="3" class="loading-state">Nenhum paciente encontrado.</td></tr>`;
    } else {
        const htmlPacientes = data.map(patient => {
            const cleanPhone = formatPhone(patient.phone);
            const patientName = (patient.name || 'Desconhecido').replace(/"/g, '&quot;');
            const recordId = patient.id;

            return `
            <tr>
                <td class="col-name" title="${patientName}" style="font-weight: 500;">${patientName}</td>
                <td class="col-phone" title="${cleanPhone}">${cleanPhone}</td>
                <td class="col-actions">
                    <button class="btn-action open-prontuario" data-id="${recordId}" data-name="${patientName}" data-phone="${cleanPhone}" style="background: var(--primary); color: white; border: none; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; margin: 0 auto;">
                        <i class="ph ph-file-text"></i> Prontuário
                    </button>
                </td>
            </tr>
            `;
        }).join('');
        document.getElementById('tableBodyPacientes').innerHTML = htmlPacientes;
    }
    
    // UX: Rodapé contextual
    if (activeTab === 'atendimentos') {
        resultsCount.textContent = `Mostrando ${allAppointments.length} agendamentos`;
    } else {
        resultsCount.textContent = `Mostrando ${data.length} pacientes`;
    }
}

// Central Filtering Logic
function applyFilters() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('filterStatus').value.toLowerCase();
    const dentistFilter = document.getElementById('filterDentista').value;

    const filtered = allPatients.filter(p => {
        const name = (p.patient_name || p.nome || '').toLowerCase();
        const phone = (p.phone || p.telefone || '').toLowerCase();
        const status = (p.status || p.ai_service || '').toLowerCase();
        const dentist = getDentistName(p);

        const matchesSearch = name.includes(term) || phone.includes(term);
        const matchesStatus = statusFilter === "" || status.includes(statusFilter);
        
        // Filtro de Dentista: usa .includes para achar o nome mesmo se houver mais de uma dentista na linha
        const matchesDentist = dentistFilter === "" || (dentistFilter === "Não definida" ? dentist === "Não definida" : dentist.toLowerCase().includes(dentistFilter.toLowerCase()));

        return matchesSearch && matchesStatus && matchesDentist;
    });

    renderTable(filtered, false);
}

function populateDentistFilter(data) {
    const select = document.getElementById('filterDentista');
    if (!select) return;
    const currentValue = select.value;
    
    // Coleta todos os nomes, separa por "/" ou "," e gera uma lista única e limpa
    let allDentists = [];
    data.forEach(p => {
        const name = getDentistName(p);
        if (name !== 'Não definida') {
            // Separa por barra ou vírgula e remove espaços extras
            const parts = name.split(/[\/,]/).map(s => s.trim()).filter(s => s.length > 3);
            allDentists.push(...parts);
        }
    });
    
    // Pega apenas os nomes únicos e organiza em ordem alfabética
    const uniqueDentists = [...new Set(allDentists)].sort();
    
    select.innerHTML = '<option value="">Todas Dentistas</option><option value="Não definida">Não definida</option>';
    uniqueDentists.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
    });
    select.value = currentValue;
}

// Search & Filter Events
searchInput.addEventListener('input', applyFilters);
document.getElementById('filterStatus').addEventListener('change', applyFilters);
document.getElementById('filterDentista').addEventListener('change', applyFilters);

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    fetchPatients();
});

// Tab Switching Logic
const tabAtendimentos = document.getElementById('tabAtendimentos');
const tabPacientes = document.getElementById('tabPacientes');

tabAtendimentos.addEventListener('click', () => {
    activeTab = 'atendimentos';
    tabAtendimentos.classList.add('active');
    tabPacientes.classList.remove('active');
    document.getElementById('contentAtendimentos').classList.remove('hidden');
    document.getElementById('contentPacientes').classList.add('hidden');
    document.querySelector('.filters-group').style.display = 'flex';
    applyFilters();
});

tabPacientes.addEventListener('click', () => {
    activeTab = 'pacientes';
    tabPacientes.classList.add('active');
    tabAtendimentos.classList.remove('active');
    document.getElementById('contentAtendimentos').classList.add('hidden');
    document.getElementById('contentPacientes').classList.remove('hidden');
    document.querySelector('.filters-group').style.display = 'none';
    applyFilters();
});

// --- Lógica do Prontuário Digital (Ficha Clínica) ---

// Sub-tabs switching
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('pront-tab-btn')) {
        document.querySelectorAll('.pront-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.pront-tab-content').forEach(c => c.classList.add('hidden'));
        
        e.target.classList.add('active');
        document.getElementById(e.target.getAttribute('data-tab')).classList.remove('hidden');
    }
});

document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.open-prontuario');
    if (btn) {
        const patientId = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const phone = btn.getAttribute('data-phone');
        
        document.getElementById('prontuarioPacienteId').value = patientId;
        document.getElementById('prontuarioPacienteNome').textContent = '- ' + name;
        document.getElementById('inputProntuarioText').value = '';
        document.getElementById('formProntuario').setAttribute('data-patient-phone', phone || '');
        
        // Reset sub-tabs to first one
        document.querySelectorAll('.pront-tab-btn')[0].click();
        
        // Buscar prontuário da tabela medical_records
        let rawContent = '';
        try {
            const { data: record } = await supabaseClient
                .from('medical_records')
                .select('*')
                .eq('patient_id', patientId)
                .single();

            if (record) {
                rawContent = JSON.stringify({
                    entries: [],
                    photos: record.photos || [],
                    fields: { ...record.anamnesis, ...record.clinical_exam },
                    odontograma: record.odontogram || {},
                    treatment_plan: record.treatment_plan || '',
                    contract_text: record.contract_text || '',
                    record_id: record.id
                });
            }

            // Buscar entradas da timeline
            const { data: entries } = await supabaseClient
                .from('record_entries')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false });

            if (entries && entries.length > 0 && rawContent) {
                let parsed = JSON.parse(rawContent);
                parsed.entries = entries.map(e => ({ date: e.created_at, text: e.entry_text, author: e.author_name }));
                rawContent = JSON.stringify(parsed);
            }
        } catch (err) {
            console.log('Prontuário novo (sem registro ainda):', err.message);
        }
        
        renderProntuarioContent(rawContent);
        document.getElementById('modalProntuario').classList.remove('hidden');
    }
});

function renderProntuarioContent(rawContent) {
    const timelineContainer = document.getElementById('timelineContainer');
    const photoGallery = document.getElementById('photoGallery');
    
    timelineContainer.innerHTML = '';
    photoGallery.innerHTML = '';
    
    let prontData = { entries: [], photos: [], fields: {} };
    
    try {
        if (rawContent && rawContent.startsWith('{')) {
            prontData = JSON.parse(rawContent);
        } else if (rawContent) {
            prontData.entries.push({ date: new Date().toISOString(), text: rawContent });
        }
    } catch (e) {
        console.error("Erro ao ler prontuário:", e);
    }
    
    // Fill Fields
    const fieldIds = [
        'p-cpf', 'p-rg', 'p-nasc', 'p-genero', 'p-ocupacao', 'p-endereco', 'p-indicado', 'p-inicio', 'p-emergencia',
        'a-saude', 'a-tratamento', 'a-medicamentos', 'a-alergia', 'a-pressao', 'a-fumante', 'a-gengiva', 'a-habitos',
        'e-higiene', 'e-halitose', 'e-mucosa', 'e-palato', 'e-obs', 'p-plano', 'p-contrato'
    ];
    
    const contractTemplate = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ODONTOLÓGICOS

CONTRATADA: ${CLINIC.name}
CONTRATANTE: [NOME DO PACIENTE]

CLÁUSULA 1ª: O presente contrato tem por objeto a prestação de serviços odontológicos conforme plano de tratamento anexo.
CLÁUSULA 2ª: O CONTRATANTE compromete-se a comparecer nas datas e horários agendados.
CLÁUSULA 3ª: [ADICIONE SUAS CLÁUSULAS AQUI...]

Assinatura: __________________________________
Data: ${new Date().toLocaleDateString('pt-BR')}`;

    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            let val = (prontData.fields && prontData.fields[id]) ? prontData.fields[id] : '';
            if (id === 'p-contrato' && !val) val = contractTemplate.replace('[NOME DO PACIENTE]', document.getElementById('prontuarioPacienteNome').textContent.replace('- ', ''));
            el.value = val;
        }
    });
    
    // Render Timeline
    if (!prontData.entries || prontData.entries.length === 0) {
        timelineContainer.innerHTML = '<div class="timeline-empty">Nenhuma anotação anterior.</div>';
    } else {
        prontData.entries.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(entry => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.innerHTML = `
                <div class="timeline-date">${formatDate(entry.date)}</div>
                <div class="timeline-content">${entry.text.replace(/\n/g, '<br>')}</div>
            `;
            timelineContainer.appendChild(item);
        });
    }
    
    // Render Photos
    if (prontData.photos && prontData.photos.length > 0) {
        prontData.photos.forEach((url, index) => {
            const photoItem = document.createElement('div');
            photoItem.className = 'photo-item';
            photoItem.innerHTML = `
                <img src="${url}" alt="Foto Paciente" onclick="window.open('${url}', '_blank')">
                <button class="btn-remove-photo" data-index="${index}"><i class="ph ph-trash"></i></button>
            `;
            photoGallery.appendChild(photoItem);
        });
    }
    
    document.getElementById('formProntuario').setAttribute('data-current-json', JSON.stringify(prontData));
    
    renderOdontograma(prontData.odontograma || {});
}

function renderOdontograma(savedState) {
    const sup = document.getElementById('teeth-superior');
    const inf = document.getElementById('teeth-inferior');
    if (!sup || !inf) return;

    sup.innerHTML = '';
    inf.innerHTML = '';

    const upperTeeth = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
    const lowerTeeth = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

    const createTooth = (num) => {
        const status = savedState[num] || 'higido';
        const div = document.createElement('div');
        div.className = `tooth status-${status}`;
        div.setAttribute('data-num', num);
        div.innerHTML = `<div class="tooth-icon">${num}</div><span class="tooth-num">${num}</span>`;
        div.onclick = () => openToothSelector(num);
        return div;
    };

    upperTeeth.forEach(num => sup.appendChild(createTooth(num)));
    lowerTeeth.forEach(num => inf.appendChild(createTooth(num)));
}

let activeTooth = null;
function openToothSelector(num) {
    activeTooth = num;
    document.getElementById('selectedToothNum').textContent = num;
    document.getElementById('toothSelector').classList.remove('hidden');
}

// Selector options click
document.querySelectorAll('.selector-options button').forEach(btn => {
    btn.onclick = () => {
        const status = btn.getAttribute('data-status');
        const currentJsonStr = document.getElementById('formProntuario').getAttribute('data-current-json');
        let prontData = JSON.parse(currentJsonStr || '{}');
        
        if (!prontData.odontograma) prontData.odontograma = {};
        prontData.odontograma[activeTooth] = status;
        
        document.getElementById('formProntuario').setAttribute('data-current-json', JSON.stringify(prontData));
        document.getElementById('toothSelector').classList.add('hidden');
        renderOdontograma(prontData.odontograma);
    };
});

// Close selector on outside click
document.addEventListener('mousedown', (e) => {
    const selector = document.getElementById('toothSelector');
    if (selector && !selector.contains(e.target) && !e.target.closest('.tooth')) {
        selector.classList.add('hidden');
    }
});

document.getElementById('btnSalvarProntuario')?.addEventListener('click', async (e) => {
    const btnSalvar = document.getElementById('btnSalvarProntuario');
    const originalText = btnSalvar.textContent;
    const noteText = document.getElementById('inputProntuarioText').value.trim();
    
    btnSalvar.textContent = 'Salvando...';
    btnSalvar.disabled = true;

    const patientId = document.getElementById('prontuarioPacienteId').value;
    const currentJsonStr = document.getElementById('formProntuario').getAttribute('data-current-json');
    let prontData = JSON.parse(currentJsonStr || '{"entries":[], "photos":[], "fields": {}}');
    
    // 1. Coletar campos da Ficha
    const anamnesisFields = ['a-saude', 'a-tratamento', 'a-medicamentos', 'a-alergia', 'a-pressao', 'a-fumante', 'a-gengiva', 'a-habitos'];
    const examFields = ['e-higiene', 'e-halitose', 'e-mucosa', 'e-palato', 'e-obs'];
    const idFields = ['p-cpf', 'p-rg', 'p-nasc', 'p-genero', 'p-ocupacao', 'p-endereco', 'p-indicado', 'p-inicio', 'p-emergencia'];
    
    let anamnesis = {};
    let clinicalExam = {};
    let allFields = {};
    
    [...anamnesisFields, ...examFields, ...idFields].forEach(fid => {
        const el = document.getElementById(fid);
        if (el) allFields[fid] = el.value;
    });
    anamnesisFields.forEach(f => { if (allFields[f]) anamnesis[f] = allFields[f]; });
    examFields.forEach(f => { if (allFields[f]) clinicalExam[f] = allFields[f]; });
    // Adicionar campos de identificação na anamnesis
    idFields.forEach(f => { if (allFields[f]) anamnesis[f] = allFields[f]; });

    const treatmentPlan = document.getElementById('p-plano')?.value || '';
    const contractText = document.getElementById('p-contrato')?.value || '';

    try {
        // Upsert medical_records (cria se não existir, atualiza se existir)
        const recordPayload = {
            clinic_id: CLINIC.id,
            patient_id: patientId,
            anamnesis: anamnesis,
            clinical_exam: clinicalExam,
            treatment_plan: treatmentPlan,
            contract_text: contractText,
            odontogram: prontData.odontograma || {},
            photos: prontData.photos || [],
            updated_at: new Date().toISOString()
        };

        // Verificar se já existe um registro
        const { data: existing } = await supabaseClient
            .from('medical_records')
            .select('id')
            .eq('patient_id', patientId)
            .single();

        let recordId;
        if (existing) {
            recordId = existing.id;
            const { error } = await supabaseClient
                .from('medical_records')
                .update(recordPayload)
                .eq('id', recordId);
            if (error) throw error;
        } else {
            const { data: newRec, error } = await supabaseClient
                .from('medical_records')
                .insert(recordPayload)
                .select('id')
                .single();
            if (error) throw error;
            recordId = newRec.id;
        }

        // 2. Adicionar nova entrada na timeline se houver texto
        if (noteText && recordId) {
            const { error: entryError } = await supabaseClient
                .from('record_entries')
                .insert({
                    clinic_id: CLINIC.id,
                    patient_id: patientId,
                    record_id: recordId,
                    author_name: CLINIC.userName,
                    entry_text: noteText,
                    entry_type: 'evolucao'
                });
            if (entryError) throw entryError;
        }
        
        document.getElementById('inputProntuarioText').value = '';
        // Re-fetch e re-render o prontuário
        const btn = document.querySelector(`.open-prontuario[data-id="${patientId}"]`);
        if (btn) btn.click();
        alert("Ficha Clínica salva com sucesso!");
        
    } catch (err) {
        alert('Erro ao salvar prontuário: ' + err.message);
    } finally {
        btnSalvar.textContent = originalText;
        btnSalvar.disabled = false;
    }
});

// Photo Upload Logic
document.getElementById('inputPhoto')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (SUPABASE_KEY === 'SUA_CHAVE_AQUI') {
        alert('Modo de teste: upload desativado.');
        return;
    }

    const id = document.getElementById('prontuarioPacienteId').value;
    const label = document.querySelector('label[for="inputPhoto"]');
    const originalLabel = label.innerHTML;
    
    label.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> Enviando...';
    label.style.opacity = '0.7';

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${id}_${Date.now()}.${fileExt}`;
        const filePath = `pacientes/${fileName}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('pacientes')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseClient.storage
            .from('pacientes')
            .getPublicUrl(filePath);

        const currentJsonStr = document.getElementById('formProntuario').getAttribute('data-current-json');
        let prontData = JSON.parse(currentJsonStr || '{"entries":[], "photos":[]}');
        
        if (!prontData.photos) prontData.photos = [];
        prontData.photos.push(publicUrl);

        // Atualizar photos em medical_records
        const { data: existingRec } = await supabaseClient
            .from('medical_records')
            .select('id, photos')
            .eq('patient_id', id)
            .single();

        let photosArray = existingRec?.photos || [];
        if (!Array.isArray(photosArray)) photosArray = [];
        photosArray.push(publicUrl);

        if (existingRec) {
            const { error: dbError } = await supabaseClient
                .from('medical_records')
                .update({ photos: photosArray, updated_at: new Date().toISOString() })
                .eq('id', existingRec.id);
            if (dbError) throw dbError;
        } else {
            const { error: dbError } = await supabaseClient
                .from('medical_records')
                .insert({
                    clinic_id: CLINIC.id,
                    patient_id: id,
                    photos: photosArray,
                    updated_at: new Date().toISOString()
                });
            if (dbError) throw dbError;
        }

        renderProntuarioContent(JSON.stringify(prontData));
        alert("Foto anexada com sucesso!");

    } catch (err) {
        console.error(err);
        alert('Erro no upload: ' + err.message);
    } finally {
        label.innerHTML = originalLabel;
        label.style.opacity = '1';
        e.target.value = '';
    }
});

// Modal Interactivity (Novo Agendamento)
const modal = document.getElementById('modalNovoAgendamento');
const btnNovoAgendamento = document.getElementById('btnNovoAgendamento');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const formNovoAgendamento = document.getElementById('formNovoAgendamento');

function openModal() { modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); formNovoAgendamento.reset(); }

btnNovoAgendamento?.addEventListener('click', openModal);
btnCloseModal?.addEventListener('click', closeModal);
btnCancelModal?.addEventListener('click', closeModal);

document.getElementById('btnCloseProntuario')?.addEventListener('click', () => {
    document.getElementById('modalProntuario').classList.add('hidden');
});
document.getElementById('btnCancelProntuario')?.addEventListener('click', () => {
    document.getElementById('modalProntuario').classList.add('hidden');
});

// Handle Form Submit (New Appointment) - Cria paciente + agendamento
formNovoAgendamento?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnSalvar = document.getElementById('btnSalvarAgendamento');
    const originalText = btnSalvar.innerText;
    btnSalvar.innerText = 'Salvando...';
    btnSalvar.disabled = true;

    const patientName = document.getElementById('inputNome').value;
    const patientPhone = document.getElementById('inputTelefone').value;
    const procedureName = document.getElementById('inputProcedimento').value;
    const status = document.getElementById('inputStatus').value;
    const scheduledAt = document.getElementById('inputData').value;

    try {
        // 1. Verificar se paciente já existe (pelo telefone)
        let patientId;
        const { data: existingPatient } = await supabaseClient
            .from('patients')
            .select('id')
            .eq('phone', patientPhone)
            .single();

        if (existingPatient) {
            patientId = existingPatient.id;
        } else {
            // Criar paciente novo
            const { data: newPatient, error: pErr } = await supabaseClient
                .from('patients')
                .insert({ clinic_id: CLINIC.id, name: patientName, phone: patientPhone })
                .select('id')
                .single();
            if (pErr) throw pErr;
            patientId = newPatient.id;
        }

        // 2. Criar agendamento
        const { error: aErr } = await supabaseClient
            .from('appointments')
            .insert({
                clinic_id: CLINIC.id,
                patient_id: patientId,
                procedure_name: procedureName,
                status: status,
                scheduled_at: scheduledAt
            });
        if (aErr) throw aErr;

        closeModal();
        fetchPatients();
    } catch (err) {
        alert('Erro ao salvar agendamento: ' + err.message);
    } finally {
        btnSalvar.innerText = originalText;
        btnSalvar.disabled = false;
    }
});

// Print / PDF Logic
document.getElementById('btnImprimirProntuario')?.addEventListener('click', () => {
    const name = document.getElementById('prontuarioPacienteNome').textContent.replace('- ', '');
    const currentJsonStr = document.getElementById('formProntuario').getAttribute('data-current-json');
    let prontData = JSON.parse(currentJsonStr || '{"entries":[], "photos":[], "fields": {}}');
    
    // Atualizar fields com os valores atuais dos inputs
    const fieldIds = [
        'p-cpf', 'p-rg', 'p-nasc', 'p-genero', 'p-ocupacao', 'p-endereco', 'p-indicado', 'p-inicio', 'p-emergencia',
        'a-saude', 'a-tratamento', 'a-medicamentos', 'a-alergia', 'a-pressao', 'a-fumante', 'a-gengiva', 'a-habitos',
        'e-higiene', 'e-halitose', 'e-mucosa', 'e-palato', 'e-obs', 'p-plano', 'p-contrato'
    ];
    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) prontData.fields[id] = el.value;
    });

    const baseUrl = window.location.href.replace(/[^/]*$/, '');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <base href="${baseUrl}">
            <title>Prontuário - ${name}</title>
            <style>
                body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.5; }
                .clinic-header { display: flex; align-items: center; gap: 20px; border-bottom: 3px solid #7C3AED; padding-bottom: 20px; margin-bottom: 30px; }
                .clinic-header img { height: 60px; object-fit: contain; }
                .clinic-info { flex: 1; }
                .clinic-info h1 { color: #7C3AED; margin: 0; font-size: 1.8rem; border: none; padding: 0; }
                .clinic-info p { margin: 4px 0 0 0; font-size: 0.9rem; color: #64748B; }
                h2 { background: #F8FAFC; padding: 10px 15px; font-size: 1.1rem; margin-top: 30px; border-left: 4px solid #7C3AED; border-radius: 0 4px 4px 0; color: #1E293B; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
                .item { font-size: 0.9rem; }
                .label { font-weight: bold; color: #475569; margin-right: 5px; }
                .timeline-item { border-left: 2px solid #CBD5E1; padding-left: 15px; margin-bottom: 20px; position: relative; }
                .timeline-item::before { content: ''; position: absolute; left: -6px; top: 0; width: 10px; height: 10px; border-radius: 50%; background: #7C3AED; }
                .date { font-size: 0.8rem; color: #64748B; font-weight: bold; margin-bottom: 4px; }
                .text { margin-top: 5px; white-space: pre-wrap; color: #334155; }
                .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
                .photo-grid img { width: 100%; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .patient-highlight { background: #EDE9FE; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
                .patient-highlight p { margin: 0; font-size: 1.1rem; color: #4C1D95; }
                @media print { .no-print { display: none; } body { padding: 0; } }
            </style>
        </head>
        <body>
            <div style="text-align: right; margin-bottom: 20px;"><button class="no-print" onclick="window.print()" style="background: #7C3AED; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Imprimir Prontuário</button></div>
            
            <div class="clinic-header">
                <img src="logo.png" alt="Logo Clínica" onerror="this.style.display='none'">
                <div class="clinic-info">
                    <h1>${CLINIC.name}</h1>
                    <p>${CLINIC.address} | Telefone/WhatsApp: ${CLINIC.phone}</p>
                </div>
            </div>

            <div class="patient-highlight">
                <p><strong>Paciente:</strong> ${name}</p>
            </div>
            
            <h2>Identificação</h2>
            <div class="grid">
                <div class="item"><span class="label">CPF:</span> ${prontData.fields['p-cpf'] || '-'}</div>
                <div class="item"><span class="label">RG:</span> ${prontData.fields['p-rg'] || '-'}</div>
                <div class="item"><span class="label">Nascimento:</span> ${prontData.fields['p-nasc'] || '-'}</div>
                <div class="item"><span class="label">Gênero:</span> ${prontData.fields['p-genero'] || '-'}</div>
                <div class="item"><span class="label">Endereço:</span> ${prontData.fields['p-endereco'] || '-'}</div>
            </div>

            <h2>Anamnese</h2>
            <div class="item"><span class="label">Problemas de Saúde:</span> ${prontData.fields['a-saude'] || '-'}</div>
            <div class="item"><span class="label">Medicamentos:</span> ${prontData.fields['a-medicamentos'] || '-'}</div>
            <div class="item"><span class="label">Alergias:</span> ${prontData.fields['a-alergia'] || '-'}</div>

            <h2>Plano de Tratamento</h2>
            <div class="text" style="background: #FFFBEB; padding: 15px; border-radius: 8px;">${prontData.fields['p-plano'] || 'Nenhum plano definido.'}</div>

            <h2>Histórico / Evolução</h2>
            ${prontData.entries.map(e => `
                <div class="timeline-item">
                    <div class="date">${formatDate(e.date)}</div>
                    <div class="text">${e.text}</div>
                </div>
            `).join('')}


            ${prontData.photos && prontData.photos.length > 0 ? `
                <h2>Galeria de Fotos</h2>
                <div class="photo-grid">
                    ${prontData.photos.map(url => `<img src="${url}">`).join('')}
                </div>
            ` : ''}
        </body>
        </html>
    `);
    printWindow.document.close();
});

// Impressão Isolada do Contrato
document.getElementById('btnImprimirContrato')?.addEventListener('click', () => {
    const name = document.getElementById('prontuarioPacienteNome').textContent.replace('- ', '');
    const contratoText = document.getElementById('p-contrato').value || 'Nenhum contrato definido para este paciente.';
    
    const baseUrl = window.location.href.replace(/[^/]*$/, '');
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <base href="${baseUrl}">
            <title>Contrato - ${name}</title>
            <style>
                body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                .clinic-header { display: flex; align-items: center; gap: 20px; border-bottom: 3px solid #7C3AED; padding-bottom: 20px; margin-bottom: 40px; }
                .clinic-header img { height: 60px; object-fit: contain; }
                .clinic-info { flex: 1; }
                .clinic-info h1 { color: #7C3AED; margin: 0; font-size: 1.8rem; border: none; padding: 0; }
                .clinic-info p { margin: 4px 0 0 0; font-size: 0.9rem; color: #64748B; }
                .contract-body { white-space: pre-wrap; text-align: justify; font-size: 1rem; }
                @media print { .no-print { display: none; } body { padding: 0; } }
            </style>
        </head>
        <body>
            <div style="text-align: right; margin-bottom: 20px;"><button class="no-print" onclick="window.print()" style="background: #7C3AED; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Imprimir Contrato</button></div>
            
            <div class="clinic-header">
                <img src="logo.png" alt="Logo Clínica" onerror="this.style.display='none'">
                <div class="clinic-info">
                    <h1>${CLINIC.name}</h1>
                    <p>${CLINIC.address} | Telefone/WhatsApp: ${CLINIC.phone}</p>
                </div>
            </div>

            <div class="contract-body">${contratoText}</div>
        </body>
        </html>
    `);
    printWindow.document.close();
});


// Export Functionality (Active Tab Only)
document.getElementById('btnExportar')?.addEventListener('click', () => {
    const isAtendimentos = activeTab === 'atendimentos';

    if (isAtendimentos && allAppointments.length === 0) {
        alert('Não há dados para exportar nesta aba.');
        return;
    }
    if (!isAtendimentos && allPatients.length === 0) {
        alert('Não há dados para exportar nesta aba.');
        return;
    }

    // Preparar os dados para o Excel
    let exportData;
    if (isAtendimentos) {
        exportData = allAppointments.map(appt => ({
            "Paciente": appt.patients?.name || 'Desconhecido',
            "Telefone": formatPhone(appt.patients?.phone),
            "Procedimento": appt.procedure_name || 'Não informado',
            "Status": appt.status || 'Pendente',
            "Data Agendamento": formatDate(appt.scheduled_at),
            "Data Criação": formatDate(appt.created_at)
        }));
    } else {
        exportData = allPatients.map(p => ({
            "Paciente": p.name || 'Desconhecido',
            "Telefone": formatPhone(p.phone)
        }));
    }

    // Criar a planilha usando a biblioteca XLSX
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, isAtendimentos ? "Atendimentos" : "Pacientes");

    // Ajustar largura das colunas automaticamente
    const wscols = isAtendimentos 
        ? [{wch:30}, {wch:20}, {wch:25}, {wch:15}, {wch:20}, {wch:20}]
        : [{wch:30}, {wch:20}];
    worksheet['!cols'] = wscols;

    // Gerar e baixar o arquivo .xlsx
    const fileName = `export_${activeTab}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
});

// --- NAVEGAÇÃO ENTRE MÓDULOS (VIEWS) ---
const navLinks = document.querySelectorAll('.nav-links a[data-view]');
const viewSections = document.querySelectorAll('.view-section');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-view');
        
        // Atualizar menu ativo
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Atualizar view ativa
        viewSections.forEach(section => {
            if (section.id === targetView) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });

        // Chamar funções específicas de cada módulo ao abrir
        if (targetView === 'dashboardView') renderDashboard();
        if (targetView === 'financeiroView') fetchFinancials();
        if (targetView === 'equipeView') fetchProfessionals();
        if (targetView === 'configView') loadSettings();
    });
});

// --- DASHBOARD ---
function renderDashboard() {
    const totalPacientes = allPatients.length;
    const totalAgendamentos = allAppointments.length;
    
    const dashPacientes = document.getElementById('dashTotalPacientes');
    const dashAtend = document.getElementById('dashAtendimentosMes');
    
    if (dashPacientes) dashPacientes.textContent = totalPacientes;
    if (dashAtend) dashAtend.textContent = totalAgendamentos;
}

// --- FINANCEIRO ---
const btnNovaReceita = document.getElementById('btnNovaReceita');
const modalFinanceiro = document.getElementById('modalFinanceiro');
const closeModalFinanceiro = document.getElementById('closeModalFinanceiro');
const btnCancelFinanceiro = document.getElementById('btnCancelFinanceiro');

if (btnNovaReceita) {
    btnNovaReceita.addEventListener('click', () => {
        const select = document.getElementById('finPaciente');
        if (select) {
            select.innerHTML = '';
            allPatients.forEach(p => {
                select.innerHTML += `<option value="${p.id}">${p.name || p.phone}</option>`;
            });
        }
        if (modalFinanceiro) modalFinanceiro.classList.remove('hidden');
    });
}

function closeFinModal() {
    if (modalFinanceiro) modalFinanceiro.classList.add('hidden');
}
if (closeModalFinanceiro) closeModalFinanceiro.addEventListener('click', closeFinModal);
if (btnCancelFinanceiro) btnCancelFinanceiro.addEventListener('click', closeFinModal);

document.getElementById('formFinanceiro')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert('Lançamento salvo! (Função de salvamento financeiro a ser implementada com tabela financial)');
    closeFinModal();
});

function fetchFinancials() {
    // Mock temporário para renderizar a tabela
    const tbody = document.getElementById('tableBodyFinanceiro');
    if (tbody && tbody.innerHTML.trim() === '') {
        tbody.innerHTML = '<tr><td colspan="5">Nenhum lançamento encontrado.</td></tr>';
    }
}

// --- EQUIPE ---
const btnNovoProfissional = document.getElementById('btnNovoProfissional');
const modalEquipe = document.getElementById('modalEquipe');
const closeModalEquipe = document.getElementById('closeModalEquipe');
const btnCancelEquipe = document.getElementById('btnCancelEquipe');

if (btnNovoProfissional) {
    btnNovoProfissional.addEventListener('click', () => {
        if (modalEquipe) modalEquipe.classList.remove('hidden');
    });
}

function closeEqpModal() {
    if (modalEquipe) modalEquipe.classList.add('hidden');
}
if (closeModalEquipe) closeModalEquipe.addEventListener('click', closeEqpModal);
if (btnCancelEquipe) btnCancelEquipe.addEventListener('click', closeEqpModal);

document.getElementById('formEquipe')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('eqpNome').value;
    const especialidade = document.getElementById('eqpEspecialidade').value;
    const n8n_calendar = document.getElementById('eqpCalendar').value;

    try {
        const { error } = await supabaseClient
            .from('professionals')
            .insert([{
                clinic_id: CLINIC.id,
                name: nome,
                specialty: especialidade,
                n8n_calendar_id: n8n_calendar
            }]);
            
        if (error) throw error;
        alert('Profissional adicionado com sucesso!');
        closeEqpModal();
        fetchProfessionals();
    } catch (err) {
        alert('Erro ao salvar profissional: ' + err.message);
    }
});

async function fetchProfessionals() {
    try {
        const { data, error } = await supabaseClient
            .from('professionals')
            .select('*')
            .eq('clinic_id', CLINIC.id)
            .order('name', { ascending: true });

        if (error) throw error;
        
        const tbody = document.getElementById('tableBodyEquipe');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        if(data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">Nenhum profissional cadastrado.</td></tr>';
            return;
        }

        data.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td>${p.name}</td>
                    <td>${p.specialty || '-'}</td>
                    <td>${p.n8n_calendar_id || '-'}</td>
                </tr>
            `;
        });
    } catch(err) {
        console.error('Erro buscando equipe', err);
    }
}

// --- CONFIGURAÇÕES ---
function loadSettings() {
    const inputName = document.getElementById('configClinicName');
    if (inputName) inputName.value = CLINIC.name;
}
document.getElementById('formSettings')?.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Configurações salvas (mock). A atualização do clinic_users requer endpoint específico.');
});

// --- CHAT N8N (SOMENTE LEITURA) ---
async function loadChatMessages(patientPhone) {
    const chatBox = document.getElementById('chatMessagesBox');
    if (!chatBox) return;
    
    chatBox.innerHTML = '<p class="empty-chat">Carregando histórico de mensagens...</p>';
    
    try {
        if (!patientPhone) {
            chatBox.innerHTML = '<p class="empty-chat">Paciente sem número de telefone cadastrado.</p>';
            return;
        }

        const phoneClean = String(patientPhone).replace(/\D/g, '');

        // Tentar tabela chat_messages primeiro
        const { data, error } = await supabaseN8N
            .from('chat_messages')
            .select('*')
            .eq('sessionId', phoneClean)
            .order('createdAt', { ascending: true })
            .limit(100);

        if (error) {
            // Se falhar, tentar n8n_chat_histories
            console.warn("Falha buscando 'chat_messages', tentando 'n8n_chat_histories'", error);
            const { data: data2, error: err2 } = await supabaseN8N
                .from('n8n_chat_histories')
                .select('*')
                .eq('session_id', phoneClean)
                .order('created_at', { ascending: true })
                .limit(100);
                
            if (err2) throw err2;
            renderMessages(chatBox, data2, 'n8n_chat_histories');
            return;
        }
        
        renderMessages(chatBox, data, 'chat_messages');

    } catch (err) {
        console.error('Erro lendo do N8N:', err);
        chatBox.innerHTML = '<p class="empty-chat">Não foi possível carregar o histórico de conversas.</p>';
    }
}

function renderMessages(container, messages, tableType) {
    if (!messages || messages.length === 0) {
        container.innerHTML = '<p class="empty-chat">Nenhum histórico de conversa encontrado com este paciente.</p>';
        return;
    }

    container.innerHTML = '';
    messages.forEach(msg => {
        let text = 'Mensagem...';
        let sender = 'received';
        let date = '';

        if (tableType === 'chat_messages') {
            text = typeof msg.message === 'object' ? (msg.message.text || msg.message.content) : msg.message;
            sender = msg.sender === 'user' ? 'received' : 'sent';
            date = msg.createdAt;
        } else {
            text = typeof msg.message === 'object' ? msg.message.data?.content : msg.message;
            sender = msg.message?.type === 'human' ? 'received' : 'sent';
            date = msg.created_at;
        }

        const timeStr = date ? new Date(date).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const safeText = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

        container.innerHTML += `
            <div class="chat-message ${sender}">
                ${safeText}
                <span class="time">${timeStr}</span>
            </div>
        `;
    });
    
    // Auto scroll para o final
    container.scrollTop = container.scrollHeight;
}

// Ligar o clique da tab do Chat IA à função de carregar mensagens
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.pront-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            if (targetId === 'prontChat') {
                const formProntuario = document.getElementById('formProntuario');
                if (formProntuario) {
                    const phone = formProntuario.getAttribute('data-patient-phone');
                    loadChatMessages(phone);
                }
            }
        });
    });
});

