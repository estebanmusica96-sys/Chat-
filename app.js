// ============================================================
// Chat Esteban — Lógica de la app de mensajería
// ============================================================

let usuarioActual = null;
let miPerfil = null;
let conversaciones = [];
let conversacionActivaId = null;
let participantesActivos = [];
let canalMensajes = null;
let canalReacciones = null;
let modoModal = 'chat'; // 'chat' o 'grupo'
let seleccionGrupo = new Map();
let grabando = false;
let mediaRecorder = null;
let chunksAudio = [];
let prefsChat = new Map();   // conversacion_id -> {apodo, color_tema, fondo}
let autodestruyeActivo = false;
let avatarFileSeleccionado = null;
const EMOJIS_REACCION = ['👍','❤️','😂','😮','😢','🙏'];

const BUCKET = 'media';

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { window.location.href = 'login.html'; return; }
  usuarioActual = user;

  await marcarComoConectado();
  setInterval(marcarComoConectado, 25000); // late para mantenerse "en línea"

  aplicarTemaGuardado();
  pedirPermisoNotificaciones();

  await mostrarMiCodigo();
  await cargarPrefsChats();
  await cargarConversaciones();
  await cargarEstados();
  suscribirseAConversaciones();

  document.getElementById('btn-logout').addEventListener('click', cerrarSesion);
  document.getElementById('btn-nuevo-chat').addEventListener('click', () => abrirModal('chat'));
  document.getElementById('btn-nuevo-grupo').addEventListener('click', () => abrirModal('grupo'));
  document.getElementById('modal-confirmar').addEventListener('click', confirmarModal);
  document.getElementById('btn-buscar-codigo').addEventListener('click', buscarPorCodigo);
  document.getElementById('modal-codigo').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarPorCodigo(); });
  document.getElementById('modal-bg').addEventListener('click', (e) => { if (e.target.id === 'modal-bg') cerrarModal(); });

  document.getElementById('btn-back').addEventListener('click', volverALista);
  document.getElementById('btn-enviar').addEventListener('click', enviarTexto);
  document.getElementById('texto-mensaje').addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarTexto(); });
  document.getElementById('btn-adjuntar').addEventListener('click', () => document.getElementById('input-imagen').click());
  document.getElementById('input-imagen').addEventListener('change', enviarImagen);
  document.getElementById('btn-audio').addEventListener('click', toggleGrabacion);
  document.getElementById('buscar-conv').addEventListener('input', filtrarListaConv);

  document.getElementById('btn-tema').addEventListener('click', toggleTema);
  document.getElementById('btn-ubicacion').addEventListener('click', enviarUbicacion);
  document.getElementById('btn-fuego').addEventListener('click', toggleFuego);

  document.getElementById('btn-perfil').addEventListener('click', abrirModalPerfil);
  document.getElementById('btn-cerrar-modal-perfil').addEventListener('click', () => document.getElementById('modal-perfil-bg').classList.remove('show'));
  document.getElementById('btn-cambiar-avatar').addEventListener('click', () => document.getElementById('input-avatar').click());
  document.getElementById('input-avatar').addEventListener('change', previsualizarAvatar);
  document.getElementById('btn-guardar-perfil').addEventListener('click', guardarPerfil);

  document.getElementById('modal-estado-bg').addEventListener('click', (e) => { if (e.target.id === 'modal-estado-bg') e.target.classList.remove('show'); });
  document.getElementById('btn-publicar-estado').addEventListener('click', publicarEstado);
  document.getElementById('estado-viewer-close').addEventListener('click', () => document.getElementById('estado-viewer').classList.remove('show'));

  document.getElementById('btn-opciones-chat').addEventListener('click', abrirOpcionesChat);
  document.getElementById('modal-opciones-bg').addEventListener('click', (e) => { if (e.target.id === 'modal-opciones-bg') e.target.classList.remove('show'); });
  document.getElementById('btn-cerrar-modal-opciones').addEventListener('click', () => document.getElementById('modal-opciones-bg').classList.remove('show'));
  document.getElementById('btn-guardar-opciones').addEventListener('click', guardarOpcionesChat);
  document.getElementById('btn-salir-grupo').addEventListener('click', salirDelGrupo);
});

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

async function marcarComoConectado() {
  await supabaseClient.from('perfiles').update({ last_seen: new Date().toISOString() }).eq('id', usuarioActual.id);
}

