/* Sesión común del portal (hub de Herramientas). Fuente: ecoagri-core/generador/hub/sesion-portal.js — GENERADO a assets/sesion-portal.js.
   Qué hace:
   1. Inicio de sesión desde el propio portal (icono de persona en la barra): habla con el servicio de la app de administración por HTTP
      (acción login) y guarda la sesión aquí.
   2. Comparte esa sesión con las herramientas: cada app, al cargar dentro de su iframe, le pide la sesión al portal con postMessage (ver
      estilos/puente_sesion.js); cuando alguien inicia o cierra sesión en una app, el portal se entera y lo recuerda para las demás.
   3. Dónde se guarda: «Mantener sesión iniciada» marcado → localStorage (30 días, sobrevive al navegador); sin marcar → sessionStorage
      (hasta cerrar la pestaña, máximo 6 h). Nunca se guarda la contraseña: eso solo lo hace el gestor de contraseñas del navegador
      (con el aviso del navegador, o con PasswordCredential si el navegador lo ofrece).
   El token lo firma el servidor; este script no puede fabricar sesiones, solo guardarlas y repartirlas. */
(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwTCTm2GbCJxNEiFta2fAj1xHs3_KYtLanFfEBFnelEBwOrT6UCa-U7p1OTbu4uaTPn/exec';
  var CLAVE = 'ecoagriapp_sesion_portal';
  // Origen del sandbox de Apps Script dentro de nuestro iframe (https://<id>-script.googleusercontent.com).
  var ORIGEN_APP = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/;
  var BASE = new URL('../', (document.currentScript && document.currentScript.src) || location.href).href;

  var marcos = [];   // { ventana, origen } de las apps que han pedido la sesión

  function el(id) { return document.getElementById(id); }
  function escapar(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ---------------- Almacén ---------------- */
  function leer() {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); } catch (e) { s = null; }
    if (!s) { try { s = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { s = null; } }
    if (!s || !s.token || (s.expira && s.expira <= Date.now())) return null;
    return s;
  }
  function limpiar() {
    try { sessionStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
    try { localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
  }
  function guardar(s) {
    limpiar();
    var texto = JSON.stringify(s);
    try { (s.recordar ? localStorage : sessionStorage).setItem(CLAVE, texto); }
    catch (e) { try { sessionStorage.setItem(CLAVE, texto); } catch (e2) { /* sin almacenamiento: la sesión vive solo en esta página */ } }
  }
  function valida(s) {
    return s && typeof s.token === 'string' && s.token.length > 20 && s.token.length < 2000 && typeof s.usuario === 'string' && s.usuario.length < 200;
  }
  function limpia(s) {
    return { token: s.token, usuario: String(s.usuario), nombre: String(s.nombre || s.usuario).slice(0, 200), rol: s.rol === 'administrador' ? 'administrador' : 'usuario',
      expira: Number(s.expira) || 0, recordar: !!s.recordar };
  }

  /* ---------------- Reparto a las apps ---------------- */
  function enviar(marco, mensaje) {
    try { mensaje.fuente = 'ecoagri-sesion'; marco.ventana.postMessage(mensaje, marco.origen); } catch (e) { /* el marco ya no existe */ }
  }
  function difundir(mensaje) { marcos.forEach(function (m) { enviar(m, mensaje); }); }
  function registrar(ventana, origen) {
    for (var i = 0; i < marcos.length; i++) if (marcos[i].ventana === ventana) { marcos[i].origen = origen; return marcos[i]; }
    var m = { ventana: ventana, origen: origen };
    marcos.push(m);
    return m;
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.fuente !== 'ecoagri-sesion' || !ORIGEN_APP.test(e.origin)) return;
    var marco = registrar(e.source, e.origin);
    if (d.tipo === 'pedir') {
      enviar(marco, { tipo: 'sesion', sesion: leer() });
    } else if (d.tipo === 'iniciada' && valida(d.sesion)) {
      var s = limpia(d.sesion);
      guardar(s);
      pintar();
    } else if (d.tipo === 'cerrada') {
      limpiar();
      pintar();
    }
  });

  /* ---------------- Servicio de inicio de sesión (HTTP) ---------------- */
  function llamar(cuerpo) {
    // text/plain: es una petición «simple», no dispara la comprobación previa (preflight) que Apps Script no responde.
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo), redirect: 'follow' })
      .then(function (r) { return r.json(); });
  }

  function iniciar(usuario, clave, recordar) {
    return llamar({ accion: 'login', usuario: usuario, clave: clave, recordar: !!recordar }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'No se pudo iniciar sesión.');
      var s = limpia(r);
      guardar(s);
      difundir({ tipo: 'sesion', sesion: s });
      pintar();
      return s;
    });
  }

  function cerrar() {
    var s = leer();
    limpiar();
    difundir({ tipo: 'cerrada' });
    pintar();
    if (s) llamar({ accion: 'logout', token: s.token }).catch(function () { /* el token vence solo */ });
  }

  /* ---------------- Control de la barra y diálogo ---------------- */
  var ICONO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6"/></svg>';

  function pintar() {
    var caja = el('barra-sesion-portal');
    if (!caja) return;
    var s = leer();
    if (!s) {
      caja.classList.remove('activa');   // conserva otras clases (p. ej. «flotante» en la portada)
      caja.innerHTML = '<button type="button" class="barra-sesion-boton" aria-label="Iniciar sesión" title="Iniciar sesión">' + ICONO + '</button>';
      caja.querySelector('button').addEventListener('click', abrirDialogo);
      return;
    }
    caja.classList.add('activa');
    caja.innerHTML = '<button type="button" class="barra-sesion-boton" aria-haspopup="dialog" aria-label="Mi cuenta: ' + escapar(s.nombre) + '" title="' + escapar(s.nombre) + '">' + ICONO + '</button>';
    caja.querySelector('button').addEventListener('click', abrirCuenta);
  }

  /* Ventana «Mi cuenta» (mismo estilo de ventana emergente que el inicio de sesión y que las herramientas). */
  function abrirCuenta() {
    var s = leer();
    if (!s) { abrirDialogo(); return; }
    var rol = el('spc-rol');
    el('spc-nombre').textContent = s.nombre;
    rol.textContent = s.rol === 'administrador' ? 'administrador' : 'usuario';
    rol.className = 'sp-pastilla' + (s.rol === 'administrador' ? ' admin' : '');
    var hasta = s.expira ? new Date(s.expira).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    el('spc-sesion').textContent = s.recordar
      ? 'Sesión de 30 días en este dispositivo' + (hasta ? ' (hasta el ' + hasta + ')' : '') + '.'
      : 'Sesión normal: dura mientras no cierre la página' + (hasta ? ' (máximo hasta el ' + hasta + ')' : '') + '.';
    var admin = el('spc-admin');
    admin.hidden = s.rol !== 'administrador';
    admin.href = BASE + 'admin/';
    el('sp-cuenta').hidden = false;
    el('spc-cerrar').focus();
  }
  function cerrarCuenta() { var m = el('sp-cuenta'); if (m) m.hidden = true; }

  function abrirDialogo() {
    var modal = el('sp-modal');
    if (!modal) return;
    el('sp-error').hidden = true;
    el('sp-clave').value = '';
    el('sp-enviar').disabled = false;
    el('sp-enviar').textContent = 'Iniciar sesión';
    el('sp-guardar-fila').hidden = !(window.PasswordCredential && window.isSecureContext);
    modal.hidden = false;
    el('sp-usuario').focus();
  }
  function cerrarDialogo() { var m = el('sp-modal'); if (m) m.hidden = true; }

  function conectarDialogo() {
    var form = el('sp-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var usuario = el('sp-usuario').value.trim();
      var clave = el('sp-clave').value;
      var error = el('sp-error');
      if (!usuario || !clave) { error.textContent = 'Complete usuario y contraseña.'; error.hidden = false; return; }
      error.hidden = true;
      el('sp-enviar').disabled = true;
      el('sp-enviar').textContent = 'Verificando…';
      iniciar(usuario, clave, el('sp-recordar').checked).then(function (s) {
        if (el('sp-guardar').checked && window.PasswordCredential && navigator.credentials) {
          // Le pide al navegador (su gestor de contraseñas) que la guarde: el portal no la conserva.
          try { navigator.credentials.store(new window.PasswordCredential({ id: usuario, password: clave, name: s.nombre })); } catch (err) { /* el navegador no lo permite */ }
        }
        cerrarDialogo();
      }).catch(function (err) {
        el('sp-enviar').disabled = false;
        el('sp-enviar').textContent = 'Iniciar sesión';
        error.textContent = (err && err.message === 'Failed to fetch') ? 'No se pudo conectar con el servidor. Revise su conexión.' : (err && err.message) || 'No se pudo iniciar sesión.';
        error.hidden = false;
      });
    });
    el('sp-cancelar').addEventListener('click', cerrarDialogo);
    el('sp-modal').addEventListener('click', function (e) { if (e.target.id === 'sp-modal') cerrarDialogo(); });
    el('spc-cerrar').addEventListener('click', cerrarCuenta);
    el('spc-salir').addEventListener('click', function () { cerrarCuenta(); cerrar(); });
    el('sp-cuenta').addEventListener('click', function (e) { if (e.target.id === 'sp-cuenta') cerrarCuenta(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cerrarDialogo(); cerrarCuenta(); } });
  }

  /* ---------------- Arranque ---------------- */
  conectarDialogo();
  pintar();

  // Si hay una sesión guardada, el servidor confirma que sigue vigente (usuario activo, no cerrada); si no, se descarta.
  (function verificar() {
    var s = leer();
    if (!s) return;
    llamar({ accion: 'verificar', token: s.token }).then(function (r) {
      if (r && r.ok === false && /iniciar sesi/i.test(r.error || '')) { limpiar(); difundir({ tipo: 'cerrada' }); pintar(); }
      else if (r && r.ok && (r.rol !== s.rol || r.nombre !== s.nombre)) { var n = limpia({ token: s.token, usuario: r.usuario, nombre: r.nombre, rol: r.rol, expira: r.expira, recordar: s.recordar }); guardar(n); difundir({ tipo: 'sesion', sesion: n }); pintar(); }
    }).catch(function () { /* sin red: se conserva lo guardado */ });
  })();

  window.EcoAgriSesionPortal = { leer: leer, iniciar: iniciar, cerrar: cerrar };
})();
