/* Ayuda interactiva: mapa visual (organigrama) y lista en árbol. Sin JS, ambos se ven completos (ver <noscript>). */
(function () {
  var lista = document.getElementById('arbol');
  var mapa = document.getElementById('mapa');
  if (!lista || !mapa) return;

  var vistaMapa = document.getElementById('vista-mapa');
  var vistaLista = document.getElementById('vista-lista');
  var botMapa = document.getElementById('ver-mapa');
  var botLista = document.getElementById('ver-lista');
  var buscar = document.getElementById('buscar');
  var conteo = document.getElementById('conteo');
  var vacio = document.getElementById('sin-resultados');

  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function guardar(clave, valor) { try { localStorage.setItem(clave, valor); } catch (e) { /* sin almacenamiento: no pasa nada */ } }
  function leer(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }

  /* ---------- Selector Mapa / Lista ---------- */
  function mostrar(vista, recordar) {
    var esMapa = vista !== 'lista';
    vistaMapa.hidden = !esMapa;
    vistaLista.hidden = esMapa;
    botMapa.setAttribute('aria-pressed', esMapa ? 'true' : 'false');
    botLista.setAttribute('aria-pressed', esMapa ? 'false' : 'true');
    if (recordar) guardar('ecoagri_ayuda_vista', esMapa ? 'mapa' : 'lista');
  }
  botMapa.addEventListener('click', function () { mostrar('mapa', true); });
  botLista.addEventListener('click', function () { mostrar('lista', true); });
  mostrar(leer('ecoagri_ayuda_vista') === 'lista' ? 'lista' : 'mapa', false);

  /* ---------- Lista en árbol ---------- */
  var botones = Array.prototype.slice.call(lista.querySelectorAll('.nodo-btn'));
  function cuerpoDe(btn) { return document.getElementById(btn.getAttribute('aria-controls')); }
  function abrir(btn, si) {
    btn.setAttribute('aria-expanded', si ? 'true' : 'false');
    var c = cuerpoDe(btn); if (c) c.hidden = !si;
  }
  function abrirAncestros(el) {
    var p = el.parentElement;
    while (p && p !== lista) {
      if (p.classList && p.classList.contains('nodo-cuerpo')) {
        var b = lista.querySelector('[aria-controls="' + p.id + '"]'); if (b) abrir(b, true);
      }
      p = p.parentElement;
    }
  }
  botones.forEach(function (b) {
    b.addEventListener('click', function () {
      var si = b.getAttribute('aria-expanded') !== 'true';
      abrir(b, si);
      if (si && b.dataset.ruta) history.replaceState(null, '', '#' + b.dataset.ruta);
    });
  });

  /* ---------- Mapa ---------- */
  var cajasHerr = Array.prototype.slice.call(mapa.querySelectorAll('.mapa-caja.herr'));
  function abrirMapa(btn, si) {
    btn.setAttribute('aria-expanded', si ? 'true' : 'false');
    var d = document.getElementById(btn.getAttribute('aria-controls')); if (d) d.hidden = !si;
  }
  cajasHerr.forEach(function (b) {
    b.addEventListener('click', function () {
      var si = b.getAttribute('aria-expanded') !== 'true';
      abrirMapa(b, si);
      if (si) history.replaceState(null, '', '#' + b.dataset.ruta);
    });
  });

  /* ---------- Expandir / contraer todo (en la vista visible) ---------- */
  document.getElementById('expandir').addEventListener('click', function () {
    botones.forEach(function (b) { abrir(b, true); });
    cajasHerr.forEach(function (b) { abrirMapa(b, true); });
  });
  document.getElementById('contraer').addEventListener('click', function () {
    botones.forEach(function (b) { abrir(b, false); });
    cajasHerr.forEach(function (b) { abrirMapa(b, false); });
    history.replaceState(null, '', location.pathname);
  });

  /* ---------- Búsqueda compartida ---------- */
  var hojas = Array.prototype.slice.call(lista.querySelectorAll('.hoja'));
  var herrs = Array.prototype.slice.call(lista.querySelectorAll('.herr'));
  var apps = Array.prototype.slice.call(lista.querySelectorAll(':scope > li'));
  var nodosMapa = Array.prototype.slice.call(mapa.querySelectorAll('.mapa-herr'));

  function filtrarLista(q) {
    var total = 0;
    hojas.forEach(function (h) {
      var ok = norm(h.textContent).indexOf(q) > -1;
      h.classList.toggle('oculto', !ok); if (ok) total++;
    });
    herrs.forEach(function (h) {
      var titulo = norm(h.querySelector('.nodo-btn .tit').textContent);
      var visibles = h.querySelectorAll('.hoja:not(.oculto)').length;
      var ok = visibles > 0 || titulo.indexOf(q) > -1;
      h.classList.toggle('oculto', !ok);
      if (titulo.indexOf(q) > -1 && !visibles) h.querySelectorAll('.hoja').forEach(function (x) { x.classList.remove('oculto'); total++; });
      if (ok) { abrir(h.querySelector(':scope > .nodo-btn'), true); abrirAncestros(h); }
    });
    apps.forEach(function (a) { a.classList.toggle('oculto', !a.querySelector('.herr:not(.oculto)')); });
    return total;
  }

  function filtrarMapa(q) {
    nodosMapa.forEach(function (n) {
      var caja = n.querySelector('.mapa-caja.herr');
      var enTitulo = norm(caja.firstElementChild.textContent).indexOf(q) > -1;
      var items = Array.prototype.slice.call(n.querySelectorAll('.mapa-hojas .mapa-item'));
      var coinciden = 0;
      items.forEach(function (it) {
        var a = it.querySelector('.mapa-caja');
        var ok = norm(a.textContent + ' ' + (a.getAttribute('title') || '')).indexOf(q) > -1;
        a.classList.toggle('coincide', ok);
        it.classList.toggle('oculto', !ok && !enTitulo);
        if (ok) coinciden++;
      });
      var visible = coinciden > 0 || enTitulo;
      n.classList.toggle('atenuado', !visible);
      if (visible) abrirMapa(caja, true);
    });
  }

  function limpiarMapa() {
    nodosMapa.forEach(function (n) {
      n.classList.remove('atenuado');
      n.querySelectorAll('.mapa-item').forEach(function (it) { it.classList.remove('oculto'); });
      n.querySelectorAll('.mapa-caja.coincide').forEach(function (a) { a.classList.remove('coincide'); });
    });
  }

  function filtrar() {
    var q = norm(buscar.value).trim();
    if (!q) {
      hojas.concat(herrs, apps).forEach(function (e) { e.classList.remove('oculto'); });
      limpiarMapa();
      conteo.textContent = ''; vacio.hidden = true; return;
    }
    var total = filtrarLista(q);
    filtrarMapa(q);
    conteo.textContent = total + (total === 1 ? ' función encontrada' : ' funciones encontradas');
    vacio.hidden = total > 0;
  }
  buscar.addEventListener('input', filtrar);

  /* ---------- Enlace directo: /ayuda/#agriapp/rotacion ---------- */
  function desdeHash() {
    var ruta = decodeURIComponent(location.hash.replace(/^#/, '')).replace(/"/g, '');
    if (!ruta) return;
    var b = lista.querySelector('.nodo-btn[data-ruta="' + ruta + '"]');
    if (b) { abrir(b, true); abrirAncestros(b.closest('li')); }
    var m = mapa.querySelector('.mapa-caja.herr[data-ruta="' + ruta + '"]');
    if (m) { abrirMapa(m, true); }
    var destino = (vistaMapa.hidden ? b : m) || b || m;
    if (destino) destino.scrollIntoView({ block: 'center' });
  }
  desdeHash();
  window.addEventListener('hashchange', desdeHash);
})();
