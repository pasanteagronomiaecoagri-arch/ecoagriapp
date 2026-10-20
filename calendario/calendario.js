/* Mi calendario (portal). Fuente: ecoagri-core/generador/hub/calendario.js — se copia a calendario/calendario.js.
   Pide a la app de administración los eventos de la persona con sesión (acción agenda_mis_eventos, por POST, con el mismo token y la misma
   red que el inicio de sesión del portal: window.EcoAgriSesionPortal.llamar) y los muestra por mes, semana o lista. Si el evento trae
   editable:true, la persona puede marcar sus tareas y cambiar el estado (pendiente/hecha) y guardarlo con la acción agenda_actualizar
   { accion, token, id, inicio, estado?, hechas? } -> { ok:true, evento } | { ok:false, error }. Los cancelados son de solo lectura; en los repetidos cada ocurrencia (id+inicio) se guarda por separado.
   Todas las horas se muestran en Colombia (UTC-5, sin horario de verano) sin importar la zona del navegador: se calculan a mano a partir del
   instante (Date.parse del texto con su desfase) restándole 5 horas, nunca con la zona local del dispositivo.
   Contrato del evento: { id, titulo, descripcion, tareas:[{texto,hecha}], inicio, fin, todoDia, lugar, finca, usuarios, personas:[{id,nombre}],
   estado:'pendiente'|'hecha'|'cancelada', recurrencia:{tipo,hasta}, color, editable:boolean, repetido:boolean }. inicio/fin = 'AAAA-MM-DDTHH:MM:SS-05:00', o 'AAAA-MM-DD' si todoDia.
   Convención de «todo el día»: la fecha fin es EXCLUSIVA (como en Google Calendar: un evento del 5 al 6 trae fin = 7); si fin <= inicio es de un día. */
