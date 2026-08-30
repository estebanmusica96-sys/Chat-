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
    const { data: otrosPartis } = await supabaseClient
      .from('participantes')
      .select('usuario_id')
      .eq('conversacion_id', conv.id)
      .neq('usuario_id', usuarioActual.id);

    const otrosIds = (otrosPartis || []).map(o => o.usuario_id);
    let otrosPerfiles = [];
    if (otrosIds.length > 0) {
      const { data } = await supabaseClient
        .from('perfiles')
        .select('id, nombre, last_seen, avatar_url')
        .in('id', otrosIds);
      otrosPerfiles = data || [];
    }

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
      otrosParticipantes: otrosPerfiles,
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

  const prefs = prefsChat.get(id) || {};
  const chatPane = document.getElementById('chat-pane');
  chatPane.style.setProperty('--coral', prefs.color_tema || '');
  document.getElementById('messages').style.background = prefs.fondo || '';
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
// ESTADOS / HISTORIAS (desaparecen solas a las 24 horas)
// ============================================================
async function cargarEstados() {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseClient
    .from('historias')
    .select('*')
    .gt('creado_en', desde)
    .order('creado_en', { ascending: false });

  const historias = data || [];
  const idsUnicos = [...new Set(historias.map(h => h.usuario_id))];
  let perfilesPorId = {};
  if (idsUnicos.length > 0) {
    const { data: perfilesData } = await supabaseClient
      .from('perfiles').select('id, nombre, avatar_url').in('id', idsUnicos);
    (perfilesData || []).forEach(p => { perfilesPorId[p.id] = p; });
  }

  const porUsuario = new Map();
  historias.forEach(h => {
    h.perfiles = perfilesPorId[h.usuario_id] || null;
    if (!porUsuario.has(h.usuario_id)) porUsuario.set(h.usuario_id, []);
    porUsuario.get(h.usuario_id).push(h);
  });

  const misHistorias = porUsuario.get(usuarioActual.id) || [];
  const tengoEstado = misHistorias.length > 0;

  const cont = document.getElementById('estados-bar');
  let html = `
    <div class="estado-item" id="estado-agregar">
      <div class="estado-avatar ${tengoEstado ? '' : 'visto'}">
        ${avatarHtml(miPerfil?.nombre, miPerfil?.avatar_url, false)}
        <span class="estado-plus" id="estado-plus-btn">+</span>
      </div>
      <span>Tu estado</span>
    </div>
  `;

  porUsuario.forEach((historias, uid) => {
    if (uid === usuarioActual.id) return; // el propio ya se muestra arriba
    const nombre = historias[0].perfiles?.nombre || 'Usuario';
    const avatar = historias[0].perfiles?.avatar_url;
    html += `
      <div class="estado-item" data-usuario="${uid}">
        <div class="estado-avatar">${avatarHtml(nombre, avatar, false)}</div>
        <span>${nombre}</span>
      </div>
    `;
  });

  cont.innerHTML = html;

  function abrirPublicar() {
    document.getElementById('estado-texto').value = '';
    document.getElementById('input-estado-imagen').value = '';
    document.getElementById('modal-estado-bg').classList.add('show');
  }

  document.getElementById('estado-agregar').addEventListener('click', () => {
    if (tengoEstado) verEstados(misHistorias);
    else abrirPublicar();
  });
  document.getElementById('estado-plus-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    abrirPublicar();
  });
  cont.querySelectorAll('.estado-item[data-usuario]').forEach(el => {
    el.addEventListener('click', () => verEstados(porUsuario.get(el.dataset.usuario)));
  });
}

async function publicarEstado() {
  const texto = document.getElementById('estado-texto').value.trim();
  const file = document.getElementById('input-estado-imagen').files[0];

  if (file) {
    const ruta = `estados/${usuarioActual.id}_${Date.now()}_${file.name}`;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(ruta, file);
    if (error) { alert('No se pudo subir la imagen.'); return; }
    const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(ruta);
    await supabaseClient.from('historias').insert({ usuario_id: usuarioActual.id, tipo: 'imagen', contenido: urlData.publicUrl });
  } else if (texto) {
    await supabaseClient.from('historias').insert({ usuario_id: usuarioActual.id, tipo: 'texto', contenido: texto });
  } else {
    return;
  }

  document.getElementById('modal-estado-bg').classList.remove('show');
  await cargarEstados();
}

function verEstados(historias) {
  let i = 0;
  const viewer = document.getElementById('estado-viewer');
  const fill = document.getElementById('estado-viewer-fill');
  const nombre = document.getElementById('estado-viewer-nombre');
  const contenido = document.getElementById('estado-viewer-content');

  function mostrar() {
    const h = historias[i];
    nombre.textContent = h.perfiles?.nombre || 'Usuario';
    contenido.innerHTML = h.tipo === 'imagen' ? `<img src="${h.contenido}">` : `<div>${escapeHtml(h.contenido)}</div>`;
    fill.style.animation = 'none';
    void fill.offsetWidth;
    fill.style.animation = 'estadoProgreso 5s linear forwards';
  }

  viewer.classList.add('show');
  mostrar();

  fill.onanimationend = () => {
    i++;
    if (i >= historias.length) { viewer.classList.remove('show'); return; }
    mostrar();
  };
  document.getElementById('estado-viewer-close').onclick = () => viewer.classList.remove('show');
}

