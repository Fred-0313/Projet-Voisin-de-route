  const SUPABASE_URL = 'https://awpzfrshobabhnriwkza.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jR2L5ZmvqSrSBRdvWrluKQ_wL34_STO';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentUser = null;
  let currentProfile = null;
  let dernierResultatsTrajets = [];

  async function initDashboard() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'connexion.html'; return; }
    currentUser = session.user;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error || !profile || profile.role !== 'passager') {
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

    chargerStatistiques();
    rechercher();
    chargerReservations();
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

  async function chargerStatistiques() {
    const { data: reservations } = await supabase
      .from('reservations')
      .select('statut, trajets(prix_par_personne)')
      .eq('passager_id', currentUser.id);

    const termines = (reservations || []).filter(r => r.statut === 'terminee');
    const enAttente = (reservations || []).filter(r => r.statut === 'en_attente' || r.statut === 'acceptee');

    document.getElementById('stat-trajets-effectues').textContent = termines.length;

    const economie = termines.reduce((sum, r) => sum + (r.trajets ? r.trajets.prix_par_personne : 0), 0);
    document.getElementById('stat-total-economise').textContent = economie.toLocaleString('fr-FR');

    document.getElementById('stat-resa-attente').textContent = enAttente.length;
    document.getElementById('stat-resa-attente-sub').textContent =
      enAttente.length > 0 ? 'A suivre dans Mes reservations' : 'Aucune pour le moment';

    document.getElementById('stat-note-donnee').textContent =
      currentProfile.note_moyenne > 0 ? currentProfile.note_moyenne : '—';
    document.getElementById('stat-note-donnee-sub').textContent = 'Recue des conducteurs';
  }

  /* Navigation */
  const breadcrumbs = {
    'rechercher':   '— Rechercher un trajet',
    'reservations': '— Mes reservations',
    'messages':     '— Messages',
    'historique':   '— Historique',
    'profil':       '— Mon profil'
  };

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.getElementById('breadcrumb-current').textContent = breadcrumbs[name] || '';
    event.currentTarget && event.currentTarget.classList.add('active');
  }

  /* Recherche rapide */
  function quickSearch(depart, arrivee) {
    document.getElementById('search-depart').value = depart;
    document.getElementById('search-arrivee').value = arrivee;
    rechercher();
  }

  async function rechercher() {
    const depart   = document.getElementById('search-depart').value;
    const arrivee  = document.getElementById('search-arrivee').value;
    const date     = document.getElementById('search-date').value;
    const vehicule = document.getElementById('search-vehicule').value;

    let query = supabase
      .from('trajets')
      .select('*, profiles!trajets_conducteur_id_fkey(prenom, nom, note_moyenne)')
      .eq('statut', 'actif')
      .gt('places_disponibles', 0)
      .order('date_trajet', { ascending: true })
      .order('heure_depart', { ascending: true });

    if (depart)   query = query.eq('ville_depart', depart);
    if (arrivee)  query = query.eq('ville_arrivee', arrivee);
    if (date)     query = query.eq('date_trajet', date);
    if (vehicule) query = query.eq('type_vehicule', vehicule);

    const { data: trajets, error } = await query;

    if (error) { showToast('Erreur lors de la recherche : ' + error.message); return; }

    dernierResultatsTrajets = trajets || [];
    afficherResultats(dernierResultatsTrajets);

    if (depart || arrivee || date || vehicule) {
      showToast('Recherche mise a jour — ' + dernierResultatsTrajets.length + ' trajet(s) trouve(s).', 'success');
    }
  }

  function afficherResultats(trajets) {
    const list = document.getElementById('trajets-list');
    document.getElementById('results-num').textContent = trajets.length;
    document.getElementById('empty-state').style.display = trajets.length === 0 ? 'block' : 'none';

    if (trajets.length === 0) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = trajets.map(t => {
      const conducteur = t.profiles;
      const initiales = (conducteur.prenom[0] + conducteur.nom[0]).toUpperCase();
      const tags = [];
      tags.push(`<span class="tag ${t.type_vehicule === 'moto' ? 'tag-moto' : 'tag-voiture'}">${capitalize(t.type_vehicule)}</span>`);
      if (t.etudiantes_uniquement) tags.push('<span class="tag tag-securite">Etudiantes uniquement</span>');
      if (t.horaire_flexible) tags.push('<span class="tag tag-flexible">Horaire flexible</span>');
      if (t.bagages_acceptes) tags.push('<span class="tag tag-flexible">Bagages acceptes</span>');

      return `
      <div class="trajet-card" data-prix="${t.prix_par_personne}" data-heure="${t.heure_depart}" data-note="${conducteur.note_moyenne || 0}">
        <div class="conducteur-info">
          <div class="conducteur-avatar">${initiales}</div>
          <div class="conducteur-name">${conducteur.prenom} ${conducteur.nom[0]}.</div>
          <div class="conducteur-rating">
            <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ${conducteur.note_moyenne > 0 ? conducteur.note_moyenne : 'Nouveau'}
          </div>
        </div>
        <div class="trajet-details">
          <div class="trajet-route">
            <span class="route-point">${t.ville_depart}</span>
            <span class="route-arrow"></span>
            <span class="route-point">${t.ville_arrivee}</span>
          </div>
          <div class="trajet-meta">
            <div class="meta-item">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${formatDateHeure(t.date_trajet, t.heure_depart)}
            </div>
            ${t.point_depart_precis ? `<div class="meta-item"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>${t.point_depart_precis}</div>` : ''}
          </div>
          <div class="trajet-tags">${tags.join('')}</div>
        </div>
        <div class="trajet-action">
          <div class="trajet-price">
            <div class="price-val">${t.prix_par_personne.toLocaleString('fr-FR')} FCFA</div>
            <div class="price-label">par personne</div>
          </div>
          <span class="places-left ${t.places_disponibles <= 1 ? 'warning' : ''}">${t.places_disponibles} place(s) restante(s)</span>
          <button class="btn-reserver" onclick="openModal('${t.id}', '${conducteur.prenom} ${conducteur.nom}', '${t.ville_depart}', '${t.ville_arrivee}', '${formatDateHeure(t.date_trajet, t.heure_depart)}', ${t.prix_par_personne}, '${capitalize(t.type_vehicule)}')">
            Reserver
          </button>
        </div>
      </div>
    `}).join('');
  }

  function sortResults() {
    const sortBy = document.getElementById('sort-select').value;
    const sorted = [...dernierResultatsTrajets];
    sorted.sort((a, b) => {
      if (sortBy === 'prix') return a.prix_par_personne - b.prix_par_personne;
      if (sortBy === 'note') return (b.profiles.note_moyenne || 0) - (a.profiles.note_moyenne || 0);
      return a.heure_depart.localeCompare(b.heure_depart);
    });
    afficherResultats(sorted);
  }

  /* Modal reservation */
  let trajetSelectionneId = null;

  function openModal(trajetId, conducteur, depart, arrivee, dateHeure, prix, vehicule) {
    trajetSelectionneId = trajetId;
    document.getElementById('modal-summary').innerHTML = `
      <div class="summary-row"><span class="summary-key">Conducteur</span><span class="summary-val">${conducteur}</span></div>
      <div class="summary-row"><span class="summary-key">Itineraire</span><span class="summary-val">${depart} → ${arrivee}</span></div>
      <div class="summary-row"><span class="summary-key">Date et heure</span><span class="summary-val">${dateHeure}</span></div>
      <div class="summary-row"><span class="summary-key">Vehicule</span><span class="summary-val">${vehicule}</span></div>
      <div class="summary-row"><span class="summary-key">Participation</span><span class="summary-val">${prix.toLocaleString('fr-FR')} FCFA</span></div>
    `;

    document.getElementById('modal-form-content').style.display = 'block';
    document.getElementById('modal-success-content').classList.remove('visible');
    document.getElementById('modal-message').value = '';
    document.getElementById('modal-overlay').classList.add('visible');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('visible');
  }

  async function confirmerReservation() {
    const btn = document.getElementById('btn-confirmer');
    btn.classList.add('loading'); btn.disabled = true;

    const message = document.getElementById('modal-message').value.trim() || null;

    const { error } = await supabase.from('reservations').insert({
      trajet_id: trajetSelectionneId,
      passager_id: currentUser.id,
      message_demande: message
    });

    btn.classList.remove('loading'); btn.disabled = false;

    if (error) {
      if (error.code === '23505') {
        showToast('Vous avez deja envoye une demande pour ce trajet.');
      } else {
        showToast('Erreur lors de la reservation : ' + error.message);
      }
      return;
    }

    document.getElementById('modal-form-content').style.display = 'none';
    document.getElementById('modal-success-content').classList.add('visible');

    rechercher();
    chargerReservations();
    chargerStatistiques();
  }

  /* Charger les vraies reservations du passager */
  async function chargerReservations() {
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*, trajets(*, profiles!trajets_conducteur_id_fkey(prenom, nom))')
      .eq('passager_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) { showToast('Erreur lors du chargement des reservations.'); return; }

    const liste = document.getElementById('resa-liste');
    if (!reservations || reservations.length === 0) {
      liste.innerHTML = '<p style="font-size:0.9rem; color:var(--gris-moyen); padding:1rem 0;">Vous n\'avez pas encore de reservation.</p>';
      updateFilterCounts([]);
      return;
    }

    updateFilterCounts(reservations);

    // Recuperer les evaluations deja faites par ce passager
    const { data: evals } = await supabase
      .from('evaluations')
      .select('reservation_id')
      .eq('evaluateur_id', currentUser.id);
    const dejaEvalues = new Set((evals || []).map(e => e.reservation_id));

    const statutMap = {
      en_attente: { badge: 'badge-attente', card: 'statut-attente', label: 'En attente de reponse',
        icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
      acceptee: { badge: 'badge-acceptee', card: 'statut-acceptee', label: 'Confirmee par le conducteur',
        icon: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' },
      refusee: { badge: 'badge-refusee', card: 'statut-refusee', label: 'Demande refusee',
        icon: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' },
      annulee: { badge: 'badge-refusee', card: 'statut-refusee', label: 'Annulee',
        icon: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' },
      terminee: { badge: 'badge-terminee', card: 'statut-terminee', label: 'Trajet termine',
        icon: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' }
    };

    liste.innerHTML = reservations.map(r => {
      const t = r.trajets;
      const conducteur = t.profiles;
      const initiales = (conducteur.prenom[0] + conducteur.nom[0]).toUpperCase();
      const sm = statutMap[r.statut] || statutMap.en_attente;

      let actionHtml = '';
      if (r.statut === 'en_attente') {
        actionHtml = `<button class="btn-resa-annuler" onclick="annulerDemande('${r.id}', this)">Annuler la demande</button>`;
      } else if (r.statut === 'acceptee') {
        actionHtml = `
          <a href="messagerie.html" class="btn-resa-msg" style="text-decoration:none; display:inline-block; text-align:center;">Envoyer un message</a>
          <button class="btn-resa-annuler" onclick="annulerDemande('${r.id}', this)">Annuler</button>`;
      } else if (r.statut === 'refusee' || r.statut === 'annulee') {
        actionHtml = `<button class="btn-resa-msg" onclick="showView('rechercher')">Chercher un autre trajet</button>`;
      } else if (r.statut === 'terminee') {
        actionHtml = dejaEvalues.has(r.id)
          ? `<span style="font-size:0.78rem; color:var(--vert); font-weight:600;">Trajet evalue</span>`
          : `<button class="btn-resa-evaluer" onclick="ouvrirEvaluation('${r.id}', '${t.conducteur_id}', '${conducteur.prenom} ${conducteur.nom}', '${t.ville_depart} → ${t.ville_arrivee}')">Evaluer le trajet</button>`;
      }

      return `
      <div class="resa-card ${sm.card}" data-statut="${r.statut === 'annulee' ? 'refusee' : r.statut}">
        <div class="resa-conducteur">
          <div class="resa-avatar">${initiales}</div>
          <div class="resa-conducteur-name">${conducteur.prenom} ${conducteur.nom[0]}.</div>
        </div>
        <div class="resa-details">
          <div class="resa-status-badge ${sm.badge}">${sm.icon} ${sm.label}</div>
          <div class="resa-route">
            <span class="route-point">${t.ville_depart}</span>
            <span class="route-arrow"></span>
            <span class="route-point">${t.ville_arrivee}</span>
          </div>
          <div class="resa-meta">
            <div class="meta-item">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${formatDateHeure(t.date_trajet, t.heure_depart)}
            </div>
          </div>
          ${r.message_demande ? `<div class="resa-message"><strong>Votre message :</strong> ${r.message_demande}</div>` : ''}
        </div>
        <div class="resa-action">
          <div>
            <div class="resa-prix" style="${r.statut === 'refusee' || r.statut === 'terminee' ? 'color:var(--gris-moyen)' : ''}">${t.prix_par_personne.toLocaleString('fr-FR')} FCFA</div>
            <div class="resa-prix-label">par personne</div>
          </div>
          ${actionHtml}
        </div>
      </div>
    `}).join('');
  }

  function updateFilterCounts(reservations) {
    const counts = { toutes: reservations.length, attente: 0, acceptee: 0, refusee: 0, terminee: 0 };
    reservations.forEach(r => {
      if (r.statut === 'en_attente') counts.attente++;
      else if (r.statut === 'acceptee') counts.acceptee++;
      else if (r.statut === 'refusee' || r.statut === 'annulee') counts.refusee++;
      else if (r.statut === 'terminee') counts.terminee++;
    });
    const keys = ['toutes', 'attente', 'acceptee', 'refusee', 'terminee'];
    document.querySelectorAll('.resa-filter-btn').forEach((btn, i) => {
      const c = btn.querySelector('.resa-filter-count');
      if (c) c.textContent = counts[keys[i]];
    });

    const badge = document.querySelector('[onclick="showView(\'reservations\')"] .nav-badge');
    const actives = counts.attente + counts.acceptee;
    if (badge) {
      if (actives > 0) { badge.textContent = actives; badge.style.display = 'inline-block'; }
      else { badge.style.display = 'none'; }
    }
  }

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = type === 'success' ? 'var(--vert)' : 'var(--rouge)';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  /* Filtres reservations */
  function filterResa(statut, btn) {
    document.querySelectorAll('.resa-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.resa-card').forEach(card => {
      card.style.display = (statut === 'toutes' || card.dataset.statut === statut) ? 'grid' : 'none';
    });
  }

  /* Annuler une demande */
  async function annulerDemande(reservationId, btn) {
    const { error } = await supabase
      .from('reservations')
      .update({ statut: 'annulee' })
      .eq('id', reservationId);

    if (error) {
      showToast('Erreur lors de l\'annulation : ' + error.message);
      return;
    }

    showToast('Votre demande a ete annulee.', 'success');
    chargerReservations();
    chargerStatistiques();
  }

  /* Evaluation */
  let selectedRating = 0;
  let evalReservationId = null;
  let evalConducteurId = null;

  function ouvrirEvaluation(reservationId, conducteurId, nomConducteur, route) {
    document.getElementById('eval-summary').innerHTML = `
      <div class="summary-row"><span class="summary-key">Conducteur</span><span class="summary-val">${nomConducteur}</span></div>
      <div class="summary-row"><span class="summary-key">Trajet</span><span class="summary-val">${route}</span></div>
    `;

    selectedRating = 0;
    document.querySelectorAll('#star-rating .star').forEach(s => { s.innerHTML = '&#9734;'; s.style.color = 'var(--gris-moyen)'; });
    document.getElementById('eval-comment').value = '';
    document.getElementById('eval-form-content').style.display = 'block';
    document.getElementById('eval-success-content').classList.remove('visible');
    document.getElementById('modal-eval-overlay').classList.add('visible');
    evalReservationId = reservationId;
    evalConducteurId = conducteurId;
  }

  function closeEvalModal() {
    document.getElementById('modal-eval-overlay').classList.remove('visible');
    chargerReservations();
  }

  async function confirmerEvaluation() {
    if (selectedRating === 0) {
      showToast('Merci de selectionner une note avant de valider.');
      return;
    }
    const btn = document.getElementById('btn-eval-confirmer');
    btn.classList.add('loading'); btn.disabled = true;

    const commentaire = document.getElementById('eval-comment').value.trim() || null;

    const { error } = await supabase.from('evaluations').insert({
      reservation_id: evalReservationId,
      evaluateur_id: currentUser.id,
      evalue_id: evalConducteurId,
      note: selectedRating,
      commentaire: commentaire
    });

    btn.classList.remove('loading'); btn.disabled = false;

    if (error) {
      showToast('Erreur lors de l\'envoi : ' + error.message);
      return;
    }

    document.getElementById('eval-form-content').style.display = 'none';
    document.getElementById('eval-success-content').classList.add('visible');
  }

  /* Etoiles */
  document.querySelectorAll('#star-rating .star').forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.dataset.val);
      document.querySelectorAll('#star-rating .star').forEach(s => {
        const val = parseInt(s.dataset.val);
        s.innerHTML = val <= selectedRating ? '&#9733;' : '&#9734;';
        s.style.color = val <= selectedRating ? 'var(--jaune)' : 'var(--gris-moyen)';
      });
    });
  });

  /* Fermer modal eval en cliquant a l'exterieur */
  document.getElementById('modal-eval-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-eval-overlay') closeEvalModal();
  });

  /* Date min = aujourd'hui */
  document.getElementById('search-date').min = new Date().toISOString().split('T')[0];

  /* Fermer modal en cliquant à l'exterieur */
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = 'connexion.html';
  }

  initDashboard();