async function mostrarMiCodigo() {
  const { data } = await supabaseClient.from('perfiles').select('*').eq('id', usuarioActual.id).maybeSingle();
  miPerfil = data;
  if (data?.codigo) document.getElementById('mi-codigo').textContent = data.codigo;
}

// ---------- Modo oscuro ----------
function aplicarTemaGuardado() {
  if (localStorage.getItem('tema') === 'oscuro') {
    document.body.classList.add('dark');
    document.getElementById('btn-tema').textContent = '☀️';
  }
}

function toggleTema() {
  const oscuro = document.body.classList.toggle('dark');
  document.getElementById('btn-tema').textContent = oscuro ? '☀️' : '🌙';
  localStorage.setItem('tema', oscuro ? 'oscuro' : 'claro');
}

// ---------- Notificaciones (mientras la pestaña esté abierta) ----------
function pedirPermisoNotificaciones() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function notificar(titulo, cuerpo) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification(titulo, { body: cuerpo });
  }
}

// ---------- Perfil (avatar y nombre) ----------
function abrirModalPerfil() {
  document.getElementById('perfil-nombre').value = miPerfil?.nombre || '';
  const preview = document.getElementById('perfil-avatar-preview');
  if (miPerfil?.avatar_url) preview.innerHTML = `<img src="${miPerfil.avatar_url}">`;
  else { preview.textContent = inicial(miPerfil?.nombre); preview.innerHTML = inicial(miPerfil?.nombre); }
  avatarFileSeleccionado = null;
  document.getElementById('modal-perfil-bg').classList.add('show');
}

function previsualizarAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  avatarFileSeleccionado = file;
  const preview = document.getElementById('perfil-avatar-preview');
  preview.innerHTML = `<img src="${URL.createObjectURL(file)}">`;
}

async function guardarPerfil() {
  const nombre = document.getElementById('perfil-nombre').value.trim();
  const updates = { nombre };

  if (avatarFileSeleccionado) {
    const ruta = `avatars/${usuarioActual.id}_${Date.now()}_${avatarFileSeleccionado.name}`;
    const { error: errSubida } = await supabaseClient.storage.from(BUCKET).upload(ruta, avatarFileSeleccionado);
    if (!errSubida) {
      const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(ruta);
      updates.avatar_url = urlData.publicUrl;
    }
  }

  await supabaseClient.from('perfiles').update(updates).eq('id', usuarioActual.id);
  miPerfil = { ...miPerfil, ...updates };
  document.getElementById('modal-perfil-bg').classList.remove('show');
  await cargarConversaciones();
}

function esReciente(lastSeen) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) < 60000;
}

// ---------- Personalización por chat (apodo, color, fondo) ----------
async function cargarPrefsChats() {
  const { data } = await supabaseClient.from('conversacion_prefs').select('*').eq('usuario_id', usuarioActual.id);
  prefsChat = new Map((data || []).map(p => [p.conversacion_id, p]));
}

// ============================================================
// CONVERSACIONES
// ============================================================
async function cargarConversaciones() {
  const { data: partis } = await supabaseClient
    .from('participantes')
    .select('conversacion_id, leido_hasta, conversaciones(id, tipo, nombre, creado_en)')
    .eq('usuario_id', usuarioActual.id);

  if (!partis || partis.length === 0) {
    document.getElementById('conv-list').innerHTML = '<div class="empty-state"><p>Aún no tienes chats. Toca 💬 para empezar uno.</p></div>';
    return;
  }

  conversaciones = [];
  for (const p of partis) {
    const conv = p.conversaciones;
    const { data: otros } = await supabaseClient
      .from('participantes')
      .select('usuario_id, perfiles(id, nombre, last_seen, avatar_url)')
      .eq('conversacion_id', conv.id)
      .neq('usuario_id', usuarioActual.id);

    const { data: ultimoMsg } = await supabaseClient
      .from('mensajes')
      .select('*')
      .eq('conversacion_id', conv.id)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: noLeidos } = await supabaseClient
      .from('mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('conversacion_id', conv.id)
      .gt('creado_en', p.leido_hasta || '1970-01-01')
      .neq('usuario_id', usuarioActual.id);

    conversaciones.push({
      ...conv,
      otrosParticipantes: (otros || []).map(o => o.perfiles),
      ultimoMsg,
      noLeidos: noLeidos || 0
    });
  }

  conversaciones.sort((a, b) => {
    const ta = a.ultimoMsg?.creado_en || a.creado_en;
    const tb = b.ultimoMsg?.creado_en || b.creado_en;
    return new Date(tb) - new Date(ta);
  });

  dibujarListaConv();
}

