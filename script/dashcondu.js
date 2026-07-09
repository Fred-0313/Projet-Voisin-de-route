  const SUPABASE_URL = 'https://awpzfrshobabhnriwkza.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jR2L5ZmvqSrSBRdvWrluKQ_wL34_STO';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentUser = null;
  let currentProfile = null;

  async function initDashboard() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = 'connexion.html';
      return;
    }
    currentUser = session.user;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error || !profile || profile.role !== 'conducteur') {
      window.location.href = 'connexion.html';
      return;
    }
    currentProfile = profile;

    const initiales = (profile.prenom[0] || '') + (profile.nom[0] || '');
    document.getElementById('sidebar-avatar').textContent = initiales.toUpperCase();
    document.getElementById('sidebar-nom').textContent = profile.prenom + ' ' + profile.nom;
    document.getElementById('sidebar-statut').textContent =
      profile.statut_verification === 'verifie' ? 'Compte verifie' : 'Verification en cours';
    document.getElementById('topbar-avatar').textContent = initiales.toUpperCase();

    chargerMesTrajets();
    chargerDemandesRecues();
    chargerProfilDetails();
  }

  async function chargerProfilDetails() {
    document.getElementById('profil-nom-complet').textContent = currentProfile.prenom + ' ' + currentProfile.nom;
    document.getElementById('profil-univ-info').textContent =
      [currentProfile.universite, currentProfile.type_vehicule ? capitalize(currentProfile.type_vehicule) : null]
        .filter(Boolean).join(' — ');

    document.getElementById('profil-note-moyenne').textContent = currentProfile.note_moyenne > 0 ? currentProfile.note_moyenne : '—';
    document.getElementById('profil-nb-evals').textContent = currentProfile.nombre_evaluations || 0;

    const { count: nbTrajets } = await supabase
      .from('trajets')
      .select('id', { count: 'exact', head: true })
      .eq('conducteur_id', currentUser.id);
    document.getElementById('profil-nb-trajets').textContent = nbTrajets || 0;

    const { data: evals } = await supabase
      .from('evaluations')
      .select('note, commentaire, created_at, evaluateur_id, profiles!evaluations_evaluateur_id_fkey(prenom, nom)')
      .eq('evalue_id', currentUser.id)
      .order('created_at', { ascending: false });

    // Repartition des notes
    const breakdown = document.getElementById('profil-rating-breakdown');
    const total = evals ? evals.length : 0;
    if (total === 0) {
      breakdown.innerHTML = '<p style="font-size:0.82rem; color:var(--gris-moyen);">Aucune evaluation recue pour le moment.</p>';
    } else {
      const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      evals.forEach(e => counts[e.note]++);
      breakdown.innerHTML = [5,4,3,2,1].map(n => {
        const pct = Math.round((counts[n] / total) * 100);
        return `<div class="rating-bar-row"><span>${n} etoile${n>1?'s':''}</span><div class="rating-bar"><div class="rating-bar-fill" style="width:${pct}%"></div></div><span>${counts[n]}</span></div>`;
      }).join('');
    }

    // Liste des avis
    const avisListe = document.getElementById('profil-avis-liste');
    if (!evals || evals.length === 0) {
      avisListe.innerHTML = '<p style="font-size:0.85rem; color:var(--gris-moyen);">Vous n\'avez pas encore recu d\'avis.</p>';
    } else {
      avisListe.innerHTML = evals.map(e => `
        <div class="avis-item">
          <div class="avis-header">
            <div class="passager-avatar" style="width:32px; height:32px; font-size:0.7rem;">${(e.profiles.prenom[0] + e.profiles.nom[0]).toUpperCase()}</div>
            <div class="avis-info">
              <div class="avis-name">${e.profiles.prenom} ${e.profiles.nom}</div>
              <div class="avis-stars">${'★'.repeat(e.note)}${'☆'.repeat(5 - e.note)}</div>
            </div>
            <div class="avis-date">${new Date(e.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div>
          </div>
          ${e.commentaire ? `<div class="avis-text">${e.commentaire}</div>` : ''}
        </div>
      `).join('');
    }
  }

  async function chargerMesTrajets() {
    const { data: trajets, error } = await supabase
      .from('trajets')
      .select('*')
      .eq('conducteur_id', currentUser.id)
      .order('date_trajet', { ascending: false });

    if (error) { showToast('Erreur lors du chargement des trajets.'); return; }

    const widget = document.getElementById('widget-trajets-recents');
    if (widget) {
      if (!trajets || trajets.length === 0) {
        widget.innerHTML = '<p style="font-size:0.85rem; color:var(--gris-moyen); padding:0.5rem 0;">Aucun trajet publie pour le moment.</p>';
      } else {
        widget.innerHTML = trajets.slice(0, 4).map(t => `
          <div class="trajet-item">
            <div class="trajet-item-route">${t.ville_depart} — ${t.ville_arrivee}</div>
            <div class="trajet-item-meta">
              <span class="trajet-meta-tag ${t.statut === 'actif' ? 'tag-actif' : t.statut === 'complet' ? 'tag-complet' : 'tag-termine'}">${capitalize(t.statut)}</span>
              <span class="trajet-meta-date">${formatDateHeure(t.date_trajet, t.heure_depart)}</span>
            </div>
            <div class="trajet-item-places">${t.places_disponibles} place(s) restante(s) sur ${t.places_initiales}</div>
          </div>
        `).join('');
      }
    }

    renderMesTrajetsComplet(trajets || []);
  }

  function renderMesTrajetsComplet(trajets) {
    const container = document.getElementById('mes-trajets-liste');
    if (!container) return;
    if (trajets.length === 0) {
      container.innerHTML = '<p style="font-size:0.9rem; color:var(--gris-moyen);">Vous n\'avez encore publie aucun trajet.</p>';
      return;
    }

    const counts = { tous: trajets.length, actif: 0, complet: 0, termine: 0 };
    trajets.forEach(t => { if (counts[t.statut] !== undefined) counts[t.statut]++; });
    document.querySelectorAll('.trajet-filters .filter-btn').forEach((btn, i) => {
      const keys = ['tous', 'actif', 'complet', 'termine'];
      const c = btn.querySelector('.filter-count');
      if (c) c.textContent = counts[keys[i]] || 0;
    });

    container.innerHTML = trajets.map(t => `
      <div class="trajet-full-card" data-statut="${t.statut}">
        <div class="trajet-full-left">
          <span class="trajet-meta-tag ${t.statut === 'actif' ? 'tag-actif' : t.statut === 'complet' ? 'tag-complet' : 'tag-termine'}">${capitalize(t.statut)}</span>
          <div class="trajet-full-route">${t.ville_depart} → ${t.ville_arrivee}</div>
          <div class="trajet-full-meta">
            <span>${formatDateHeure(t.date_trajet, t.heure_depart)}</span>
            <span>${capitalize(t.type_vehicule)}</span>
            <span>${t.prix_par_personne.toLocaleString('fr-FR')} FCFA / personne</span>
          </div>
          ${t.statut === 'termine' ? `<div class="passagers-a-evaluer" data-trajet-id="${t.id}"><p style="font-size:0.78rem; color:var(--gris-moyen); margin-top:0.8rem;">Chargement des passagers...</p></div>` : ''}
        </div>
        <div class="trajet-full-right">
          <div class="trajet-full-places">${t.places_disponibles} place(s) restante(s) sur ${t.places_initiales}</div>
        </div>
      </div>
    `).join('');

    trajets.filter(t => t.statut === 'termine').forEach(t => chargerPassagersAEvaluer(t.id));
  }

  async function chargerPassagersAEvaluer(trajetId) {
    const { data: reservations } = await supabase
      .from('reservations')
      .select('id, passager_id, profiles!reservations_passager_id_fkey(prenom, nom)')
      .eq('trajet_id', trajetId)
      .eq('statut', 'acceptee');

    const zone = document.querySelector(`.passagers-a-evaluer[data-trajet-id="${trajetId}"]`);
    if (!zone) return;
    if (!reservations || reservations.length === 0) {
      zone.innerHTML = '';
      return;
    }

    // Verifier quelles evaluations existent deja
    const { data: evals } = await supabase
      .from('evaluations')
      .select('reservation_id')
      .eq('evaluateur_id', currentUser.id);
    const dejaEvalues = new Set((evals || []).map(e => e.reservation_id));

    zone.innerHTML = reservations.map(r => `
      <div class="passager-row">
        <div class="passager-info">
          <div class="passager-avatar">${(r.profiles.prenom[0] + r.profiles.nom[0]).toUpperCase()}</div>
          <div>
            <div class="passager-name">${r.profiles.prenom} ${r.profiles.nom}</div>
            <div class="passager-sub">Passager(e) de ce trajet</div>
          </div>
        </div>
        ${dejaEvalues.has(r.id)
          ? '<button class="btn-evaluer-passager done">Passager evalue</button>'
          : `<button class="btn-evaluer-passager" onclick="ouvrirEvalPassager(this, '${r.id}', '${r.passager_id}', '${r.profiles.prenom} ${r.profiles.nom}')">Evaluer ce passager</button>`}
      </div>
    `).join('');
  }

  async function chargerDemandesRecues() {
    const { data: trajetsIds } = await supabase
      .from('trajets')
      .select('id')
      .eq('conducteur_id', currentUser.id);

    if (!trajetsIds || trajetsIds.length === 0) {
      document.getElementById('demandes-body').innerHTML = '<p style="font-size:0.85rem; color:var(--gris-moyen);">Aucune demande pour le moment.</p>';
      return;
    }

    const ids = trajetsIds.map(t => t.id);

    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*, trajets(*), profiles!reservations_passager_id_fkey(prenom, nom)')
      .in('trajet_id', ids)
      .eq('statut', 'en_attente');

    if (error) { console.error(error); return; }

    const body = document.getElementById('demandes-body');
    if (!reservations || reservations.length === 0) {
      body.innerHTML = '<p style="font-size:0.85rem; color:var(--gris-moyen);">Aucune demande en attente.</p>';
      return;
    }

    body.innerHTML = reservations.map(r => `
      <div class="demande-item" id="demande-${r.id}">
        <div class="demande-passager">
          <div class="demande-avatar">${(r.profiles.prenom[0] + r.profiles.nom[0]).toUpperCase()}</div>
          <div class="demande-name">${r.profiles.prenom} ${r.profiles.nom}</div>
        </div>
        <div class="demande-trajet">${r.trajets.ville_depart} — ${r.trajets.ville_arrivee}, ${formatDateHeure(r.trajets.date_trajet, r.trajets.heure_depart)}</div>
        <div class="demande-actions">
          <button class="btn-accepter" onclick="repondre('${r.id}','acceptee')">Accepter</button>
          <button class="btn-refuser" onclick="repondre('${r.id}','refusee')">Refuser</button>
        </div>
      </div>
    `).join('');

    const badge = document.querySelector('[onclick="showView(\'demandes\')"] .nav-badge');
    if (badge) badge.textContent = reservations.length;
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  function formatDateHeure(date, heure) {
    const d = new Date(date + 'T00:00:00');
    const aujourd = new Date(); aujourd.setHours(0,0,0,0);
    const demain = new Date(aujourd); demain.setDate(demain.getDate() + 1);
    let label;
    if (d.getTime() === aujourd.getTime()) label = "Aujourd'hui";
    else if (d.getTime() === demain.getTime()) label = "Demain";
    else label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return label + ', ' + heure.slice(0,5);
  }

  /* Navigation entre vues */
  const breadcrumbs = {
    'publier':     '— Publier un trajet',
    'mes-trajets': '— Mes trajets',
    'demandes':    '— Demandes recues',
    'messages':    '— Messages',
    'gains':       '— Mes gains',
    'profil':      '— Mon profil'
  };

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.getElementById('breadcrumb-current').textContent = breadcrumbs[name] || '';
    event.currentTarget && event.currentTarget.classList.add('active');
  }

  /* Tarif */
  function updateTarif() { updateTarifPreview(); }

  function updateTarifPreview() {
    const tarif  = parseFloat(document.getElementById('tarif').value) || 0;
    const places = parseInt(document.getElementById('places-dispo').value) || 0;
    const preview = document.getElementById('tarif-preview');
    const total   = document.getElementById('tarif-total');
    if (tarif > 0 && places > 0) {
      preview.style.display = 'flex';
      total.textContent = (tarif * places).toLocaleString('fr-FR') + ' FCFA total partage';
    } else {
      preview.style.display = 'none';
    }
  }

  /* Recurrence */
  function toggleRecurrence() {
    const val = document.getElementById('recurrence').value;
    document.getElementById('recurrence-jours').style.display = val === 'hebdo' ? 'block' : 'none';
  }

  function toggleDay(el) { el.classList.toggle('selected'); }

  /* Validation */
  function validateForm() {
    let ok = true;
    const checks = [
      ['ville-depart',  'err-depart',   v => !!v],
      ['ville-arrivee', 'err-arrivee',  v => !!v],
      ['date-trajet',   'err-date',     v => !!v],
      ['heure-depart',  'err-heure',    v => !!v],
      ['type-vehicule', 'err-vehicule', v => !!v],
      ['places-dispo',  'err-places',   v => !!v],
      ['tarif',         'err-tarif',    v => parseFloat(v) > 0],
    ];
    checks.forEach(([id, errId, fn]) => {
      const el  = document.getElementById(id);
      const err = document.getElementById(errId);
      const fail = !fn(el.value);
      if (err) err.classList.toggle('visible', fail);
      if (fail) ok = false;
    });
    return ok;
  }

  /* Publication */
  async function publierTrajet() {
    if (!validateForm()) {
      showToast('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    const btn = document.getElementById('btn-publier');
    btn.classList.add('loading'); btn.disabled = true;

    const depart  = document.getElementById('ville-depart').value;
    const arrivee = document.getElementById('ville-arrivee').value;
    const date    = document.getElementById('date-trajet').value;
    const heure   = document.getElementById('heure-depart').value;
    const tarif   = parseInt(document.getElementById('tarif').value);
    const places  = parseInt(document.getElementById('places-dispo').value);
    const vehicule = document.getElementById('type-vehicule').value;
    const departPrecis = document.getElementById('depart-precis').value.trim() || null;
    const arriveePrecis = document.getElementById('arrivee-precis').value.trim() || null;
    const description = document.getElementById('description').value.trim() || null;

    const nouveauTrajet = {
      conducteur_id: currentUser.id,
      ville_depart: depart,
      ville_arrivee: arrivee,
      point_depart_precis: departPrecis,
      point_arrivee_precis: arriveePrecis,
      date_trajet: date,
      heure_depart: heure,
      type_vehicule: vehicule,
      places_disponibles: places,
      places_initiales: places,
      prix_par_personne: tarif,
      description: description,
      bagages_acceptes: document.getElementById('opt-bagage').checked,
      etudiantes_uniquement: document.getElementById('opt-femme').checked,
      horaire_flexible: document.getElementById('opt-flexible').checked,
      trajet_recurrent: document.getElementById('opt-recurrent').checked
    };

    const { data, error } = await supabase.from('trajets').insert(nouveauTrajet).select().single();

    btn.classList.remove('loading'); btn.disabled = false;

    if (error) {
      showToast('Erreur lors de la publication : ' + error.message);
      return;
    }

    document.getElementById('success-detail').innerHTML = `
      <div class="detail-row"><span class="detail-key">Itineraire</span><span class="detail-val">${depart.split('—')[0]} → ${arrivee.split('—')[0]}</span></div>
      <div class="detail-row"><span class="detail-key">Date</span><span class="detail-val">${new Date(date).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'})}</span></div>
      <div class="detail-row"><span class="detail-key">Heure</span><span class="detail-val">${heure}</span></div>
      <div class="detail-row"><span class="detail-key">Vehicule</span><span class="detail-val">${vehicule.charAt(0).toUpperCase() + vehicule.slice(1)}</span></div>
      <div class="detail-row"><span class="detail-key">Places</span><span class="detail-val">${places} place${places > 1 ? 's' : ''}</span></div>
      <div class="detail-row"><span class="detail-key">Participation</span><span class="detail-val">${tarif.toLocaleString('fr-FR')} FCFA / personne</span></div>
    `;
    document.getElementById('success-overlay').classList.add('visible');
    chargerMesTrajets();
  }

  function closeSuccess() {
    document.getElementById('success-overlay').classList.remove('visible');
    resetForm();
  }

  function resetForm() {
    ['ville-depart','ville-arrivee','date-trajet','heure-depart','type-vehicule','places-dispo','tarif','description','depart-precis','arrivee-precis'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('tarif-preview').style.display = 'none';
    document.getElementById('recurrence-jours').style.display = 'none';
    document.querySelectorAll('.field-error-msg').forEach(e => e.classList.remove('visible'));
  }

  /* Demandes */
  async function repondre(id, action) {
    const el = document.getElementById('demande-' + id);
    const nom = el.querySelector('.demande-name').textContent;

    const { error } = await supabase
      .from('reservations')
      .update({ statut: action })
      .eq('id', id);

    if (error) {
      showToast('Erreur lors de la mise a jour : ' + error.message);
      return;
    }

    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';
    setTimeout(() => el.remove(), 300);

    if (action === 'acceptee') {
      showToast(nom + ' a ete notifie(e) — sa reservation est confirmee.', 'success');
    } else {
      showToast(nom + ' a ete notifie(e) du refus.', '');
    }

    setTimeout(() => {
      const badge = document.querySelector('[onclick="showView(\'demandes\')"] .nav-badge');
      const remaining = document.querySelectorAll('#demandes-body .demande-item').length;
      if (badge) {
        if (remaining > 0) badge.textContent = remaining;
        else badge.style.display = 'none';
      }
    }, 350);
  }

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = type === 'success' ? 'var(--vert)' : 'var(--rouge)';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  /* Date min = aujourd'hui */
  document.getElementById('date-trajet').min = new Date().toISOString().split('T')[0];

  /* Filtres Mes trajets */
  function filterTrajets(statut, btn) {
    document.querySelectorAll('.trajet-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.trajet-full-card').forEach(card => {
      card.style.display = (statut === 'tous' || card.dataset.statut === statut) ? 'flex' : 'none';
    });
  }

  /* Evaluation du passager */
  let selectedRatingPassager = 0;
  let evalPassagerBtn = null;
  let evalReservationId = null;
  let evalPassagerId = null;

  function ouvrirEvalPassager(btn, reservationId, passagerId, nomPassager) {
    selectedRatingPassager = 0;
    document.querySelectorAll('#star-rating-passager .star-p').forEach(s => {
      s.innerHTML = '&#9734;'; s.style.color = 'var(--gris-moyen)';
    });
    document.getElementById('eval-passager-comment').value = '';
    document.getElementById('eval-passager-nom').textContent = nomPassager || '';
    document.getElementById('modal-eval-passager').classList.add('visible');
    evalPassagerBtn = btn;
    evalReservationId = reservationId;
    evalPassagerId = passagerId;
  }

  function fermerEvalPassager() {
    document.getElementById('modal-eval-passager').classList.remove('visible');
  }

  async function confirmerEvalPassager() {
    if (selectedRatingPassager === 0) {
      showToast('Merci de selectionner une note avant de valider.');
      return;
    }
    const commentaire = document.getElementById('eval-passager-comment').value.trim() || null;

    const { error } = await supabase.from('evaluations').insert({
      reservation_id: evalReservationId,
      evaluateur_id: currentUser.id,
      evalue_id: evalPassagerId,
      note: selectedRatingPassager,
      commentaire: commentaire
    });

    if (error) {
      showToast('Erreur lors de l\'envoi de l\'evaluation : ' + error.message);
      return;
    }

    fermerEvalPassager();
    if (evalPassagerBtn) {
      evalPassagerBtn.textContent = 'Passager evalue';
      evalPassagerBtn.classList.add('done');
      evalPassagerBtn.onclick = null;
    }
    showToast('Evaluation envoyee. Merci pour votre retour.', 'success');
  }

  /* Etoiles passager */
  document.querySelectorAll('#star-rating-passager .star-p').forEach(star => {
    star.addEventListener('click', () => {
      selectedRatingPassager = parseInt(star.dataset.val);
      document.querySelectorAll('#star-rating-passager .star-p').forEach(s => {
        const val = parseInt(s.dataset.val);
        s.innerHTML = val <= selectedRatingPassager ? '&#9733;' : '&#9734;';
        s.style.color = val <= selectedRatingPassager ? 'var(--jaune)' : 'var(--gris-moyen)';
      });
    });
  });

  /* Fermer modal eval passager en cliquant a l'exterieur */
  document.getElementById('modal-eval-passager').addEventListener('click', e => {
    if (e.target.id === 'modal-eval-passager') fermerEvalPassager();
  });

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = 'connexion.html';
  }

  initDashboard();
