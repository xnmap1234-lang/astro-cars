const SHEET_NAME = 'Visits';
const ADMIN_KEY = 'CHANGE_THIS_TO_A_LONG_RANDOM_KEY';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    if (d.event !== 'pageview') return json({ok:false,error:'ignored'});
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) sh = ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) sh.appendRow(['Timestamp','Date','Time','Path','Source','Medium','Campaign','Device','Browser','Language','Referrer','Title']);
    const now = new Date();
    const tz = Session.getScriptTimeZone() || 'Africa/Casablanca';
    sh.appendRow([now,Utilities.formatDate(now,tz,'yyyy-MM-dd'),Utilities.formatDate(now,tz,'HH:mm:ss'),clean(d.path),clean(d.source),clean(d.utm_medium),clean(d.utm_campaign),clean(d.device),clean(d.browser),clean(d.language),clean(d.referrer),clean(d.title)]);
    return json({ok:true});
  } catch(err) { return json({ok:false,error:String(err)}); }
}

function doGet(e) {
  const p=e.parameter||{};
  if(p.action!=='stats') return json({ok:true,service:'Astro Cars Analytics'});
  if(p.key!==ADMIN_KEY) return respond({ok:false,error:'Unauthorized'},p.callback);
  const days=Math.min(90,Math.max(1,Number(p.days||30)));
  const ss=SpreadsheetApp.getActiveSpreadsheet(); const sh=ss.getSheetByName(SHEET_NAME);
  if(!sh||sh.getLastRow()<2) return respond({ok:true,total:0,today:0,devices:{},sources:{},days:{},recent:[]},p.callback);
  const values=sh.getDataRange().getValues(); const rows=values.slice(1); const tz=Session.getScriptTimeZone()||'Africa/Casablanca';
  const cutoff=new Date(Date.now()-days*86400000); const today=Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  const devices={},sources={},dayMap={}; let total=0,todayCount=0; const recent=[];
  rows.forEach(r=>{const ts=r[0] instanceof Date?r[0]:new Date(r[0]); if(isNaN(ts)||ts<cutoff)return; total++; const date=String(r[1]||Utilities.formatDate(ts,tz,'yyyy-MM-dd')); const device=String(r[7]||'Other'); const source=String(r[4]||'Direct'); devices[device]=(devices[device]||0)+1; sources[source]=(sources[source]||0)+1; dayMap[date]=(dayMap[date]||0)+1; if(date===today)todayCount++; recent.push({date,time:String(r[2]||''),source,device,browser:String(r[8]||''),referrer:String(r[10]||'')});});
  recent.reverse(); recent.splice(50);
  return respond({ok:true,total,today:todayCount,devices,sources,days:dayMap,recent},p.callback);
}
function clean(v){return String(v||'').slice(0,500);}
function json(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function respond(o,cb){ if(cb && /^[A-Za-z_$][\w$]*$/.test(cb)) return ContentService.createTextOutput(cb+'('+JSON.stringify(o)+')').setMimeType(ContentService.MimeType.JAVASCRIPT); return json(o); }
