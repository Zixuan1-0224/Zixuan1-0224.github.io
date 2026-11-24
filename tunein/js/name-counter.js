(function(){var n=document.getElementById('pnm'),c=document.getElementById('pnmCnt'),m=document.getElementById('myName');
function cnt(){if(n&&c){c.textContent=Array.from(n.value).length+'/6'}}
function tick(){cnt();if(!m)return;var v=(n&&n.value.replace(/\s+/g,' ').trim().slice(0,6))||'';var top=document.getElementById('top');var joined=top&&!top.hidden&&document.getElementById('jp2')&&document.getElementById('jp2').hidden;m.hidden=!(v&&top&&!top.hidden);if(v){m.querySelector('b').textContent=v;var hx=(typeof CHEX==='string'&&CHEX)||'';if(hx)m.querySelector('i').style.background=hx}}
if(n)n.addEventListener('input',cnt);setInterval(tick,500);tick()})();
