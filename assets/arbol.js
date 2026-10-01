/* Árbol interactivo de la Ayuda. Sin JS el árbol se ve completo (ver <noscript> en la página). */
(function () {
  var raiz = document.getElementById('arbol');
  if (!raiz) return;

  var botones = Array.prototype.slice.call(raiz.querySelectorAll('.nodo-btn'));
  var buscar = document.getElementById('buscar');
  var conteo = document.getElementById('conteo');
  var vacio = document.getElementById('sin-resultados');

  function cuerpoDe(btn) { return document.getElementById(btn.getAttribute('aria-controls')); }
  function abrir(btn, si) {
    btn.setAttribute('aria-expanded', si ? 'true' : 'false');
    var c = cuerpoDe(btn); if (c) c.hidden = !si;
  }
  function abrirAncestros(el) {
    var p = el.parentElement;
    while (p && p !== raiz) {
      if (p.classList && p.classList.contains('nodo-cuerpo')) {
        var b = raiz.querySelector('[aria-controls="' + p.id + '"]'); if (b) abrir(b, true);
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

  document.getElementById('expandir').addEventListener('click', function () { botones.forEach(function (b) { abrir(b, true); }); });
  document.getElementById('contraer').addEventListener('click', function () { botones.forEach(function (b) { abrir(b, false); }); history.replaceState(null, '', location.pathname); });

  // Búsqueda: filtra hojas y herramientas por texto, abriendo lo que coincide.
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  var hojas = Array.prototype.slice.call(raiz.querySelectorAll('.hoja'));
  var herrs = Array.prototype.slice.call(raiz.querySelectorAll('.herr'));
  var apps = Array.prototype.slice.call(raiz.querySelectorAll(':scope > li'));

  function filtrar() {
    var q = norm(buscar.value).trim();
    if (!q) {
      hojas.concat(herrs, apps).forEach(function (e) { e.classList.remove('oculto'); });
      conteo.textContent = ''; vacio.hidden = true; return;
    }
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
      // Si el título coincide pero ninguna hoja, se muestran todas sus hojas.
      if (titulo.indexOf(q) > -1 && !visibles) h.querySelectorAll('.hoja').forEach(function (x) { x.classList.remove('oculto'); total++; });
      if (ok) { var b = h.querySelector(':scope > .nodo-btn'); abrir(b, true); abrirAncestros(h); }
    });
    apps.forEach(function (a) { a.classList.toggle('oculto', !a.querySelector('.herr:not(.oculto)')); });
    conteo.textContent = total + (total === 1 ? ' función encontrada' : ' funciones encontradas');
    vacio.hidden = total > 0;
  }
  buscar.addEventListener('input', filtrar);

  // Enlace directo: /ayuda/#agriapp/rotacion abre esa rama.
  function desdeHash() {
    var ruta = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!ruta) return;
    var b = raiz.querySelector('.nodo-btn[data-ruta="' + ruta.replace(/"/g, '') + '"]');
    if (!b) return;
    abrir(b, true); abrirAncestros(b.closest('li'));
    b.scrollIntoView({ block: 'start' });
  }
  desdeHash();
  window.addEventListener('hashchange', desdeHash);
})();
