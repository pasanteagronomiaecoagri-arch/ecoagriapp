/* Clima — fuente: ecoagri-core/generador/hub/clima.js (GENERADO a clima/clima.js en el portal).
   Punto a consultar: finca (fincas.json), coordenadas escritas o clic en el mapa. Fuentes, todas públicas y sin clave:
   - Open-Meteo: actual, pronóstico (7 días), últimos 14 días y comparación de modelos.
   - IDEAM (datos.gov.co): lecturas de las estaciones automáticas más cercanas (catálogo local estaciones.json).
   - NASA POWER: respaldo del histórico diario si Open-Meteo no responde.
   URL: ?finca=SA  o  ?lat=4.73&lng=-74.43 (para enlazar desde otras apps). */
(function () {
  'use strict';

  var CENTRO = [4.7347, -74.4358];              // Cachipay (Cundinamarca)
  var ALMACEN = 'ecoagriapp_clima_ultimo';
  var DATASETS = { precip: 's54a-sgyg', temp: 'sbwg-7ju4', humedad: 'uext-mhny' };
  var MODELOS = [['ecmwf_ifs025', 'ECMWF'], ['gfs_seamless', 'GFS'], ['icon_seamless', 'ICON']];
  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  var estado = { lat: null, lng: null, fincas: [], estaciones: [], mapa: null, marcador: null, capaEstaciones: null, secuencia: 0 };

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v, d) { return (v === null || v === undefined || isNaN(v)) ? '—' : Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function leerAlmacen() { try { return JSON.parse(localStorage.getItem(ALMACEN) || 'null'); } catch (e) { return null; } }
  function guardarAlmacen(v) { try { localStorage.setItem(ALMACEN, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }

  function pedir(url, ms) {
    var control = new AbortController();
    var t = setTimeout(function () { control.abort(); }, ms || 20000);
    return fetch(url, { signal: control.signal }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) { clearTimeout(t); return d; }, function (e) { clearTimeout(t); throw e; });
  }

  /* ---------------- Utilidades geográficas ---------------- */
  function distanciaKm(a1, o1, a2, o2) {
    var R = 6371, rad = Math.PI / 180;
    var dA = (a2 - a1) * rad, dO = (o2 - o1) * rad;
    var h = Math.sin(dA / 2) * Math.sin(dA / 2) + Math.cos(a1 * rad) * Math.cos(a2 * rad) * Math.sin(dO / 2) * Math.sin(dO / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function analizarCoordenadas(texto) {
    var m = String(texto || '').match(/(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)/);
    return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
  }
  function esPunto(lat, lng) { return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }
  function enColombia(lat, lng) { return lat > -5 && lat < 14 && lng > -82 && lng < -66; }

  /* ---------------- Códigos de tiempo (WMO) e iconos ---------------- */
  function condicion(c) {
    if (c === 0) return ['Despejado', 'sol'];
    if (c === 1) return ['Mayormente despejado', 'solnube'];
    if (c === 2) return ['Parcialmente nublado', 'solnube'];
    if (c === 3) return ['Nublado', 'nube'];
    if (c === 45 || c === 48) return ['Niebla', 'niebla'];
    if (c >= 51 && c <= 57) return ['Llovizna', 'lluvia'];
    if (c >= 61 && c <= 67) return ['Lluvia', 'lluvia'];
    if (c >= 71 && c <= 77) return ['Nieve', 'nube'];
    if (c >= 80 && c <= 82) return ['Aguaceros', 'lluvia'];
    if (c >= 95) return ['Tormenta eléctrica', 'tormenta'];
    return ['—', 'nube'];
  }
  var NUBE = '<path d="M7 19h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.4 12.1 3.5 3.5 0 0 0 7 19Z"/>';
  var ICONOS = {
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    solnube: '<circle cx="8" cy="8" r="2.8"/><path d="M8 2.5V4M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1"/><path d="M8.5 20h8.3a3.6 3.6 0 0 0 .5-7.2A5 5 0 0 0 8 13.7 3.2 3.2 0 0 0 8.5 20Z"/>',
    nube: NUBE,
    niebla: '<path d="M7 14h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.4 7.1 3.5 3.5 0 0 0 7 14Z"/><path d="M4 17.5h16M6 21h12"/>',
    lluvia: '<path d="M7 15h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.4 8.1 3.5 3.5 0 0 0 7 15Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    tormenta: '<path d="M7 14h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.4 7.1 3.5 3.5 0 0 0 7 14Z"/><path d="M12.5 14l-2.5 4h3l-2 4"/>'
  };
  function icono(nombre) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONOS[nombre] || NUBE) + '</svg>'; }

  /* ---------------- Mensajes ---------------- */
  function aviso(texto, error) {
    var e = $('estado');
    if (!texto) { e.hidden = true; return; }
    e.hidden = false; e.className = 'aviso-estado' + (error ? ' error' : ''); e.textContent = texto;
  }
  function nota(texto) { $('nota-punto').textContent = texto; }

  /* ---------------- Punto, mapa y selector ---------------- */
  function pintarPunto(lat, lng, centrar) {
    if (!estado.mapa) return;
    if (!estado.marcador) estado.marcador = L.marker([lat, lng], { draggable: true }).addTo(estado.mapa).on('dragend', function () {
      var p = estado.marcador.getLatLng(); fijarPunto(p.lat, p.lng, 'mapa', true);
    });
    else estado.marcador.setLatLng([lat, lng]);
    if (centrar) estado.mapa.setView([lat, lng], Math.max(estado.mapa.getZoom(), 12));
  }
  function fijarPunto(lat, lng, origen, consultar) {
    lat = Math.round(lat * 1e6) / 1e6; lng = Math.round(lng * 1e6) / 1e6;
    estado.lat = lat; estado.lng = lng;
    $('lat').value = lat; $('lng').value = lng;
    $('lat').classList.remove('invalido'); $('lng').classList.remove('invalido');
    pintarPunto(lat, lng, origen !== 'mapa');
    if (origen !== 'finca') $('finca').value = '';
    if (!enColombia(lat, lng)) nota('El punto está fuera de Colombia: el pronóstico funciona, pero no habrá estaciones IDEAM.');
    else nota('Punto: ' + lat + ', ' + lng + '.');
    if (consultar) consultarClima();
  }
  function leerCampos() {
    var lat = parseFloat(String($('lat').value).replace(',', '.')), lng = parseFloat(String($('lng').value).replace(',', '.'));
    var ok = esPunto(lat, lng);
    $('lat').classList.toggle('invalido', !ok); $('lng').classList.toggle('invalido', !ok);
    return ok ? { lat: lat, lng: lng } : null;
  }
  function llenarFincas() {
    var s = $('finca');
    var html = '<option value="">— Elegir finca —</option>';
    estado.fincas.forEach(function (f) {
      html += '<option value="' + esc(f.id) + '">' + esc(f.nombre) + (analizarCoordenadas(f.coordenadas) ? '' : ' (sin coordenadas)') + '</option>';
    });
    s.innerHTML = html;
  }
  function alElegirFinca() {
    var f = estado.fincas.filter(function (x) { return x.id === $('finca').value; })[0];
    if (!f) return;
    var c = analizarCoordenadas(f.coordenadas);
    if (c && esPunto(c.lat, c.lng)) { fijarPunto(c.lat, c.lng, 'finca', true); guardarAlmacen({ finca: f.id }); }
    else nota(f.nombre + ' todavía no tiene coordenadas registradas aquí: escríbalas o haga clic en el mapa.');
  }

  function iniciarMapa() {
    var calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    var satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Imágenes © Esri' });
    estado.mapa = L.map('mapa', { layers: [calles], zoomControl: true }).setView(CENTRO, 10);
    L.control.layers({ 'Calles': calles, 'Satélite': satelite }, null, { collapsed: true }).addTo(estado.mapa);
    estado.capaEstaciones = L.layerGroup().addTo(estado.mapa);
    estado.mapa.on('click', function (e) { fijarPunto(e.latlng.lat, e.latlng.lng, 'mapa', true); });
    setTimeout(function () { estado.mapa.invalidateSize(); }, 200);
  }
  function marcarEstaciones(lista, usadas) {
    estado.capaEstaciones.clearLayers();
    lista.forEach(function (e) {
      var activa = usadas.indexOf(e.codigo) >= 0;
      L.marker([e.lat, e.lng], { icon: L.divIcon({ className: '', html: '<div class="marca-estacion' + (activa ? ' activa' : '') + '" style="width:' + (activa ? 14 : 10) + 'px;height:' + (activa ? 14 : 10) + 'px"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), keyboard: false })
        .bindTooltip(e.nombre + ' · ' + num(e.km, 1) + ' km').addTo(estado.capaEstaciones);
    });
  }

  /* ---------------- Open-Meteo ---------------- */
  function urlOpenMeteo(lat, lng) {
    var base = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&timezone=America%2FBogota';
    return base + '&past_days=60&forecast_days=8'
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,vapour_pressure_deficit,soil_moisture_0_to_1cm'
      + '&hourly=temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,weather_code,cloud_cover'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_hours,precipitation_probability_max,et0_fao_evapotranspiration,'
      + 'wind_speed_10m_max,wind_gusts_10m_max,shortwave_radiation_sum,sunshine_duration,daylight_duration,cloud_cover_mean,relative_humidity_2m_mean,dew_point_2m_mean,vapour_pressure_deficit_max,uv_index_max';
  }
  // Pronóstico emitido el día anterior (API de «previous runs») junto con el valor ya analizado, para contrastar ayer.
  function urlAyer(lat, lng) {
    return 'https://previous-runs-api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&timezone=America%2FBogota&past_days=3&forecast_days=1'
      + '&hourly=temperature_2m,temperature_2m_previous_day1,precipitation,precipitation_previous_day1,relative_humidity_2m,relative_humidity_2m_previous_day1';
  }
  function urlModelos(lat, lng) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&timezone=America%2FBogota&forecast_days=7&daily=precipitation_sum&models=' + MODELOS.map(function (m) { return m[0]; }).join(',');
  }
  function urlNasa(lat, lng) {
    function f(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
    var fin = new Date(Date.now() - 86400000), ini = new Date(Date.now() - 15 * 86400000);
    return 'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M&community=AG&longitude=' + lng + '&latitude=' + lat + '&start=' + f(ini) + '&end=' + f(fin) + '&format=JSON';
  }

  function pintarAhora(om) {
    var c = om.current, cond = condicion(c.weather_code);
    var html = '<h2 id="t-ahora">Ahora</h2><p class="sub">Modelo Open-Meteo en el punto (cuadrícula ~11 km) · altitud del modelo ' + num(om.elevation, 0) + ' m · actualizado ' + esc(c.time.replace('T', ' ')) + '</p>'
      + '<div class="ahora"><div class="ahora-temp">' + icono(cond[1]) + '<div><div class="grande">' + num(c.temperature_2m, 1) + '<small> °C</small></div><div class="cond">' + esc(cond[0]) + ' · sensación ' + num(c.apparent_temperature, 1) + ' °C</div></div></div>'
      + '<div class="datos">'
      + dato('Humedad relativa', num(c.relative_humidity_2m, 0), '%')
      + dato('Lluvia (última hora)', num(c.precipitation, 1), 'mm')
      + dato('Viento', num(c.wind_speed_10m, 0), 'km/h') + dato('Ráfagas', num(c.wind_gusts_10m, 0), 'km/h')
      + dato('Nubosidad', num(c.cloud_cover, 0), '%')
      + dato('Déficit de vapor', num(c.vapour_pressure_deficit, 2), 'kPa')
      + dato('Humedad del suelo (0–1 cm)', num(c.soil_moisture_0_to_1cm * 100, 0), '%')
      + '</div></div>';
    $('sec-ahora').innerHTML = html;
  }
  function dato(e, v, u) { return '<div class="dato"><span class="e">' + esc(e) + '</span><span class="v">' + v + ' <small>' + esc(u) + '</small></span></div>'; }

  function sumar(arr, a, b) { var s = 0; for (var i = Math.max(a, 0); i < Math.min(b, arr.length); i++) s += (arr[i] || 0); return s; }

  /* ---------------- Fechas ---------------- */
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function indiceAhora(om) {
    var h = om.hourly, i = h.time.indexOf(om.current.time.slice(0, 13) + ':00');
    if (i < 0) i = h.time.findIndex(function (t) { return t > om.current.time; }) - 1;
    return i;
  }
  function indiceHoy(om) { var i = om.daily.time.indexOf(om.current.time.slice(0, 10)); return i < 0 ? 60 : i; }
  function nombreDia(f) { var d = new Date(f + 'T12:00:00'); return DIAS[d.getDay()] + ' ' + d.getDate(); }
  function fechaLarga(f) { var d = new Date(f + 'T12:00:00'); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function fechaBogota(offsetDias) { return new Date(Date.now() - 5 * 3600000 + offsetDias * 86400000).toISOString().slice(0, 10); }
  function hh(c) { return String(c).padStart(2, '0'); }

  /* ---------------- Sanidad vegetal ---------------- */
  // Parámetros de las interpretaciones (se muestran al hacer clic en cada indicador).
  var U = { hr: 90, hongosMedio: 10, hongosAlto: 20, horaIni: 6, horaFin: 17, lluviaMax: 0.1, probMax: 30, vientoMax: 15, minHoras: 2 };

  function razonesNoAplicar(h, k) {
    var hora = parseInt(h.time[k].slice(11, 13), 10), r = [];
    if (hora < U.horaIni || hora > U.horaFin) r.push('fuera del horario diurno (' + U.horaIni + ':00 a ' + (U.horaFin + 1) + ':00)');
    if ((h.precipitation[k] || 0) >= U.lluviaMax) r.push('lluvia prevista ' + num(h.precipitation[k], 1) + ' mm');
    var p = h.precipitation_probability[k];
    if (p !== null && p !== undefined && p >= U.probMax) r.push('probabilidad de lluvia ' + p + ' %');
    if ((h.wind_speed_10m[k] || 0) >= U.vientoMax) r.push('viento ' + num(h.wind_speed_10m[k], 0) + ' km/h');
    return r;
  }
  function franjasAplicar(h, desde, hasta) {
    var v = [], ini = null;
    for (var k = desde; k <= hasta; k++) {
      var ok = razonesNoAplicar(h, k).length === 0;
      if (ok && ini === null) ini = k;
      if ((!ok || k === hasta) && ini !== null) { var fin = ok ? k : k - 1; if (fin - ini + 1 >= U.minHoras) v.push([ini, fin]); ini = null; }
    }
    return v;
  }
  // Mapa hora por hora (una fila por fecha, 24 columnas). clasificar(k) -> [clase, texto del tooltip]
  function tiraHoras(h, desde, hasta, clasificar) {
    var fechas = [];
    for (var k = desde; k <= hasta; k++) { var f = h.time[k].slice(0, 10); if (fechas.indexOf(f) < 0) fechas.push(f); }
    var html = '<div class="tira"><span class="tira-et"></span>';
    for (var c = 0; c < 24; c++) html += '<span class="tira-h">' + (c % 3 === 0 ? c : '') + '</span>';
    fechas.forEach(function (f) {
      var base = h.time.indexOf(f + 'T00:00');
      html += '<span class="tira-et">' + esc(nombreDia(f)) + '</span>';
      for (var c2 = 0; c2 < 24; c2++) {
        var kk = base + c2;
        if (base < 0 || kk < desde || kk > hasta) html += '<i class="c fuera"></i>';
        else { var r = clasificar(kk); html += '<i class="c ' + r[0] + '" title="' + esc(hh(c2) + ':00 — ' + r[1]) + '"></i>'; }
      }
    });
    return html + '</div>';
  }

  function pintarSanidad(om) {
    var h = om.hourly, ahora = indiceAhora(om), tope = Math.min(ahora + 48, h.time.length - 1);
    var l24 = sumar(h.precipitation, ahora - 23, ahora + 1), l72 = sumar(h.precipitation, ahora - 71, ahora + 1), p48 = sumar(h.precipitation, ahora + 1, ahora + 49);
    var hr = 0, hrPasada = 0;
    for (var i = ahora + 1; i <= tope; i++) if (h.relative_humidity_2m[i] >= U.hr) hr++;
    for (var j = Math.max(ahora - 23, 0); j <= ahora; j++) if (h.relative_humidity_2m[j] >= U.hr) hrPasada++;
    var ventanas = franjasAplicar(h, ahora + 1, tope);
    function rango(v) { return nombreDia(h.time[v[0]].slice(0, 10)) + ' ' + h.time[v[0]].slice(11, 13) + '–' + hh(parseInt(h.time[v[1]].slice(11, 13), 10) + 1) + ' h'; }
    var nivel = hr >= U.hongosAlto ? ['alerta', 'Alto'] : hr >= U.hongosMedio ? ['aviso', 'Medio'] : ['ok', 'Bajo'];

    var tiraHongos = tiraHoras(h, ahora + 1, tope, function (k) {
      return h.relative_humidity_2m[k] >= U.hr ? ['humedo', 'humedad relativa ' + num(h.relative_humidity_2m[k], 0) + ' % (≥ ' + U.hr + ' %)'] : ['seco', 'humedad relativa ' + num(h.relative_humidity_2m[k], 0) + ' %'];
    });
    var enVentana = {};
    ventanas.forEach(function (v) { for (var k = v[0]; k <= v[1]; k++) enVentana[k] = true; });
    var tiraAplicar = tiraHoras(h, ahora + 1, tope, function (k) {
      var r = razonesNoAplicar(h, k);
      if (!r.length) return enVentana[k] ? ['ok', 'cumple todos los criterios'] : ['corta', 'cumple, pero la franja dura menos de ' + U.minHoras + ' h'];
      return ['no', 'no: ' + r.join('; ')];
    });

    $('sec-sanidad').innerHTML = '<h2 id="t-sanidad">Para sanidad vegetal</h2><p class="sub">Calculado con el pronóstico por hora del modelo. Haga clic en un indicador para ver cómo se calcula.</p>'
      + '<ul class="lista-indicadores">'
      + '<li><span>Lluvia últimas 24 h / 72 h</span><b>' + num(l24, 1) + ' / ' + num(l72, 1) + ' mm</b></li>'
      + '<li><span>Lluvia prevista próximas 48 h</span><b>' + num(p48, 1) + ' mm</b></li>'
      + '<li><span>Horas con humedad ≥ ' + U.hr + ' % (24 h atrás / 48 h adelante)</span><b>' + hrPasada + ' / ' + hr + ' h</b></li>'
      + '<li class="fila-clic"><button type="button" class="fila-boton" aria-expanded="false" aria-controls="det-hongos"><span>Condiciones que favorecen hongos<i class="flechita" aria-hidden="true"></i></span><span class="pastilla ' + nivel[0] + '">' + nivel[1] + '</span></button></li>'
      + '<li class="detalle" id="det-hongos" hidden>'
      + '<p><strong>Cómo se calcula.</strong> Se cuentan las horas con humedad relativa ≥ ' + U.hr + ' % en las próximas 48 h (pronóstico por hora de Open-Meteo).</p>'
      + '<ul class="criterios"><li><span class="pastilla ok">Bajo</span> menos de ' + U.hongosMedio + ' h</li><li><span class="pastilla aviso">Medio</span> de ' + U.hongosMedio + ' a ' + (U.hongosAlto - 1) + ' h</li><li><span class="pastilla alerta">Alto</span> ' + U.hongosAlto + ' h o más</li></ul>'
      + '<p>Ahora: <strong>' + hr + ' h</strong> en las próximas 48 h (y ' + hrPasada + ' h en las últimas 24 h) → nivel <strong>' + nivel[1].toLowerCase() + '</strong>.</p>'
      + tiraHongos + '<p class="leyenda-tira"><span><i class="c humedo"></i>HR ≥ ' + U.hr + ' %</span><span><i class="c seco"></i>HR menor</span><span><i class="c fuera"></i>fuera de las 48 h</span></p>'
      + '<p class="nota">Es un indicador simple de humedad alta sostenida, que acompaña a muchas infecciones por hongos. No considera la temperatura, el mojado real de la hoja, el cultivo, su etapa ni la sensibilidad de cada patógeno: úselo como aviso para revisar el lote, no como diagnóstico.</p></li>'
      + '<li class="fila-clic"><button type="button" class="fila-boton" aria-expanded="false" aria-controls="det-franjas"><span>Franjas para aplicar (próximas 48 h)<i class="flechita" aria-hidden="true"></i></span><span class="pastilla ' + (ventanas.length ? 'ok' : 'aviso') + '">' + ventanas.length + (ventanas.length === 1 ? ' franja' : ' franjas') + '</span></button></li>'
      + '<li class="chips"><span class="ventanas">' + (ventanas.length ? ventanas.slice(0, 6).map(function (v) { return '<span>' + esc(rango(v)) + '</span>'; }).join('') : 'No hay franjas de ' + U.minHoras + ' h o más que cumplan las condiciones.') + '</span></li>'
      + '<li class="detalle" id="det-franjas" hidden>'
      + '<p><strong>Criterios</strong> (una hora cuenta solo si cumple todos a la vez):</p>'
      + '<ul class="criterios"><li>Horario diurno: de ' + U.horaIni + ':00 a ' + (U.horaFin + 1) + ':00.</li><li>Lluvia prevista menor a ' + num(U.lluviaMax, 1) + ' mm en esa hora.</li><li>Probabilidad de lluvia menor a ' + U.probMax + ' % (si el modelo la entrega).</li><li>Viento menor a ' + U.vientoMax + ' km/h (para limitar la deriva de la aspersión).</li><li>La franja debe durar al menos ' + U.minHoras + ' horas seguidas.</li></ul>'
      + tiraAplicar + '<p class="leyenda-tira"><span><i class="c ok"></i>franja válida</span><span><i class="c corta"></i>cumple, franja muy corta</span><span><i class="c no"></i>no cumple (pase el cursor para ver el motivo)</span><span><i class="c fuera"></i>fuera de las 48 h</span></p>'
      + '<p class="nota">No considera la temperatura ni la humedad del aire, el periodo de reentrada o carencia, ni lo que indique la etiqueta de cada producto. Confirme siempre con la lectura en campo.</p></li>'
      + '</ul>';
  }
  function alternarDetalle(e) {
    var b = e.target.closest ? e.target.closest('.fila-boton') : null;
    if (!b) return;
    var panel = $(b.getAttribute('aria-controls')), abierto = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', abierto ? 'false' : 'true');
    if (panel) panel.hidden = abierto;
  }

  /* ---------------- Pronóstico por día y por hora ---------------- */
  function tarjetaDia(d, i, etiqueta, clase) {
    var cond = condicion(d.weather_code[i]), prob = d.precipitation_probability_max[i];
    return '<button type="button" class="dia' + (clase ? ' ' + clase : '') + '" data-i="' + i + '" aria-pressed="false"><div class="nombre">' + esc(etiqueta) + '</div>' + icono(cond[1])
      + '<div class="t">' + num(d.temperature_2m_max[i], 0) + '° <i>/ ' + num(d.temperature_2m_min[i], 0) + '°</i></div>'
      + '<div class="l">' + num(d.precipitation_sum[i], 1) + ' mm' + (prob === null || prob === undefined ? '' : ' · ' + num(prob, 0) + ' %') + '</div>'
      + '<div class="et">ET0 ' + num(d.et0_fao_evapotranspiration[i], 1) + ' mm</div></button>';
  }
  function pintarPronostico(om) {
    var d = om.daily, i0 = indiceHoy(om);
    estado.om = om; estado.i0 = i0; estado.diaSel = null;
    var html = '<h2 id="t-pron">Pronóstico de 7 días</h2><p class="sub">Haga clic en un día para ver el pronóstico hora por hora. «Ayer» contrasta lo que se había pronosticado con lo que ocurrió.</p><div class="dias">';
    html += tarjetaDia(d, i0 - 1, 'ayer', 'ayer');
    for (var i = i0; i < Math.min(i0 + 7, d.time.length); i++) html += tarjetaDia(d, i, i === i0 ? 'hoy' : nombreDia(d.time[i]), i === i0 ? 'hoy' : '');
    $('sec-pronostico').innerHTML = html + '</div><div class="hora-panel" id="hora-panel" hidden></div>';
  }
  function alElegirDia(e) {
    var cerrar = e.target.closest ? e.target.closest('[data-cerrar]') : null;
    var b = e.target.closest ? e.target.closest('.dia') : null;
    if (!b && !cerrar) return;
    var i = cerrar ? null : parseInt(b.getAttribute('data-i'), 10);
    if (i === estado.diaSel) i = null;               // segundo clic en el mismo día: cierra
    estado.diaSel = i;
    Array.prototype.forEach.call(document.querySelectorAll('#sec-pronostico .dia'), function (x) { x.setAttribute('aria-pressed', parseInt(x.getAttribute('data-i'), 10) === i ? 'true' : 'false'); });
    var panel = $('hora-panel');
    panel.hidden = i === null;
    if (i !== null) { renderHora(); }
  }
  function renderHora() {
    var om = estado.om, i = estado.diaSel;
    if (!om || i === null || i === undefined || !$('hora-panel')) return;
    $('hora-panel').innerHTML = (i === estado.i0 - 1) ? vistaAyer() : vistaHoraDia(om, i);
  }
  var BOTON_CERRAR = '<button type="button" class="boton" data-cerrar>Cerrar</button>';

  function vistaHoraDia(om, i) {
    var h = om.hourly, f = om.daily.time[i], ini = h.time.indexOf(f + 'T00:00'), ahora = indiceAhora(om);
    var cab = '<div class="hora-cab"><h3>Hora por hora · ' + esc(fechaLarga(f)) + '</h3>' + BOTON_CERRAR + '</div>';
    if (ini < 0) return cab + '<p class="nota">El modelo no entregó datos por hora para ese día.</p>';
    var etiq = [], T = [], LL = [], filas = '';
    for (var c = 0; c < 24; c++) {
      var k = ini + c, cond = condicion(h.weather_code[k]), pasada = k <= ahora, p = h.precipitation_probability[k];
      etiq.push(hh(c)); T.push(h.temperature_2m[k]); LL.push(h.precipitation[k]);
      filas += '<tr class="' + (pasada ? 'pasada' : '') + (k === ahora ? ' ahora-fila' : '') + '"><td>' + hh(c) + ':00</td><td class="icono-celda" title="' + esc(cond[0]) + '">' + icono(cond[1]) + '</td><td class="num">' + num(h.temperature_2m[k], 1) + '</td><td class="num">' + num(h.relative_humidity_2m[k], 0) + '</td><td class="num">' + num(h.precipitation[k], 1) + '</td><td class="num">' + (p === null || p === undefined ? '—' : num(p, 0)) + '</td><td class="num">' + num(h.wind_speed_10m[k], 0) + '</td><td class="num">' + num(h.cloud_cover[k], 0) + '</td></tr>';
    }
    var hoyIdx = (ahora >= ini && ahora <= ini + 23) ? ahora - ini : -1;
    var pron = ahora >= ini + 23 ? 24 : (ahora < ini ? 0 : ahora - ini + 1);
    return cab + '<p class="sub">' + (ahora >= ini + 23 ? 'Día ya terminado: valores del análisis del modelo.' : ahora < ini ? 'Pronóstico del modelo.' : 'Las horas ya pasadas (en gris) son análisis del modelo; las siguientes, pronóstico.') + '</p>'
      + '<div class="grafica"><h3>Temperatura (°C)</h3>' + grafLineas(etiq, [{ nombre: 'Temperatura', v: T, linea: 'l-max', punto: 'p-max' }], { unidad: '°C', hoy: hoyIdx, paso: 3 }) + '</div>'
      + '<div class="grafica"><h3>Lluvia (mm por hora)</h3>' + grafBarras(etiq, LL, { unidad: 'mm', dec: 1, pron: pron, paso: 3, hoy: hoyIdx }) + '</div>'
      + '<div class="tabla-scroll alta"><table class="tabla compacta"><thead><tr><th>Hora</th><th>Tiempo</th><th class="num">T °C</th><th class="num">HR %</th><th class="num">Lluvia mm</th><th class="num">Prob. %</th><th class="num">Viento km/h</th><th class="num">Nubes %</th></tr></thead><tbody>' + filas + '</tbody></table></div>';
  }

  /* ---------------- Ayer: pronóstico vs. observado ---------------- */
  function valido(x) { return x !== null && x !== undefined && isFinite(x); }
  function estad(v, modo) {
    var a = v.filter(valido);
    if (!a.length) return null;
    if (modo === 'max') return Math.max.apply(null, a);
    if (modo === 'min') return Math.min.apply(null, a);
    if (modo === 'suma') return a.reduce(function (s, x) { return s + x; }, 0);
    if (modo === 'llueve') return a.filter(function (x) { return x >= 0.1; }).length;
    return a.reduce(function (s, x) { return s + x; }, 0) / a.length;
  }
  function acumular(v) { var s = 0, r = []; v.forEach(function (x) { if (valido(x)) s += x; r.push(valido(x) || r.length ? s : null); }); return r; }

  function vistaAyer() {
    var om = estado.om, f = om.daily.time[estado.i0 - 1], a = estado.ayerPrev, obs = estado.obsAyer;
    var cab = '<div class="hora-cab"><h3>Ayer · ' + esc(fechaLarga(f)) + ': ¿qué tan bueno fue el pronóstico?</h3>' + BOTON_CERRAR + '</div>';
    if (estado.ayerError) return cab + '<p class="nota">No se pudo consultar el pronóstico de ayer (servicio de pronósticos anteriores de Open-Meteo). Inténtelo de nuevo en unos minutos.</p>';
    if (!a) return cab + '<p class="cargando-bloque">Cargando el pronóstico de ayer…</p>';
    var h = a.hourly, ini = h.time.indexOf(f + 'T00:00');
    if (ini < 0) return cab + '<p class="nota">El servicio no devolvió datos de ayer.</p>';
    function tomar(clave) { var r = []; for (var c = 0; c < 24; c++) r.push(h[clave] ? h[clave][ini + c] : null); return r; }
    var P = { T: tomar('temperature_2m_previous_day1'), LL: tomar('precipitation_previous_day1'), HR: tomar('relative_humidity_2m_previous_day1') };
    var A = { T: tomar('temperature_2m'), LL: tomar('precipitation'), HR: tomar('relative_humidity_2m') };
    var O = obs ? { T: obs.temp, LL: obs.lluvia, HR: obs.hr } : null;
    if (!P.T.some(valido)) return cab + '<p class="nota">Open-Meteo no conserva el pronóstico emitido el día anterior para este punto.</p>';
    var ref = O && O.T && O.T.some(valido) ? O : A, refNombre = ref === O ? 'la estación IDEAM ' + obs.nombre + ' (' + num(obs.km, 1) + ' km)' : 'el análisis del modelo (no es una medición)';

    function fila(nombre, clave, modo, dec, unidad) {
      var p = P[clave] && estad(P[clave], modo), an = A[clave] && estad(A[clave], modo), o = O && O[clave] ? estad(O[clave], modo) : null;
      var r = ref[clave] ? estad(ref[clave], modo) : null, err = (valido(p) && valido(r)) ? p - r : null;
      return '<tr><td>' + nombre + '</td><td class="num">' + num(p, dec) + '</td><td class="num">' + num(an, dec) + '</td>' + (O ? '<td class="num">' + num(o, dec) + '</td>' : '') + '<td class="num">' + (err === null ? '—' : (err > 0 ? '+' : '') + num(err, dec)) + ' ' + unidad + '</td></tr>';
    }
    var mae = null;
    if (ref.T) { var s = 0, n = 0; for (var c = 0; c < 24; c++) if (valido(P.T[c]) && valido(ref.T[c])) { s += Math.abs(P.T[c] - ref.T[c]); n++; } if (n >= 12) mae = s / n; }
    var tabla = '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Variable</th><th class="num">Pronóstico</th><th class="num">Analizado</th>' + (O ? '<th class="num">Observado</th>' : '') + '<th class="num">Error (pron. − ref.)</th></tr></thead><tbody>'
      + fila('Temperatura máxima (°C)', 'T', 'max', 1, '°C') + fila('Temperatura mínima (°C)', 'T', 'min', 1, '°C') + fila('Temperatura media (°C)', 'T', 'media', 1, '°C')
      + fila('Humedad relativa media (%)', 'HR', 'media', 0, '%') + fila('Lluvia total (mm)', 'LL', 'suma', 1, 'mm') + fila('Horas con lluvia (≥ 0,1 mm)', 'LL', 'llueve', 0, 'h')
      + '</tbody></table></div>';

    var etiq = []; for (var c2 = 0; c2 < 24; c2++) etiq.push(hh(c2));
    function series(clave, acum) {
      function t(v) { return v ? (acum ? acumular(v) : v) : null; }
      var s = [{ nombre: 'Pronóstico (emitido ayer)', v: t(P[clave]), linea: 's-pron', punto: 'q-pron' }, { nombre: 'Analizado (modelo)', v: t(A[clave]), linea: 's-anal', punto: 'q-anal' }];
      if (O && O[clave] && O[clave].some(valido)) s.push({ nombre: 'Observado IDEAM', v: t(O[clave]), linea: 's-obs', punto: 'q-obs' });
      return s.filter(function (x) { return x.v; });
    }
    var leyenda = '<p class="leyenda"><span><i style="background:var(--aviso)"></i>Pronóstico (emitido ayer)</span><span><i style="background:var(--tinta-3)"></i>Analizado (modelo)</span>' + (O ? '<span><i style="background:var(--verde)"></i>Observado IDEAM</span>' : '') + '</p>';
    var detalle = '<details class="tabla-det"><summary>Ver hora por hora</summary><div class="tabla-scroll alta"><table class="tabla compacta"><thead><tr><th>Hora</th><th class="num">T pron.</th><th class="num">T anal.</th>' + (O && O.T ? '<th class="num">T obs.</th>' : '') + '<th class="num">Lluvia pron.</th><th class="num">Lluvia anal.</th>' + (O && O.LL ? '<th class="num">Lluvia obs.</th>' : '') + '</tr></thead><tbody>';
    for (var c3 = 0; c3 < 24; c3++) detalle += '<tr><td>' + hh(c3) + ':00</td><td class="num">' + num(P.T[c3], 1) + '</td><td class="num">' + num(A.T[c3], 1) + '</td>' + (O && O.T ? '<td class="num">' + num(O.T[c3], 1) + '</td>' : '') + '<td class="num">' + num(P.LL[c3], 1) + '</td><td class="num">' + num(A.LL[c3], 1) + '</td>' + (O && O.LL ? '<td class="num">' + num(O.LL[c3], 1) + '</td>' : '') + '</tr>';
    detalle += '</tbody></table></div></details>';

    return cab + '<p class="sub"><strong>Pronóstico</strong> = lo que el modelo anunciaba un día antes · <strong>Analizado</strong> = lo que el modelo estima después, ya con datos · <strong>Observado</strong> = lecturas de la estación IDEAM más cercana con datos'
      + (O ? ' (' + esc(obs.nombre) + ', ' + num(obs.km, 1) + ' km)' : ' (no hay lecturas de ayer disponibles: se compara solo con el análisis del modelo)') + '.</p>'
      + (mae !== null ? '<p class="resumen-ayer">Error medio horario de temperatura frente a ' + esc(refNombre) + ': <strong>' + num(mae, 1) + ' °C</strong>.</p>' : '')
      + tabla
      + '<div class="grafica"><h3>Temperatura ayer (°C)</h3>' + grafLineas(etiq, series('T', false), { unidad: '°C', paso: 3 }) + leyenda + '</div>'
      + '<div class="grafica"><h3>Lluvia acumulada ayer (mm)</h3>' + grafLineas(etiq, series('LL', true), { unidad: 'mm', paso: 3, cero: true }) + '</div>'
      + detalle
      + '<p class="nota">Las lecturas de IDEAM pueden tener huecos; la lluvia observada se suma por hora con los datos disponibles. Una sola estación (a ' + (obs ? num(obs.km, 1) + ' km' : 'varios km') + ' y otra altitud) no representa exactamente el punto consultado.</p>';
  }
  function construirObsAyer(l, fecha) {
    function porHora(sensor, modo) {
      var s = [], n = [], c;
      for (c = 0; c < 24; c++) { s.push(0); n.push(0); }
      (sensor.filas || []).forEach(function (f) {
        if (f.fechaobservacion.slice(0, 10) !== fecha) return;
        var hora = parseInt(f.fechaobservacion.slice(11, 13), 10), v = parseFloat(f.valorobservado);
        if (isFinite(v)) { s[hora] += v; n[hora]++; }
      });
      return s.map(function (x, i) { return n[i] ? (modo === 'suma' ? x : x / n[i]) : null; });
    }
    var sT = l.temp.filter(function (s) { return /aire/i.test(s.sensor); })[0], sL = l.precip[0],
      sH = l.humedad.filter(function (s) { return /aire/i.test(s.sensor) && !/suelo/i.test(s.sensor); })[0];
    var r = { nombre: l.est.nombre, km: l.est.km, temp: sT ? porHora(sT, 'media') : null, lluvia: sL ? porHora(sL, 'suma') : null, hr: sH ? porHora(sH, 'media') : null };
    var hay = [r.temp, r.lluvia, r.hr].some(function (a) { return a && a.some(valido); });
    return hay ? r : null;
  }

  /* ---------------- Gráficas del periodo ---------------- */
  function pintarGraficas(fechas, tmax, tmin, lluvia, indiceHoy, fuente) {
    var etiq = fechas.map(etiquetaFecha);
    var html = '<h2 id="t-graf">Últimos 14 días y próximos 7</h2><p class="sub">' + esc(fuente) + '</p>';
    html += '<div class="grafica"><h3>Lluvia diaria (mm)</h3>' + grafBarras(etiq, lluvia, { unidad: 'mm', dec: 1, pron: indiceHoy + 1, hoy: indiceHoy, paso: 3 }) + '<p class="leyenda"><span><i style="background:var(--frac)"></i>Observado/analizado</span><span><i style="background:var(--frac);opacity:.45"></i>Pronóstico</span></p></div>';
    html += '<div class="grafica"><h3>Temperatura máxima y mínima (°C)</h3>' + grafLineas(etiq, [{ nombre: 'Máxima', v: tmax, linea: 'l-max', punto: 'p-max' }, { nombre: 'Mínima', v: tmin, linea: 'l-min', punto: 'p-min' }], { unidad: '°C', hoy: indiceHoy, paso: 3, etiquetaHoy: 'hoy' }) + '<p class="leyenda"><span><i style="background:var(--alerta)"></i>Máxima</span><span><i style="background:var(--frac)"></i>Mínima</span></p></div>';
    var acumulado = sumar(lluvia, Math.max(indiceHoy - 13, 0), indiceHoy + 1), acum7 = sumar(lluvia, indiceHoy + 1, indiceHoy + 8);
    html += '<p class="nota">Lluvia acumulada en los últimos 14 días (hasta hoy): <strong>' + num(acumulado, 1) + ' mm</strong> · prevista en los próximos 7 días: <strong>' + num(acum7, 1) + ' mm</strong>.</p>';
    $('sec-graficas').innerHTML = html;
  }
  function etiquetaFecha(f) { var d = new Date(f + 'T12:00:00'); return d.getDate() + '/' + (d.getMonth() + 1); }
  function decEje(rango) { return rango < 2 ? 2 : rango < 20 ? 1 : 0; }
  function techoBonito(x) { if (x <= 0) return 0; var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

  // Barras con base en cero (admite negativos). o: {unidad, dec, pron (desde qué índice es pronóstico), hoy, paso}
  function grafBarras(etiq, v, o) {
    o = o || {};
    var W = 760, H = 210, ml = 42, mr = 8, mt = 14, mb = 26, n = v.length, pron = o.pron === undefined ? n : o.pron;
    var vals = v.filter(valido), mx = Math.max.apply(null, vals.concat([0])), mn = Math.min.apply(null, vals.concat([0]));
    if (!vals.length) return '<p class="nota">Sin datos para graficar.</p>';
    mx = techoBonito(mx); mn = -techoBonito(-mn);
    if (mx === 0 && mn === 0) mx = 1;
    if (o.minimoMax && mx < o.minimoMax) mx = o.minimoMax;
    var rango = mx - mn, ld = Math.max(decEje(rango), 0), paso = o.paso || 1;
    function Y(x) { return mt + (H - mt - mb) * (mx - x) / rango; }
    var ancho = (W - ml - mr) / n, svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfica de barras en ' + esc(o.unidad || '') + '">';
    for (var g = 0; g <= 4; g++) { var val = mx - rango * g / 4, y = Y(val); svg += '<line class="rejilla" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (ml - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + num(val, ld) + '</text>'; }
    v.forEach(function (x, i) {
      var xx = ml + i * ancho + 1.5;
      if (valido(x)) {
        var y0 = Y(0), y1 = Y(x), clase = x < 0 ? 'barra-neg' : (i >= pron ? 'barra-pron' : 'barra-obs');
        svg += '<rect class="' + clase + '" x="' + xx + '" y="' + Math.min(y0, y1) + '" width="' + Math.max(ancho - 3, 1.5) + '" height="' + Math.abs(y1 - y0) + '"><title>' + esc(etiq[i] + ': ' + num(x, o.dec === undefined ? 1 : o.dec) + ' ' + (o.unidad || '')) + '</title></rect>';
      }
      if (i % paso === 0 || (i === n - 1 && (n - 1) % paso >= Math.ceil(paso / 2))) svg += '<text x="' + (xx + (ancho - 3) / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(etiq[i]) + '</text>';
    });
    svg += '<line class="eje" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    if (o.hoy !== undefined && o.hoy >= 0 && o.hoy < n) { var xh = ml + (o.hoy + 0.5) * ancho; svg += '<line class="hoy-linea" x1="' + xh + '" x2="' + xh + '" y1="' + mt + '" y2="' + (H - mb) + '"/><text class="hoy-txt" x="' + (xh + 4) + '" y="' + (mt + 8) + '">' + (o.etiquetaHoy || 'ahora') + '</text>'; }
    return svg + '</svg>';
  }
  // Líneas (varias series, con huecos). series: [{nombre, v, linea, punto}] o: {unidad, hoy, paso, ref, refEtq, cero}
  function grafLineas(etiq, series, o) {
    o = o || {};
    var W = 760, H = 210, ml = 42, mr = 10, mt = 14, mb = 26, n = etiq.length, paso = o.paso || 1;
    var todos = [];
    series.forEach(function (s) { s.v.forEach(function (x) { if (valido(x)) todos.push(x); }); });
    if (o.ref !== undefined) todos.push(o.ref);
    if (!todos.length) return '<p class="nota">Sin datos para graficar.</p>';
    var mn = Math.min.apply(null, todos), mx = Math.max.apply(null, todos);
    if (o.cero) mn = Math.min(mn, 0);
    var pad = (mx - mn) * 0.08 || 1; mx += pad; if (!o.cero || mn < 0) mn -= pad;
    var rango = mx - mn, ld = decEje(rango);
    function X(i) { return ml + (i + 0.5) * (W - ml - mr) / n; }
    function Y(x) { return mt + (H - mt - mb) * (1 - (x - mn) / rango); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfica de líneas en ' + esc(o.unidad || '') + '">';
    for (var g = 0; g <= 4; g++) { var val = mn + rango * g / 4, y = Y(val); svg += '<line class="rejilla" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (ml - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + num(val, ld) + '</text>'; }
    if (o.ref !== undefined) svg += '<line class="ref-linea" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(o.ref) + '" y2="' + Y(o.ref) + '"/><text class="ref-txt" x="' + (W - mr - 4) + '" y="' + (Y(o.ref) - 4) + '" text-anchor="end">' + esc(o.refEtq || '') + '</text>';
    series.forEach(function (s) {
      var seg = [], puntos = '';
      function cerrar() { if (seg.length > 1) svg += '<polyline class="' + s.linea + '" points="' + seg.join(' ') + '"/>'; seg = []; }
      s.v.forEach(function (x, i) {
        if (!valido(x)) { cerrar(); return; }
        seg.push(X(i).toFixed(1) + ',' + Y(x).toFixed(1));
        puntos += '<circle class="' + s.punto + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(x).toFixed(1) + '" r="' + (n > 40 ? 1.8 : 2.6) + '"><title>' + esc(etiq[i] + ' · ' + s.nombre + ': ' + num(x, Math.max(ld, 1)) + ' ' + (o.unidad || '')) + '</title></circle>';
      });
      cerrar(); svg += puntos;
    });
    etiq.forEach(function (f, i) { if (i % paso === 0 || (i === n - 1 && (n - 1) % paso >= Math.ceil(paso / 2))) svg += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(f) + '</text>'; });
    svg += '<line class="eje" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (H - mb) + '" y2="' + (H - mb) + '"/>';
    if (o.hoy !== undefined && o.hoy >= 0 && o.hoy < n) svg += '<line class="hoy-linea" x1="' + X(o.hoy) + '" x2="' + X(o.hoy) + '" y1="' + mt + '" y2="' + (H - mb) + '"/><text class="hoy-txt" x="' + (X(o.hoy) + 4) + '" y="' + (mt + 8) + '">' + (o.etiquetaHoy || (n > 30 ? 'hoy' : 'ahora')) + '</text>';
    return svg + '</svg>';
  }

  /* ---------------- Explorador de variables ---------------- */
  function movil(arr, n, modo) {   // ventana de n días que termina en cada día; null si no hay n datos
    return arr.map(function (x, i) {
      if (i < n - 1) return null;
      var w = arr.slice(i - n + 1, i + 1);
      if (!w.every(valido)) return null;
      var s = w.reduce(function (a, b) { return a + b; }, 0);
      return modo === 'media' ? s / n : s;
    });
  }
  function dividir(a, f) { return a.map(function (x) { return valido(x) ? f(x) : null; }); }
  var VARIABLES = [
    { id: 'lluvia', g: 'Agua', n: 'Lluvia diaria', u: 'mm', d: 1, t: 'barras', suma: true, f: function (D) { return D.precipitation_sum; }, desc: 'Lluvia acumulada en el día.' },
    { id: 'lluvia7', g: 'Agua', n: 'Lluvia acumulada de 7 días (móvil)', u: 'mm', d: 1, t: 'linea', f: function (D) { return movil(D.precipitation_sum, 7, 'suma'); }, desc: 'Suma de la lluvia del día y los 6 anteriores: muestra si la semana ha sido húmeda o seca.' },
    { id: 'horasllu', g: 'Agua', n: 'Horas con lluvia', u: 'h', d: 0, t: 'barras', suma: true, f: function (D) { return D.precipitation_hours; }, desc: 'Número de horas del día con precipitación.' },
    { id: 'prob', g: 'Agua', n: 'Probabilidad de lluvia (máxima del día)', u: '%', d: 0, t: 'barras', f: function (D) { return D.precipitation_probability_max; }, desc: 'Solo existe para el pronóstico: los días pasados no tienen probabilidad.' },
    { id: 'et0', g: 'Agua', n: 'Evapotranspiración de referencia (ET0)', u: 'mm', d: 1, t: 'linea', suma: true, f: function (D) { return D.et0_fao_evapotranspiration; }, desc: 'Agua que perdería un cultivo de referencia bien regado (FAO-56 Penman-Monteith). Es la «evapotranspiración potencial» del día; multiplíquela por el coeficiente de cultivo (Kc) para estimar el uso real.' },
    { id: 'balance', g: 'Agua', n: 'Balance hídrico diario (lluvia − ET0)', u: 'mm', d: 1, t: 'barras', suma: true, f: function (D) { return D.precipitation_sum.map(function (p, i) { return valido(p) && valido(D.et0_fao_evapotranspiration[i]) ? p - D.et0_fao_evapotranspiration[i] : null; }); }, desc: 'Positivo: la lluvia supera lo que el cultivo de referencia consume; negativo: hay déficit y puede hacer falta riego. Es un cálculo simple, sin suelo ni escorrentía.' },
    { id: 'gaussen', g: 'Agua', n: 'Índice de Gaussen (30 días móviles)', u: '', d: 2, t: 'linea', ref: 1, refEtq: '1 = límite seco / húmedo', f: function (D) {
      var P = movil(D.precipitation_sum, 30, 'suma'), T = movil(D.temperature_2m_mean, 30, 'media');
      return P.map(function (p, i) { return valido(p) && valido(T[i]) && T[i] > 0 ? p / (2 * T[i]) : null; });
    }, desc: 'Criterio de Bagnouls–Gaussen: un periodo es seco cuando la lluvia (mm) es menor o igual al doble de la temperatura media (°C), P ≤ 2T. Aquí se calcula con los 30 días anteriores a cada fecha: índice = P / (2T). Menor a 1: seco · mayor a 1: húmedo.' },
    { id: 'tmax', g: 'Temperatura', n: 'Temperatura máxima', u: '°C', d: 1, t: 'linea', f: function (D) { return D.temperature_2m_max; }, desc: 'Máxima del día a 2 m de altura.' },
    { id: 'tmin', g: 'Temperatura', n: 'Temperatura mínima', u: '°C', d: 1, t: 'linea', f: function (D) { return D.temperature_2m_min; }, desc: 'Mínima del día a 2 m de altura.' },
    { id: 'tmed', g: 'Temperatura', n: 'Temperatura media', u: '°C', d: 1, t: 'linea', f: function (D) { return D.temperature_2m_mean; }, desc: 'Promedio de las 24 horas.' },
    { id: 'rocio', g: 'Temperatura', n: 'Punto de rocío medio', u: '°C', d: 1, t: 'linea', f: function (D) { return D.dew_point_2m_mean; }, desc: 'Temperatura a la que el aire se satura y se forma rocío: cuanto más cerca de la mínima nocturna, más probable el mojado de las hojas.' },
    { id: 'hr', g: 'Aire', n: 'Humedad relativa media', u: '%', d: 0, t: 'linea', f: function (D) { return D.relative_humidity_2m_mean; }, desc: 'Promedio de la humedad relativa del aire en el día.' },
    { id: 'vpd', g: 'Aire', n: 'Déficit de presión de vapor (máximo)', u: 'kPa', d: 2, t: 'linea', f: function (D) { return D.vapour_pressure_deficit_max; }, desc: 'Qué tan «sediento» está el aire. Valores altos (> 1,5 kPa) aumentan la demanda de agua y el estrés; muy bajos favorecen enfermedades.' },
    { id: 'viento', g: 'Aire', n: 'Viento máximo', u: 'km/h', d: 0, t: 'linea', f: function (D) { return D.wind_speed_10m_max; }, desc: 'Velocidad máxima del viento a 10 m en el día.' },
    { id: 'rafaga', g: 'Aire', n: 'Ráfaga máxima', u: 'km/h', d: 0, t: 'linea', f: function (D) { return D.wind_gusts_10m_max; }, desc: 'Ráfaga máxima del día a 10 m.' },
    { id: 'brillo', g: 'Sol y nubes', n: 'Brillo solar (horas de sol efectivas)', u: 'h', d: 1, t: 'barras', f: function (D) { return dividir(D.sunshine_duration, function (s) { return s / 3600; }); }, desc: 'Horas del día con sol directo (radiación directa suficiente), es decir, sin nubes que lo tapen.' },
    { id: 'duracion', g: 'Sol y nubes', n: 'Duración del día (horas de luz)', u: 'h', d: 2, t: 'linea', f: function (D) { return dividir(D.daylight_duration, function (s) { return s / 3600; }); }, desc: 'Horas entre la salida y la puesta del sol (fotoperiodo). En la zona ecuatorial casi no cambia durante el año.' },
    { id: 'pctsol', g: 'Sol y nubes', n: 'Fracción de sol (brillo ÷ duración del día)', u: '%', d: 0, t: 'barras', f: function (D) { return D.sunshine_duration.map(function (s, i) { return valido(s) && D.daylight_duration[i] ? 100 * s / D.daylight_duration[i] : null; }); }, desc: 'Qué parte del día hubo sol efectivo.' },
    { id: 'rad', g: 'Sol y nubes', n: 'Radiación solar (suma del día)', u: 'MJ/m²', d: 1, t: 'linea', f: function (D) { return D.shortwave_radiation_sum; }, desc: 'Energía solar total recibida en el día; impulsa la fotosíntesis y la evapotranspiración.' },
    { id: 'nub', g: 'Sol y nubes', n: 'Nubosidad media', u: '%', d: 0, t: 'linea', f: function (D) { return D.cloud_cover_mean; }, desc: 'Porcentaje medio del cielo cubierto de nubes.' },
    { id: 'uv', g: 'Sol y nubes', n: 'Índice UV máximo', u: '', d: 1, t: 'linea', f: function (D) { return D.uv_index_max; }, desc: 'Radiación ultravioleta máxima del día (≥ 8 muy alto; ≥ 11 extremo).' }
  ];
  function pintarExplorador(om) {
    var grupos = [], porGrupo = {};
    VARIABLES.forEach(function (v) { if (!porGrupo[v.g]) { porGrupo[v.g] = []; grupos.push(v.g); } porGrupo[v.g].push(v); });
    var guardada = leerAlmacen() || {}, sel = guardada.variable || 'lluvia';
    $('sec-explorar').innerHTML = '<h2 id="t-exp">Explorar otras variables</h2><p class="sub">Elija una variable para ver cómo ha evolucionado (hasta «hoy»: análisis del modelo) y cómo se pronostica.</p>'
      + '<div class="exp-controles"><div class="campo"><label for="var-sel">Variable</label><select id="var-sel">'
      + grupos.map(function (g) { return '<optgroup label="' + esc(g) + '">' + porGrupo[g].map(function (v) { return '<option value="' + v.id + '"' + (v.id === sel ? ' selected' : '') + '>' + esc(v.n) + (v.u ? ' (' + esc(v.u) + ')' : '') + '</option>'; }).join('') + '</optgroup>'; }).join('')
      + '</select></div><div class="campo"><label for="var-rango">Periodo</label><select id="var-rango"><option value="14">14 días + pronóstico</option><option value="30">30 días + pronóstico</option><option value="60">60 días + pronóstico</option></select></div></div>'
      + '<p class="exp-desc" id="exp-desc"></p><div class="grafica" id="exp-grafica"></div><div class="datos" id="exp-datos"></div>';
    $('var-sel').addEventListener('change', function () { var g = leerAlmacen() || {}; g.variable = $('var-sel').value; guardarAlmacen(g); actualizarExplorador(); });
    $('var-rango').addEventListener('change', actualizarExplorador);
    actualizarExplorador();
  }
  function actualizarExplorador() {
    var om = estado.om;
    if (!om || !$('var-sel')) return;
    var v = VARIABLES.filter(function (x) { return x.id === $('var-sel').value; })[0] || VARIABLES[0];
    var D = om.daily, i0 = indiceHoy(om), rango = parseInt($('var-rango').value, 10);
    var ini = Math.max(i0 - rango, 0), fin = D.time.length, serie = v.f(D).slice(ini, fin), hoy = i0 - ini;
    var etiq = D.time.slice(ini, fin).map(etiquetaFecha), paso = rango >= 60 ? 6 : rango >= 30 ? 4 : 3;
    var u = v.u ? ' ' + v.u : '';
    $('exp-desc').innerHTML = '<strong>' + esc(v.n) + '.</strong> ' + esc(v.desc);
    $('exp-grafica').innerHTML = '<h3>' + esc(v.n) + (v.u ? ' (' + esc(v.u) + ')' : '') + '</h3>'
      + (v.t === 'barras' ? grafBarras(etiq, serie, { unidad: v.u, dec: v.d, pron: hoy + 1, hoy: hoy, paso: paso, etiquetaHoy: 'hoy' })
        : grafLineas(etiq, [{ nombre: v.n, v: serie, linea: 'l-var', punto: 'p-var' }], { unidad: v.u, hoy: hoy, paso: paso, ref: v.ref, refEtq: v.refEtq, cero: v.id === 'uv' || v.id === 'viento' || v.id === 'rafaga' }))
      + '<p class="leyenda"><span><i style="background:var(--frac)"></i>Pasado (análisis del modelo)</span><span><i style="background:var(--frac);opacity:.45"></i>Pronóstico (después de «hoy»)</span></p>';
    var pas = serie.slice(0, hoy + 1).filter(valido), pro = serie.slice(hoy + 1).filter(valido), hoyV = serie[hoy];
    function media(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
    function fmt(x) { return x === null || x === undefined ? '—' : num(x, v.d); }
    var datos = dato('Hoy', fmt(hoyV), v.u) + dato('Promedio del pasado', fmt(media(pas)), v.u) + dato('Mínimo del pasado', fmt(pas.length ? Math.min.apply(null, pas) : null), v.u) + dato('Máximo del pasado', fmt(pas.length ? Math.max.apply(null, pas) : null), v.u);
    if (v.suma) datos += dato('Suma del pasado', fmt(pas.reduce(function (s, x) { return s + x; }, 0)), v.u) + dato('Suma pronosticada', fmt(pro.reduce(function (s, x) { return s + x; }, 0)), v.u);
    else if (pro.length) datos += dato('Promedio del pronóstico', fmt(media(pro)), v.u);
    if (v.id === 'gaussen' && valido(hoyV)) datos += dato('Hoy se considera', hoyV < 1 ? 'periodo seco' : 'periodo húmedo', '');
    $('exp-datos').innerHTML = datos;
  }

  function pintarModelos(datos) {
    if (!datos) { $('sec-modelos').innerHTML = '<h2 id="t-mod">Comparación de modelos</h2><p class="nota">No se pudo consultar la comparación de modelos.</p>'; return; }
    var d = datos.daily, hoy = d.time[0];
    var html = '<h2 id="t-mod">Lluvia prevista según cada modelo (mm)</h2><p class="sub">Cuando los modelos discrepan, la incertidumbre es alta: tome la lluvia como un rango, no como un valor.</p><div class="tabla-scroll"><table class="tabla"><thead><tr><th>Modelo</th>';
    d.time.forEach(function (t, i) { var f = new Date(t + 'T12:00:00'); html += '<th class="num">' + (t === hoy ? 'hoy' : DIAS[f.getDay()] + ' ' + f.getDate()) + '</th>'; });
    html += '</tr></thead><tbody>';
    MODELOS.forEach(function (m) {
      var serie = d['precipitation_sum_' + m[0]]; if (!serie) return;
      html += '<tr><td>' + esc(m[1]) + '</td>' + serie.map(function (x) { return '<td class="num">' + num(x, 1) + '</td>'; }).join('') + '</tr>';
    });
    $('sec-modelos').innerHTML = html + '</tbody></table></div>';
  }

  /* ---------------- IDEAM ---------------- */
  function estacionesCercanas(lat, lng, n, maxKm) {
    return estado.estaciones.map(function (e) { return { codigo: e[0], nombre: e[1], categoria: e[2], alt: e[3], lat: e[4], lng: e[5], municipio: e[6], depto: e[7], km: distanciaKm(lat, lng, e[4], e[5]) }; })
      .filter(function (e) { return e.km <= maxKm; }).sort(function (a, b) { return a.km - b.km; }).slice(0, n);
  }
  function leerDataset(id, codigo) {
    var desde = fechaBogota(-3) + 'T00:00:00';   // 3 días: cubre «ayer» aunque IDEAM publique con retraso
    var url = 'https://www.datos.gov.co/resource/' + id + '.json?$where=' + encodeURIComponent("codigoestacion='" + codigo + "' AND fechaobservacion>='" + desde + "'") + '&$order=' + encodeURIComponent('fechaobservacion DESC') + '&$limit=1000&$select=' + encodeURIComponent('fechaobservacion,valorobservado,descripcionsensor,unidadmedida');
    return pedir(url, 30000).catch(function () { return null; });
  }
  function resumirSensores(filas, esLluvia) {
    var por = {};
    (filas || []).forEach(function (f) { var k = f.descripcionsensor || '—'; (por[k] = por[k] || []).push(f); });
    return Object.keys(por).map(function (k) {
      var r = por[k], ult = r[0], t0 = new Date(ult.fechaobservacion).getTime(), v = r.filter(function (x) { return t0 - new Date(x.fechaobservacion).getTime() <= 86400000; }).map(function (x) { return parseFloat(x.valorobservado); }).filter(isFinite);
      return { sensor: k, ultimo: parseFloat(ult.valorobservado), unidad: ult.unidadmedida || '', fecha: ult.fechaobservacion.replace('T', ' ').slice(0, 16),
        suma: v.reduce(function (a, b) { return a + b; }, 0), max: Math.max.apply(null, v), min: Math.min.apply(null, v), n: v.length, lluvia: esLluvia, filas: r };
    });
  }
  function leerEstacion(e) {
    return Promise.all([leerDataset(DATASETS.precip, e.codigo), leerDataset(DATASETS.temp, e.codigo), leerDataset(DATASETS.humedad, e.codigo)]).then(function (r) {
      return { est: e, precip: resumirSensores(r[0], true), temp: resumirSensores(r[1], false), humedad: resumirSensores(r[2], false), fallo: !r[0] && !r[1] && !r[2] };
    });
  }
  function pintarIdeam(lecturas, cercanas, elevModelo) {
    var con = lecturas.filter(function (l) { return l.precip.length || l.temp.length || l.humedad.length; });
    var html = '<h2 id="t-ideam">Estación IDEAM más cercana</h2><p class="sub">Lecturas medidas (no modelo). IDEAM las publica con retraso de hasta un día; la hora es la de la estación.</p>';
    if (!cercanas.length) { $('sec-ideam').innerHTML = html + '<p class="nota">No hay estaciones automáticas del IDEAM a menos de 60 km de este punto.</p>'; return cercanas; }
    if (!con.length) {
      html += '<p class="nota">Ninguna de las ' + cercanas.length + ' estaciones más cercanas (' + cercanas.map(function (e) { return esc(e.nombre); }).join(', ') + ') tiene lecturas publicadas en datos.gov.co o el servicio no respondió. Inténtelo más tarde.</p>';
      $('sec-ideam').innerHTML = html; return [];
    }
    con.slice(0, 2).forEach(function (l) {
      var e = l.est, dif = (e.alt !== null && elevModelo !== null && elevModelo !== undefined) ? e.alt - elevModelo : null;
      html += '<div class="estacion"><h3>' + esc(e.nombre) + '</h3><p class="meta">' + esc(e.municipio) + ', ' + esc(e.depto) + ' · ' + esc(e.categoria) + ' · ' + num(e.km, 1) + ' km · ' + (e.alt ? num(e.alt, 0) + ' m' : 'altitud sin dato')
        + (dif !== null && Math.abs(dif) >= 100 ? ' · ' + (dif > 0 ? '+' : '') + num(dif, 0) + ' m respecto al punto (~' + num(Math.abs(dif) * 0.0065, 1) + ' °C de diferencia esperada)' : '') + '</p>'
        + '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Variable</th><th class="num">Último valor</th><th>Hora</th><th class="num">Últimas 24 h</th></tr></thead><tbody>';
      l.precip.forEach(function (s) { html += '<tr><td>Lluvia</td><td class="num">' + num(s.ultimo, 1) + ' ' + esc(s.unidad) + '</td><td>' + esc(s.fecha) + '</td><td class="num">' + num(s.suma, 1) + ' mm</td></tr>'; });
      l.temp.forEach(function (s) { html += '<tr><td>' + esc(s.sensor.charAt(0) + s.sensor.slice(1).toLowerCase()) + '</td><td class="num">' + num(s.ultimo, 1) + ' ' + esc(s.unidad) + '</td><td>' + esc(s.fecha) + '</td><td class="num">' + num(s.min, 1) + ' – ' + num(s.max, 1) + '</td></tr>'; });
      l.humedad.forEach(function (s) { html += '<tr><td>' + esc(s.sensor.charAt(0) + s.sensor.slice(1).toLowerCase()) + '</td><td class="num">' + num(s.ultimo, 0) + ' ' + esc(s.unidad) + '</td><td>' + esc(s.fecha) + '</td><td class="num">' + num(s.min, 0) + ' – ' + num(s.max, 0) + '</td></tr>'; });
      html += '</tbody></table></div></div>';
    });
    $('sec-ideam').innerHTML = html;
    return con.map(function (l) { return l.est.codigo; });
  }

  /* ---------------- Consulta ---------------- */
  function consultarClima() {
    var p = (estado.lat !== null && estado.lng !== null) ? { lat: estado.lat, lng: estado.lng } : leerCampos();
    var campos = leerCampos();
    if (campos) p = campos;
    if (!p) { aviso('Escriba una latitud y una longitud válidas, elija una finca o haga clic en el mapa.', true); return; }
    estado.lat = p.lat; estado.lng = p.lng; pintarPunto(p.lat, p.lng, false);
    guardarAlmacen({ lat: p.lat, lng: p.lng, finca: $('finca').value || '' });
    try { history.replaceState(null, '', '?lat=' + p.lat + '&lng=' + p.lng); } catch (e) { /* sin historial */ }
    var seq = ++estado.secuencia;
    aviso('Consultando el clima…'); $('resultado').hidden = false;
    ['sec-ahora', 'sec-sanidad', 'sec-ideam', 'sec-pronostico', 'sec-graficas', 'sec-explorar', 'sec-modelos'].forEach(function (id) { $(id).innerHTML = '<p class="cargando-bloque">Cargando…</p>'; });
    estado.om = null; estado.ayerPrev = null; estado.ayerError = false; estado.obsAyer = null; estado.diaSel = null;

    var cercanas = enColombia(p.lat, p.lng) ? estacionesCercanas(p.lat, p.lng, 4, 60) : [];
    var elevModelo = null;

    var principal = pedir(urlOpenMeteo(p.lat, p.lng), 25000).then(function (om) {
      if (seq !== estado.secuencia) return;
      elevModelo = om.elevation;
      pintarAhora(om); pintarSanidad(om); pintarPronostico(om);
      pintarExplorador(om);
      pedir(urlAyer(p.lat, p.lng), 25000).then(function (a) { if (seq === estado.secuencia) { estado.ayerPrev = a; renderHora(); } }, function () { if (seq === estado.secuencia) { estado.ayerError = true; renderHora(); } });
      var d = om.daily, i0 = indiceHoy(om);
      pintarGraficas(d.time.slice(Math.max(i0 - 14, 0), i0 + 8), d.temperature_2m_max.slice(Math.max(i0 - 14, 0), i0 + 8), d.temperature_2m_min.slice(Math.max(i0 - 14, 0), i0 + 8), d.precipitation_sum.slice(Math.max(i0 - 14, 0), i0 + 8), Math.min(i0, 14), 'Fuente: Open-Meteo (análisis del modelo para los días pasados, pronóstico para los siguientes).');
      aviso('');
      return pedir(urlModelos(p.lat, p.lng), 25000).then(function (m) { if (seq === estado.secuencia) pintarModelos(m); }, function () { if (seq === estado.secuencia) pintarModelos(null); });
    }, function () {
      if (seq !== estado.secuencia) return;
      // Respaldo: NASA POWER (solo histórico diario).
      ['sec-ahora', 'sec-sanidad', 'sec-pronostico', 'sec-explorar', 'sec-modelos'].forEach(function (id) { $(id).innerHTML = ''; });
      $('sec-ahora').innerHTML = '<h2 id="t-ahora">Pronóstico no disponible</h2><p class="nota">Open-Meteo no respondió. Se muestra el histórico de NASA POWER; reintente en unos minutos para ver el pronóstico.</p>';
      return pedir(urlNasa(p.lat, p.lng), 30000).then(function (n) {
        if (seq !== estado.secuencia) return;
        var par = n.properties.parameter, fechas = Object.keys(par.PRECTOTCORR);
        function ok(x) { return x === -999 ? null : x; }
        pintarGraficas(fechas.map(function (f) { return f.slice(0, 4) + '-' + f.slice(4, 6) + '-' + f.slice(6); }), fechas.map(function (f) { return ok(par.T2M_MAX[f]); }), fechas.map(function (f) { return ok(par.T2M_MIN[f]); }), fechas.map(function (f) { return ok(par.PRECTOTCORR[f]) || 0; }), fechas.length - 1, 'Fuente: NASA POWER (respaldo, solo días pasados).');
        aviso('');
      }, function () { if (seq === estado.secuencia) { $('sec-graficas').innerHTML = ''; aviso('No se pudo consultar ninguna fuente de modelos. Revise la conexión e inténtelo de nuevo.', true); } });
    });

    if (cercanas.length) $('sec-ideam').innerHTML = '<h2 id="t-ideam">Estación IDEAM más cercana</h2><p class="cargando-bloque">Consultando ' + cercanas.length + ' estaciones del IDEAM (puede tardar hasta 30 s)…</p>';
    var ideam = Promise.all(cercanas.map(leerEstacion)).then(function (lecturas) {
      if (seq !== estado.secuencia) return;
      return principal.then(function () {
        if (seq !== estado.secuencia) return;
        var usadas = pintarIdeam(lecturas, cercanas, elevModelo);
        var conDatos = lecturas.filter(function (l) { return usadas && usadas.indexOf(l.est.codigo) >= 0; });
        if (conDatos.length && estado.om) { estado.obsAyer = construirObsAyer(conDatos[0], estado.om.daily.time[estado.i0 - 1]); renderHora(); }
        marcarEstaciones(cercanas, usadas || []);
      });
    }, function () { if (seq === estado.secuencia) $('sec-ideam').innerHTML = '<h2 id="t-ideam">Estación IDEAM más cercana</h2><p class="nota">No se pudo consultar el IDEAM.</p>'; });
    return Promise.all([principal, ideam]);
  }

  /* ---------------- Arranque ---------------- */
  function miUbicacion() {
    if (!navigator.geolocation) { aviso('Este navegador no ofrece ubicación.', true); return; }
    aviso('Buscando su ubicación…');
    navigator.geolocation.getCurrentPosition(function (pos) { aviso(''); fijarPunto(pos.coords.latitude, pos.coords.longitude, 'gps', true); },
      function () { aviso('No se pudo obtener la ubicación (permiso denegado o sin señal). Escriba las coordenadas o use el mapa.', true); }, { enableHighAccuracy: true, timeout: 15000 });
  }
  function arrancar() {
    iniciarMapa();
    $('finca').addEventListener('change', alElegirFinca);
    $('sec-sanidad').addEventListener('click', alternarDetalle);
    $('sec-pronostico').addEventListener('click', alElegirDia);
    $('consultar').addEventListener('click', function () { estado.lat = null; estado.lng = null; consultarClima(); });
    $('mi-ubicacion').addEventListener('click', miUbicacion);
    ['lat', 'lng'].forEach(function (id) { $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') { estado.lat = null; estado.lng = null; consultarClima(); } }); });

    var fin = [
      pedir('fincas.json', 15000).then(function (d) { estado.fincas = d.fincas || []; }, function () { estado.fincas = []; }),
      pedir('estaciones.json', 30000).then(function (d) { estado.estaciones = d.estaciones || []; }, function () { estado.estaciones = []; aviso('No se pudo cargar el catálogo de estaciones IDEAM; se mostrará solo el pronóstico.', true); })
    ];
    Promise.all(fin).then(function () {
      llenarFincas();
      var q = new URLSearchParams(location.search), ultimo = leerAlmacen();
      var lat = parseFloat(q.get('lat')), lng = parseFloat(q.get('lng')), f = q.get('finca');
      if (f) { $('finca').value = f; if ($('finca').value === f) { alElegirFinca(); return; } }
      if (esPunto(lat, lng)) { fijarPunto(lat, lng, 'url', true); return; }
      if (ultimo && ultimo.finca) { $('finca').value = ultimo.finca; if ($('finca').value === ultimo.finca) { var fc = estado.fincas.filter(function (x) { return x.id === ultimo.finca; })[0]; var c = fc && analizarCoordenadas(fc.coordenadas); if (c) { alElegirFinca(); return; } } }
      if (ultimo && esPunto(ultimo.lat, ultimo.lng)) { fijarPunto(ultimo.lat, ultimo.lng, 'guardado', true); return; }
      fijarPunto(CENTRO[0], CENTRO[1], 'inicio', true);   // Cachipay por defecto
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})();
