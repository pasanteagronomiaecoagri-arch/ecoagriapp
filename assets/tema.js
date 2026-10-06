/* Interruptor de tema claro/oscuro del hub (portada, ayuda, versiones y 404). Mismo mecanismo y misma clave que las apps:
   el tema ya se aplicó antes de pintar (script en <head>); aquí solo se conecta el botón y se guarda la elección.
   Todas las páginas del hub comparten origen, así que la elección vale para todas ellas. */
(function () {
  var CLAVE = 'ecoagriapp_tema';
  var boton = document.getElementById('barra-tema-boton');
  if (!boton) return;

  function oscuro() {
    var explicito = document.documentElement.getAttribute('data-theme');
    if (explicito === 'dark') return true;
    if (explicito === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function marcar(si) { boton.classList.toggle('oscuro', si); boton.setAttribute('aria-pressed', si ? 'true' : 'false'); }

  marcar(oscuro());
  boton.addEventListener('click', function () {
    var nuevo = oscuro() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevo);
    marcar(nuevo === 'dark');
    try { localStorage.setItem(CLAVE, nuevo); } catch (error) { /* sin almacenamiento: se ignora */ }
  });
})();
