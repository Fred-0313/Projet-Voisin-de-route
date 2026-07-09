  const SUPABASE_URL = 'https://awpzfrshobabhnriwkza.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jR2L5ZmvqSrSBRdvWrluKQ_wL34_STO';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentRole = 'passager';
  let steps = { passager: 1, conducteur: 1 };
  const totalSteps = 3;

  const stepTitles = {
    passager:   ['Informations personnelles', 'Informations universitaires', 'Securite du compte'],
    conducteur: ['Informations personnelles', 'Universite et vehicule',       'Securite du compte']
  };

  function setRole(role, btn) {
    currentRole = role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('form-passager').style.display   = role === 'passager'   ? 'block' : 'none';
    document.getElementById('form-conducteur').style.display = role === 'conducteur' ? 'block' : 'none';
  }

  function updateUI(role) {
    const s = steps[role];
    const prefix = role === 'passager' ? 'p' : 'c';

    document.getElementById('title-' + role).textContent    = stepTitles[role][s - 1];
    document.getElementById('step-num-' + role).textContent = s;
    document.getElementById('prog-' + role).style.width = (s / totalSteps * 100) + '%';

    for (let i = 1; i <= totalSteps; i++) {
      const dot = document.getElementById((role === 'passager' ? 'pd' : 'cd') + i);
      dot.className = 'step-dot' + (i < s ? ' done' : i === s ? ' active' : '');
    }

    for (let i = 1; i <= totalSteps; i++) {
      const sec = document.getElementById(prefix + '-step' + i);
      if (sec) sec.classList.toggle('active', i === s);
    }

    document.getElementById(prefix + '-btn-back').style.visibility = s > 1 ? 'visible' : 'hidden';

    const nextBtn = document.getElementById(prefix + '-btn-next');
    if (s === totalSteps) {
      nextBtn.textContent  = 'Creer mon compte';
      nextBtn.className    = 'btn-submit';
      nextBtn.onclick      = () => submitForm(role);
    } else {
      nextBtn.textContent  = 'Continuer';
      nextBtn.className    = 'btn-next';
      nextBtn.onclick      = () => nextStep(role);
    }
  }

  function validateStep(role, step) {
    const p = role === 'passager' ? 'p' : 'c';
    let ok = true;

    const require = (id, errId, condition) => {
      const el  = document.getElementById(id);
      const err = document.getElementById(errId);
      if (!err) return;
      const fail = condition ? !condition(el.value) : !el.value.trim();
      el.classList.toggle('error', fail);
      err.classList.toggle('visible', fail);
      if (fail) ok = false;
    };

    if (role === 'passager') {
      if (step === 1) {
        require(p+'-prenom', p+'-prenom-err');
        require(p+'-nom',    p+'-nom-err');
        require(p+'-email',  p+'-email-err', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
        require(p+'-phone',  p+'-phone-err');
      } else if (step === 2) {
        require(p+'-univ',  p+'-univ-err');
        require(p+'-carte', p+'-carte-err');
      } else if (step === 3) {
        require(p+'-mdp',  p+'-mdp-err',  v => v.length >= 8);
        require(p+'-mdp2', p+'-mdp2-err', v => v === document.getElementById(p+'-mdp').value);
        if (!document.getElementById(p+'-cgu').checked) {
          showToast('Veuillez accepter les conditions generales d\'utilisation.'); ok = false;
        }
      }
    } else {
      if (step === 1) {
        require(p+'-prenom', p+'-prenom-err');
        require(p+'-nom',    p+'-nom-err');
        require(p+'-email',  p+'-email-err', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
        require(p+'-phone',  p+'-phone-err');
      } else if (step === 2) {
        require(p+'-univ',     p+'-univ-err');
        require(p+'-carte',    p+'-carte-err');
        require(p+'-vehicule', p+'-vehicule-err');
      } else if (step === 3) {
        require(p+'-mdp',  p+'-mdp-err',  v => v.length >= 8);
        require(p+'-mdp2', p+'-mdp2-err', v => v === document.getElementById(p+'-mdp').value);
        if (!document.getElementById(p+'-cgu').checked) {
          showToast('Veuillez accepter les conditions generales d\'utilisation.'); ok = false;
        }
      }
    }
    return ok;
  }

  function nextStep(role) {
    if (!validateStep(role, steps[role])) return;
    if (steps[role] < totalSteps) { steps[role]++; updateUI(role); }
  }

  function prevStep(role) {
    if (steps[role] > 1) { steps[role]--; updateUI(role); }
  }

  async function submitForm(role) {
    if (!validateStep(role, steps[role])) return;
    const prefix = role === 'passager' ? 'p' : 'c';

    const nextBtn = document.getElementById(prefix + '-btn-next');
    const originalText = nextBtn.textContent;
    nextBtn.textContent = 'Creation en cours...';
    nextBtn.disabled = true;

    const email = document.getElementById(prefix + '-email').value.trim();
    const mdp   = document.getElementById(prefix + '-mdp').value;

    try {
      // 1. Creer le compte d'authentification (gere les mots de passe de facon securisee)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: mdp
      });

      if (authError) {
        showToast(traduireErreur(authError.message));
        nextBtn.textContent = originalText;
        nextBtn.disabled = false;
        return;
      }

      const userId = authData.user.id;

      // 2. Construire le profil selon le role
      let profile = {
        id: userId,
        role: role,
        prenom: document.getElementById(prefix + '-prenom').value.trim(),
        nom: document.getElementById(prefix + '-nom').value.trim(),
        email: email,
        telephone: document.getElementById(prefix + '-phone').value.trim(),
        sexe: document.getElementById(prefix + '-sexe').value || null,
        date_naissance: document.getElementById(prefix + '-ddn').value || null,
        universite: document.getElementById(prefix + '-univ').value || null,
        numero_carte_etudiante: document.getElementById(prefix + '-carte').value.trim() || null,
        ville: document.getElementById(prefix + (role === 'passager' ? '-ville' : '-ville')).value || null
      };

      if (role === 'passager') {
        profile.faculte = document.getElementById('p-faculte').value.trim() || null;
        profile.niveau_etudes = document.getElementById('p-niveau').value || null;
      } else {
        profile.type_vehicule = (document.getElementById('c-vehicule').value || '').toLowerCase() || null;
        profile.marque_vehicule = document.getElementById('c-marque').value.trim() || null;
        profile.immatriculation = document.getElementById('c-immat').value.trim() || null;
        const placesText = document.getElementById('c-places').value || '';
        profile.places_max = parseInt(placesText) || null;
      }

      // 3. Inserer le profil dans la base de donnees
      const { error: profileError } = await supabase.from('profiles').insert(profile);

      if (profileError) {
        showToast('Erreur lors de la creation du profil : ' + profileError.message);
        nextBtn.textContent = originalText;
        nextBtn.disabled = false;
        return;
      }

      // 4. Afficher l'ecran de succes
      document.querySelector('#form-' + role + ' .form-body').querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
      document.getElementById(prefix + '-success').classList.add('visible');
      document.getElementById(prefix + '-form-nav').style.display = 'none';
      document.getElementById('prog-' + role).style.width = '100%';

    } catch (err) {
      showToast('Une erreur est survenue. Veuillez reessayer.');
      nextBtn.textContent = originalText;
      nextBtn.disabled = false;
    }
  }

  function traduireErreur(msg) {
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return 'Cette adresse email est deja utilisee. Essayez de vous connecter.';
    }
    if (msg.includes('Password') || msg.includes('password')) {
      return 'Le mot de passe doit contenir au moins 6 caracteres.';
    }
    if (msg.includes('Invalid email')) {
      return 'Adresse email invalide.';
    }
    return 'Erreur : ' + msg;
  }

  function checkStrength(input, id) {
    const v = input.value;
    const container = document.getElementById(id);
    const fill      = document.getElementById(id + '-fill');
    const label     = document.getElementById(id + '-label');
    container.classList.toggle('visible', v.length > 0);
    let score = 0;
    if (v.length >= 8)               score++;
    if (/[A-Z]/.test(v))             score++;
    if (/[0-9]/.test(v))             score++;
    if (/[^A-Za-z0-9]/.test(v))      score++;
    const levels = [
      { w: '25%',  bg: '#D93025', txt: 'Mot de passe trop faible' },
      { w: '50%',  bg: '#F5A623', txt: 'Mot de passe acceptable' },
      { w: '75%',  bg: '#E8B400', txt: 'Mot de passe correct' },
      { w: '100%', bg: '#1A7A46', txt: 'Mot de passe tres fort'  },
    ];
    const l = levels[score - 1] || levels[0];
    fill.style.width      = l.w;
    fill.style.background = l.bg;
    label.textContent     = l.txt;
    label.style.color     = l.bg;
  }

  function handleUpload(input, labelId) {
    if (input.files && input.files[0]) {
      document.getElementById(labelId).textContent = input.files[0].name;
    }
  }

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = 'toast' + (type === 'success' ? ' success' : '') + ' show';
    setTimeout(() => t.classList.remove('show'), 4000);
  }