(function () {
  'use strict';

  var DESFASE_MS = 5 * 3600 * 1000;                 // Colombia = UTC-5
  var HORA_PX = 44;                                  // alto de una hora en la vista de semana
  var ESPERA_MS = 45000;                             // tiempo máximo de una petición
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var DIAS_C = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  var ESTADOS = { pendiente: 'pendiente', hecha: 'hecha', cancelada: 'cancelada' };
  var REPETICION = { daily: 'todos los días', weekly: 'cada semana', monthly: 'cada mes', yearly: 'cada año', diaria: 'todos los días', diario: 'todos los días',
    semanal: 'cada semana', mensual: 'cada mes', anual: 'cada año', ninguna: '', none: '' };

  var $ = function (id) { return document.getElementById(id); };
  function escapar(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function primera(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /* ---------------- Fechas (todo en «claves» AAAA-MM-DD de Colombia) ---------------- */
  function clave(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function partes(k) { var p = k.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function utc(k) { var p = partes(k); return Date.UTC(p.y, p.m - 1, p.d); }
  function deUtc(ms) { var f = new Date(ms); return clave(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()); }
  function sumarDias(k, n) { return deUtc(utc(k) + n * 86400000); }
  function diaSemana(k) { return (new Date(utc(k)).getUTCDay() + 6) % 7; }       // lunes = 0
  function lunesDe(k) { return sumarDias(k, -diaSemana(k)); }
  function diasDelMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function primeroDelMes(k) { var p = partes(k); return clave(p.y, p.m, 1); }
  function sumarMeses(k, n) {
    var p = partes(k), t = p.y * 12 + (p.m - 1) + n, y = Math.floor(t / 12), m = t % 12 + 1;
    return clave(y, m, Math.min(p.d, diasDelMes(y, m)));
  }
  function claveMes(k) { return k.slice(0, 7); }
  function localDe(ms) {       // instante -> { clave, min } en hora de Colombia
    var f = new Date(ms - DESFASE_MS);
    return { clave: clave(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()), min: f.getUTCHours() * 60 + f.getUTCMinutes() };
  }
  function hoy() { return localDe(Date.now()).clave; }
  function ahoraMin() { return localDe(Date.now()).min; }

  function horaLarga(min) {      // 8:00 a. m.
    var h = Math.floor(min / 60) % 24, m = min % 60;
    return (h % 12 || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'a. m.' : 'p. m.');
  }
  function horaCorta(min) {      // 8 am · 8:30 am
    var h = Math.floor(min / 60) % 24, m = min % 60;
    return (h % 12 || 12) + (m ? ':' + pad(m) : '') + (h < 12 ? ' am' : ' pm');
  }
  function fechaLarga(k) { var p = partes(k); return DIAS[diaSemana(k)] + ' ' + p.d + ' de ' + MESES[p.m - 1] + ' de ' + p.y; }
  function fechaMedia(k) { var p = partes(k); return DIAS_C[diaSemana(k)] + ' ' + p.d + ' ' + MESES_C[p.m - 1]; }
  function fechaMes(k) { var p = partes(k); return p.d + ' de ' + MESES[p.m - 1]; }

  /* ---------------- Estado ---------------- */
  var estado = {
    vista: window.matchMedia && window.matchMedia('(max-width: 700px)').matches ? 'lista' : 'mes',
    ancla: hoy(),              // un día cualquiera del mes/semana que se está viendo
    foco: hoy(),               // día con el foco del teclado
    token: null,               // token de la sesión con la que se pidió lo que hay en memoria
    eventos: {},               // uid -> evento normalizado
    indice: null,              // clave de día -> [eventos] (se arma al necesitarlo)
    trozos: {},                // 'AAAA-MM' -> 'cargando' | 'ok' | 'error'
    preparado: null,
    calendarioUrl: '',
    mensajeError: '',
    motivoSinSesion: ''
  };
  var modal = { abierto: false, origen: null, tipo: '', uid: '', dia: '', viaDia: false };
  var guardando = {};              // uid -> true mientras se guarda ese evento (evita el doble clic)
  var restaurarFoco = false;
  var irAHoyLista = true;          // al abrir (y con «Hoy») la lista se desplaza al primer día de hoy en adelante

  function sesion() { return window.EcoAgriSesionPortal ? window.EcoAgriSesionPortal.leer() : null; }

  /* ---------------- Normalización de eventos ---------------- */
  function aTexto(x) { return x == null ? '' : String(x); }

  function normalizar(e) {
    if (!e || typeof e !== 'object') return null;
    var ini = aTexto(e.inicio), fin = aTexto(e.fin);
    var todoDia = e.todoDia === true || /^\d{4}-\d{2}-\d{2}$/.test(ini);
    var n = {
      id: aTexto(e.id), titulo: aTexto(e.titulo).trim() || '(Sin título)', descripcion: aTexto(e.descripcion),
      // Se conservan todas (aunque alguna venga sin texto) para que «hechas» siga alineado con las tareas del servidor; las vacías no se dibujan.
      tareas: Array.isArray(e.tareas) ? e.tareas.map(function (t) { return { texto: aTexto(t && t.texto), hecha: !!t && t.hecha === true }; }) : [],
      inicioRaw: ini, editable: e.editable === true, repetido: e.repetido === true,
      todoDia: todoDia, lugar: aTexto(e.lugar).trim(), finca: aTexto(e.finca).trim(),
      personas: Array.isArray(e.personas) ? e.personas.filter(function (p) { return p && aTexto(p.nombre).trim(); }).map(function (p) { return { id: aTexto(p.id), nombre: aTexto(p.nombre) }; }) : [],
      estado: ESTADOS[e.estado] || 'pendiente',
      recurrencia: e.recurrencia && typeof e.recurrencia === 'object' ? { tipo: aTexto(e.recurrencia.tipo), hasta: aTexto(e.recurrencia.hasta) } : null
    };
    if (todoDia) {
      var a = ini.slice(0, 10), b = (fin || ini).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) b = a;
      n.kIni = a; n.kUlt = b > a ? sumarDias(b, -1) : a;     // fin exclusivo
      n.minIni = 0; n.minFin = 1440;
    } else {
      var mi = Date.parse(ini), mf = fin ? Date.parse(fin) : mi;
      if (isNaN(mi)) return null;
      if (isNaN(mf) || mf < mi) mf = mi;
      var li = localDe(mi), lf = localDe(mf);
      n.kIni = li.clave; n.minIni = li.min;
      if (mf > mi && lf.min === 0 && lf.clave > li.clave) { n.kUlt = sumarDias(lf.clave, -1); n.minFin = 1440; }   // termina a medianoche en punto
      else { n.kUlt = lf.clave; n.minFin = lf.min; }
      if (n.kUlt === n.kIni && n.minFin <= n.minIni) n.minFin = Math.min(1440, n.minIni + 30);
    }
    n.uid = n.id + '|' + n.kIni + '|' + n.minIni + '|' + n.kUlt;
    return n;
  }

  function reindexar() {
    var idx = {};
    Object.keys(estado.eventos).forEach(function (uid) {
      var e = estado.eventos[uid], k = e.kIni, tope = 0;
      while (k <= e.kUlt && tope++ < 400) { (idx[k] = idx[k] || []).push(e); k = sumarDias(k, 1); }
    });
    Object.keys(idx).forEach(function (k) {
      idx[k].sort(function (a, b) {
        if (a.todoDia !== b.todoDia) return a.todoDia ? -1 : 1;
        var ma = a.kIni < k ? 0 : a.minIni, mb = b.kIni < k ? 0 : b.minIni;
        return ma - mb || a.titulo.localeCompare(b.titulo, 'es');
      });
    });
    estado.indice = idx;
  }
  function delDia(k) { if (!estado.indice) reindexar(); return estado.indice[k] || []; }

  /* Tramo del evento dentro del día k, en minutos. */
  function tramo(e, k) { return { ini: e.kIni < k ? 0 : e.minIni, fin: e.kUlt > k ? 1440 : e.minFin }; }
  function etiquetaHora(e, k) {
    if (e.todoDia) return 'Todo el día';
    var t = tramo(e, k);
    if (e.kIni < k && e.kUlt > k) return 'Todo el día';
    if (e.kIni < k) return 'Hasta ' + horaLarga(t.fin);
    if (e.kUlt > k) return 'Desde ' + horaLarga(t.ini);
    return horaLarga(t.ini) + ' – ' + horaLarga(t.fin);
  }
  function cuando(e) {
    if (e.todoDia) return e.kIni === e.kUlt ? 'Todo el día · ' + fechaLarga(e.kIni) : 'Todo el día · del ' + fechaLarga(e.kIni) + ' al ' + fechaLarga(e.kUlt);
    if (e.kIni === e.kUlt) return fechaLarga(e.kIni) + ' · ' + horaLarga(e.minIni) + ' – ' + horaLarga(e.minFin);
    return fechaMedia(e.kIni) + ', ' + horaLarga(e.minIni) + ' → ' + fechaMedia(e.kUlt) + ', ' + horaLarga(e.minFin);
  }
  function dondeTexto(e) { return [e.lugar, e.finca ? 'Finca ' + e.finca : ''].filter(Boolean).join(' · '); }

  /* ---------------- Rango visible y carga por meses ---------------- */
  function rangoVisible() {
    var a = estado.ancla;
    if (estado.vista === 'semana') { var l = lunesDe(a); return { desde: l, hasta: sumarDias(l, 6) }; }
    var p1 = primeroDelMes(a), p = partes(a);
    var ult = clave(p.y, p.m, diasDelMes(p.y, p.m));
    if (estado.vista === 'lista') return { desde: p1, hasta: ult };
    return { desde: lunesDe(p1), hasta: sumarDias(lunesDe(ult), 6) };
  }
  function mesesDe(r) {
    var out = [], k = primeroDelMes(r.desde);
    while (k <= r.hasta) { out.push(claveMes(k)); k = sumarMeses(k, 1); }
    return out;
  }
  function limitesMes(m) { var p = partes(m + '-01'); return { desde: m + '-01', hasta: clave(p.y, p.m, diasDelMes(p.y, p.m)) }; }

  function cargarVisible() {
    var s = sesion();
    if (!s) return;
    mesesDe(rangoVisible()).forEach(function (m) { if (estado.trozos[m] !== 'ok' && estado.trozos[m] !== 'cargando') pedirMes(m, s.token); });
    pintarCarga();
  }

  function pedirMes(m, token) {
    var lim = limitesMes(m), terminado = false;
    estado.trozos[m] = 'cargando';
    var temporizador = new Promise(function (_, rechazar) { setTimeout(function () { rechazar(new Error('espera')); }, ESPERA_MS); });
    Promise.race([window.EcoAgriSesionPortal.llamar({ accion: 'agenda_mis_eventos', token: token, desde: lim.desde, hasta: lim.hasta }), temporizador])
      .then(function (r) {
        if (terminado || estado.token !== token) return;
        terminado = true;
        if (!r || r.ok !== true) {
          var texto = (r && r.error) ? String(r.error) : 'El servidor no pudo entregar su calendario.';
          if (/iniciar sesi/i.test(texto)) { sesionVencida(); return; }
          estado.trozos[m] = 'error'; estado.mensajeError = texto;
        } else if (r.preparado === false) {
          estado.preparado = false; delete estado.trozos[m];
        } else {
          estado.preparado = true;
          (Array.isArray(r.eventos) ? r.eventos : []).forEach(function (x) { var n = normalizar(x); if (n) estado.eventos[n.uid] = n; });
          estado.indice = null;
          if (typeof r.calendarioUrl === 'string' && /^https:\/\//i.test(r.calendarioUrl)) estado.calendarioUrl = r.calendarioUrl;
          estado.trozos[m] = 'ok';
        }
        despuesDeCarga();
      })
      .catch(function () {
        if (terminado || estado.token !== token) return;
        terminado = true;
        estado.trozos[m] = 'error';
        estado.mensajeError = '';
        despuesDeCarga();
      });
  }

  function despuesDeCarga() {
    if (estado.preparado === false) { mostrarAviso('El calendario aún no está preparado', 'Avise al administrador: todavía no se ha creado la agenda conectada con Google Calendar. Cuando esté lista, aquí aparecerán sus eventos.', [{ texto: 'Volver a revisar', fn: reintentar }]); return; }
    pintar();
  }

  function reintentar() {
    var s = sesion();
    if (!s) { pedirSesion(); return; }
    Object.keys(estado.trozos).forEach(function (m) { if (estado.trozos[m] === 'error') delete estado.trozos[m]; });
    estado.preparado = null;
    prepararVista();
    cargarVisible();
    pintar();
  }

  function actualizar() {
    estado.eventos = {}; estado.indice = null; estado.trozos = {}; estado.preparado = null; estado.mensajeError = '';
    prepararVista();
    cargarVisible();
    pintar();
  }

  /* ---------------- Sesión ---------------- */
  function sesionVencida() {
    estado.motivoSinSesion = 'vencida';
    window.EcoAgriSesionPortal.vencida();      // dispara el evento ecoagri:sesion con sesión nula
  }

  function pedirSesion() {
    mostrarAviso(estado.motivoSinSesion === 'vencida' ? 'Su sesión venció' : 'Inicie sesión para ver su calendario',
      estado.motivoSinSesion === 'vencida' ? 'Por seguridad la sesión se cierra pasado un tiempo. Inicie sesión de nuevo para ver sus eventos.'
        : 'El calendario es personal: muestra solo los eventos y tareas que el administrador le asignó. Entre con su usuario y contraseña.',
      [{ texto: 'Iniciar sesión', principal: true, fn: function () { window.EcoAgriSesionPortal.abrirDialogo(); } }]);
    window.EcoAgriSesionPortal.abrirDialogo();
  }

  function alCambiarSesion(e) {
    var s = e && e.detail ? e.detail.sesion : sesion();
    var token = s ? s.token : null;
    if (token === estado.token) return;
    var habia = !!estado.token;
    estado.token = token;
    estado.eventos = {}; estado.indice = null; estado.trozos = {}; estado.preparado = null; estado.mensajeError = ''; estado.calendarioUrl = '';
    guardando = {};
    cerrarModal(true);
    avisoPagina('', '');
    if (!token) { if (habia || document.readyState !== 'loading') pedirSesionSinDialogo(); return; }
    estado.motivoSinSesion = '';
    $('cal-aviso').hidden = true;
    $('cal-app').hidden = false;
    prepararVista();
    cargarVisible();
    pintar();
  }
  function pedirSesionSinDialogo() {
    mostrarAviso(estado.motivoSinSesion === 'vencida' ? 'Su sesión venció' : 'Inicie sesión para ver su calendario',
      estado.motivoSinSesion === 'vencida' ? 'Por seguridad la sesión se cierra pasado un tiempo. Inicie sesión de nuevo para ver sus eventos.'
        : 'El calendario es personal: muestra solo los eventos y tareas que el administrador le asignó. Entre con su usuario y contraseña.',
      [{ texto: 'Iniciar sesión', principal: true, fn: function () { window.EcoAgriSesionPortal.abrirDialogo(); } }]);
    if (estado.motivoSinSesion === 'vencida') window.EcoAgriSesionPortal.abrirDialogo();
  }

  function mostrarAviso(titulo, texto, botones, esError) {
    $('cal-app').hidden = true;
    var caja = $('cal-aviso');
    caja.hidden = false;
    caja.className = 'cal-aviso' + (esError ? ' error' : '');
    $('cal-aviso-titulo').textContent = titulo;
    $('cal-aviso-texto').textContent = texto;
    var acc = $('cal-aviso-acciones');
    acc.innerHTML = '';
    (botones || []).forEach(function (b) {
      var x = document.createElement('button');
      x.type = 'button'; x.className = 'boton' + (b.principal ? ' principal' : ''); x.textContent = b.texto;
      x.addEventListener('click', b.fn);
      acc.appendChild(x);
    });
  }

  /* ---------------- Dibujo ---------------- */
  function prepararVista() { estado.foco = estado.ancla; }

  function titulo() {
    var p = partes(estado.ancla);
    if (estado.vista !== 'semana') return primera(MESES[p.m - 1]) + ' de ' + p.y;
    var l = lunesDe(estado.ancla), d = sumarDias(l, 6), a = partes(l), b = partes(d);
    if (a.m === b.m) return a.d + ' – ' + b.d + ' de ' + MESES[b.m - 1] + ' de ' + b.y;
    return a.d + ' ' + MESES_C[a.m - 1] + (a.y !== b.y ? ' ' + a.y : '') + ' – ' + b.d + ' ' + MESES_C[b.m - 1] + ' ' + b.y;
  }

  function pintarCarga() {
    var cargando = Object.keys(estado.trozos).some(function (m) { return estado.trozos[m] === 'cargando'; });
    $('cal-cargando').hidden = !cargando;
    $('cal-app').setAttribute('aria-busy', cargando ? 'true' : 'false');
  }

  function pintar() {
    if (!estado.token) return;
    $('cal-app').hidden = false;
    $('cal-aviso').hidden = true;
    $('cal-titulo').textContent = titulo();
    Array.prototype.forEach.call(document.querySelectorAll('.cal-vistas button'), function (b) { b.setAttribute('aria-pressed', b.dataset.vista === estado.vista ? 'true' : 'false'); });
    var cuerpo = $('cal-cuerpo');
    var scrollPrevio = estado.vista === 'semana' && cuerpo.querySelector('.cal-sem-scroll') ? cuerpo.querySelector('.cal-sem-scroll').scrollTop : null;
    if (estado.vista === 'mes') cuerpo.innerHTML = htmlMes();
    else if (estado.vista === 'semana') cuerpo.innerHTML = htmlSemana();
    else cuerpo.innerHTML = htmlLista();
    if (estado.vista === 'semana') posicionarSemana(scrollPrevio);
    pintarMensaje();
    pintarCarga();
    var g = $('cal-google');
    g.hidden = !estado.calendarioUrl;
    if (estado.calendarioUrl) g.href = estado.calendarioUrl;
    if (restaurarFoco) { restaurarFoco = false; enfocarDia(estado.foco); }
    if (irAHoyLista && estado.vista === 'lista' && mesesDe(rangoVisible()).every(function (x) { return estado.trozos[x] === 'ok'; })) {
      irAHoyLista = false;
      var secs = cuerpo.querySelectorAll('.cal-lista-dia'), destino = null, hoyK = hoy();
      for (var i = 0; i < secs.length && !destino; i++) if (secs[i].dataset.dia >= hoyK) destino = secs[i];
      if (destino && destino.getBoundingClientRect().top > 0) window.scrollTo(0, Math.max(0, window.pageYOffset + destino.getBoundingClientRect().top - 80));
    }
  }

  function pintarMensaje() {
    var m = $('cal-mensaje'), r = rangoVisible(), meses = mesesDe(r);
    var hayError = meses.some(function (x) { return estado.trozos[x] === 'error'; });
    var todoListo = meses.every(function (x) { return estado.trozos[x] === 'ok'; });
    m.className = 'cal-mensaje';
    m.innerHTML = '';
    if (hayError) {
      m.classList.add('error');
      m.innerHTML = '<span>' + escapar(estado.mensajeError || 'No se pudo cargar el calendario. Revise su conexión e intente de nuevo.') + '</span>';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'boton'; b.textContent = 'Reintentar';
      b.addEventListener('click', reintentar);
      m.appendChild(b);
      m.hidden = false;
      return;
    }
    if (todoListo && cuantosEnVista(r) === 0) {
      m.textContent = estado.vista === 'semana' ? 'Aún no tienes eventos esta semana.' : 'Aún no tienes eventos este mes.';
      m.hidden = false;
      return;
    }
    m.hidden = true;
  }

  function cuantosEnVista(r) {
    // Mes y lista cuentan solo los días del mes que se mira; semana, los siete días.
    var desde = r.desde, hasta = r.hasta, vistos = {};
    if (estado.vista === 'mes') { var p = partes(estado.ancla); desde = clave(p.y, p.m, 1); hasta = clave(p.y, p.m, diasDelMes(p.y, p.m)); }
    for (var k = desde; k <= hasta; k = sumarDias(k, 1)) delDia(k).forEach(function (e) { vistos[e.uid] = 1; });
    return Object.keys(vistos).length;
  }

  function nombreEstado(e) { return e.estado; }

  /* ----- Mes ----- */
  function htmlMes() {
    var r = rangoVisible(), hoyK = hoy(), mesActual = claveMes(estado.ancla);
    var foco = estado.foco >= r.desde && estado.foco <= r.hasta ? estado.foco : (hoyK >= r.desde && hoyK <= r.hasta && claveMes(hoyK) === mesActual ? hoyK : primeroDelMes(estado.ancla));
    estado.foco = foco;
    var h = '<div class="cal-mes" role="grid" aria-label="' + escapar(titulo()) + '"><div class="cal-mes-cab" role="row">';
    DIAS_C.forEach(function (d, i) { h += '<div role="columnheader" aria-label="' + DIAS[i] + '">' + d + '</div>'; });
    h += '</div>';
    for (var k = r.desde; k <= r.hasta; ) {
      h += '<div class="cal-mes-fila" role="row">';
      for (var i = 0; i < 7; i++, k = sumarDias(k, 1)) h += celdaMes(k, mesActual, hoyK, foco);
      h += '</div>';
    }
    return h + '</div>';
  }

  function celdaMes(k, mesActual, hoyK, foco) {
    var evs = delDia(k), p = partes(k), MAX = 3;
    var clases = 'cal-dia' + (claveMes(k) !== mesActual ? ' fuera' : '') + (k === hoyK ? ' hoy' : '');
    var etiqueta = fechaLarga(k) + (k === hoyK ? ', hoy' : '') + ', ' + (evs.length ? evs.length + (evs.length === 1 ? ' evento' : ' eventos') : 'sin eventos');
    var h = '<div class="' + clases + '" role="gridcell" data-dia="' + k + '" tabindex="' + (k === foco ? '0' : '-1') + '" aria-label="' + escapar(etiqueta) + '"><span class="cal-num" aria-hidden="true">' + p.d + '</span>';
    if (evs.length) {
      h += '<ul class="cal-chips">';
      evs.slice(0, evs.length > MAX ? MAX - 1 : MAX).forEach(function (e) {
        var hora = !e.todoDia && e.kIni === k ? '<span class="h">' + horaCorta(e.minIni) + '</span>' : '';
        h += '<li><button type="button" tabindex="-1" class="cal-ev e-' + e.estado + (e.kIni < k ? ' sigue' : '') + '" data-uid="' + escapar(e.uid) + '" title="' + escapar(e.titulo + ' — ' + etiquetaHora(e, k)) + '">' + hora + escapar(e.titulo) + '</button></li>';
      });
      if (evs.length > MAX) h += '<li><button type="button" tabindex="-1" class="cal-mas" data-mas="' + k + '">+' + (evs.length - (MAX - 1)) + ' más</button></li>';
      h += '</ul><span class="cal-puntos" aria-hidden="true">';
      evs.slice(0, 4).forEach(function (e) { h += '<i class="e-' + e.estado + '"></i>'; });
      h += evs.length > 4 ? '+' : '';
      h += '</span>';
    }
    return h + '</div>';
  }

  /* ----- Semana ----- */
  function htmlSemana() {
    var l = lunesDe(estado.ancla), hoyK = hoy(), dias = [], i;
    for (i = 0; i < 7; i++) dias.push(sumarDias(l, i));
    var foco = dias.indexOf(estado.foco) > -1 ? estado.foco : (dias.indexOf(hoyK) > -1 ? hoyK : dias[0]);
    estado.foco = foco;
    var h = '<div class="cal-sem-marco"><div class="cal-sem">';
    h += '<div class="cal-sem-fila cal-sem-cab" role="row"><div></div>';
    dias.forEach(function (k) {
      var p = partes(k);
      h += '<button type="button" class="cal-sem-dia' + (k === hoyK ? ' hoy' : '') + '" data-dia="' + k + '" tabindex="' + (k === foco ? '0' : '-1') + '" aria-label="' + escapar(fechaLarga(k) + (k === hoyK ? ', hoy' : '') + ', ' + delDia(k).length + ' eventos') + '">' + DIAS_C[diaSemana(k)] + '<br><b>' + p.d + '</b></button>';
    });
    h += '</div><div class="cal-sem-fila cal-sem-todo"><div class="cal-eje">Todo el día</div>';
    dias.forEach(function (k) {
      h += '<div>';
      delDia(k).filter(function (e) { return e.todoDia; }).forEach(function (e) {
        h += '<button type="button" class="cal-ev e-' + e.estado + (e.kIni < k ? ' sigue' : '') + '" data-uid="' + escapar(e.uid) + '" title="' + escapar(e.titulo) + '">' + escapar(e.titulo) + '</button>';
      });
      h += '</div>';
    });
    h += '</div><div class="cal-sem-scroll" id="cal-sem-scroll"><div class="cal-sem-horas" style="--hora:' + HORA_PX + 'px"><div class="cal-eje-horas" style="height:' + (24 * HORA_PX) + 'px">';
    for (i = 1; i < 24; i++) h += '<span style="top:' + (i * HORA_PX) + 'px">' + horaCorta(i * 60) + '</span>';
    h += '</div>';
    dias.forEach(function (k) {
      h += '<div class="cal-col' + (k === hoyK ? ' hoy' : '') + '" style="height:' + (24 * HORA_PX) + 'px" data-col="' + k + '">';
      distribuir(delDia(k).filter(function (e) { return !e.todoDia; }), k).forEach(function (b) {
        var alto = Math.max(22, (b.fin - b.ini) / 60 * HORA_PX - 2);
        h += '<button type="button" class="cal-bloque e-' + b.e.estado + '" data-uid="' + escapar(b.e.uid) + '" style="top:' + (b.ini / 60 * HORA_PX + 1) + 'px;height:' + alto + 'px;left:calc(' + (b.carril * 100 / b.carriles) + '% + 1px);width:calc(' + (100 / b.carriles) + '% - 3px)">' +
          '<b>' + escapar(b.e.titulo) + '</b>' + (alto >= 40 ? '<small>' + horaCorta(b.ini) + ' – ' + horaCorta(b.fin) + '</small>' : '') + '</button>';
      });
      if (k === hoyK) h += '<div class="cal-ahora" style="top:' + (ahoraMin() / 60 * HORA_PX) + 'px"></div>';
      h += '</div>';
    });
    return h + '</div></div></div></div>';
  }

  /* Reparte los eventos con hora de un día en carriles para que los que se traslapan queden lado a lado. */
  function distribuir(evs, k) {
    var items = evs.map(function (e) { var t = tramo(e, k); return { e: e, ini: t.ini, fin: Math.max(t.fin, t.ini + 30) }; });
    items.sort(function (a, b) { return a.ini - b.ini || b.fin - a.fin; });
    var grupo = [], finGrupo = -1;
    function cerrar() {
      var carriles = [];
      grupo.forEach(function (b) {
        var c = 0;
        while (carriles[c] !== undefined && carriles[c] > b.ini) c++;
        carriles[c] = b.fin; b.carril = c;
      });
      grupo.forEach(function (b) { b.carriles = carriles.length; });
    }
    items.forEach(function (b) {
      if (grupo.length && b.ini >= finGrupo) { cerrar(); grupo = []; finGrupo = -1; }
      grupo.push(b); finGrupo = Math.max(finGrupo, b.fin);
    });
    if (grupo.length) cerrar();
    return items;
  }

  function posicionarSemana(guardado) {
    var sc = $('cal-sem-scroll');
    if (!sc) return;
    if (guardado != null) { sc.scrollTop = guardado; return; }
    var l = lunesDe(estado.ancla), minimo = 7 * 60;
    for (var i = 0; i < 7; i++) (function (k) { delDia(k).forEach(function (e) { if (!e.todoDia && e.kIni === k) minimo = Math.min(minimo, Math.max(0, e.minIni - 60)); }); })(sumarDias(l, i));
    sc.scrollTop = minimo / 60 * HORA_PX;
  }

  /* ----- Lista ----- */
  function htmlLista() {
    var r = rangoVisible(), hoyK = hoy(), h = '', hayAlgo = false;
    for (var k = r.desde; k <= r.hasta; k = sumarDias(k, 1)) {
      var evs = delDia(k);
      if (!evs.length) continue;
      hayAlgo = true;
      h += '<section class="cal-lista-dia' + (k === hoyK ? ' hoy' : '') + (k < hoyK ? ' pasado' : '') + '" data-dia="' + k + '"><h3>' + escapar(primera(fechaLarga(k))) + (k === hoyK ? ' <span class="hoy-ins">Hoy</span>' : '') + '</h3><ul>';
      evs.forEach(function (e) { h += '<li>' + filaEvento(e, k) + '</li>'; });
      h += '</ul></section>';
    }
    return hayAlgo ? '<div class="cal-lista">' + h + '</div>' : '';
  }

  function filaEvento(e, k) {
    var meta = [dondeTexto(e), e.personas.length > 1 ? e.personas.length + ' personas' : ''].filter(Boolean).join(' · ');
    return '<button type="button" class="cal-fila e-' + e.estado + '" data-uid="' + escapar(e.uid) + '"><span class="hora">' + escapar(etiquetaHora(e, k)) + '</span><span class="tit">' + escapar(e.titulo) + '</span>' +
      (meta ? '<span class="meta">' + escapar(meta) + '</span>' : '') + '<span class="cal-pastilla">' + nombreEstado(e) + '</span></button>';
  }

  /* ---------------- Ventana de detalle ---------------- */
  function textoPlano(html) {
    var t = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
    try { t = new DOMParser().parseFromString(t, 'text/html').body.textContent || ''; } catch (e) { t = t.replace(/<[^>]+>/g, ''); }
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  function abrirModal(origen) {
    var m = $('cal-modal');
    if (!modal.abierto) modal.origen = origen || document.activeElement;
    modal.abierto = true;
    m.hidden = false;
    $('cal-caja').focus();
    $('cal-modal-cuerpo').scrollTop = 0;
  }
  function cerrarModal(sinFoco) {
    if (!modal.abierto) return;
    $('cal-modal').hidden = true;
    modal.abierto = false;
    var o = modal.origen;
    modal.origen = null;
    if (!o || !document.contains(o)) { var u = modal.uid && $('cal-cuerpo').querySelector('[data-uid="' + modal.uid.replace(/(["\\])/g, '\\$1') + '"]'); if (u) o = u; }   // el dibujo pudo reemplazar el botón de origen
    if (!sinFoco && o && document.contains(o) && o.focus) o.focus();
    else if (!sinFoco && estado.vista === 'mes') enfocarDia(estado.foco);
  }

  function tareasVisibles(e) {
    return e.tareas.map(function (t, i) { return { i: i, texto: t.texto, hecha: t.hecha }; }).filter(function (t) { return t.texto.trim(); });
  }
  function leyendaTareas(vis) {
    return 'Tareas (' + vis.filter(function (t) { return t.hecha; }).length + ' de ' + vis.length + ' hechas)';
  }

  function abrirEvento(uid, origen, viaDia) {
    var e = estado.eventos[uid];
    if (!e) return;
    modal.tipo = 'evento'; modal.uid = uid; modal.viaDia = !!viaDia;
    avisoModal('', '');
    dibujarEvento(e);
    abrirModal(origen);
    if (e.editable) actualizarEditor(e);
  }

  /* Contenido del detalle de un evento (no mueve el foco: lo usa también el redibujo tras guardar). */
  function dibujarEvento(e) {
    var h = '';
    if (modal.viaDia) h += '<button type="button" class="cal-volver" id="cal-volver">← Eventos del ' + escapar(fechaMes(modal.dia)) + '</button>';
    h += '<p class="rotulo">Evento</p><h2 id="cal-modal-titulo">' + escapar(e.titulo) + '<span class="cal-pastilla">' + nombreEstado(e) + '</span></h2><dl class="cal-datos">';
    h += '<dt>Cuándo</dt><dd>' + escapar(cuando(e)) + '</dd>';
    var donde = dondeTexto(e);
    if (donde) h += '<dt>Dónde</dt><dd>' + escapar(donde) + '</dd>';
    if (e.personas.length) h += '<dt>Personas</dt><dd class="cal-personas">' + e.personas.map(function (p) { return '<span>' + escapar(p.nombre) + '</span>'; }).join('') + '</dd>';
    if (e.recurrencia && e.recurrencia.tipo) {
      var rep = REPETICION[e.recurrencia.tipo.toLowerCase()];
      if (rep !== '') h += '<dt>Se repite</dt><dd>' + escapar((rep || e.recurrencia.tipo) + (e.recurrencia.hasta ? ', hasta el ' + textoFecha(e.recurrencia.hasta) : '')) + '</dd>';
    }
    h += '</dl>';
    var desc = textoPlano(e.descripcion);
    if (desc) h += '<p class="cal-desc">' + escapar(desc) + '</p>';
    var vis = tareasVisibles(e);
    if (e.editable) h += formularioEvento(e, vis);
    else {
      if (vis.length) {
        h += '<div class="cal-tareas"><h3>' + leyendaTareas(vis) + '</h3><ul>';
        vis.forEach(function (t) {
          h += '<li class="' + (t.hecha ? 'hecha' : '') + '"><span class="cal-check" aria-hidden="true">' + (t.hecha ? '✓' : '') + '</span><span class="sr-solo">' + (t.hecha ? 'Hecha: ' : 'Pendiente: ') + '</span><span class="cal-tarea-texto">' + escapar(t.texto) + '</span></li>';
        });
        h += '</ul></div>';
      }
      if (e.estado === 'cancelada') h += '<p class="cal-nota-solo">Este evento fue cancelado por el administrador: no se puede cambiar.</p>';
    }
    $('cal-modal-cuerpo').innerHTML = h;
    $('cal-caja').className = 'cal-caja e-' + e.estado;
    var v = $('cal-volver');
    if (v) v.addEventListener('click', function () { abrirDia(modal.dia, null, true); });
  }

  /* Formulario de la persona invitada: casillas para las tareas, Pendiente/Hecha y «Guardar cambios». */
  function formularioEvento(e, vis) {
    var ocupado = !!guardando[e.uid], dis = ocupado ? ' disabled' : '';
    var h = '<form class="cal-editor" id="cal-editor" novalidate>';
    if (e.repetido) h += '<p class="cal-nota-solo">Evento repetido: sus cambios se guardan solo para este día.</p>';
    if (vis.length) {
      h += '<fieldset class="cal-tareas"' + dis + '><legend id="cal-tareas-leyenda">' + leyendaTareas(vis) + '</legend><ul>';
      vis.forEach(function (t) {
        h += '<li class="' + (t.hecha ? 'hecha' : '') + '"><label><input type="checkbox" data-i="' + t.i + '"' + (t.hecha ? ' checked' : '') + '><span class="cal-tarea-texto">' + escapar(t.texto) + '</span></label></li>';
      });
      h += '</ul></fieldset>';
    }
    h += '<fieldset class="cal-estado-ctl"' + dis + '><legend>Estado del evento</legend><div class="cal-segmentos">';
    ['pendiente', 'hecha'].forEach(function (v) {
      h += '<label class="seg-' + v + '"><input type="radio" name="estado" value="' + v + '"' + (e.estado === v ? ' checked' : '') + '><span>' + primera(v) + '</span></label>';
    });
    h += '</div></fieldset>';
    h += '<p class="cal-sugerencia" id="cal-sugerencia" hidden>Todas las tareas están marcadas. ¿Marcar el evento como hecho? <button type="button" class="boton" id="cal-sug-si">Sí, marcar como hecho</button></p>';
    h += '<div class="cal-editor-acc"><button type="submit" class="boton principal" id="cal-guardar" aria-disabled="true">' + (ocupado ? 'Guardando…' : 'Guardar cambios') + '</button>' +
      '<span class="cal-sin-guardar" id="cal-sin-guardar" hidden>Hay cambios sin guardar.</span></div></form>';
    return h;
  }

  function leerBorrador(e) {
    var f = $('cal-editor'), hechas = e.tareas.map(function (t) { return t.hecha; });
    Array.prototype.forEach.call(f.querySelectorAll('input[type="checkbox"][data-i]'), function (c) { hechas[+c.dataset.i] = c.checked; });
    var r = f.querySelector('input[name="estado"]:checked'), est = r ? r.value : e.estado;
    var hechasCambio = hechas.some(function (x, i) { return x !== e.tareas[i].hecha; });
    return { estado: est, hechas: hechas, hechasCambio: hechasCambio, cambio: hechasCambio || est !== e.estado };
  }

  /* Pone al día lo que depende del borrador: tachado y conteo de tareas, sugerencia «¿Marcar como hecho?» y el botón Guardar. */
  function actualizarEditor(e) {
    if (!$('cal-editor')) return;
    var b = leerBorrador(e), ocupado = !!guardando[e.uid], vis = tareasVisibles(e).map(function (t) { return { hecha: b.hechas[t.i] }; });
    Array.prototype.forEach.call($('cal-editor').querySelectorAll('input[type="checkbox"][data-i]'), function (c) { c.closest('li').className = c.checked ? 'hecha' : ''; });
    var ley = $('cal-tareas-leyenda');
    if (ley) ley.textContent = leyendaTareas(vis);
    $('cal-sugerencia').hidden = ocupado || !(vis.length && vis.every(function (t) { return t.hecha; }) && b.estado === 'pendiente');
    var g = $('cal-guardar');
    g.setAttribute('aria-disabled', ocupado || !b.cambio ? 'true' : 'false');
    g.textContent = ocupado ? 'Guardando…' : 'Guardar cambios';
    $('cal-sin-guardar').hidden = ocupado || !b.cambio;
  }

  function avisoModal(tipo, texto) {
    $('cal-modal-estado').textContent = tipo === 'ok' || tipo === 'curso' ? texto : '';
    $('cal-modal-estado').className = 'cal-modal-msg' + (tipo === 'curso' ? ' curso' : ' ok');
    $('cal-modal-error').textContent = tipo === 'error' ? texto : '';
  }

  /* Aviso en la página (fuera del detalle): el detalle pudo cerrarse mientras se guardaba, o el calendario se recargó. */
  var temporizadorAviso = 0;
  function avisoPagina(tipo, texto) {
    var x = $('cal-guardado');
    clearTimeout(temporizadorAviso);
    if (!texto) { x.hidden = true; return; }
    $('cal-guardado-texto').textContent = texto;
    x.className = 'cal-guardado' + (tipo === 'error' ? ' error' : '');
    x.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    x.hidden = false;
    if (tipo !== 'error') temporizadorAviso = setTimeout(function () { x.hidden = true; }, 6000);
  }

  function detalleAbiertoDe(uid) { return modal.abierto && modal.tipo === 'evento' && modal.uid === uid; }

  /* Vuelve a dibujar el detalle sin perder el foco del botón Guardar. */
  function redibujarDetalle(e) {
    var a = document.activeElement, caja = $('cal-caja');
    var conservar = a === document.body || (caja.contains(a) && (a.id === 'cal-guardar' || a.closest('#cal-editor')));
    dibujarEvento(e);
    if (e.editable) actualizarEditor(e);
    if (conservar) { var g = $('cal-guardar') || caja; g.focus(); }
  }

  function guardarCambios() {
    var e = estado.eventos[modal.uid];
    if (!e || modal.tipo !== 'evento' || !e.editable || guardando[e.uid] || !$('cal-editor')) return;
    var b = leerBorrador(e);
    if (!b.cambio) return;
    var token = estado.token, uid = e.uid, terminado = false;
    var previo = { estado: e.estado, hechas: e.tareas.map(function (t) { return t.hecha; }) };
    var cuerpo = { accion: 'agenda_actualizar', token: token, id: e.id, inicio: e.inicioRaw };
    if (b.estado !== e.estado) cuerpo.estado = b.estado;
    if (b.hechasCambio) cuerpo.hechas = b.hechas;
    // Actualización optimista: el evento y la cuadrícula cambian ya; si el servidor dice que no, se revierte.
    e.estado = b.estado; e.tareas.forEach(function (t, i) { t.hecha = b.hechas[i]; });
    guardando[uid] = true;
    avisoPagina('', '');
    avisoModal('curso', 'Guardando…');
    pintar();
    redibujarDetalle(e);
    var temporizador = new Promise(function (_, rechazar) { setTimeout(function () { rechazar(new Error('espera')); }, ESPERA_MS); });

    function revertir() { e.estado = previo.estado; e.tareas.forEach(function (t, i) { t.hecha = previo.hechas[i]; }); }
    function fallo(texto) {
      revertir();
      if (/iniciar sesi/i.test(texto)) { sesionVencida(); return; }
      if (/cambiado por el administrador|recargue/i.test(texto)) {
        cerrarModal(true);
        avisoPagina('error', 'El evento «' + e.titulo + '» fue cambiado por el administrador. Se volvió a cargar su calendario; revise y repita el cambio si hace falta.');
        actualizar();
        return;
      }
      pintar();
      if (detalleAbiertoDe(uid)) { redibujarDetalle(e); avisoModal('error', texto + ' Se restauró lo anterior.'); }
      else avisoPagina('error', 'No se guardó «' + e.titulo + '»: ' + texto + ' Se restauró lo anterior.');
    }

    Promise.race([window.EcoAgriSesionPortal.llamar(cuerpo), temporizador])
      .then(function (r) {
        if (terminado || estado.token !== token) return;
        terminado = true; delete guardando[uid];
        if (estado.eventos[uid] !== e) return;                       // el calendario se recargó mientras tanto: lo que llegue de allí manda
        if (!r || r.ok !== true) { fallo((r && r.error) ? String(r.error) : 'El servidor no pudo guardar los cambios.'); return; }
        var n = normalizar(r.evento), actual = e;
        if (n) {                                                      // el servidor manda: su versión reemplaza a la optimista
          delete estado.eventos[uid]; estado.eventos[n.uid] = n; estado.indice = null; actual = n;
          if (modal.abierto && modal.uid === uid) modal.uid = n.uid;
        }
        pintar();
        if (detalleAbiertoDe(actual.uid)) { redibujarDetalle(actual); avisoModal('ok', 'Guardado'); }
        else avisoPagina('ok', 'Cambios guardados en «' + actual.titulo + '».');
      })
      .catch(function () {
        if (terminado || estado.token !== token) return;
        terminado = true; delete guardando[uid];
        if (estado.eventos[uid] !== e) return;
        fallo('No se pudo guardar: sin conexión o sin respuesta del servidor. Si duda de que se haya guardado, pulse «Actualizar».');
      });
  }

  function alCambioEditor(ev) {
    var e = estado.eventos[modal.uid];
    if (!e || !e.editable || !$('cal-editor') || !ev.target.closest('#cal-editor')) return;
    avisoModal('', '');
    actualizarEditor(e);
  }
  function alEnviarEditor(ev) {
    ev.preventDefault();
    guardarCambios();
  }
  function alClicSugerencia(ev) {
    if (!ev.target.closest || !ev.target.closest('#cal-sug-si')) return;
    var e = estado.eventos[modal.uid];
    if (!e || !$('cal-editor')) return;
    $('cal-editor').querySelector('input[name="estado"][value="hecha"]').checked = true;
    avisoModal('', '');
    actualizarEditor(e);
    $('cal-guardar').focus();
  }

  function textoFecha(f) {
    var k = String(f).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(k) ? fechaMes(k) + ' de ' + partes(k).y : String(f);
  }

  function abrirDia(k, origen, interno) {
    var evs = delDia(k);
    if (!evs.length) return;
    if (evs.length === 1 && !interno) { modal.dia = k; abrirEvento(evs[0].uid, origen, false); return; }
    modal.tipo = 'dia'; modal.dia = k; modal.viaDia = false;
    var h = '<p class="rotulo">' + (k === hoy() ? 'Hoy' : 'Día') + '</p><h2 id="cal-modal-titulo">' + escapar(primera(fechaLarga(k))) + '</h2><ul class="cal-lista-modal">';
    evs.forEach(function (e) { h += '<li>' + filaEvento(e, k) + '</li>'; });
    $('cal-modal-cuerpo').innerHTML = h + '</ul>';
    $('cal-caja').className = 'cal-caja';
    abrirModal(origen);
  }

  /* ---------------- Navegación y teclado ---------------- */
  function mover(dir) {
    if (estado.vista === 'semana') estado.ancla = sumarDias(estado.ancla, 7 * dir);
    else estado.ancla = sumarMeses(estado.ancla, dir);
    prepararVista();
    cargarVisible();
    pintar();
  }
  function irAHoy() { estado.ancla = hoy(); estado.foco = estado.ancla; irAHoyLista = true; cargarVisible(); pintar(); }
  function cambiarVista(v) {
    if (v === estado.vista) return;
    estado.vista = v;
    cargarVisible();
    pintar();
  }

  function enfocarDia(k) {
    var x = $('cal-cuerpo').querySelector('[data-dia="' + k + '"].cal-dia, [data-dia="' + k + '"].cal-sem-dia');
    if (x) { Array.prototype.forEach.call($('cal-cuerpo').querySelectorAll('[data-dia][tabindex="0"]'), function (y) { y.setAttribute('tabindex', '-1'); }); x.setAttribute('tabindex', '0'); x.focus(); }
  }

  function moverFoco(delta) {
    var nuevo = sumarDias(estado.foco, delta), r = rangoVisible();
    estado.foco = nuevo;
    if (nuevo < r.desde || nuevo > r.hasta) {
      estado.ancla = nuevo; restaurarFoco = true; cargarVisible(); pintar();
    } else enfocarDia(nuevo);
  }

  function alTeclado(e) {
    if (modal.abierto) return;
    var objetivo = e.target;
    var enDia = objetivo.classList && (objetivo.classList.contains('cal-dia') || objetivo.classList.contains('cal-sem-dia'));
    if (!enDia) return;
    var mes = estado.vista === 'mes';
    var salto = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: mes ? -7 : 0, ArrowDown: mes ? 7 : 0 }[e.key];
    if (salto) { e.preventDefault(); estado.foco = objetivo.dataset.dia; moverFoco(salto); return; }
    if (e.key === 'Home') { e.preventDefault(); estado.foco = objetivo.dataset.dia; moverFoco(-diaSemana(estado.foco)); return; }
    if (e.key === 'End') { e.preventDefault(); estado.foco = objetivo.dataset.dia; moverFoco(6 - diaSemana(estado.foco)); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      var dir = e.key === 'PageUp' ? -1 : 1;
      estado.foco = estado.vista === 'semana' ? sumarDias(objetivo.dataset.dia, 7 * dir) : sumarMeses(objetivo.dataset.dia, dir);
      estado.ancla = estado.foco; restaurarFoco = true; cargarVisible(); pintar();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && objetivo.classList.contains('cal-dia')) { e.preventDefault(); estado.foco = objetivo.dataset.dia; abrirDia(objetivo.dataset.dia, objetivo); }
  }

  function atraparTab(e) {
    if (!modal.abierto) return;
    if (e.key === 'Escape') { e.preventDefault(); cerrarModal(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call($('cal-caja').querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!f.length) { e.preventDefault(); return; }
    var primero = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === $('cal-caja'))) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }

  function alClic(e) {
    var t = e.target;
    var ev = t.closest && t.closest('[data-uid]');
    if (ev && $('cal-cuerpo').contains(ev)) { var dia = ev.closest('[data-dia]'); modal.dia = dia ? dia.dataset.dia : ''; abrirEvento(ev.dataset.uid, ev, false); return; }
    var mas = t.closest && t.closest('[data-mas]');
    if (mas) { abrirDia(mas.dataset.mas, mas, true); return; }
    var d = t.closest && t.closest('.cal-dia, .cal-sem-dia');
    if (d && $('cal-cuerpo').contains(d)) { estado.foco = d.dataset.dia; Array.prototype.forEach.call($('cal-cuerpo').querySelectorAll('[data-dia][tabindex="0"]'), function (y) { y.setAttribute('tabindex', '-1'); }); d.setAttribute('tabindex', '0'); abrirDia(d.dataset.dia, d, true); }
  }

  function alClicModal(e) {
    var ev = e.target.closest && e.target.closest('[data-uid]');
    if (ev && $('cal-modal-cuerpo').contains(ev)) { abrirEvento(ev.dataset.uid, null, modal.tipo === 'dia'); return; }
    if (e.target.id === 'cal-modal') cerrarModal();
  }

  /* ---------------- Arranque ---------------- */
  function iniciar() {
    $('cal-ant').addEventListener('click', function () { mover(-1); });
    $('cal-sig').addEventListener('click', function () { mover(1); });
    $('cal-hoy').addEventListener('click', irAHoy);
    $('cal-actualizar').addEventListener('click', actualizar);
    Array.prototype.forEach.call(document.querySelectorAll('.cal-vistas button'), function (b) { b.addEventListener('click', function () { cambiarVista(b.dataset.vista); }); });
    $('cal-cuerpo').addEventListener('click', alClic);
    $('cal-cuerpo').addEventListener('keydown', alTeclado);
    $('cal-modal').addEventListener('click', alClicModal);
    $('cal-modal-cerrar').addEventListener('click', function () { cerrarModal(); });
    $('cal-modal-cuerpo').addEventListener('change', alCambioEditor);
    $('cal-modal-cuerpo').addEventListener('submit', alEnviarEditor);
    $('cal-modal-cuerpo').addEventListener('click', alClicSugerencia);
    $('cal-guardado-cerrar').addEventListener('click', function () { avisoPagina('', ''); });
    document.addEventListener('keydown', atraparTab, true);
    document.addEventListener('ecoagri:sesion', alCambiarSesion);

    if (!window.EcoAgriSesionPortal) { mostrarAviso('No se pudo iniciar la sesión', 'Recargue la página. Si el problema sigue, avise al administrador.', [], true); return; }
    var s = sesion();
    if (s) alCambiarSesion({ detail: { sesion: s } });
    else { estado.token = null; pedirSesion(); }
  }

  iniciar();
})();
