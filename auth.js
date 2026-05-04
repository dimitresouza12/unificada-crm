// ============================================
// MY CLINICA - Autenticação SaaS
// Login dinâmico via tabela clinic_users
// ============================================

const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Se já estiver logado, redireciona para o painel
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        // Carregar dados da clínica antes de redirecionar
        await loadClinicData(session.user.id);
        window.location.href = 'index.html';
    }
}
checkSession();

// Carregar dados da clínica do usuário logado e salvar no sessionStorage
async function loadClinicData(userId) {
    try {
        const { data: clinicUser } = await supabaseClient
            .from('clinic_users')
            .select('*, clinics(*)')
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (clinicUser && clinicUser.clinics) {
            sessionStorage.setItem('clinic_id', clinicUser.clinic_id);
            sessionStorage.setItem('clinic_name', clinicUser.clinics.name);
            sessionStorage.setItem('clinic_type', clinicUser.clinics.clinic_type);
            sessionStorage.setItem('clinic_slug', clinicUser.clinics.slug);
            sessionStorage.setItem('clinic_logo', clinicUser.clinics.logo_url || '');
            sessionStorage.setItem('clinic_address', clinicUser.clinics.address || '');
            sessionStorage.setItem('clinic_phone', clinicUser.clinics.phone || '');
            sessionStorage.setItem('clinic_color', clinicUser.clinics.primary_color || '#7C3AED');
            sessionStorage.setItem('user_role', clinicUser.role);
            sessionStorage.setItem('user_display_name', clinicUser.display_name);
        }
    } catch (err) {
        console.error('Erro ao carregar dados da clínica:', err);
    }
}

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    let usernameOrEmail = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('btnLogin');
    const errorMsg = document.getElementById('errorMsg');

    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Autenticando...';
    btn.disabled = true;
    errorMsg.style.display = 'none';

    try {
        let email = usernameOrEmail;

        // Se não parece um email, buscar o email real na tabela clinic_users
        if (!usernameOrEmail.includes('@')) {
            const { data: userData, error: lookupError } = await supabaseClient
                .from('clinic_users')
                .select('user_id, clinics(email)')
                .eq('username', usernameOrEmail.toLowerCase())
                .eq('is_active', true)
                .single();

            if (lookupError || !userData) {
                throw new Error('Usuário não encontrado.');
            }

            // Buscar email do auth user via a clínica
            email = userData.clinics?.email;
            if (!email) {
                throw new Error('Email da clínica não configurado.');
            }
        }

        // Autenticar com Supabase Auth
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        // Carregar dados da clínica e salvar no sessionStorage
        await loadClinicData(data.user.id);

        // Sucesso - redirecionar
        window.location.href = 'index.html';

    } catch (err) {
        errorMsg.innerText = err.message === 'Invalid login credentials'
            ? 'Acesso negado: Usuário ou senha incorretos.'
            : 'Erro: ' + err.message;
        errorMsg.style.display = 'block';
    } finally {
        btn.innerHTML = 'Entrar';
        btn.disabled = false;
    }
});
