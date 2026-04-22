// Global Error Handler for Debugging
window.addEventListener('error', function(e) {
    const tb = document.getElementById('tableBody');
    if(tb) tb.innerHTML = `<tr><td colspan="5" style="color:red; padding: 2rem;">Erro de Código: ${e.message}</td></tr>`;
});
window.addEventListener('unhandledrejection', function(e) {
    const tb = document.getElementById('tableBody');
    if(tb) tb.innerHTML = `<tr><td colspan="5" style="color:red; padding: 2rem;">Erro de Banco/Conexão: ${e.reason}</td></tr>`;
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
const tableBody = document.getElementById('tableBody');
const resultsCount = document.getElementById('resultsCount');
const searchInput = document.getElementById('searchInput');

let allPatients = [];

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
function renderTable(data) {
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

        let dentista = 'Não definida';
        if (patient.memoria_contexto) {
            const match = patient.memoria_contexto.match(/Profissional Identificado:\s*(.+)/i);
            if (match && match[1]) dentista = match[1].trim();
        }
        
        const patientName = (patient.patient_name || patient.nome || 'Desconhecido').replace(/"/g, '&quot;');

        return `
        <tr>
            <td style="font-weight: 500;">${patientName}</td>
            <td>${cleanPhone}</td>
            <td>${patient.procedure || patient.procedimento || 'Não informado'}</td>
            <td><span style="color: var(--primary); font-weight: 500; background: #F3E8FF; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem; white-space: nowrap;">${dentista}</span></td>
            <td>
                <span class="status-badge ${getStatusClass(patient.status || patient.ai_service)}">
                    ${patient.status || patient.ai_service || 'Pendente'}
                </span>
            </td>
            <td>${formatDate(patient.created_at)}</td>
            <td>${formatDate(patient.appointment_date || patient.data_agendamento)}</td>
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

            const recordId = patient.id || cleanPhone;
            const prontuarioContent = (patient.prontuario || '').replace(/"/g, '&quot;');
            const patientName = (patient.patient_name || patient.nome || 'Desconhecido').replace(/"/g, '&quot;');

            return `
            <tr>
                <td style="font-weight: 500;">${patientName}</td>
                <td>${cleanPhone}</td>
                <td>
                    <button class="btn-action open-prontuario" data-id="${recordId}" data-name="${patientName}" data-pront="${prontuarioContent}" style="background: var(--primary); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; gap: 4px; transition: 0.2s;">
                        <i class="ph ph-file-text"></i> Prontuário
                    </button>
                </td>
            </tr>
            `;
        }).join('');
        document.getElementById('tableBodyPacientes').innerHTML = htmlPacientes;
    }

    resultsCount.textContent = `Mostrando ${data.length} atendimentos e ${pacientes.length} pacientes`;
}

// Search Functionality
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allPatients.filter(p => {
        const name = (p.patient_name || p.nome || '').toLowerCase();
        const phone = (p.phone || p.telefone || '').toLowerCase();
        return name.includes(term) || phone.includes(term);
    });
    renderTable(filtered);
});

// Mock data initialization (Remove this block when Supabase Key is ready)
function renderMockData() {
    const mockData = [
        { patient_name: 'Ana Silva', phone: '(11) 98765-4321', procedure: 'Check-up & Limpeza', status: 'Agendado', appointment_date: '2023-10-25T10:00:00' },
        { patient_name: 'Carlos Pereira', phone: '(11) 91234-5678', procedure: 'Tratamento de Canal', status: 'Confirmado', appointment_date: '2023-10-26T14:30:00' },
        { patient_name: 'Beatriz Souza', phone: '(11) 99887-6655', procedure: 'Clareamento Dental', status: 'Concluído', appointment_date: '2023-10-24T09:15:00' },
        { patient_name: 'João Oliveira', phone: '(11) 97766-5544', procedure: 'Restauração', status: 'Pendente', appointment_date: '2023-10-27T11:00:00' },
        { patient_name: 'Maria Lopes', phone: '(11) 95544-3322', procedure: 'Extração', status: 'Cancelado', appointment_date: '2023-10-28T16:00:00' },
    ];
    
    if (SUPABASE_KEY === 'SUA_CHAVE_AQUI') {
        allPatients = mockData;
        renderTable(allPatients);
        
        // Append a warning about mock data
        const warning = document.createElement('div');
        warning.style.padding = '1rem';
        warning.style.backgroundColor = '#FEF3C7';
        warning.style.color = '#92400E';
        warning.style.textAlign = 'center';
        warning.style.fontWeight = '500';
        warning.innerHTML = 'Atenção: Exibindo dados de teste. Para ver os dados reais da clínica, cole a Anon Key no arquivo app.js';
        document.querySelector('.content').prepend(warning);
    } else {
        fetchPatients();
    }
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    // If key is not set, load mock data to show the UI
    if (SUPABASE_KEY === 'SUA_CHAVE_AQUI') {
        renderMockData();
    } else {
        fetchPatients();
    }
});

// --- Lógica de Navegação das Abas ---
document.addEventListener('click', (e) => {
    if(e.target.classList.contains('tab-btn')) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.remove('active');
            c.style.display = 'none';
        });
        
        e.target.classList.add('active');
        const target = document.getElementById(e.target.getAttribute('data-target'));
        if(target) {
            target.classList.add('active');
            target.style.display = 'block';
        }
    }
});

// --- Lógica do Prontuário Digital ---

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.open-prontuario');
    if (btn) {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const content = btn.getAttribute('data-pront');
        
        document.getElementById('prontuarioPacienteId').value = id;
        document.getElementById('prontuarioPacienteNome').textContent = '- ' + name;
        document.getElementById('inputProntuarioText').value = content;
        
        document.getElementById('modalProntuario').classList.remove('hidden');
    }
});

document.getElementById('btnCloseProntuario')?.addEventListener('click', () => {
    document.getElementById('modalProntuario').classList.add('hidden');
});
document.getElementById('btnCancelProntuario')?.addEventListener('click', () => {
    document.getElementById('modalProntuario').classList.add('hidden');
});

document.getElementById('formProntuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (SUPABASE_KEY === 'SUA_CHAVE_AQUI') {
        alert('Modo de teste: o prontuário não será salvo. Configure a chave do Supabase.');
        document.getElementById('modalProntuario').classList.add('hidden');
        return;
    }

    const btnSalvar = document.getElementById('btnSalvarProntuario');
    const originalText = btnSalvar.textContent;
    btnSalvar.textContent = 'Salvando...';
    btnSalvar.disabled = true;

    const id = document.getElementById('prontuarioPacienteId').value;
    const content = document.getElementById('inputProntuarioText').value;

    try {
        // Fallback: se não tiver 'id', tenta pelo 'identifier' (telefone)
        let column = 'id';
        if (!id.includes('-') && id.length > 5 && !isNaN(id)) {
             column = 'identifier'; 
        }

        const { error } = await supabaseClient
            .from('chats')
            .update({ prontuario: content })
            .eq(column, id);

        if (error) throw error;
        
        document.getElementById('modalProntuario').classList.add('hidden');
        // A tabela vai recarregar automaticamente pelo realtime, 
        // mas chamamos aqui caso o realtime não esteja funcionando
        fetchPatients();
    } catch (err) {
        alert('Erro ao salvar prontuário: ' + err.message);
    } finally {
        btnSalvar.textContent = originalText;
        btnSalvar.disabled = false;
    }
});

// Remove PWA Registration (Kill Cache)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
    }
  });
}

// Modal Interactivity
const modal = document.getElementById('modalNovoAgendamento');
const btnNovoAgendamento = document.getElementById('btnNovoAgendamento');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const formNovoAgendamento = document.getElementById('formNovoAgendamento');

function openModal() {
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
    formNovoAgendamento.reset();
}

btnNovoAgendamento.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

// Handle Form Submit (Insert into Supabase)
formNovoAgendamento.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (SUPABASE_KEY === 'SUA_CHAVE_AQUI') {
        alert('Não é possível salvar: Chave do Supabase não configurada.');
        return;
    }

    const btnSalvar = document.getElementById('btnSalvarAgendamento');
    const originalText = btnSalvar.innerText;
    btnSalvar.innerText = 'Salvando...';
    btnSalvar.disabled = true;

    const newPatient = {
        nome: document.getElementById('inputNome').value,
        telefone: document.getElementById('inputTelefone').value,
        procedimento: document.getElementById('inputProcedimento').value,
        status: document.getElementById('inputStatus').value,
        data_agendamento: document.getElementById('inputData').value,
        created_at: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient
            .from('chats')
            .insert([newPatient]);

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

// Export to CSV Functionality
document.getElementById('btnExportar').addEventListener('click', () => {
    if (allPatients.length === 0) {
        alert('Não há dados para exportar.');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Paciente,Telefone,Procedimento,Status,Data Conversa,Data Agendamento\n";

    allPatients.forEach(p => {
        const name = (p.patient_name || p.nome || 'Desconhecido').replace(/,/g, '');
        const phone = (p.phone || p.telefone || p.identifier || '-').replace(/,/g, '');
        const proc = (p.procedure || p.procedimento || 'Não informado').replace(/,/g, '');
        const status = (p.status || p.ai_service || 'Pendente').replace(/,/g, '');
        const dateConv = formatDate(p.created_at).replace(/,/g, '');
        const dateAgend = formatDate(p.appointment_date || p.data_agendamento).replace(/,/g, '');
        
        csvContent += `${name},${phone},${proc},${status},${dateConv},${dateAgend}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "agendamentos_clinica.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
