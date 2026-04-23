// ATENÇÃO: COLOQUE SUA CHAVE AQUI (A MESMA DO APP.JS)
const SUPABASE_URL = 'https://kqwijexdskiilhfxkbvk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gYQ12En3DdbmRv7X9v9CnA_MJuN2cMT'; // Usando a chave que você já configurou

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Se já estiver logado, redireciona para o painel
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        window.location.href = 'index.html';
    }
}
checkSession();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    let email = document.getElementById('email').value.trim();
    
    // Tratamento de Usuário: se digitar 'unificada', mapeamos para o email real
    if (email.toLowerCase() === 'unificada') {
        email = 'unificadaclinica@gmail.com';
    }
    
    const password = document.getElementById('password').value;
    const btn = document.getElementById('btnLogin');
    const errorMsg = document.getElementById('errorMsg');
    
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Autenticando...';
    btn.disabled = true;
    errorMsg.style.display = 'none';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;
        
        // Sucesso
        window.location.href = 'index.html';
        
    } catch (err) {
        errorMsg.innerText = 'Acesso negado: Usuário ou senha incorretos.';
        errorMsg.style.display = 'block';
    } finally {
        btn.innerHTML = 'Entrar';
        btn.disabled = false;
    }
});