function nombreConversacion(conv) {
  const apodo = prefsChat.get(conv.id)?.apodo;
  if (apodo) return apodo;
  if (conv.tipo === 'grupo') return conv.nombre || 'Grupo';
  return conv.otrosParticipantes[0]?.nombre || 'Usuario';
}

function inicial(nombre) {
  return (nombre || '?').trim().charAt(0).toUpperCase();
}

function avatarHtml(nombre, avatarUrl, esGrupo) {
  if (avatarUrl) return `<div class="avatar ${esGrupo ? 'group' : ''}"><img src="${avatarUrl}"></div>`;
  return `<div class="avatar ${esGrupo ? 'group' : ''}">${inicial(nombre)}</div>`;
}

function dibujarListaConv() {
  const cont = document.getElementById('conv-list');
  if (conversaciones.length === 0) {
    cont.innerHTML = '<div class="empty-state"><p>Aún no tienes chats. Toca 💬 para empezar uno.</p></div>';
    return;
  }

  cont.innerHTML = conversaciones.map(conv => {
    const nombre = nombreConversacion(conv);
    const esGrupo = conv.tipo === 'grupo';
    const enLinea = !esGrupo && esReciente(conv.otrosParticipantes[0]?.last_seen);
    const preview = conv.ultimoMsg
      ? (conv.ultimoMsg.tipo === 'texto' ? conv.ultimoMsg.contenido : conv.ultimoMsg.tipo === 'imagen' ? '📷 Foto' : '🎤 Audio')
      : 'Sin mensajes todavía';
    const hora = conv.ultimoMsg ? new Date(conv.ultimoMsg.creado_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';

    return `
      <div class="conv-item ${conv.id === conversacionActivaId ? 'active' : ''}" data-id="${conv.id}">
        <div class="avatar ${esGrupo ? 'group' : ''}">${inicial(nombre)}${enLinea ? '<span class="online-dot"></span>' : ''}</div>
        <div class="conv-info">
          <div class="conv-info-top">
            <span class="conv-name">${nombre}</span>
            <span class="conv-time">${hora}</span>
          </div>
          <div class="conv-info-top">
            <span class="conv-preview">${preview}</span>
            ${conv.noLeidos > 0 ? `<span class="unread-badge">${conv.noLeidos}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', () => abrirConversacion(el.dataset.id));
  });
}

function filtrarListaConv() {
  const q = document.getElementById('buscar-conv').value.toLowerCase();
  document.querySelectorAll('.conv-item').forEach(el => {
    const nombre = el.querySelector('.conv-name').textContent.toLowerCase();
    el.style.display = nombre.includes(q) ? 'flex' : 'none';
  });
}

// ============================================================
// ABRIR CONVERSACIÓN
// ============================================================
async function abrirConversacion(id) {
  conversacionActivaId = id;
  const conv = conversaciones.find(c => c.id === id);
  if (!conv) return;

  document.getElementById('chat-empty').style.display = 'none';
  document.getElementById('chat-activo').style.display = 'flex';
  document.getElementById('sidebar').classList.add('chat-open');
  document.getElementById('chat-pane').classList.add('open');

  const nombre = nombreConversacion(conv);
  document.getElementById('chat-avatar').textContent = inicial(nombre);
  document.getElementById('chat-avatar').className = 'avatar ' + (conv.tipo === 'grupo' ? 'group' : '');
  document.getElementById('chat-nombre').textContent = nombre;

  if (conv.tipo === 'grupo') {
    document.getElementById('chat-status').textContent = `${conv.otrosParticipantes.length + 1} participantes`;
    document.getElementById('chat-status').className = 'chat-head-status';
  } else {
    const enLinea = esReciente(conv.otrosParticipantes[0]?.last_seen);
    document.getElementById('chat-status').textContent = enLinea ? 'En línea' : 'Desconectado';
    document.getElementById('chat-status').className = 'chat-head-status ' + (enLinea ? 'online' : '');
  }

  await marcarLeido(id);
  await cargarMensajes(id);
  dibujarListaConv();
}

function volverALista() {
  document.getElementById('sidebar').classList.remove('chat-open');
  document.getElementById('chat-pane').classList.remove('open');
}

async function marcarLeido(convId) {
  await supabaseClient.from('participantes')
    .update({ leido_hasta: new Date().toISOString() })
    .eq('conversacion_id', convId)
    .eq('usuario_id', usuarioActual.id);
}

// ============================================================
// MENSAJES
// ============================================================
async function cargarMensajes(convId) {
  const { data } = await supabaseClient
    .from('mensajes')
    .select('*, perfiles(nombre)')
    .eq('conversacion_id', convId)
    .order('creado_en', { ascending: true })
    .limit(200);

  dibujarMensajes(data || []);
}

function dibujarMensajes(mensajes) {
  const cont = document.getElementById('messages');
  const conv = conversaciones.find(c => c.id === conversacionActivaId);
  const esGrupo = conv?.tipo === 'grupo';

  cont.innerHTML = mensajes.map(m => {
    const mio = m.usuario_id === usuarioActual.id;
    const hora = new Date(m.creado_en).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    let cuerpo = '';
    if (m.tipo === 'texto') cuerpo = `<div>${escapeHtml(m.contenido)}</div>`;
    else if (m.tipo === 'imagen') cuerpo = `<img src="${m.contenido}" alt="imagen">`;
    else if (m.tipo === 'audio') cuerpo = `<audio controls src="${m.contenido}"></audio>`;

    return `
      <div class="msg-row ${mio ? 'mine' : ''}">
        <div>
          ${esGrupo && !mio ? `<div class="msg-sender">${m.perfiles?.nombre || 'Usuario'}</div>` : ''}
          <div class="bubble">${cuerpo}<div class="bubble-time">${hora}</div></div>
        </div>
      </div>
    `;
  }).join('');

  cont.scrollTop = cont.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function enviarTexto() {
  const input = document.getElementById('texto-mensaje');
  const texto = input.value.trim();
  if (!texto || !conversacionActivaId) return;

  input.value = '';
  await supabaseClient.from('mensajes').insert({
    conversacion_id: conversacionActivaId,
    usuario_id: usuarioActual.id,
    tipo: 'texto',
    contenido: texto
  });
}

async function enviarImagen(e) {
  const file = e.target.files[0];
  if (!file || !conversacionActivaId) return;

  const ruta = `${conversacionActivaId}/${Date.now()}_${file.name}`;
  const { error: errSubida } = await supabaseClient.storage.from(BUCKET).upload(ruta, file);
  if (errSubida) { alert('No se pudo subir la imagen.'); return; }

  const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(ruta);

  await supabaseClient.from('mensajes').insert({
    conversacion_id: conversacionActivaId,
    usuario_id: usuarioActual.id,
    tipo: 'imagen',
    contenido: urlData.publicUrl
  });

  e.target.value = '';
}

async function toggleGrabacion() {
  const btn = document.getElementById('btn-audio');

  if (!grabando) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      chunksAudio = [];
      mediaRecorder.ondataavailable = (e) => chunksAudio.push(e.data);
      mediaRecorder.onstop = subirAudioGrabado;
      mediaRecorder.start();
      grabando = true;
      btn.textContent = '⏹';
      document.getElementById('btn-enviar').classList.add('recording');
    } catch (err) {
      alert('No se pudo acceder al micrófono.');
    }
  } else {
    mediaRecorder.stop();
    grabando = false;
    btn.textContent = '🎤';
    document.getElementById('btn-enviar').classList.remove('recording');
  }
}

