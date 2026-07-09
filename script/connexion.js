  const SUPABASE_URL = 'https://awpzfrshobabhnriwkza.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jR2L5ZmvqSrSBRdvWrluKQ_wL34_STO';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentRole = 'passager';
  let showPassword = false;

  const redirections = {
    passager:   'dashboard-passager.html',
    conducteur: 'dashboard-conducteur.html'
  };

  function switchRole(role) {
    currentRole = role;
    document.getElementById('tab-passager').classList.toggle('active', role === 'passager');
    document.getElementById('tab-conducteur').classList.toggle('active', role === 'conducteur');

    const indicator = document.getElementById('role-indicator');
    const indText   = document.getElementById('role-indicator-text');
    const btn       = document.getElementById('btn-connexion');

    if (role === 'conducteur') {
      indicator.className = 'role-indicator conducteur';
      indText.textContent = 'Connexion en tant que Conducteur';
      btn.className       = 'btn-connexion conducteur-mode';
    } else {
      indicator.className = 'role-indicator';
      indText.textContent = 'Connexion en tant que Passager';
      btn.className       = 'btn-connexion';
    }
    hideAlerts();
  }

  function togglePassword() {
    showPassword = !showPassword;
    const input = document.getElementById('mdp');
    input.type  = showPassword ? 'text' : 'password';
    document.getElementById('eye-icon').innerHTML = showPassword
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }

  function hideAlerts() {
    document.getElementById('alert-error').classList.remove('visible');
    document.getElementById('alert-success').classList.remove('visible');
  }

  function setLoading(btn, state) {
    btn.classList.toggle('loading', state);
    btn.disabled = state;
  }

  async function handleLogin() {
    hideAlerts();
    const email = document.getElementById('email').value.trim();
    const mdp   = document.getElementById('mdp').value;
    let ok = true;

    const emailField = document.getElementById('email');
    const mdpField   = document.getElementById('mdp');
    const emailErr   = document.getElementById('email-err');
    const mdpErr     = document.getElementById('mdp-err');

    emailField.classList.remove('error'); emailErr.classList.remove('visible');
    mdpField.classList.remove('error');   mdpErr.classList.remove('visible');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailField.classList.add('error'); emailErr.classList.add('visible'); ok = false;
    }
    if (!mdp) {
      mdpField.classList.add('error'); mdpErr.classList.add('visible'); ok = false;
    }
    if (!ok) return;

    const btn = document.getElementById('btn-connexion');
    setLoading(btn, true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: mdp });

      if (error) {
        setLoading(btn, false);
        document.getElementById('alert-error').classList.add('visible');
        document.getElementById('alert-error-msg').textContent = 'Identifiants incorrects. Verifiez votre email et votre mot de passe.';
        return;
      }

      // Verifier que le role choisi correspond bien au profil
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      setLoading(btn, false);

      if (profileError || !profile) {
        document.getElementById('alert-error').classList.add('visible');
        document.getElementById('alert-error-msg').textContent = 'Profil introuvable. Contactez le support.';
        await supabase.auth.signOut();
        return;
      }

      if (profile.role !== currentRole) {
        document.getElementById('alert-error').classList.add('visible');
        document.getElementById('alert-error-msg').textContent =
          'Ce compte est enregistre comme ' + (profile.role === 'passager' ? 'Passager' : 'Conducteur') +
          '. Selectionnez le bon profil ci-dessus pour vous connecter.';
        await supabase.auth.signOut();
        return;
      }

      document.getElementById('alert-success').classList.add('visible');
      document.getElementById('alert-success-msg').textContent = 'Connexion reussie. Redirection vers votre tableau de bord...';
      setTimeout(() => { window.location.href = redirections[currentRole]; }, 1200);

    } catch (err) {
      setLoading(btn, false);
      document.getElementById('alert-error').classList.add('visible');
      document.getElementById('alert-error-msg').textContent = 'Une erreur est survenue. Veuillez reessayer.';
    }
  }

  function showForgot() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('forgot-view').classList.add('visible');
    document.getElementById('forgot-success').classList.remove('visible');
    document.getElementById('forgot-form-content').style.display = 'block';
  }

  function showLogin() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('forgot-view').classList.remove('visible');
  }

  function handleForgot() {
    const email = document.getElementById('forgot-email').value.trim();
    const err   = document.getElementById('forgot-email-err');
    err.classList.remove('visible');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      document.getElementById('forgot-email').classList.add('error');
      err.classList.add('visible'); return;
    }

    setTimeout(() => {
      document.getElementById('forgot-form-content').style.display = 'none';
      document.getElementById('forgot-success').classList.add('visible');
    }, 800);
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (!document.getElementById('forgot-view').classList.contains('visible')) handleLogin();
      else handleForgot();
    }
  });
