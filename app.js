// Global Error Handler for Debugging
window.addEventListener('error', function(e) {
    const tb = document.getElementById('tableBodyAtendimentos');
    if(tb) tb.innerHTML = `<tr><td colspan="7" style="color:red; padding: 2rem;">Erro de Código: ${e.message}</td></tr>`;
});
window.addEventListener('unhandledrejection', function(e) {
    const tb = document.getElementById('tableBodyAtendimentos');
    if(tb) tb.innerHTML = `<tr><td colspan="7" style="color:red; padding: 2rem;">Erro de Banco/Conexão: ${e.reason}</td></tr>`;
});

// ATENÇÃO: COLOQUE SUA CHAVE AQUI
const SUPABASE_URL = 'https://kqwijexdskiilhfxkbvk.supabase.co';
// Cole a sua API Key Pública (Anon Key) entre as aspas abaixo:
const SUPABASE_KEY = 'sb_publishable_gYQ12En3DdbmRv7X9v9CnA_MJuN2cMT';

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Verifica Autenticação
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
    }
}
checkAuth();

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

// Helper function to format dates
function formatDate(dateString) {
    if (!dateString) return 'Não definida';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
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
    const match = patient.memoria_contexto.match(/Profissional Identificado:\s*(.+)/i);
    return (match && match[1]) ? match[1].trim() : 'Não definida';
}