async function subirAudioGrabado() {
  if (!conversacionActivaId) return;
  const blob = new Blob(chunksAudio, { type: 'audio/webm' });
  const ruta = `${conversacionActivaId}/${Date.now()}_nota.webm`;

  const { error } = await supabaseClient.storage.from(BUCKET).upload(ruta, blob);
  if (error) { alert('No se pudo subir el audio.'); return; }

  const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(ruta);

  await supabaseClient.from('mensajes').insert({
    conversacion_id: conversacionActivaId,
    usuario_id: usuarioActual.id,
    tipo: 'audio',
    contenido: urlData.publicUrl
  });
}

// ============================================================
// REALTIME
// ============================================================
function suscribirseAConversaciones() {
  canalMensajes = supabaseClient
    .channel('mensajes-onda')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, async (payload) => {
      const m = payload.new;
      if (m.conversacion_id === conversacionActivaId) {
        await marcarLeido(conversacionActivaId);
        await cargarMensajes(conversacionActivaId);
      }
      await cargarConversaciones();
    })
    .subscribe();
}

// ============================================================
// MODAL: nuevo chat / nuevo grupo — solo por código de 2 dígitos
// ============================================================
function abrirModal(modo) {
  modoModal = modo;
  seleccionGrupo = new Map(); // id -> nombre
  document.getElementById('modal-titulo').textContent = modo === 'grupo' ? 'Nuevo grupo' : 'Nuevo chat';
  document.getElementById('modal-nombre-grupo').style.display = modo === 'grupo' ? 'block' : 'none';
  document.getElementById('modal-nombre-grupo').value = '';
  document.getElementById('modal-codigo').value = '';
  document.getElementById('codigo-error').style.display = 'none';
  document.getElementById('modal-confirmar').style.display = modo === 'grupo' ? 'block' : 'none';
  document.getElementById('modal-list').innerHTML = modo === 'grupo'
    ? '<p class="empty-state" style="padding:10px">Agrega personas por su código...</p>'
    : '';
  document.getElementById('modal-bg').classList.add('show');
}

