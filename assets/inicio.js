/* Magnificación de la tarjeta bajo el cursor (efecto "dock"): la más cercana al puntero crece más y las vecinas un poco.
   Solo con ratón (no en pantallas táctiles) y sin la preferencia de reducir movimiento. */
(function () {
  var lista = document.getElementById('lista');
  if (!lista || !window.matchMedia) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var tarjetas = Array.prototype.slice.call(lista.querySelectorAll('.tarjeta-app'));
  var y = 0, cuadro = 0;

  function pintar() {
    cuadro = 0;
    tarjetas.forEach(function (t) {
      var r = t.getBoundingClientRect();
      var distancia = Math.abs(y - (r.top + r.height / 2));
      var cerca = Math.max(0, 1 - distancia / 200);          // 1 = el puntero está en su centro, 0 = lejos
      var encima = y >= r.top && y <= r.bottom ? 0.02 : 0;    // un extra para la que está justo debajo del puntero
      t.style.setProperty('--esc', (1 + 0.07 * cerca * cerca + encima).toFixed(4));
      t.style.setProperty('--luz', cerca.toFixed(3));
    });
  }

  lista.addEventListener('mousemove', function (e) {
    y = e.clientY;
    if (!cuadro) cuadro = requestAnimationFrame(pintar);
  });
  lista.addEventListener('mouseleave', function () {
    tarjetas.forEach(function (t) { t.style.removeProperty('--esc'); t.style.removeProperty('--luz'); });
  });
})();
