import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Droplet, Zap, AlertTriangle, Shield, MapPin, Activity,
  Bell, Phone, ChevronRight, Wifi, Battery, Signal, Flame, Coffee,
  RefreshCw, User, Siren, Flame as FireIcon
} from 'lucide-react';

const FUKUOKA_LAT = 33.5905;
const FUKUOKA_LON = 130.4017;

const TEL_KANSEI  = '07047341911';
const TEL_POLICE  = '110';
const TEL_FIRE    = '119';

const COLOR = {
  bg:        '#F5F2EA',
  bgCard:    '#FFFFFF',
  bgSoft:    '#EAE5D8',
  text:      '#1F3A52',
  textSub:   '#5C6E80',
  textMute:  '#8C9AA8',
  brand:     '#2E8BC0',
  brandDark: '#1F5577',
  water:     '#2E8BC0',
  salt:      '#D4942A',
  break:     '#7A5AB3',
  safe:      '#3B8C5A',
  caution:   '#D4942A',
  danger:    '#C24A3D',
  border:    'rgba(31,58,82,0.12)',
  borderSt:  'rgba(31,58,82,0.20)',
};

function calcWBGT(tempC, humidity) {
  if (tempC == null || humidity == null) return null;
  const e = (humidity / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  return Math.round((0.567 * tempC + 0.393 * e + 3.94) * 10) / 10;
}

function wbgtLevel(wbgt) {
  if (wbgt == null) return { label: 'N/A', color: COLOR.textMute };
  if (wbgt >= 31) return { label: '危険',     color: COLOR.danger };
  if (wbgt >= 28) return { label: '厳重警戒', color: '#D86A2A' };
  if (wbgt >= 25) return { label: '警戒',     color: COLOR.caution };
  if (wbgt >= 21) return { label: '注意',     color: COLOR.safe };
  return                      { label: 'ほぼ安全', color: COLOR.brand };
}

const LS_PREFIX = 'hydroguard:v1:';
const lsGet = (key, fallback) => {
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
};
const lsSet = (key, value) => {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch {}
};

function getGuardId() {
  try {
    const qs = new URLSearchParams(window.location.search);
    return qs.get('id') || '01';
  } catch { return '01'; }
}

const GUARD_NAMES = {
  '01': '川村 蓮',
  '02': '大田 学',
  '03': '木村 勇輝',
  '04': '許斐 亮太郎',
  '05': '小林 拓光',
};

const CallConfirmModal = ({ open, onClose, title, number, color, description }) => {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(31,58,82,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLOR.bgCard, borderRadius: 20, padding: 24,
          maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(31,58,82,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 24, background: `${color}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Phone style={{ width: 22, height: 22, color }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: COLOR.text }}>{title}</div>
            <div style={{ fontSize: 13, color: COLOR.textSub }}>{number}</div>
          </div>
        </div>
        <div style={{ fontSize: 14, color: COLOR.textSub, lineHeight: 1.6, marginBottom: 20 }}>
          {description}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '14px', borderRadius: 12, border: `1px solid ${COLOR.border}`,
              background: 'transparent', color: COLOR.textSub, fontWeight: 600,
              fontSize: 14, cursor: 'pointer',
            }}
          >
            キャンセル
          </button>
          <a
            href={`tel:${number}`}
            onClick={() => setTimeout(onClose, 500)}
            style={{
              padding: '14px', borderRadius: 12, background: color,
              color: '#fff', fontWeight: 700, fontSize: 14, textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            発信する
          </a>
        </div>
      </div>
    </div>
  );
};

const HydroGuard = () => {
  const guardId = getGuardId();
  const guardName = GUARD_NAMES[guardId] || '本田 英樹';
  const isCaptain = guardId === '01';

  const today = new Date().toISOString().slice(0, 10);
  const dayKey = `day:${today}:${guardId}`;
  const initialState = lsGet(dayKey, { water: 0, salt: 0, breakMin: 0, logs: [] });

  const [waterCount, setWaterCount] = useState(initialState.water);
  const [saltCount, setSaltCount]   = useState(initialState.salt);
  const [breakMin, setBreakMin]     = useState(initialState.breakMin);
  const [logs, setLogs]             = useState(initialState.logs);
  const [pulse, setPulse]           = useState(82);
  const [now, setNow]               = useState(new Date());

  const [wbgt, setWbgt]   = useState(null);
  const [tempC, setTempC] = useState(null);
  const [humid, setHumid] = useState(null);
  const [apiOk, setApiOk] = useState(false);
  const [apiAt, setApiAt] = useState(null);

  const [policeModal, setPoliceModal] = useState(false);
  const [fireModal, setFireModal]     = useState(false);

  useEffect(() => {
    lsSet(dayKey, { water: waterCount, salt: saltCount, breakMin, logs });
  }, [waterCount, saltCount, breakMin, logs, dayKey]);

  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700;12..96,900&family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700;900&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch {} };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setPulse(() => 78 + Math.round(Math.sin(Date.now() / 800) * 4 + 4));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const fetchWeather = useCallback(async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${FUKUOKA_LAT}&longitude=${FUKUOKA_LON}&current=temperature_2m,relative_humidity_2m&timezone=Asia%2FTokyo`;
      const r = await fetch(url);
      const j = await r.json();
      const t = j?.current?.temperature_2m;
      const h = j?.current?.relative_humidity_2m;
      if (typeof t === 'number' && typeof h === 'number') {
        setTempC(t); setHumid(h); setWbgt(calcWBGT(t, h));
        setApiOk(true); setApiAt(new Date());
      } else { setApiOk(false); }
    } catch { setApiOk(false); }
  }, []);

  useEffect(() => {
    fetchWeather();
    const t = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchWeather]);

  const totalWaterMl = waterCount * 200;
  const wbgtLv = wbgtLevel(wbgt);

  const wbgtPenalty = wbgt == null ? 0 : wbgt >= 31 ? 3 : wbgt >= 28 ? 2 : wbgt >= 25 ? 1 : 0;
  const riskScore = Math.max(0, 5 - waterCount) + (saltCount === 0 ? 2 : 0) + wbgtPenalty;
  const riskLevel = riskScore >= 5 ? 'DANGER' : riskScore >= 3 ? 'CAUTION' : 'SAFE';
  const riskJp = riskLevel === 'SAFE' ? '安全' : riskLevel === 'CAUTION' ? '注意' : '危険';
  const riskColor =
    riskLevel === 'SAFE' ? COLOR.safe :
    riskLevel === 'CAUTION' ? COLOR.caution : COLOR.danger;

  const tt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const addLog = (entry) => setLogs((l) => [entry, ...l].slice(0, 6));

  const addWater = () => { setWaterCount((c) => c + 1); addLog({ time: tt(new Date()), type: 'water', amount: 200 }); };
  const addSalt  = () => { setSaltCount((c) => c + 1);  addLog({ time: tt(new Date()), type: 'salt',  amount: 1   }); };
  const addBreak = () => { setBreakMin((b) => b + 15);  addLog({ time: tt(new Date()), type: 'break', amount: 15  }); };

  const undo = () => {
    if (logs.length === 0) return;
    const last = logs[0];
    if      (last.type === 'water') setWaterCount((c) => Math.max(0, c - 1));
    else if (last.type === 'salt')  setSaltCount((c)  => Math.max(0, c - 1));
    else if (last.type === 'break') setBreakMin((b)   => Math.max(0, b - last.amount));
    setLogs((l) => l.slice(1));
  };

  const resetAll = () => {
    if (!confirm('本日の全記録をリセットします。よろしいですか？')) return;
    setWaterCount(0); setSaltCount(0); setBreakMin(0); setLogs([]);
  };

  const guards = [
    { id: '01', name: '川村 蓮',     pos: 'Pos.①',  status: 'SAFE',    water: 5, salt: 1, breakMin: 0,  hr: 78,  role: '隊長' },
    { id: '02', name: '大田 学',     pos: 'Pos.②',  status: 'SAFE',    water: 4, salt: 1, breakMin: 30, hr: 82 },
    { id: '03', name: '木村 勇輝',   pos: 'Pos.③',  status: 'CAUTION', water: 2, salt: 0, breakMin: 15, hr: 95 },
    { id: '04', name: '許斐 亮太郎', pos: 'Pos.④',  status: 'SAFE',    water: 4, salt: 1, breakMin: 60, hr: 75 },
    { id: '05', name: '小林 拓光',   pos: 'Pos.⑤',  status: 'DANGER',  water: 1, salt: 0, breakMin: 0,  hr: 108 },
  ];

  const fontDisplay = "'Bricolage Grotesque', system-ui, sans-serif";
  const fontMono    = "'JetBrains Mono', ui-monospace, monospace";
  const fontJa      = "'Noto Sans JP', system-ui, sans-serif";

  return (
    <div style={{ minHeight: '100vh', background: COLOR.bg, color: COLOR.text, fontFamily: fontJa }}>

      <CallConfirmModal
        open={policeModal}
        onClose={() => setPoliceModal(false)}
        title="警察に通報" number={TEL_POLICE} color="#1A56C4"
        description="本当に110番に発信しますか？誤発報は警備会社の信用問題になるため、必ず必要な状況か再確認してください。"
      />
      <CallConfirmModal
        open={fireModal}
        onClose={() => setFireModal(false)}
        title="消防・救急に通報" number={TEL_FIRE} color={COLOR.danger}
        description="本当に119番に発信しますか？誤発報は警備会社の信用問題になるため、必ず必要な状況か再確認してください。"
      />

      <div style={{
        borderBottom: `1px solid ${COLOR.border}`, padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11, fontFamily: fontMono, background: COLOR.bgCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            width: 8, height: 8, borderRadius: 4,
            background: apiOk ? COLOR.safe : COLOR.danger,
            animation: 'pulse 2s infinite',
          }} />
          <span style={{ color: COLOR.textSub }}>{apiOk ? 'LIVE' : 'OFFLINE'}</span>
          <span style={{ color: COLOR.textMute }}>|</span>
          <span style={{ color: COLOR.textSub }}>
            {now.toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Flame style={{ width: 12, height: 12, color: wbgtLv.color }} />
          <span style={{ color: COLOR.textSub }}>WBGT</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: wbgtLv.color }}>
            {wbgt != null ? `${wbgt}` : '--'}
          </span>
          <span style={{
            padding: '2px 8px', fontSize: 10, textTransform: 'uppercase',
            letterSpacing: 2, background: `${wbgtLv.color}1a`,
            border: `1px solid ${wbgtLv.color}50`, color: wbgtLv.color,
            borderRadius: 4,
          }}>
            {wbgtLv.label}
          </span>
          <button onClick={fetchWeather} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            opacity: 0.5, padding: 4, color: COLOR.textSub,
          }}>
            <RefreshCw style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      <header style={{ padding: '32px 16px 16px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
          fontSize: 11, letterSpacing: '0.3em', color: COLOR.textSub,
          fontFamily: fontMono,
        }}>
          <Shield style={{ width: 12, height: 12 }} />
          <span>ATS · SAFETY OPERATIONS / 001</span>
        </div>
        <h1 style={{
          fontSize: 'clamp(44px, 10vw, 100px)', fontWeight: 900,
          lineHeight: 0.85, letterSpacing: '-0.04em',
          fontFamily: fontDisplay, margin: 0,
        }}>
          <span style={{ color: COLOR.text }}>HYDRO</span>
          <span style={{ color: COLOR.brand }}>GUARD</span>
        </h1>
        <p style={{ marginTop: 16, fontSize: 'clamp(14px, 2.5vw, 22px)', color: COLOR.textSub, lineHeight: 1.5, maxWidth: 600 }}>
          屋外警備の熱中症を、<span style={{ color: COLOR.brandDark, fontWeight: 700 }}>AIが未然に防ぐ。</span>
        </p>
        <p style={{ marginTop: 4, fontSize: 11, color: COLOR.textMute, fontFamily: fontMono }}>
          {tempC != null && humid != null
            ? `福岡 ${tempC}℃ / 湿度 ${humid}% (Open-Meteo · ${apiAt ? tt(apiAt) : '--'} 取得)`
            : 'WBGT 取得中…'}
        </p>
      </header>

      <section style={{ padding: '0 16px 64px', maxWidth: 1280, margin: '0 auto' }}>
        <div className="hg-grid" style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)',
          gap: 32, alignItems: 'start',
        }}>

          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.25em', color: COLOR.textMute,
              marginBottom: 12, textTransform: 'uppercase', fontFamily: fontMono,
            }}>
              ▸ あなたの画面
            </div>

            <div style={{
              width: 300, height: 720, background: COLOR.text, borderRadius: 44,
              padding: 12, position: 'relative', margin: '0 auto',
              boxShadow: '0 30px 80px rgba(31,58,82,0.25)',
            }}>
              <div style={{
                position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                width: 128, height: 24, background: COLOR.text, borderRadius: 16,
                zIndex: 10,
              }} />

              <div style={{
                width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', background: COLOR.bg,
              }}>

                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '16px 24px 8px', fontSize: 11, fontWeight: 600,
                  fontFamily: fontMono, color: COLOR.text,
                }}>
                  <span>{tt(now)}</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Signal style={{ width: 12, height: 12 }} />
                    <Wifi style={{ width: 12, height: 12 }} />
                    <Battery style={{ width: 16, height: 16 }} />
                  </div>
                </div>

                <div style={{ padding: '8px 20px 12px' }}>
                  <div style={{
                    fontSize: 10, letterSpacing: '0.3em', color: COLOR.textMute,
                    fontFamily: fontMono,
                  }}>HYDROGUARD</div>
                  <div style={{
                    fontSize: 14, color: COLOR.text, marginTop: 4, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <User style={{ width: 14, height: 14, color: COLOR.textSub }} />
                    {guardName}
                    {isCaptain && (
                      <span style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                        fontWeight: 700, letterSpacing: 1, color: COLOR.salt,
                        background: `${COLOR.salt}1a`, border: `1px solid ${COLOR.salt}55`,
                        fontFamily: fontMono,
                      }}>隊長</span>
                    )}
                  </div>
                </div>

                <div style={{ padding: '0 20px' }}>
                  <div style={{
                    background: COLOR.bgCard, borderRadius: 16, padding: 20,
                    border: `1px solid ${COLOR.border}`,
                    borderTop: `2px solid ${riskColor}`,
                  }}>
                    <div style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.25em',
                      color: COLOR.textSub, fontFamily: fontMono,
                    }}>Current Status</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4 }}>
                      <div style={{
                        fontSize: 44, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em',
                        color: riskColor, fontFamily: fontDisplay,
                      }}>{riskJp}</div>
                      <div style={{ fontSize: 11, color: COLOR.textMute, fontFamily: fontMono }}>
                        {riskLevel}
                      </div>
                    </div>
                    <div style={{
                      marginTop: 12, height: 6, background: COLOR.bgSoft,
                      borderRadius: 3, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${Math.min(waterCount * 20, 100)}%`,
                        background: riskColor, transition: 'width 0.5s',
                      }} />
                    </div>
                    <div style={{
                      marginTop: 10, display: 'flex', justifyContent: 'space-between',
                      fontSize: 10, color: COLOR.textSub, fontFamily: fontMono,
                    }}>
                      <span>WBGT {wbgt != null ? `${wbgt}°` : '--'}</span>
                      <span>HR {pulse}bpm</span>
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: '16px 20px 0', display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
                }}>
                  {[
                    { icon: Droplet, label: '水分', amt: '+200ml', total: `${totalWaterMl}ml`, color: COLOR.water, onClick: addWater },
                    { icon: Zap,     label: '塩分', amt: '+1錠',   total: `${saltCount}錠`,    color: COLOR.salt,  onClick: addSalt },
                    { icon: Coffee,  label: '休憩', amt: '+15分',  total: `${breakMin}分`,     color: COLOR.break, onClick: addBreak },
                  ].map((b, i) => (
                    <button key={i} onClick={b.onClick} style={{
                      borderRadius: 16, padding: 12, textAlign: 'left', cursor: 'pointer',
                      background: `${b.color}10`, border: `1px solid ${b.color}40`,
                      transition: 'all 0.15s',
                    }}>
                      <b.icon style={{ width: 20, height: 20, marginBottom: 4, color: b.color }} />
                      <div style={{ fontSize: 10, color: COLOR.textSub }}>{b.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: b.color }}>{b.amt}</div>
                      <div style={{ fontSize: 9, color: COLOR.textMute, marginTop: 2, fontFamily: fontMono }}>
                        {b.total}
                      </div>
                    </button>
                  ))}
                </div>

                <div style={{
                  padding: '8px 20px 0', display: 'flex', gap: 8, fontSize: 11,
                }}>
                  <button onClick={undo} disabled={logs.length === 0} style={{
                    flex: 1, padding: '8px', borderRadius: 10,
                    background: 'transparent', border: `1px solid ${COLOR.border}`,
                    color: logs.length === 0 ? COLOR.textMute : COLOR.textSub,
                    cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}>
                    ↶ 直前を取消
                  </button>
                  {isCaptain && (
                    <button onClick={resetAll} style={{
                      padding: '8px 12px', borderRadius: 10,
                      background: 'transparent', border: `1px solid ${COLOR.danger}40`,
                      color: COLOR.danger, cursor: 'pointer', fontWeight: 600,
                    }}>
                      リセット
                    </button>
                  )}
                </div>

                <div style={{ padding: '12px 20px 0', flex: 1, overflow: 'hidden' }}>
                  <div style={{
                    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.25em',
                    color: COLOR.textMute, marginBottom: 8, fontFamily: fontMono,
                  }}>記録</div>
                  <div>
                    {logs.length === 0 && (
                      <div style={{ fontSize: 11, color: COLOR.textMute, fontStyle: 'italic' }}>
                        まだ記録がありません
                      </div>
                    )}
                    {logs.slice(0, 3).map((log, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', fontSize: 12,
                        padding: '6px 0', borderBottom: `1px solid ${COLOR.border}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {log.type === 'water' && <Droplet style={{ width: 12, height: 12, color: COLOR.water }} />}
                          {log.type === 'salt'  && <Zap     style={{ width: 12, height: 12, color: COLOR.salt }} />}
                          {log.type === 'break' && <Coffee  style={{ width: 12, height: 12, color: COLOR.break }} />}
                          <span style={{ color: COLOR.text }}>
                            {log.type === 'water' && `水分 +${log.amount}ml`}
                            {log.type === 'salt'  && `塩分 +${log.amount}錠`}
                            {log.type === 'break' && `休憩 +${log.amount}分`}
                          </span>
                        </div>
                        <span style={{ color: COLOR.textMute, fontSize: 10, fontFamily: fontMono }}>
                          {log.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '12px 20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a href={`tel:${TEL_KANSEI}`} style={{
                    background: COLOR.brand, color: '#fff', padding: '14px',
                    borderRadius: 14, fontWeight: 700, letterSpacing: '0.15em',
                    fontSize: 12, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8, textDecoration: 'none',
                  }}>
                    <Phone style={{ width: 16, height: 16 }} />
                    管制に緊急連絡
                  </a>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button onClick={() => setPoliceModal(true)} style={{
                      background: 'transparent', border: `1.5px solid #1A56C4`,
                      color: '#1A56C4', padding: '12px', borderRadius: 14,
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <Siren style={{ width: 14, height: 14 }} />
                      警察 110
                    </button>
                    <button onClick={() => setFireModal(true)} style={{
                      background: 'transparent', border: `1.5px solid ${COLOR.danger}`,
                      color: COLOR.danger, padding: '12px', borderRadius: 14,
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <FireIcon style={{ width: 14, height: 14 }} />
                      消防 119
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 12, fontSize: 10, color: COLOR.textMute, textAlign: 'center',
              maxWidth: 300, margin: '12px auto 0', fontFamily: fontMono,
            }}>
              ▲ 水・塩・休憩はワンタップ。警察消防は2タップ確認式。
            </div>
          </div>

          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.25em', color: COLOR.textMute,
              marginBottom: 12, textTransform: 'uppercase', fontFamily: fontMono,
            }}>
              ▸ 管制ダッシュボード
            </div>
            <div style={{
              borderRadius: 16, overflow: 'hidden',
              background: COLOR.bgCard, border: `1px solid ${COLOR.border}`,
            }}>

              <div style={{
                padding: '16px 20px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', borderBottom: `1px solid ${COLOR.border}`,
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.text }}>
                    博多どんたく 港演舞台
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.textSub, marginTop: 2, fontFamily: fontMono }}>
                    2026.05.04 · 隊員5名 / 休憩目標 60分 · 隊長: 川村
                  </div>
                </div>
                <div style={{
                  padding: '6px 12px', borderRadius: 8, display: 'flex', gap: 6,
                  alignItems: 'center', background: `${COLOR.danger}15`,
                  border: `1px solid ${COLOR.danger}40`,
                }}>
                  <AlertTriangle style={{ width: 12, height: 12, color: COLOR.danger }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: COLOR.danger }}>1件 危険</span>
                </div>
              </div>

              <div style={{
                padding: '12px 20px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', background: `${COLOR.danger}08`,
                borderBottom: `1px solid ${COLOR.danger}30`,
              }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 4, background: COLOR.danger,
                    animation: 'pulse 2s infinite',
                  }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.danger }}>
                      小林 拓光 / Pos.⑤
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.textSub, marginTop: 2 }}>
                      水分摂取40分間なし · 心拍108bpm
                    </div>
                  </div>
                </div>
                <button style={{
                  fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                  padding: '8px 12px', borderRadius: 8, display: 'flex', gap: 4,
                  alignItems: 'center', fontWeight: 700, background: COLOR.danger,
                  color: '#fff', border: 'none', cursor: 'pointer', fontFamily: fontMono,
                }}>
                  <Bell style={{ width: 12, height: 12 }} />
                  LINE通知
                  <ChevronRight style={{ width: 12, height: 12 }} />
                </button>
              </div>

              <div style={{
                padding: 16, display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              }}>
                {guards.map((g) => {
                  const c = g.status === 'SAFE' ? COLOR.safe :
                            g.status === 'CAUTION' ? COLOR.caution : COLOR.danger;
                  const breakOk = g.breakMin >= 60;
                  return (
                    <div key={g.id} style={{
                      borderRadius: 12, padding: 14, background: COLOR.bg,
                      border: `1px solid ${COLOR.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, color: COLOR.textMute, fontFamily: fontMono }}>#{g.id}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: COLOR.text }}>{g.name}</span>
                            {g.role && (
                              <span style={{
                                fontSize: 9, padding: '2px 6px', borderRadius: 4,
                                fontWeight: 700, letterSpacing: 1, color: COLOR.salt,
                                background: `${COLOR.salt}1a`, border: `1px solid ${COLOR.salt}55`,
                                fontFamily: fontMono,
                              }}>{g.role}</span>
                            )}
                          </div>
                          <div style={{
                            fontSize: 11, color: COLOR.textSub, marginTop: 2,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            <MapPin style={{ width: 10, height: 10 }} />
                            {g.pos}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em',
                          padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                          color: c, background: `${c}15`, border: `1px solid ${c}40`,
                          fontFamily: fontMono,
                        }}>{g.status}</div>
                      </div>
                      <div style={{
                        marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 8, fontSize: 11, fontFamily: fontMono,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLOR.textSub }}>
                          <Droplet style={{ width: 12, height: 12, color: COLOR.water }} />
                          <span>{g.water * 200}ml</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLOR.textSub }}>
                          <Zap style={{ width: 12, height: 12, color: COLOR.salt }} />
                          <span>{g.salt}錠</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLOR.textSub }}>
                          <Coffee style={{ width: 12, height: 12, color: breakOk ? COLOR.break : COLOR.textMute }} />
                          <span style={{ color: breakOk ? COLOR.break : undefined }}>{g.breakMin}/60分</span>
                        </div>
                      </div>
                      <div style={{
                        marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 10, color: COLOR.textMute, fontFamily: fontMono,
                      }}>
                        <Activity style={{ width: 12, height: 12, color: c }} />
                        <span>HR {g.hr}bpm</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{
              marginTop: 12, fontSize: 10, color: COLOR.textMute, textAlign: 'center',
              fontFamily: fontMono,
            }}>
              ※ ダッシュボード上の他隊員データはデモ用ダミー。
              <br />来週Supabase連携で全員リアルタイム表示予定。
            </div>
          </div>
        </div>
      </section>

      <section style={{
        padding: '48px 16px', maxWidth: 1280, margin: '0 auto',
        borderTop: `1px solid ${COLOR.border}`,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24,
        }}>
          {[
            { num: '01', label: 'ワンタップ記録', desc: '水・塩・休憩を秒で記録' },
            { num: '02', label: 'WBGT自動取得',   desc: 'Open-Meteo連携・10分毎更新' },
            { num: '03', label: '緊急連絡内蔵',   desc: '管制・警察110・消防119' },
            { num: '04', label: 'オフライン対応', desc: 'localStorage自動保存' },
          ].map((v) => (
            <div key={v.num} style={{
              paddingLeft: 16, borderLeft: `1px solid ${COLOR.brand}55`,
            }}>
              <div style={{
                fontSize: 10, letterSpacing: '0.3em', color: COLOR.brand, fontFamily: fontMono,
              }}>{v.num}</div>
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: COLOR.text }}>{v.label}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: COLOR.textSub, lineHeight: 1.5 }}>{v.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '0 16px 48px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{
          borderRadius: 16, padding: 24,
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24,
          background: COLOR.bgCard, border: `1px solid ${COLOR.brand}40`,
        }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.3em', marginBottom: 8,
              color: COLOR.brand, fontFamily: fontMono,
            }}>
              FIELD TEST · 2026.05.03–04
            </div>
            <div style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 900, color: COLOR.text, fontFamily: fontDisplay }}>
              今週末、博多どんたくで運用開始。
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: COLOR.textSub, maxWidth: 600 }}>
              港演舞台 / 隊員5名でテストパターン運用。次はダイワ大会、ゴルフ大会へ。
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: COLOR.textSub, textAlign: 'right', fontFamily: fontMono }}>
              隊員別URL: ?id=01〜05
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {['01','02','03','04','05'].map(id => (
                <a key={id} href={`?id=${id}`} style={{
                  textAlign: 'center', padding: '8px 0', borderRadius: 6, fontSize: 11,
                  fontWeight: 700, fontFamily: fontMono, textDecoration: 'none',
                  background: id === guardId ? COLOR.brand : COLOR.bgSoft,
                  color: id === guardId ? '#fff' : COLOR.textSub,
                }}>
                  {id}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer style={{
        padding: '24px 16px', maxWidth: 1280, margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11, color: COLOR.textMute, borderTop: `1px solid ${COLOR.border}`,
        fontFamily: fontMono,
      }}>
        <div>HYDROGUARD <span style={{ color: COLOR.textMute }}>v0.3 · field test</span></div>
        <div>ATSセキュリティ株式会社 · 内部実証版</div>
      </footer>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @media (max-width: 768px) {
          .hg-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<HydroGuard />);