function cerrarModal() {
  document.getElementById('modal-bg').classList.remove('show');
}

function mostrarErrorCodigo(texto) {
  const el = document.getElementById('codigo-error');
  el.textContent = texto;
  el.style.display = 'block';
}

async function buscarPorCodigo() {
  const codigoEl = document.getElementById('modal-codigo');
  const codigo = codigoEl.value.trim().padStart(2, '0');
  document.getElementById('codigo-error').style.display = 'none';

  if (!/^\d{2}$/.test(codigo)) { mostrarErrorCodigo('Escribe un código de 2 dígitos.'); return; }

  const { data, error } = await supabaseClient.rpc('buscar_por_codigo', { codigo_buscado: codigo });
  if (error || !data || data.length === 0) { mostrarErrorCodigo('No existe ningún usuario con ese código.'); return; }

  const encontrado = data[0];
  codigoEl.value = '';

  if (modoModal === 'chat') {
    cerrarModal();
    await crearChatIndividual(encontrado.id);
  } else {
    if (seleccionGrupo.has(encontrado.id)) { mostrarErrorCodigo('Esa persona ya está en la lista.'); return; }
    seleccionGrupo.set(encontrado.id, encontrado.nombre);
    dibujarSeleccionGrupo();
  }
}

function dibujarSeleccionGrupo() {
  const cont = document.getElementById('modal-list');
  if (seleccionGrupo.size === 0) {
    cont.innerHTML = '<p class="empty-state" style="padding:10px">Agrega personas por su código...</p>';
    return;
  }
  cont.innerHTML = [...seleccionGrupo.entries()].map(([id, nombre]) => `
    <div class="contact-pick" data-id="${id}">
      <div class="avatar">${inicial(nombre)}</div>
      <span>${nombre}</span>
      <span style="margin-left:auto;color:var(--ink-faint);cursor:pointer" data-quitar="${id}">✕</span>
    </div>
  `).join('');
  cont.querySelectorAll('[data-quitar]').forEach(el => {
    el.addEventListener('click', () => {
      seleccionGrupo.delete(el.dataset.quitar);
      dibujarSeleccionGrupo();
    });
  });
}

async function confirmarModal() {
  if (modoModal !== 'grupo') { cerrarModal(); return; }

  const nombreGrupo = document.getElementById('modal-nombre-grupo').value.trim();
  if (!nombreGrupo) { mostrarErrorCodigo('Ponle un nombre al grupo.'); return; }
  if (seleccionGrupo.size === 0) { mostrarErrorCodigo('Agrega al menos una persona por su código.'); return; }

  const { data: nuevaId, error } = await supabaseClient.rpc('crear_conversacion', {
    p_tipo: 'grupo',
    p_nombre: nombreGrupo,
    p_participantes: [...seleccionGrupo.keys()]
  });
  if (error) { mostrarErrorCodigo('No se pudo crear el grupo.'); return; }

  cerrarModal();
  await cargarConversaciones();
  await abrirConversacion(nuevaId);
}

async function crearChatIndividual(otroId) {
  // Busca si ya existe una conversación individual entre ambos
  const existente = conversaciones.find(c =>
    c.tipo === 'individual' && c.otrosParticipantes.some(p => p.id === otroId)
  );

  if (existente) {
    await abrirConversacion(existente.id);
    return;
  }

  const { data: nuevaId, error } = await supabaseClient.rpc('crear_conversacion', {
    p_tipo: 'individual',
    p_nombre: null,
    p_participantes: [otroId]
  });
  if (error) { alert('No se pudo crear el chat.'); return; }

  await cargarConversaciones();
  await abrirConversacion(nuevaId);
}