// Fetch data from Supabase
async function fetchPatients() {
    if (SUPABASE_KEY === 'SUA_CHAVE_AQUI') {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-state" style="color: #B91C1C;">
                    <i class="ph ph-warning" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    Chave do Supabase não configurada. Abra o arquivo app.js e cole a sua Anon Key.
                </td>
            </tr>
        `;
        return;
    }

    try {
        // Fetch from 'chats' or whichever table contains the lead info.
        // Adjust the select query based on the exact columns in the user's Supabase.
        const { data, error } = await supabaseClient
            .from('chats') // Assumed table name
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        allPatients = data || [];
        renderTable(allPatients);
        
        // Subscribe to real-time changes
        supabaseClient
            .channel('public:chats')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, payload => {
                console.log('Change received!', payload);
                fetchPatients(); // Reload table on any change
            })
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
    if (shouldPopulateDentists) populateDentistFilter(allPatients);
    
    if (data.length === 0) {
        document.getElementById('tableBodyAtendimentos').innerHTML = `<tr><td colspan="7" class="loading-state">Nenhum atendimento encontrado.</td></tr>`;
        document.getElementById('tableBodyPacientes').innerHTML = `<tr><td colspan="6" class="loading-state">Nenhum paciente encontrado.</td></tr>`;
        resultsCount.textContent = 'Mostrando 0 resultados';
        return;
    }

    // ABA ATENDIMENTOS (Tudo, sem Prontuário)
    const htmlAtendimentos = data.map(patient => {
        let cleanPhone = patient.phone || patient.telefone || patient.identifier || '-';
        if (cleanPhone.includes('@')) cleanPhone = cleanPhone.split('@')[0];

        const dentista = getDentistName(patient);
        let patientName = (patient.patient_name || patient.nome || 'Desconhecido').replace(/"/g, '&quot;');
        
        // UX: Identificação de Novo Lead
        const isNewLead = patientName === 'Desconhecido' || cleanPhone === '=';
        if (isNewLead) {
            patientName = `<span style="color: var(--primary); background: var(--primary-light); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; margin-right: 6px;">NOVO</span> ${patientName}`;
        }

        return `
        <tr>
            <td class="col-name" title="${patientName.replace(/<[^>]*>/g, '')}" style="font-weight: 500;">${patientName}</td>
            <td class="col-phone" title="${cleanPhone}">${cleanPhone}</td>
            <td class="col-proc" title="${patient.procedure || patient.procedimento || 'Não informado'}">${patient.procedure || patient.procedimento || 'Não informado'}</td>
            <td class="col-dentist" title="${dentista}"><span style="color: var(--primary); font-weight: 600; background: var(--primary-light); padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; white-space: nowrap;">${dentista}</span></td>
            <td class="col-status">
                <span class="status-badge ${getStatusClass(patient.status || patient.ai_service)}">
                    ${patient.status || patient.ai_service || 'Pendente'}
                </span>
            </td>
            <td class="col-date" title="${formatDate(patient.created_at)}">${formatDate(patient.created_at)}</td>
            <td class="col-date" title="${formatDate(patient.appointment_date || patient.data_agendamento)}">${formatDate(patient.appointment_date || patient.data_agendamento)}</td>
        </tr>
        `;
    }).join('');
    document.getElementById('tableBodyAtendimentos').innerHTML = htmlAtendimentos;

    // ABA PACIENTES (Filtro: Agendado, Confirmado, Concluído) (Sem Dentista e Status, Com Prontuário)
    const pacientes = data.filter(p => {
        const s1 = String(p.status || p.ai_service).toLowerCase();
        const s2 = String(p.memoria_contexto || '').toLowerCase();
        
        // Verifica nos campos de status e dentro da memoria_contexto gerada pela IA
        const hasValidStatus = s1.includes('agendado') || s1.includes('confirmado') || s1.includes('concluído') || s1.includes('finalizado') || 
                               s2.includes('status atual: agendado') || s2.includes('status atual: confirmado') || s2.includes('status atual: concluído') || 
                               s2.includes('agendado para') || s2.includes('marcado');
        
        // Verifica se existe alguma data de agendamento preenchida
        const hasDate = (p.appointment_date || p.data_agendamento) ? true : false;

        return hasValidStatus || hasDate;
    });

    if (pacientes.length === 0) {
        document.getElementById('tableBodyPacientes').innerHTML = `<tr><td colspan="3" class="loading-state">Nenhum paciente confirmado encontrado.</td></tr>`;
    } else {
            const htmlPacientes = pacientes.map(patient => {
            let cleanPhone = patient.phone || patient.telefone || patient.identifier || '-';
            if (cleanPhone.includes('@')) cleanPhone = cleanPhone.split('@')[0];
            const patientName = (patient.patient_name || patient.nome || 'Desconhecido').replace(/"/g, '&quot;');
            const recordId = patient.id || cleanPhone;
            const prontuarioContent = (patient.prontuario || '').replace(/"/g, '&quot;');

            return `
            <tr>
                <td class="col-name" title="${patientName}" style="font-weight: 500;">${patientName}</td>
                <td class="col-phone" title="${cleanPhone}">${cleanPhone}</td>
                <td class="col-actions">
                    <button class="btn-action open-prontuario" data-id="${recordId}" data-name="${patientName}" data-pront="${prontuarioContent}" style="background: var(--primary); color: white; border: none; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; margin: 0 auto;">
                        <i class="ph ph-file-text"></i> Prontuário
                    </button>
                </td>
            </tr>
            `;
        }).join('');
        document.getElementById('tableBodyPacientes').innerHTML = htmlPacientes;
    }

    document.getElementById('tableBodyAtendimentos').innerHTML = htmlAtendimentos || `<tr><td colspan="7" class="loading-state">Nenhum atendimento encontrado.</td></tr>`;
    
    // UX: Rodapé contextual
    if (activeTab === 'atendimentos') {
        resultsCount.textContent = `Mostrando ${data.length} atendimentos registrados`;
    } else {
        resultsCount.textContent = `Mostrando ${pacientes.length} fichas de pacientes`;
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
        const matchesDentist = dentistFilter === "" || dentist === dentistFilter;

        return matchesSearch && matchesStatus && matchesDentist;
    });

    renderTable(filtered, false);
}

function populateDentistFilter(data) {
    const select = document.getElementById('filterDentista');
    if (!select) return;
    const currentValue = select.value;
    const dentists = [...new Set(data.map(p => getDentistName(p)))].filter(d => d !== 'Não definida');
    
    select.innerHTML = '<option value="">Todas Dentistas</option><option value="Não definida">Não definida</option>';
    dentists.forEach(d => {
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

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.open-prontuario');
    if (btn) {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const rawContent = btn.getAttribute('data-pront');
        
        document.getElementById('prontuarioPacienteId').value = id;
        document.getElementById('prontuarioPacienteNome').textContent = '- ' + name;
        document.getElementById('inputProntuarioText').value = '';
        
        // Reset sub-tabs to first one
        document.querySelectorAll('.pront-tab-btn')[0].click();
        
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

CONTRATADA: Clínica Unificada
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
    if (SUPABASE_KEY === 'SUA_CHAVE_AQUI') {
        alert('Modo de teste: o prontuário não será salvo.');
        return;
    }

    const btnSalvar = document.getElementById('btnSalvarProntuario');
    const originalText = btnSalvar.textContent;
    const noteText = document.getElementById('inputProntuarioText').value.trim();
    
    btnSalvar.textContent = 'Salvando...';
    btnSalvar.disabled = true;

    const id = document.getElementById('prontuarioPacienteId').value;
    const currentJsonStr = document.getElementById('formProntuario').getAttribute('data-current-json');
    let prontData = JSON.parse(currentJsonStr || '{"entries":[], "photos":[], "fields": {}}');
    
    // 1. Coletar campos da Ficha
    const fieldIds = [
        'p-cpf', 'p-rg', 'p-nasc', 'p-genero', 'p-ocupacao', 'p-endereco', 'p-indicado', 'p-inicio', 'p-emergencia',
        'a-saude', 'a-tratamento', 'a-medicamentos', 'a-alergia', 'a-pressao', 'a-fumante', 'a-gengiva', 'a-habitos',
        'e-higiene', 'e-halitose', 'e-mucosa', 'e-palato', 'e-obs', 'p-plano', 'p-contrato'
    ];
    
    if (!prontData.fields) prontData.fields = {};
    fieldIds.forEach(fid => {
        const el = document.getElementById(fid);
        if (el) prontData.fields[fid] = el.value;
    });

    // 2. Adicionar nova entrada na timeline se houver texto
    if (noteText) {
        prontData.entries.push({
            date: new Date().toISOString(),
            text: noteText
        });
    }

    try {
        let query = supabaseClient.from('chats').update({ prontuario: JSON.stringify(prontData) });
        if (id.includes('-') || isNaN(id)) {
            query = query.eq('id', id);
        } else {
            query = query.eq('phone', id);
        }

        const { error } = await query;
        if (error) throw error;
        
        document.getElementById('inputProntuarioText').value = '';
        renderProntuarioContent(JSON.stringify(prontData));
        fetchPatients();
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

        let query = supabaseClient.from('chats').update({ prontuario: JSON.stringify(prontData) });
        if (id.includes('-') || isNaN(id)) {
            query = query.eq('id', id);
        } else {
            query = query.eq('phone', id);
        }

        const { error: dbError } = await query;
        if (dbError) throw dbError;

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

// Handle Form Submit (New Appointment)
formNovoAgendamento?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (SUPABASE_KEY === 'SUA_CHAVE_AQUI') {
        alert('Chave do Supabase não configurada.');
        return;
    }

    const btnSalvar = document.getElementById('btnSalvarAgendamento');
    const originalText = btnSalvar.innerText;
    btnSalvar.innerText = 'Salvando...';
    btnSalvar.disabled = true;

    const newPatient = {
        nome: document.getElementById('inputNome').value,
        phone: document.getElementById('inputTelefone').value,
        procedimento: document.getElementById('inputProcedimento').value,
        status: document.getElementById('inputStatus').value,
        data_agendamento: document.getElementById('inputData').value,
        conversation_id: 'manual-' + Date.now(),
        created_at: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient.from('chats').insert([newPatient]);
        if (error) throw error;
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

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Prontuário - ${name}</title>
            <style>
                body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.5; }
                h1 { color: #6366F1; border-bottom: 2px solid #6366F1; padding-bottom: 10px; }
                h2 { background: #F1F5F9; padding: 8px 12px; font-size: 1.1rem; margin-top: 30px; border-radius: 4px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
                .item { font-size: 0.9rem; }
                .label { font-weight: bold; color: #64748B; margin-right: 5px; }
                .timeline-item { border-left: 2px solid #E2E8F0; padding-left: 15px; margin-bottom: 20px; }
                .date { font-size: 0.8rem; color: #94A3B8; font-weight: bold; }
                .text { margin-top: 5px; white-space: pre-wrap; }
                .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                .photo-grid img { width: 100%; border-radius: 4px; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div style="text-align: right;"><button class="no-print" onclick="window.print()">Imprimir PDF</button></div>
            <h1>Prontuário Odontológico</h1>
            <p><strong>Paciente:</strong> ${name}</p>
            
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

            <h2>Contrato</h2>
            <div class="text" style="border: 1px solid #E2E8F0; padding: 20px; font-size: 0.8rem;">${prontData.fields['p-contrato'] || 'Sem contrato.'}</div>

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

// Export Functionality (Active Tab Only)
document.getElementById('btnExportar')?.addEventListener('click', () => {
    const isAtendimentos = activeTab === 'atendimentos';
    const sourceData = isAtendimentos ? allPatients : allPatients.filter(p => {
        const s1 = String(p.status || p.ai_service).toLowerCase();
        const s2 = String(p.memoria_contexto || '').toLowerCase();
        return s1.includes('agendado') || s1.includes('confirmado') || s1.includes('conclu') || s2.includes('agendado');
    });

    if (sourceData.length === 0) {
        alert('Não há dados para exportar nesta aba.');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    if (isAtendimentos) {
        csvContent += "Paciente,Telefone,Procedimento,Status,Data Conversa,Data Agendamento\n";
        sourceData.forEach(p => {
            const name = p.patient_name || p.nome || 'Desconhecido';
            const phone = p.phone || p.telefone || '=';
            const proc = p.procedure || p.procedimento || 'Não informado';
            const status = p.status || p.ai_service || 'Pendente';
            const d1 = formatDate(p.created_at);
            const d2 = formatDate(p.appointment_date || p.data_agendamento);
            csvContent += `"${name}","${phone}","${proc}","${status}","${d1}","${d2}"\n`;
        });
    } else {
        csvContent += "Paciente,Telefone\n";
        sourceData.forEach(p => {
            const name = p.patient_name || p.nome || 'Desconhecido';
            const phone = p.phone || p.telefone || '=';
            csvContent += `"${name}","${phone}"\n`;
        });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `export_${activeTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