// ============================================================
// MENSAJES
// ============================================================
async function cargarMensajes(convId) {
  const { data } = await supabaseClient
    .from('mensajes')
    .select('*, reacciones(usuario_id, emoji)')
    .eq('conversacion_id', convId)
    .order('creado_en', { ascending: true })
    .limit(200);

  const mensajes = data || [];

  // Nombres de quien envió cada mensaje (para mostrarlos en grupos)
  const idsUnicos = [...new Set(mensajes.map(m => m.usuario_id))];
  let nombresPorId = {};
  if (idsUnicos.length > 0) {
    const { data: perfilesEnviaron } = await supabaseClient
      .from('perfiles').select('id, nombre').in('id', idsUnicos);
    (perfilesEnviaron || []).forEach(p => { nombresPorId[p.id] = p.nombre; });
  }
  mensajes.forEach(m => { m.nombreRemitente = nombresPorId[m.usuario_id] || 'Usuario'; });

  let otroLeidoHasta = null;
  const conv = conversaciones.find(c => c.id === convId);
  if (conv && conv.tipo === 'individual') {
    const { data: p } = await supabaseClient
      .from('participantes').select('leido_hasta')
      .eq('conversacion_id', convId).neq('usuario_id', usuarioActual.id).maybeSingle();
    otroLeidoHasta = p?.leido_hasta || null;
  }

  dibujarMensajes(mensajes, otroLeidoHasta);
}

function dibujarMensajes(mensajes, otroLeidoHasta) {
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
    else if (m.tipo === 'ubicacion') {
      const [lat, lng] = m.contenido.split(',');
      cuerpo = `<a class="bubble-ubicacion" href="https://maps.google.com/?q=${lat},${lng}" target="_blank"><span class="icono">📍</span> Ver ubicación</a>`;
    }

    let checks = '';
    if (mio && !esGrupo) {
      const leido = otroLeidoHasta && new Date(otroLeidoHasta) >= new Date(m.creado_en);
      checks = `<span class="check-doble ${leido ? 'leido' : ''}">${leido ? '✓✓' : '✓'}</span> `;
    }

    const reaccionesPorEmoji = {};
    (m.reacciones || []).forEach(r => { reaccionesPorEmoji[r.emoji] = (reaccionesPorEmoji[r.emoji] || 0) + 1; });
    const reaccionesHtml = Object.keys(reaccionesPorEmoji).length
      ? `<div class="reacciones-lista">${Object.entries(reaccionesPorEmoji).map(([e, n]) => `<span class="reaccion-chip">${e} ${n}</span>`).join('')}</div>`
      : '';

    const marcaFuego = m.autodestruye ? '<span class="marca-fuego">🔥</span>' : '';

    return `
      <div class="msg-row ${mio ? 'mine' : ''}" data-id="${m.id}" data-autodestruye="${m.autodestruye ? '1' : '0'}" data-mio="${mio ? '1' : '0'}">
        <div class="bubble-wrap">
          ${esGrupo && !mio ? `<div class="msg-sender">${m.nombreRemitente}</div>` : ''}
          <div class="reaccion-picker">${EMOJIS_REACCION.map(e => `<span data-emoji="${e}" data-msg="${m.id}">${e}</span>`).join('')}</div>
          ${mio ? `<div class="msg-borrar" data-borrar="${m.id}">✕</div>` : ''}
          <div class="bubble">${marcaFuego}${cuerpo}<div class="bubble-time">${checks}${hora}</div></div>
          ${reaccionesHtml}
        </div>
      </div>
    `;
  }).join('');

  cont.scrollTop = cont.scrollHeight;

  cont.querySelectorAll('.reaccion-picker span').forEach(el => {
    el.addEventListener('click', () => reaccionar(el.dataset.msg, el.dataset.emoji));
  });
  cont.querySelectorAll('[data-borrar]').forEach(el => {
    el.addEventListener('click', () => borrarMensaje(el.dataset.borrar));
  });

  // Mensajes autodestruibles: si NO son míos y los estoy viendo, se
  // borran solos unos segundos después de mostrarse.
  cont.querySelectorAll('.msg-row').forEach(row => {
    if (row.dataset.autodestruye === '1' && row.dataset.mio === '0') {
      const id = row.dataset.id;
      setTimeout(() => borrarMensaje(id, true), 5000);
    }
  });
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
    contenido: texto,
    autodestruye: autodestruyeActivo
  });

  if (autodestruyeActivo) { autodestruyeActivo = false; document.getElementById('btn-fuego').classList.remove('activo'); }
}

function toggleFuego() {
  autodestruyeActivo = !autodestruyeActivo;
  document.getElementById('btn-fuego').classList.toggle('activo', autodestruyeActivo);
}

