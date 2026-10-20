// Panel local en http://192.168.4.1, servido por el ESP32 desde su propia red.
// Sirve de respaldo cuando no hay internet: la simulación se lanza sin pasar por la web.
#pragma once

const char PANEL_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maqueta SismoCol</title>
<style>
body { font-family: Arial, sans-serif; background: #edf2f7; color: #17365d; text-align: center; margin: 0; padding: 18px; }
.card { background: white; max-width: 450px; margin: auto; padding: 22px; border-radius: 16px; box-shadow: 0 3px 12px #0002; }
h1 { font-size: 27px; }
input { box-sizing: border-box; width: 100%; padding: 12px; font-size: 28px; text-align: center; margin: 8px 0 14px; }
button { width: 100%; padding: 14px; border: none; border-radius: 8px; font-size: 17px; font-weight: bold; color: white; margin-bottom: 10px; }
.iniciar { background: #16834a; }
.detener { background: #c62828; }
.panel { margin-top: 15px; padding: 14px; border-radius: 10px; background: #eef5ff; }
.estado { font-size: 18px; font-weight: bold; }
small { color: #526780; }
</style>
</head>
<body>
<div class="card">
  <h1>MAQUETA DE SISMO</h1>
  <p>Magnitud de 2,0 a 8,0</p>
  <form id="formSismo">
    <input id="mag" type="number" min="2" max="8" step="0.1" value="5" required>
    <button class="iniciar" type="submit">INICIAR SISMO</button>
  </form>
  <button class="detener" id="btnDetener">DETENER TODO</button>

  <div class="panel">
    <p>Magnitud actual</p>
    <div class="estado" id="magnitud">0</div>
    <p>Estado</p>
    <div class="estado" id="estado">Motores detenidos</div>
    <p>Movimiento: <b id="fase">Detenido</b></p>
    <p>Origen: <b id="origen">-</b> · Quedan: <b id="restante">0</b> s</p>
    <p>Internet: <b id="internet">-</b> · Web SismoCol: <b id="mqtt">-</b></p>
  </div>

  <p><small>
    Magnitudes 2–5,9: solo vibración.<br>
    Magnitudes 6–8: movimiento de ida y vuelta.<br>
    Las simulaciones enviadas desde la web también aparecen aquí.
  </small></p>
</div>

<script>
const $ = (id) => document.getElementById(id);

$('formSismo').addEventListener('submit', async function(e) {
  e.preventDefault();
  const mag = Number($('mag').value);
  if (!(mag >= 2 && mag <= 8)) {
    alert('Introduzca una magnitud entre 2 y 8');
    return;
  }
  try {
    const r = await fetch('/iniciar?mag=' + mag);
    const d = await r.json();
    if (!r.ok) alert(d.mensaje || 'Error al iniciar');
    actualizar();
  } catch (e) {
    alert('No se pudo comunicar con el ESP32');
  }
});

$('btnDetener').addEventListener('click', async function() {
  try {
    await fetch('/detener');
    actualizar();
  } catch (e) {
    alert('No se pudo comunicar con el ESP32');
  }
});

async function actualizar() {
  try {
    const d = await (await fetch('/estado')).json();
    $('magnitud').textContent = d.magnitud.toFixed(1);
    $('estado').textContent = d.estado;
    $('fase').textContent = d.fase;
    $('origen').textContent = d.origen;
    $('restante').textContent = Math.ceil(d.restanteMs / 1000);
    $('internet').textContent = d.wifi ? 'conectado' : 'sin conexión';
    $('mqtt').textContent = d.mqtt ? 'conectada' : 'sin conexión';
  } catch (e) {}
}

setInterval(actualizar, 500);
actualizar();
</script>
</body>
</html>
)HTML";
