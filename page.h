#pragma once
#include <Arduino.h>

const char DASHBOARD_PAGE[] PROGMEM = R"rawliteral(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plant watering and ventilation</title>
<style>
:root{--bg:#F7F7F5;--card:#FFFFFF;--border:#E5E5E0;--text:#1C1C1C;--muted:#6B6B66}
@media(prefers-color-scheme:dark){:root{--bg:#141413;--card:#1D1D1B;--border:#2E2E2B;--text:#F0EFEA;--muted:#9A9A93}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:auto;padding:20px 16px}
h1{font-size:22px;font-weight:600}
h2{font-size:17px}
.live,p small,footer,.label{color:var(--muted);font-size:13px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#777;margin-right:6px}
.dot.on{background:#2E7D32}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
.card{border:1px solid var(--border);border-radius:12px;background:var(--card);padding:16px;min-height:136px}
.value{font-size:36px;font-weight:600;font-variant-numeric:tabular-nums}
.value small{font-size:16px}
.context{font-size:13px;color:var(--muted)}
.controls{display:flex;flex-wrap:wrap;gap:8px}
button{min-height:44px;border:1px solid var(--border);border-radius:8px;padding:10px 14px;background:var(--card);color:var(--text);font:inherit;cursor:pointer}
button.primary{background:#E28C65;color:#1C1C1C}
#message{min-height:44px}
footer{margin-top:24px}
</style>
</head>
<body><main>
<h1>Plant watering and ventilation</h1>
<div class="live"><span id="dot" class="dot"></span><span id="live">Connecting</span></div>
<div class="grid">
<section class="card"><div class="label">Soil moisture</div><div class="value"><span id="soil">--</span><small> %</small></div><div class="context" id="soilraw">ADC --</div></section>
<section class="card"><div class="label">Gas relative level</div><div class="value"><span id="gas">--</span><small> %</small></div><div class="context" id="gasraw">ADC --</div></section>
<section class="card"><div class="label">Controller</div><div id="mode">--</div><div class="context" id="outputs">Pump -- / fans --</div><div class="context" id="soak">Soak --</div></section>
</div>
<h2>Controls</h2>
<div class="controls">
<button class="primary" onclick="command('auto')">Automatic</button>
<button onclick="command('off')">All off</button>
<button onclick="command('demo')">3 s pump / 5 s fan demo</button>
<button onclick="command('pump on')">Pump on (3 s max)</button>
<button onclick="command('pump off')">Pump off</button>
<button onclick="command('fan on')">Fans on</button>
<button onclick="command('fan off')">Fans off</button>
<button onclick="command('help')">Help</button>
</div>
<p id="message" role="status"></p>
<p><small id="thresholds">Thresholds --</small></p>
<p><strong>Not a safety alarm. No ppm accuracy.</strong> Real MQ2 needs warmup,
initial conditioning and real gas calibration; soil dry/wet calibration is also
required. The physical 10k/12k divider remains necessary on this circuit.</p>
<p class="context" id="calibration">Calibration --</p>
<footer>ESP32 DevKit V1 · uptime <span id="uptime">--</span> s</footer>
<script>
let last=0,online=false;
const el=id=>document.getElementById(id);
async function refresh(){
 try{
  const r=await fetch('/api/status',{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();
  el('soil').textContent=d.soil_percent??'--';
  el('gas').textContent=d.gas_percent??'--';
  el('soilraw').textContent='ADC '+d.soil_raw+(d.soil_percent===null?' · sensor fault / stale':'');
  el('gasraw').textContent='ADC '+d.gas_raw+(d.gas_percent===null?' · sensor fault / stale':'');
  el('mode').textContent=d.mode;
  el('outputs').textContent='Pump '+(d.pump?'ON':'OFF')+' / fans '+(d.fan?'ON':'OFF');
  el('soak').textContent='Soak remaining '+d.soak_seconds+' s';
  el('thresholds').textContent='Demo thresholds: water <'+d.water_below+'%; fans >'+d.fan_above+'% / off <'+d.fan_below+'%.';
  el('calibration').textContent=d.gas_calibration+' · '+(d.warmup?'MQ2 warmup advisory active':'Warmup advisory elapsed; real stabilization still must be verified.');
  el('uptime').textContent=d.uptime;
  last=Date.now();online=true;
 }catch(e){online=false;}
 updateLive();
}
function updateLive(){
 el('dot').className='dot'+(online?' on':'');
 el('live').textContent=online?'Live, updated '+Math.floor((Date.now()-last)/1000)+' s ago':'Offline, retrying';
}
async function command(cmd){
 try{
  const r=await fetch('/api/control',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'cmd='+encodeURIComponent(cmd)});
  el('message').textContent=await r.text();
  await refresh();
 }catch(e){el('message').textContent='Control failed: connection unavailable';}
}
refresh();setInterval(refresh,2000);setInterval(updateLive,1000);
</script>
</main></body></html>
)rawliteral";