async function enviarUbicacion() {
  if (!conversacionActivaId) return;
  if (!navigator.geolocation) { alert('Tu navegador no soporta ubicación.'); return; }

  navigator.geolocation.getCurrentPosition(async (pos) => {
    await supabaseClient.from('mensajes').insert({
      conversacion_id: conversacionActivaId,
      usuario_id: usuarioActual.id,
      tipo: 'ubicacion',
      contenido: `${pos.coords.latitude},${pos.coords.longitude}`
    });
  }, () => alert('No se pudo obtener tu ubicación. Revisa el permiso de ubicación.'));
}

async function reaccionar(mensajeId, emoji) {
  await supabaseClient.from('reacciones').upsert({
    mensaje_id: mensajeId, usuario_id: usuarioActual.id, emoji
  }, { onConflict: 'mensaje_id,usuario_id' });
  await cargarMensajes(conversacionActivaId);
}

async function borrarMensaje(mensajeId, silencioso) {
  if (!silencioso && !confirm('¿Borrar este mensaje?')) return;
  await supabaseClient.from('mensajes').delete().eq('id', mensajeId);
  const fila = document.querySelector(`.msg-row[data-id="${mensajeId}"]`);
  if (fila) fila.remove();
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
      } else if (m.usuario_id !== usuarioActual.id) {
        notificar('Nuevo mensaje', m.tipo === 'texto' ? m.contenido : 'Te enviaron algo nuevo');
      }
      await cargarConversaciones();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mensajes' }, (payload) => {
      const fila = document.querySelector(`.msg-row[data-id="${payload.old.id}"]`);
      if (fila) fila.remove();
    })
    .subscribe();

  canalReacciones = supabaseClient
    .channel('reacciones-onda')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reacciones' }, async () => {
      if (conversacionActivaId) await cargarMensajes(conversacionActivaId);
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

// ============================================================
// OPCIONES DEL CHAT (renombrar, apodo, color, fondo, salir)
// ============================================================
let colorSeleccionado = null;
let fondoSeleccionado = null;

function abrirOpcionesChat() {
  const conv = conversaciones.find(c => c.id === conversacionActivaId);
  if (!conv) return;

  const esGrupo = conv.tipo === 'grupo';
  document.getElementById('row-renombrar').style.display = esGrupo ? 'flex' : 'none';
  document.getElementById('btn-salir-grupo').style.display = esGrupo ? 'block' : 'none';
  document.getElementById('opciones-nombre-grupo').value = conv.nombre || '';

  const prefs = prefsChat.get(conv.id) || {};
  document.getElementById('opciones-apodo').value = prefs.apodo || '';
  colorSeleccionado = prefs.color_tema || null;
  fondoSeleccionado = prefs.fondo || null;

  document.querySelectorAll('#opciones-colores .color-swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === colorSeleccionado);
    el.onclick = () => {
      colorSeleccionado = el.dataset.color;
      document.querySelectorAll('#opciones-colores .color-swatch').forEach(s => s.classList.remove('selected'));
      el.classList.add('selected');
    };
  });
  document.querySelectorAll('#opciones-fondos .color-swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.fondo === fondoSeleccionado);
    el.onclick = () => {
      fondoSeleccionado = el.dataset.fondo;
      document.querySelectorAll('#opciones-fondos .color-swatch').forEach(s => s.classList.remove('selected'));
      el.classList.add('selected');
    };
  });

  document.getElementById('modal-opciones-bg').classList.add('show');
}

async function guardarOpcionesChat() {
  const conv = conversaciones.find(c => c.id === conversacionActivaId);
  if (!conv) return;

  if (conv.tipo === 'grupo') {
    const nuevoNombre = document.getElementById('opciones-nombre-grupo').value.trim();
    if (nuevoNombre && nuevoNombre !== conv.nombre) {
      await supabaseClient.from('conversaciones').update({ nombre: nuevoNombre }).eq('id', conv.id);
    }
  }

  const apodo = document.getElementById('opciones-apodo').value.trim();
  await supabaseClient.from('conversacion_prefs').upsert({
    conversacion_id: conv.id,
    usuario_id: usuarioActual.id,
    apodo: apodo || null,
    color_tema: colorSeleccionado,
    fondo: fondoSeleccionado
  }, { onConflict: 'conversacion_id,usuario_id' });

  document.getElementById('modal-opciones-bg').classList.remove('show');
  await cargarPrefsChats();
  await cargarConversaciones();
  await abrirConversacion(conv.id);
}

async function salirDelGrupo() {
  const conv = conversaciones.find(c => c.id === conversacionActivaId);
  if (!conv) return;
  if (!confirm(`¿Salir del grupo "${nombreConversacion(conv)}"?`)) return;

  await supabaseClient.from('participantes').delete()
    .eq('conversacion_id', conv.id).eq('usuario_id', usuarioActual.id);

  document.getElementById('modal-opciones-bg').classList.remove('show');
  conversacionActivaId = null;
  volverALista();
  document.getElementById('chat-empty').style.display = 'flex';
  document.getElementById('chat-activo').style.display = 'none';
  await cargarConversaciones();
}
