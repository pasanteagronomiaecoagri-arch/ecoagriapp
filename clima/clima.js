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
    return base + '&past_days=14&forecast_days=8'
      + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,vapour_pressure_deficit,soil_moisture_0_to_1cm'
      + '&hourly=temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,wind_speed_10m_max,shortwave_radiation_sum';
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

  function pintarSanidad(om) {
    var h = om.hourly, ahora = h.time.indexOf(om.current.time.slice(0, 13) + ':00');
    if (ahora < 0) ahora = h.time.findIndex(function (t) { return t > om.current.time; }) - 1;
    var l24 = sumar(h.precipitation, ahora - 23, ahora + 1), l72 = sumar(h.precipitation, ahora - 71, ahora + 1), p48 = sumar(h.precipitation, ahora + 1, ahora + 49);
    var hr = 0, hrPasada = 0;
    for (var i = ahora + 1; i < Math.min(ahora + 49, h.time.length); i++) if (h.relative_humidity_2m[i] >= 90) hr++;
    for (var j = Math.max(ahora - 23, 0); j <= ahora; j++) if (h.relative_humidity_2m[j] >= 90) hrPasada++;
    // Ventanas de aplicación: horas diurnas (6–17 h) sin lluvia prevista y con viento suave.
    var ventanas = [], inicio = null;
    for (var k = ahora + 1; k <= Math.min(ahora + 48, h.time.length - 1); k++) {
      var hora = parseInt(h.time[k].slice(11, 13), 10);
      var buena = hora >= 6 && hora <= 17 && (h.precipitation[k] || 0) < 0.1 && (h.precipitation_probability[k] === null || h.precipitation_probability[k] < 30) && (h.wind_speed_10m[k] || 0) < 15;
      if (buena && inicio === null) inicio = k;
      if ((!buena || k === Math.min(ahora + 48, h.time.length - 1)) && inicio !== null) {
        var fin = buena ? k : k - 1;
        if (fin - inicio + 1 >= 2) ventanas.push([inicio, fin]);
        inicio = null;
      }
    }
    function rango(v) {
      var d = new Date(h.time[v[0]]), dia = DIAS[d.getDay()];
      return dia + ' ' + h.time[v[0]].slice(11, 13) + '–' + String(parseInt(h.time[v[1]].slice(11, 13), 10) + 1).padStart(2, '0') + ' h';
    }
    var estadoHongos = hr >= 20 ? ['alerta', 'Alto'] : hr >= 10 ? ['aviso', 'Medio'] : ['ok', 'Bajo'];
    $('sec-sanidad').innerHTML = '<h2 id="t-sanidad">Para sanidad vegetal</h2><p class="sub">Calculado con el pronóstico por hora del modelo.</p>'
      + '<ul class="lista-indicadores">'
      + '<li><span>Lluvia últimas 24 h / 72 h</span><b>' + num(l24, 1) + ' / ' + num(l72, 1) + ' mm</b></li>'
      + '<li><span>Lluvia prevista próximas 48 h</span><b>' + num(p48, 1) + ' mm</b></li>'
      + '<li><span>Horas con humedad ≥ 90 % (24 h atrás / 48 h adelante)</span><b>' + hrPasada + ' / ' + hr + ' h</b></li>'
      + '<li><span>Condiciones que favorecen hongos</span><span class="pastilla ' + estadoHongos[0] + '">' + estadoHongos[1] + '</span></li>'
      + '</ul>'
      + '<p class="ventanas"><strong>Franjas para aplicar</strong> (próximas 48 h, de día, sin lluvia prevista y viento &lt; 15 km/h):<br>'
      + (ventanas.length ? ventanas.slice(0, 6).map(function (v) { return '<span>' + esc(rango(v)) + '</span>'; }).join('') : 'No hay franjas de 2 h o más que cumplan las condiciones.') + '</p>'
      + '<p class="nota">Orientativo: confirme con la lectura en campo y las condiciones de cada producto.</p>';
  }

  function pintarPronostico(om) {
    var d = om.daily, hoy = om.current.time.slice(0, 10), i0 = d.time.indexOf(hoy);
    if (i0 < 0) i0 = 14;
    var html = '<h2 id="t-pron">Pronóstico de 7 días</h2><p class="sub">Temperatura máxima / mínima, lluvia acumulada, probabilidad y evapotranspiración de referencia (ET0).</p><div class="dias">';
    for (var i = i0; i < Math.min(i0 + 7, d.time.length); i++) {
      var f = new Date(d.time[i] + 'T12:00:00'), cond = condicion(d.weather_code[i]);
      html += '<div class="dia' + (i === i0 ? ' hoy' : '') + '"><div class="nombre">' + (i === i0 ? 'hoy' : DIAS[f.getDay()] + ' ' + f.getDate()) + '</div>' + icono(cond[1])
        + '<div class="t">' + num(d.temperature_2m_max[i], 0) + '° <i>/ ' + num(d.temperature_2m_min[i], 0) + '°</i></div>'
        + '<div class="l">' + num(d.precipitation_sum[i], 1) + ' mm · ' + num(d.precipitation_probability_max[i], 0) + ' %</div>'
        + '<div class="et">ET0 ' + num(d.et0_fao_evapotranspiration[i], 1) + ' mm</div></div>';
    }
    $('sec-pronostico').innerHTML = html + '</div>';
  }

  function pintarGraficas(fechas, tmax, tmin, lluvia, indiceHoy, fuente) {
    var html = '<h2 id="t-graf">Últimos 14 días y próximos 7</h2><p class="sub">' + esc(fuente) + '</p>';
    html += '<div class="grafica"><h3>Lluvia diaria (mm)</h3>' + graficaBarras(fechas, lluvia, indiceHoy) + '<p class="leyenda"><span><i style="background:var(--frac)"></i>Observado/analizado</span><span><i style="background:var(--frac);opacity:.45"></i>Pronóstico</span></p></div>';
    html += '<div class="grafica"><h3>Temperatura máxima y mínima (°C)</h3>' + graficaLineas(fechas, tmax, tmin, indiceHoy) + '<p class="leyenda"><span><i style="background:var(--alerta)"></i>Máxima</span><span><i style="background:var(--frac)"></i>Mínima</span></p></div>';
    var acumulado = sumar(lluvia, Math.max(indiceHoy - 13, 0), indiceHoy + 1), acum7 = sumar(lluvia, indiceHoy + 1, indiceHoy + 8);
    html += '<p class="nota">Lluvia acumulada en los últimos 14 días (hasta hoy): <strong>' + num(acumulado, 1) + ' mm</strong> · prevista en los próximos 7 días: <strong>' + num(acum7, 1) + ' mm</strong>.</p>';
    $('sec-graficas').innerHTML = html;
  }
  function etiquetaFecha(f) { var d = new Date(f + 'T12:00:00'); return d.getDate() + '/' + (d.getMonth() + 1); }
  function graficaBarras(fechas, v, hoy) {
    var W = 760, H = 210, ml = 36, mr = 8, mt = 14, mb = 26, n = v.length, max = 5;
    v.forEach(function (x) { if (x > max) max = x; });
    max = Math.ceil(max / 5) * 5;
    var ancho = (W - ml - mr) / n, svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Lluvia diaria en milímetros">';
    for (var g = 0; g <= 4; g++) {
      var y = mt + (H - mt - mb) * g / 4;
      svg += '<line class="rejilla" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (ml - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + num(max * (1 - g / 4), 0) + '</text>';
    }
    v.forEach(function (x, i) {
      var h = (H - mt - mb) * (x || 0) / max, xx = ml + i * ancho + 2;
      svg += '<rect class="' + (i > hoy ? 'barra-pron' : 'barra-obs') + '" x="' + xx + '" y="' + (H - mb - h) + '" width="' + Math.max(ancho - 4, 2) + '" height="' + h + '"><title>' + esc(etiquetaFecha(fechas[i]) + ': ' + num(x, 1) + ' mm') + '</title></rect>';
      if (i % 3 === 0 || i === n - 1) svg += '<text x="' + (xx + (ancho - 4) / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + etiquetaFecha(fechas[i]) + '</text>';
    });
    var xh = ml + (hoy + 0.5) * ancho;
    svg += '<line class="eje" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (H - mb) + '" y2="' + (H - mb) + '"/><line class="hoy-linea" x1="' + xh + '" x2="' + xh + '" y1="' + mt + '" y2="' + (H - mb) + '"/><text class="hoy-txt" x="' + (xh + 4) + '" y="' + (mt + 8) + '">hoy</text></svg>';
    return svg;
  }
  function graficaLineas(fechas, a, b, hoy) {
    var W = 760, H = 210, ml = 36, mr = 8, mt = 14, mb = 26, n = a.length;
    var todos = a.concat(b).filter(function (x) { return x !== null && x !== undefined; });
    var mn = Math.floor(Math.min.apply(null, todos) - 1), mx = Math.ceil(Math.max.apply(null, todos) + 1);
    function X(i) { return ml + (i + 0.5) * (W - ml - mr) / n; }
    function Y(x) { return mt + (H - mt - mb) * (1 - (x - mn) / (mx - mn)); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Temperatura máxima y mínima diaria">';
    for (var g = 0; g <= 4; g++) {
      var val = mn + (mx - mn) * g / 4, y = Y(val);
      svg += '<line class="rejilla" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (ml - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + num(val, 0) + '</text>';
    }
    function linea(v, clase, punto) {
      var pts = v.map(function (x, i) { return x === null || x === undefined ? null : X(i).toFixed(1) + ',' + Y(x).toFixed(1); }).filter(Boolean).join(' ');
      var s = '<polyline class="' + clase + '" points="' + pts + '"/>';
      v.forEach(function (x, i) { if (x !== null && x !== undefined) s += '<circle class="' + punto + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(x).toFixed(1) + '" r="2.6"><title>' + esc(etiquetaFecha(fechas[i]) + ': ' + num(x, 1) + ' °C') + '</title></circle>'; });
      return s;
    }
    svg += linea(a, 'l-max', 'p-max') + linea(b, 'l-min', 'p-min');
    fechas.forEach(function (f, i) { if (i % 3 === 0 || i === n - 1) svg += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + etiquetaFecha(f) + '</text>'; });
    svg += '<line class="eje" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (H - mb) + '" y2="' + (H - mb) + '"/><line class="hoy-linea" x1="' + X(hoy) + '" x2="' + X(hoy) + '" y1="' + mt + '" y2="' + (H - mb) + '"/><text class="hoy-txt" x="' + (X(hoy) + 4) + '" y="' + (mt + 8) + '">hoy</text></svg>';
    return svg;
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
    var url = 'https://www.datos.gov.co/resource/' + id + '.json?$where=' + encodeURIComponent("codigoestacion='" + codigo + "'") + '&$order=' + encodeURIComponent('fechaobservacion DESC') + '&$limit=200&$select=' + encodeURIComponent('fechaobservacion,valorobservado,descripcionsensor,unidadmedida');
    return pedir(url, 30000).catch(function () { return null; });
  }
  function resumirSensores(filas, esLluvia) {
    var por = {};
    (filas || []).forEach(function (f) { var k = f.descripcionsensor || '—'; (por[k] = por[k] || []).push(f); });
    return Object.keys(por).map(function (k) {
      var r = por[k], ult = r[0], t0 = new Date(ult.fechaobservacion).getTime(), v = r.filter(function (x) { return t0 - new Date(x.fechaobservacion).getTime() <= 86400000; }).map(function (x) { return parseFloat(x.valorobservado); }).filter(isFinite);
      return { sensor: k, ultimo: parseFloat(ult.valorobservado), unidad: ult.unidadmedida || '', fecha: ult.fechaobservacion.replace('T', ' ').slice(0, 16),
        suma: v.reduce(function (a, b) { return a + b; }, 0), max: Math.max.apply(null, v), min: Math.min.apply(null, v), n: v.length, lluvia: esLluvia };
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
    ['sec-ahora', 'sec-sanidad', 'sec-ideam', 'sec-pronostico', 'sec-graficas', 'sec-modelos'].forEach(function (id) { $(id).innerHTML = '<p class="cargando-bloque">Cargando…</p>'; });

    var cercanas = enColombia(p.lat, p.lng) ? estacionesCercanas(p.lat, p.lng, 4, 60) : [];
    var elevModelo = null;

    var principal = pedir(urlOpenMeteo(p.lat, p.lng), 25000).then(function (om) {
      if (seq !== estado.secuencia) return;
      elevModelo = om.elevation;
      pintarAhora(om); pintarSanidad(om); pintarPronostico(om);
      var d = om.daily, i0 = d.time.indexOf(om.current.time.slice(0, 10)); if (i0 < 0) i0 = 14;
      pintarGraficas(d.time.slice(Math.max(i0 - 14, 0), i0 + 8), d.temperature_2m_max.slice(Math.max(i0 - 14, 0), i0 + 8), d.temperature_2m_min.slice(Math.max(i0 - 14, 0), i0 + 8), d.precipitation_sum.slice(Math.max(i0 - 14, 0), i0 + 8), Math.min(i0, 14), 'Fuente: Open-Meteo (análisis del modelo para los días pasados, pronóstico para los siguientes).');
      aviso('');
      return pedir(urlModelos(p.lat, p.lng), 25000).then(function (m) { if (seq === estado.secuencia) pintarModelos(m); }, function () { if (seq === estado.secuencia) pintarModelos(null); });
    }, function () {
      if (seq !== estado.secuencia) return;
      // Respaldo: NASA POWER (solo histórico diario).
      ['sec-ahora', 'sec-sanidad', 'sec-pronostico', 'sec-modelos'].forEach(function (id) { $(id).innerHTML = ''; });
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
