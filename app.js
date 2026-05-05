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
let allFinancials = [];
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
let allProfessionals = [];

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
        document.getElementById('tableBodyPacientes').innerHTML = `<tr><td colspan="4" class="loading-state">Nenhum paciente encontrado.</td></tr>`;
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

    // ABA PACIENTES → Mostra todos os pacientes com botões Prontuário e Editar
    if (data.length === 0) {
        document.getElementById('tableBodyPacientes').innerHTML = `<tr><td colspan="4" class="loading-state">Nenhum paciente encontrado.</td></tr>`;
    } else {
        const htmlPacientes = data.map(patient => {
            const cleanPhone = formatPhone(patient.phone);
            const patientName = (patient.name || 'Desconhecido').replace(/"/g, '&quot;');
            const patientEmail = patient.email || '-';
            const recordId = patient.id;
            const rawPhone = patient.phone || '';

            return `
            <tr>
                <td class="col-name" title="${patientName}" style="font-weight: 500;">${patientName}</td>
                <td class="col-phone" title="${cleanPhone}">${cleanPhone}</td>
                <td class="col-email" title="${patientEmail}">${patientEmail}</td>
                <td class="col-actions" style="display: flex; gap: 6px; justify-content: center;">
                    <button class="btn-action open-prontuario" data-id="${recordId}" data-name="${patientName}" data-phone="${cleanPhone}" style="background: var(--primary); color: white; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px; transition: 0.2s;">
                        <i class="ph ph-file-text"></i> Prontuário
                    </button>
                    <button class="btn-action edit-patient" data-id="${recordId}" data-name="${patientName}" data-phone="${rawPhone}" data-email="${patientEmail}" style="background: #3B82F6; color: white; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px; transition: 0.2s;">
                        <i class="ph ph-pencil-simple"></i> Editar
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
    fetchFinancials();
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
        if (targetView === 'viewDashboard') renderDashboard();
        if (targetView === 'viewFinanceiro') fetchFinancials();
        if (targetView === 'viewEquipe') fetchProfessionals();
        if (targetView === 'viewAgenda') renderAgenda();
        if (targetView === 'viewConfig') loadSettings();
    });
});

// --- DASHBOARD ---
function renderDashboard() {
    const totalPacientes = allPatients.length;
    const totalAgendamentos = allAppointments.length;
    
    // Calcular Leads no Mês (Pacientes criados neste mês)
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const novosLeads = allPatients.filter(p => {
        const d = new Date(p.created_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    // Calcular Receita do Mês
    const receitaMes = allFinancials.filter(f => {
        const d = new Date(f.created_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);

    // Calcular Ticket Médio
    const ticketMedio = totalPacientes > 0 ? (receitaMes / totalPacientes) : 0;
    
    const dashPacientes = document.getElementById('dashTotalPacientes');
    const dashAtend = document.getElementById('dashAgendamentosHoje');
    const dashLeads = document.getElementById('dashNovosLeads');
    const dashReceita = document.getElementById('dashReceitaMes');
    const dashTicket = document.getElementById('dashTicketMedio');
    
    if (dashPacientes) dashPacientes.textContent = totalPacientes;
    if (dashAtend) dashAtend.textContent = totalAgendamentos;
    if (dashLeads) dashLeads.textContent = novosLeads;
    if (dashReceita) dashReceita.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(receitaMes);
    if (dashTicket) dashTicket.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ticketMedio);
    
    renderRevenueChart();
}

let revenueChartInstance = null;

function renderRevenueChart() {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;
    
    // Group revenue by last 7 days
    const last7Days = [];
    const revenueData = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        
        const sumDay = allFinancials.filter(f => {
            const fd = new Date(f.created_at);
            return fd.getDate() === d.getDate() && fd.getMonth() === d.getMonth() && fd.getFullYear() === d.getFullYear();
        }).reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
        
        revenueData.push(sumDay);
    }
    
    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }
    
    if (window.Chart) {
        revenueChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets: [{
                    label: 'Receita Diária (R$)',
                    data: revenueData,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
}

// --- FINANCEIRO ---
const btnNovoLancamento = document.getElementById('btnNovoLancamento');
const modalFinanceiro = document.getElementById('modalFinanceiro');
const closeModalFinanceiro = document.getElementById('closeModalFinanceiro');
const btnCancelFinanceiro = document.getElementById('btnCancelFinanceiro');

if (btnNovoLancamento) {
    btnNovoLancamento.addEventListener('click', () => {
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
    const pacienteId = document.getElementById('finPaciente').value;
    const valor = document.getElementById('finValor').value;
    const metodo = document.getElementById('finMetodo').value;
    const descricao = document.getElementById('finDescricao').value;

    try {
        const { error } = await supabaseClient
            .from('financial_records')
            .insert([{
                clinic_id: CLINIC.id,
                patient_id: pacienteId,
                total_amount: valor,
                payment_method: metodo,
                notes: descricao
            }]);
            
        if (error) throw error;
        alert('Lançamento salvo com sucesso!');
        closeFinModal();
        fetchFinancials();
    } catch (error) {
        console.error('Erro ao salvar financeiro:', error);
        alert('Erro ao salvar lançamento: ' + error.message);
    }
});

async function fetchFinancials() {
    try {
        const { data, error } = await supabaseClient
            .from('financial_records')
            .select('*, patients(name)')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        allFinancials = data || [];
        
        const tbody = document.getElementById('tableBodyFinanceiro');
        if (!tbody) return;
        
        if (allFinancials.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-state">Nenhum lançamento encontrado.</td></tr>';
            return;
        }
        
        tbody.innerHTML = allFinancials.map(f => {
            const dataStr = new Date(f.created_at).toLocaleDateString('pt-BR');
            const pacienteName = f.patients ? f.patients.name : 'Avulso';
            const desc = f.notes || '---';
            const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(f.total_amount);
            const status = '<span class="status-badge status-concluido">Recebido</span>';
            
            return `
            <tr>
                <td style="font-weight: 500;">${dataStr}</td>
                <td>${pacienteName}</td>
                <td>${desc}</td>
                <td style="color: var(--success-color); font-weight: 600;">${valor}</td>
                <td>${f.payment_method}</td>
                <td>${status}</td>
            </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erro ao buscar financeiro:', error);
        const tbody = document.getElementById('tableBodyFinanceiro');
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="color:red;">Erro ao carregar finanças</td></tr>`;
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
    const n8n_calendar = document.getElementById('eqpCalendar').value;

    try {
        const { error } = await supabaseClient
            .from('professionals')
            .insert([{
                clinic_id: CLINIC.id,
                name: nome,
                google_calendar_id: n8n_calendar
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
        
        allProfessionals = data || [];
        
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
                    <td>${p.google_calendar_id || '-'}</td>
                    <td>${new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
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

// --- EDITAR PACIENTE ---
const modalEditPatient = document.getElementById('modalEditPatient');
const closeEditPatient = document.getElementById('closeEditPatient');
const btnCancelEditPatient = document.getElementById('btnCancelEditPatient');

function closeEditPatientModal() {
    if (modalEditPatient) modalEditPatient.classList.add('hidden');
}
if (closeEditPatient) closeEditPatient.addEventListener('click', closeEditPatientModal);
if (btnCancelEditPatient) btnCancelEditPatient.addEventListener('click', closeEditPatientModal);

// Delegated click handler for edit patient buttons
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-patient');
    if (btn) {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const phone = btn.getAttribute('data-phone');
        const email = btn.getAttribute('data-email');
        
        document.getElementById('editPatientId').value = id;
        document.getElementById('editPatientName').value = name;
        document.getElementById('editPatientPhone').value = phone || '';
        document.getElementById('editPatientEmail').value = (email && email !== '-') ? email : '';
        
        if (modalEditPatient) modalEditPatient.classList.remove('hidden');
    }
});

document.getElementById('formEditPatient')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editPatientId').value;
    const name = document.getElementById('editPatientName').value;
    const phone = document.getElementById('editPatientPhone').value;
    const email = document.getElementById('editPatientEmail').value;

    try {
        const updateObj = { name, phone };
        if (email) updateObj.email = email;
        
        const { error } = await supabaseClient
            .from('patients')
            .update(updateObj)
            .eq('id', id);
            
        if (error) throw error;
        alert('Paciente atualizado com sucesso!');
        closeEditPatientModal();
        fetchPatients();
    } catch (err) {
        alert('Erro ao atualizar paciente: ' + err.message);
    }
});

// --- AGENDA (FullCalendar + Google Calendar Integration) ---
let calendarInstance = null;
const PROF_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#EF4444'];
let profColorMap = {}; // { calendarId: color }

async function renderAgenda() {
    const container = document.getElementById('calendarContainer');
    if (!container || !window.FullCalendar) return;
    
    // Fetch professionals
    await fetchProfessionalsForAgenda();
    
    // Destroy previous instance
    if (calendarInstance) {
        calendarInstance.destroy();
        calendarInstance = null;
    }

    const hasApiKey = CONFIG.GOOGLE_API_KEY && CONFIG.GOOGLE_API_KEY.length > 10;
    const gcalStatus = document.getElementById('gcalStatus');
    const legendEl = document.getElementById('agendaLegend');
    
    // Build color map for professionals
    const profsWithCalendar = allProfessionals.filter(p => p.google_calendar_id);
    profColorMap = {};
    profsWithCalendar.forEach((p, i) => {
        profColorMap[p.google_calendar_id] = PROF_COLORS[i % PROF_COLORS.length];
    });

    // --- Show/Hide Google Calendar status ---
    if (gcalStatus) {
        gcalStatus.style.display = 'flex';
        if (hasApiKey && profsWithCalendar.length > 0) {
            gcalStatus.className = 'gcal-status gcal-connected';
            gcalStatus.innerHTML = `
                <div class="gcal-status-icon"><i class="ph ph-check-circle"></i></div>
                <div class="gcal-status-text">
                    <strong>Google Calendar Conectado</strong>
                    <p>Sincronizando ${profsWithCalendar.length} agenda(s). Clique em um evento para ver detalhes ou editar no Google Calendar.</p>
                </div>`;
        } else if (!hasApiKey) {
            gcalStatus.className = 'gcal-status';
            gcalStatus.innerHTML = `
                <div class="gcal-status-icon"><i class="ph ph-warning-circle"></i></div>
                <div class="gcal-status-text">
                    <strong>Google Calendar não configurado</strong>
                    <p>Adicione sua <code>GOOGLE_API_KEY</code> no arquivo <code>config.js</code> para sincronizar com o Google Calendar. 
                    <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Gerar API Key →</a></p>
                </div>`;
        } else {
            gcalStatus.className = 'gcal-status';
            gcalStatus.innerHTML = `
                <div class="gcal-status-icon"><i class="ph ph-info"></i></div>
                <div class="gcal-status-text">
                    <strong>Nenhum calendário configurado</strong>
                    <p>Adicione o <strong>Google Calendar ID</strong> nos profissionais da aba <strong>Equipe</strong> para ver suas agendas aqui.</p>
                </div>`;
        }
    }

    // --- Build Legend ---
    if (legendEl) {
        if (profsWithCalendar.length > 0) {
            legendEl.style.display = 'flex';
            legendEl.innerHTML = profsWithCalendar.map(p => {
                const color = profColorMap[p.google_calendar_id];
                return `<div class="legend-item">
                    <span class="legend-dot" style="background: ${color};"></span>
                    ${p.name}
                </div>`;
            }).join('') + `<div class="legend-item" style="margin-left: auto; color: var(--text-muted); font-weight: 400;">
                <i class="ph ph-cursor-click" style="font-size: 1rem;"></i> Clique no evento para detalhes
            </div>`;
        } else {
            legendEl.style.display = 'none';
        }
    }

    // --- Build event sources ---
    let eventSources = [];

    // Google Calendar sources (real-time from Google)
    if (hasApiKey) {
        profsWithCalendar.forEach(p => {
            eventSources.push({
                googleCalendarId: p.google_calendar_id,
                color: profColorMap[p.google_calendar_id],
                textColor: '#fff',
                className: `gcal-prof-${p.id}`,
                extraParams: function() {
                    return { professionalName: p.name, professionalId: p.id };
                }
            });
        });
    }

    // Local appointments as fallback/supplement
    const localEvents = allAppointments.map(appt => {
        const profCalId = allProfessionals.find(p => p.id === appt.professional_id)?.google_calendar_id;
        const eventColor = profCalId ? profColorMap[profCalId] : '#7C3AED';
        const profName = allProfessionals.find(p => p.id === appt.professional_id)?.name || '';

        return {
            title: `${appt.patients?.name || 'Paciente'} - ${appt.procedure_name || 'Consulta'}`,
            start: appt.scheduled_at,
            end: new Date(new Date(appt.scheduled_at).getTime() + (appt.duration_minutes || 60) * 60000).toISOString(),
            color: appt.status === 'Cancelado' ? '#EF4444' : appt.status === 'Concluído' ? '#10B981' : eventColor,
            extendedProps: {
                source: 'local',
                status: appt.status,
                patientId: appt.patient_id,
                professionalName: profName,
                professionalId: appt.professional_id,
                procedureName: appt.procedure_name
            }
        };
    });

    // Only add local events if no Google Calendar is configured
    if (!hasApiKey || profsWithCalendar.length === 0) {
        eventSources.push({ events: localEvents });
    }

    // --- Calendar Configuration ---
    const calendarOptions = {
        initialView: 'timeGridWeek',
        locale: 'pt-br',
        height: 'auto',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
        },
        buttonText: {
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            day: 'Dia',
            list: 'Lista'
        },
        slotMinTime: '07:00:00',
        slotMaxTime: '22:00:00',
        allDaySlot: false,
        nowIndicator: true,
        navLinks: true,
        editable: false,
        selectable: false,
        dayMaxEvents: 3,
        eventSources: eventSources,
        
        // Event click → show detail panel
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            showEventDetail(info.event);
        },

        // Tooltip on hover
        eventDidMount: function(info) {
            const event = info.event;
            const profName = event.extendedProps?.professionalName || '';
            const status = event.extendedProps?.status || '';
            let tooltipText = event.title;
            if (profName) tooltipText += ` | ${profName}`;
            if (status) tooltipText += ` (${status})`;
            info.el.title = tooltipText;
        },

        // Loading indicator
        loading: function(isLoading) {
            if (isLoading) {
                container.style.opacity = '0.6';
            } else {
                container.style.opacity = '1';
            }
        },

        // Error handling for Google Calendar
        eventSourceFailure: function(error) {
            console.error('Erro ao carregar Google Calendar:', error);
            if (gcalStatus) {
                gcalStatus.className = 'gcal-status';
                gcalStatus.style.display = 'flex';
                gcalStatus.innerHTML = `
                    <div class="gcal-status-icon"><i class="ph ph-x-circle"></i></div>
                    <div class="gcal-status-text">
                        <strong>Erro ao conectar com Google Calendar</strong>
                        <p>Verifique se a API Key está correta e se o Google Calendar API está ativado. 
                        Os calendários também precisam ser <strong>públicos</strong> ou compartilhados.
                        <a href="https://support.google.com/calendar/answer/37083" target="_blank">Como tornar público →</a></p>
                    </div>`;
            }
        }
    };

    // Add Google Calendar API Key if configured
    if (hasApiKey) {
        calendarOptions.googleCalendarApiKey = CONFIG.GOOGLE_API_KEY;
    }

    calendarInstance = new FullCalendar.Calendar(container, calendarOptions);
    calendarInstance.render();

    // --- Populate Professional Filter ---
    const filterSelect = document.getElementById('agendaProfessionalFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">Todas as Dentistas</option>';
        allProfessionals.forEach(p => {
            const dot = profColorMap[p.google_calendar_id] || '#999';
            filterSelect.innerHTML += `<option value="${p.id}" style="color: ${dot};">● ${p.name}</option>`;
        });
    }
}

// --- Fetch Professionals ---
async function fetchProfessionalsForAgenda() {
    try {
        const { data, error } = await supabaseClient
            .from('professionals')
            .select('*')
            .eq('clinic_id', CLINIC.id)
            .order('name', { ascending: true });
        
        if (error) throw error;
        allProfessionals = data || [];
    } catch(err) {
        console.error('Erro buscando profissionais para agenda:', err);
    }
}

// --- Show Event Detail Panel ---
function showEventDetail(event) {
    const panel = document.getElementById('eventDetailPanel');
    if (!panel) return;

    // Create backdrop if it doesn't exist
    let backdrop = document.getElementById('eventDetailBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'eventDetailBackdrop';
        backdrop.className = 'event-detail-backdrop hidden';
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', closeEventDetail);
    }

    // Fill in details
    const title = event.title || 'Evento';
    const startDate = event.start;
    const endDate = event.end;
    const profName = event.extendedProps?.professionalName || '';
    const description = event.extendedProps?.description || event.extendedProps?.procedureName || '';
    const htmlLink = event.extendedProps?.htmlLink || event.url || '';
    const status = event.extendedProps?.status || '';

    document.getElementById('eventDetailTitle').textContent = title;

    // Format time
    let timeStr = '';
    if (startDate) {
        const opts = { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' };
        timeStr = startDate.toLocaleDateString('pt-BR', opts);
        if (endDate) {
            timeStr += ' → ' + endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
    }
    document.getElementById('eventDetailTime').textContent = timeStr;
    document.getElementById('eventDetailProfessional').textContent = profName || 'Não definido';
    document.getElementById('eventDetailDesc').textContent = description || status || 'Sem descrição';

    // Edit link
    const editLink = document.getElementById('eventDetailEditLink');
    if (htmlLink) {
        editLink.href = htmlLink;
        editLink.style.display = 'inline-flex';
    } else {
        // Build Google Calendar link for local events
        const calendarUrl = buildGCalEditUrl(event);
        if (calendarUrl) {
            editLink.href = calendarUrl;
            editLink.style.display = 'inline-flex';
            editLink.innerHTML = '<i class="ph ph-arrow-square-out"></i> Abrir no Google Calendar';
        } else {
            editLink.style.display = 'none';
        }
    }

    // Show panel + backdrop
    backdrop.classList.remove('hidden');
    panel.classList.remove('hidden');
}

function closeEventDetail() {
    const panel = document.getElementById('eventDetailPanel');
    const backdrop = document.getElementById('eventDetailBackdrop');
    if (panel) panel.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
}

// Close button
document.getElementById('closeEventDetail')?.addEventListener('click', closeEventDetail);

// --- Build Google Calendar URL for creating/editing ---
function buildGCalEditUrl(event) {
    if (!event || !event.start) return '';
    const start = event.start;
    const end = event.end || new Date(start.getTime() + 3600000);
    
    const formatGCal = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const dates = `${formatGCal(start)}/${formatGCal(end)}`;
    const title = encodeURIComponent(event.title || 'Consulta');
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}`;
}

// --- New Event Button → Opens Google Calendar ---
document.getElementById('btnNovoEventoGCal')?.addEventListener('click', () => {
    // Default to now + 1 hour
    const now = new Date();
    const start = new Date(now.getTime() + 3600000); // 1h from now
    const end = new Date(start.getTime() + 3600000); // 1h duration
    
    const formatGCal = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const dates = `${formatGCal(start)}/${formatGCal(end)}`;
    
    // Try to use the first professional's calendar
    const firstProf = allProfessionals.find(p => p.google_calendar_id);
    let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Consulta - ')}&dates=${dates}`;
    
    if (firstProf?.google_calendar_id) {
        url += `&src=${encodeURIComponent(firstProf.google_calendar_id)}`;
    }
    
    window.open(url, '_blank');
});

// --- Filter by Professional ---
document.getElementById('agendaProfessionalFilter')?.addEventListener('change', (e) => {
    const selectedId = e.target.value;
    if (!calendarInstance) return;
    
    // Get all event sources
    const sources = calendarInstance.getEventSources();
    
    if (!selectedId) {
        // Show all: re-render the agenda
        renderAgenda();
    } else {
        // Find the selected professional
        const selectedProf = allProfessionals.find(p => p.id === selectedId);
        if (!selectedProf) return;
        
        // Remove all sources, add only the selected one
        sources.forEach(s => s.remove());
        
        if (CONFIG.GOOGLE_API_KEY && selectedProf.google_calendar_id) {
            calendarInstance.addEventSource({
                googleCalendarId: selectedProf.google_calendar_id,
                color: profColorMap[selectedProf.google_calendar_id] || '#7C3AED',
                textColor: '#fff'
            });
        } else {
            // Fallback to local events
            const filtered = allAppointments.filter(a => a.professional_id === selectedId);
            const events = filtered.map(appt => ({
                title: `${appt.patients?.name || 'Paciente'} - ${appt.procedure_name || 'Consulta'}`,
                start: appt.scheduled_at,
                end: new Date(new Date(appt.scheduled_at).getTime() + (appt.duration_minutes || 60) * 60000).toISOString(),
                color: appt.status === 'Cancelado' ? '#EF4444' : appt.status === 'Concluído' ? '#10B981' : '#7C3AED',
                extendedProps: { status: appt.status, professionalName: selectedProf.name }
            }));
            calendarInstance.addEventSource({ events });
        }
    }
});

