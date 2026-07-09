
  const SUPABASE_URL = 'https://awpzfrshobabhnriwkza.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jR2L5ZmvqSrSBRdvWrluKQ_wL34_STO';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let currentUser = null;
  let currentProfile = null;
  let currentReservationId = null;
  let currentAutreId = null;
  let messagesPollInterval = null;

  async function initMessagerie() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'connexion.html'; return; }
    currentUser = session.user;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error || !profile) { window.location.href = 'connexion.html'; return; }
    currentProfile = profile;

    const initiales = (profile.prenom[0] || '') + (profile.nom[0] || '');
    document.getElementById('profile-avatar').textContent = initiales.toUpperCase();
    document.getElementById('profile-name').textContent = profile.prenom + ' ' + profile.nom;
    document.getElementById('topbar-avatar').textContent = initiales.toUpperCase();
    document.getElementById('sidebar-role-label').textContent =
      profile.role === 'passager' ? 'Espace Passager' : 'Espace Conducteur';

    // Adapter les liens de la sidebar selon le role
    const dashboardUrl = profile.role === 'passager' ? 'dashboard-passager.html' : 'dashboard-conducteur.html';
    document.getElementById('link-principal-1').href = dashboardUrl;
    document.getElementById('link-principal-2').href = dashboardUrl;
    document.getElementById('link-compte-1').href = dashboardUrl;
    document.querySelectorAll('#sidebar-nav-passager a[href]').forEach(a => { a.href = dashboardUrl; });

    document.getElementById('label-principal-1').textContent =
      profile.role === 'passager' ? 'Rechercher un trajet' : 'Publier un trajet';
    document.getElementById('label-principal-2').textContent =
      profile.role === 'passager' ? 'Mes reservations' : 'Demandes recues';
    document.getElementById('label-compte-1').textContent =
      profile.role === 'passager' ? 'Historique' : 'Mes gains';

    chargerConversations();
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  async function chargerConversations() {
    let reservations;

    if (currentProfile.role === 'passager') {
      const { data, error } = await supabase
        .from('reservations')
        .select('*, trajets(*, profiles!trajets_conducteur_id_fkey(id, prenom, nom))')
        .eq('passager_id', currentUser.id)
        .in('statut', ['acceptee', 'terminee'])
        .order('updated_at', { ascending: false });
      reservations = data;
      if (error) console.error(error);
    } else {
      const { data: trajetsIds } = await supabase
        .from('trajets')
        .select('id')
        .eq('conducteur_id', currentUser.id);

      if (!trajetsIds || trajetsIds.length === 0) { reservations = []; }
      else {
        const ids = trajetsIds.map(t => t.id);
        const { data, error } = await supabase
          .from('reservations')
          .select('*, trajets(*), profiles!reservations_passager_id_fkey(id, prenom, nom)')
          .in('trajet_id', ids)
          .in('statut', ['acceptee', 'terminee'])
          .order('updated_at', { ascending: false });
        reservations = data;
        if (error) console.error(error);
      }
    }

    const liste = document.getElementById('conv-liste');
    if (!reservations || reservations.length === 0) {
      liste.innerHTML = '<p style="font-size:0.85rem; color:var(--gris-moyen); padding:1rem;">Aucune conversation pour le moment. Une discussion s\'ouvre automatiquement lorsque votre reservation est confirmee.</p>';
      return;
    }

    liste.innerHTML = reservations.map((r, i) => {
      const autre = currentProfile.role === 'passager' ? r.trajets.profiles : r.profiles;
      const initiales = (autre.prenom[0] + autre.nom[0]).toUpperCase();
      const route = r.trajets.ville_depart + ' → ' + r.trajets.ville_arrivee;
      return `
        <div class="conv-item ${i === 0 ? 'active' : ''}" id="conv-${r.id}" onclick="openConv('${r.id}', '${autre.id}', '${autre.prenom} ${autre.nom}', '${initiales}', '${route.replace(/'/g, "\\'")}', '${r.statut}', ${r.trajets.prix_par_personne})">
          <div class="conv-avatar">${initiales}</div>
          <div class="conv-info">
            <div class="conv-top">
              <span class="conv-name">${autre.prenom} ${autre.nom[0]}.</span>
              <span class="conv-time"></span>
            </div>
            <div class="conv-route">${route}</div>
            <div class="conv-preview" id="preview-${r.id}">Ouvrir la conversation</div>
          </div>
        </div>
      `;
    }).join('');

    // Ouvrir automatiquement la premiere conversation
    const first = reservations[0];
    const autre = currentProfile.role === 'passager' ? first.trajets.profiles : first.profiles;
    const initiales = (autre.prenom[0] + autre.nom[0]).toUpperCase();
    const route = first.trajets.ville_depart + ' → ' + first.trajets.ville_arrivee;
    openConv(first.id, autre.id, autre.prenom + ' ' + autre.nom, initiales, route, first.statut, first.trajets.prix_par_personne);
  }

  async function openConv(reservationId, autreId, autreNom, initiales, route, statut, prix) {
    document.querySelectorAll('.conv-item').forEach(i => i.classList.remove('active'));
    const el = document.getElementById('conv-' + reservationId);
    if (el) el.classList.add('active');

    currentReservationId = reservationId;
    currentAutreId = autreId;

    document.getElementById('chat-name').textContent = autreNom;
    document.getElementById('chat-avatar').textContent = initiales;
    document.getElementById('chat-status').textContent = '';

    const badgeLabel = statut === 'terminee' ? 'Termine' : 'Confirme';
    document.getElementById('trajet-banner-text').innerHTML = '<strong>' + route + '</strong>';
    document.getElementById('trajet-banner-badge').textContent = badgeLabel + ' — ' + prix.toLocaleString('fr-FR') + ' FCFA';

    document.getElementById('breadcrumb-current').textContent = '— ' + autreNom;

    if (window.innerWidth <= 900) {
      document.getElementById('conv-list').classList.remove('show-mobile');
      document.getElementById('chat-area').classList.remove('hide-mobile');
    }

    await chargerMessages();

    if (messagesPollInterval) clearInterval(messagesPollInterval);
    messagesPollInterval = setInterval(chargerMessages, 4000);
  }

  async function chargerMessages() {
    if (!currentReservationId) return;

    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('reservation_id', currentReservationId)
      .order('created_at', { ascending: true });

    if (error) { console.error(error); return; }

    const container = document.getElementById('chat-messages');
    if (!messages || messages.length === 0) {
      container.innerHTML = '<p style="text-align:center; font-size:0.83rem; color:var(--gris-moyen); padding:2rem;">Aucun message encore. Lancez la conversation.</p>';
      return;
    }

    container.innerHTML = messages.map(m => {
      const mine = m.expediteur_id === currentUser.id;
      const heure = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const initiales = mine
        ? ((currentProfile.prenom[0] || '') + (currentProfile.nom[0] || '')).toUpperCase()
        : document.getElementById('chat-avatar').textContent;
      return `
        <div class="msg-row ${mine ? 'mine' : ''}">
          <div class="msg-avatar">${initiales}</div>
          <div>
            <div class="msg-bubble">${escapeHtml(m.contenu)}</div>
            <span class="msg-time">${heure}</span>
          </div>
        </div>
      `;
    }).join('');

    scrollToBottom();

    // Marquer comme lus les messages recus
    const nonLus = messages.filter(m => m.expediteur_id !== currentUser.id && !m.lu);
    if (nonLus.length > 0) {
      await supabase.from('messages').update({ lu: true }).in('id', nonLus.map(m => m.id));
    }

    // Mettre a jour l'apercu dans la liste
    const dernier = messages[messages.length - 1];
    const preview = document.getElementById('preview-' + currentReservationId);
    if (preview) preview.textContent = dernier.contenu.slice(0, 40) + (dernier.contenu.length > 40 ? '...' : '');
  }

  async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !currentReservationId) return;

    input.value = '';
    input.style.height = 'auto';

    const { error } = await supabase.from('messages').insert({
      reservation_id: currentReservationId,
      expediteur_id: currentUser.id,
      contenu: text
    });

    if (error) {
      showToast('Erreur lors de l\'envoi du message.');
      return;
    }

    await chargerMessages();
  }

  function backToList() {
    document.getElementById('conv-list').classList.add('show-mobile');
    document.getElementById('chat-area').classList.add('hide-mobile');
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom() {
    const el = document.getElementById('chat-messages');
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
  }

  function showToast(msg) {
    alert(msg);
  }

  document.getElementById('message-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  async function handleLogout() {
    if (messagesPollInterval) clearInterval(messagesPollInterval);
    await supabase.auth.signOut();
    window.location.href = 'connexion.html';
  }

  initMessagerie();
