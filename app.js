// ATENÇÃO: COLOQUE SUA CHAVE AQUI
const SUPABASE_URL = 'https://kqwijexdskiilhfxkbvk.supabase.co';
// Cole a sua API Key Pública (Anon Key) entre as aspas abaixo:
const SUPABASE_KEY = 'sb_publishable_gYQ12En3DdbmRv7X9v9CnA_MJuN2cMT';

// Initialize Supabase Client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
    const s = String(status).toLowerCase();
    if (s.includes('agendado') || s.includes('confirmado')) return 'status-agendado';
    if (s.includes('pendente') || s.includes('avaliação')) return 'status-pendente';
    if (s.includes('cancelado')) return 'status-cancelado';
    if (s.includes('concluído') || s.includes('finalizado')) return 'status-concluido';
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
        const { data, error } = await supabase
            .from('chats') // Assumed table name
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        allPatients = data || [];
        renderTable(allPatients);
        
        // Subscribe to real-time changes
        supabase
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
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-state">Nenhum paciente encontrado.</td>
            </tr>
        `;
        resultsCount.textContent = 'Mostrando 0 resultados';
        return;
    }

    // Mapping Supabase columns to UI
    // Adjust these property names (patient_name, phone, procedure, status, appointment_date) 
    // to match the exact column names in the Supabase 'chats' table.
    const html = data.map(patient => `
        <tr>
            <td style="font-weight: 500;">${patient.patient_name || patient.nome || 'Desconhecido'}</td>
            <td>${patient.phone || patient.telefone || '-'}</td>
            <td>${patient.procedure || patient.procedimento || 'Não informado'}</td>
            <td>
                <span class="status-badge ${getStatusClass(patient.status || patient.ai_service)}">
                    ${patient.status || patient.ai_service || 'Pendente'}
                </span>
            </td>
            <td>${formatDate(patient.appointment_date || patient.updated_at)}</td>
        </tr>
    `).join('');

    tableBody.innerHTML = html;
    resultsCount.textContent = `Mostrando ${data.length} resultados`;
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

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('Service Worker registrado com sucesso: ', registration.scope);
    }).catch(err => {
      console.log('Falha ao registrar o Service Worker: ', err);
    });
  });
}

// Button Interactivity
document.getElementById('btnNovoAgendamento').addEventListener('click', () => {
    alert('🚀 Funcionalidade em desenvolvimento: Em breve você poderá adicionar agendamentos manuais por aqui!');
});

document.getElementById('btnExportar').addEventListener('click', () => {
    alert('📊 Funcionalidade em desenvolvimento: Em breve você poderá exportar a tabela para Excel/CSV!');
});
