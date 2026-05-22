import { useState, useEffect, useRef } from 'react';
import './index.css';
import { Download, Settings, Film, CheckCircle2, FolderOpen, X, AlertCircle } from 'lucide-react';

const api = (window as any).electronAPI ?? null;

interface DownloadItem {
  id: number;
  url: string;
  title: string;
  percent: number;
  speed: string;
  eta: string;
  done: boolean;
  error: string | null;
}

function App() {
  const [url, setUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const downloadIdRef = useRef(0);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [downloadFolder, setDownloadFolder] = useState('C:\\Users\\david\\Downloads');
  const [quality, setQuality] = useState('best');
  const [format, setFormat] = useState('video');

  // Escuchar progreso real desde Electron
  useEffect(() => {
    if (!api) return;
    api.onDownloadProgress((data: any) => {
      setDownloads(prev =>
        prev.map(d =>
          d.id === downloadIdRef.current
            ? { ...d, percent: data.percent, speed: data.speed, eta: data.eta, title: data.title || d.title, done: !!data.done }
            : d
        )
      );
      if (data.done) setIsDownloading(false);
    });
  }, []);

  const handleSelectFolder = async () => {
    if (!api) {
      alert('La selección de carpeta solo funciona en la app de escritorio.');
      return;
    }
    const folder = await api.selectFolder();
    if (folder) setDownloadFolder(folder);
  };

  const handleDownload = async () => {
    if (!url || isDownloading) return;

    const id = ++downloadIdRef.current;
    const newItem: DownloadItem = {
      id,
      url,
      title: 'Obteniendo información...',
      percent: 0,
      speed: '',
      eta: '',
      done: false,
      error: null,
    };

    setDownloads(prev => [newItem, ...prev]);
    setIsDownloading(true);
    setUrl('');

    if (api) {
      // Descarga REAL con yt-dlp
      try {
        await api.downloadVideo(url, { folder: downloadFolder, quality, format });
      } catch (e: any) {
        setDownloads(prev =>
          prev.map(d => d.id === id ? { ...d, error: e?.message || 'Error desconocido', done: true } : d)
        );
        setIsDownloading(false);
      }
    } else {
      // Simulación para cuando se usa en navegador sin Electron
      let p = 0;
      const sim = setInterval(() => {
        p = Math.min(p + Math.floor(Math.random() * 6) + 1, 100);
        setDownloads(prev =>
          prev.map(d => d.id === id
            ? { ...d, percent: p, title: 'Video de demostración.mp4', speed: '2.3MB/s', eta: p < 100 ? '0:30' : '', done: p === 100 }
            : d
          )
        );
        if (p >= 100) {
          clearInterval(sim);
          setIsDownloading(false);
        }
      }, 150);
    }
  };

  return (
    <>
      <div className="titlebar-drag"></div>

      <main className="main-container glass">
        <header className="header">
          <div className="logo-container">
            <div className="logo-glow"></div>
            <h1 className="title">Aluro<span className="accent">Download</span><span className="plus">+</span></h1>
          </div>
          <button className="icon-btn glass" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
            <Settings size={22} />
          </button>
        </header>

        {isSettingsOpen && (
          <div className="settings-panel glass">
            <div className="settings-header">
              <h2>⚙️ Configuración</h2>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
            </div>
            <div className="settings-content">
              <div className="setting-group">
                <label>Carpeta de Destino</label>
                <div className="folder-input">
                  <input type="text" value={downloadFolder} onChange={e => setDownloadFolder(e.target.value)} className="glass-input" />
                  <button className="browse-btn glass" onClick={handleSelectFolder}>
                    <FolderOpen size={18} /> Explorar
                  </button>
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-group">
                  <label>Formato</label>
                  <select value={format} onChange={e => setFormat(e.target.value)} className="glass-input">
                    <option value="video">🎬 Video (MP4/MKV)</option>
                    <option value="audio">🎵 Solo Audio (MP3)</option>
                  </select>
                </div>
                <div className="setting-group">
                  <label>Calidad Máxima</label>
                  <select value={quality} onChange={e => setQuality(e.target.value)} className="glass-input" disabled={format === 'audio'}>
                    <option value="best">⭐ Máxima (4K/1080p)</option>
                    <option value="1080">🔵 1080p Full HD</option>
                    <option value="720">🟢 720p HD</option>
                    <option value="480">🟡 480p SD</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="search-section">
          <div className="input-wrapper glass">
            <input
              type="text"
              placeholder="Pega el enlace del video y presiona Enter o clic en Descargar..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isDownloading && url && handleDownload()}
              className="url-input"
            />
            <button className="download-btn" onClick={handleDownload} disabled={isDownloading || !url}>
              {isDownloading ? <span className="loader"></span> : <Download size={20} />}
              <span>{isDownloading ? 'Descargando...' : 'Descargar'}</span>
            </button>
          </div>
        </section>

        <section className="downloads-section">
          {downloads.length > 0 && <h2 className="subtitle">Cola de Descarga</h2>}

          {downloads.map(d => (
            <div key={d.id} className="download-card glass">
              <div className="card-info">
                <div className="video-icon" style={{ color: d.error ? '#ef4444' : d.done ? '#10b981' : 'var(--primary-color)' }}>
                  {d.error ? <AlertCircle size={26} /> : d.done ? <CheckCircle2 size={26} /> : <Film size={26} />}
                </div>
                <div className="video-details">
                  <h3 className="video-title">{d.title}</h3>
                  <p className="video-status" style={{ color: d.error ? '#ef4444' : d.done ? '#10b981' : 'var(--text-secondary)' }}>
                    {d.error
                      ? `❌ Error: ${d.error}`
                      : d.done
                      ? `✅ Guardado en: ${downloadFolder}`
                      : `${d.percent.toFixed(1)}% ${d.speed ? `· ${d.speed}` : ''} ${d.eta ? `· ETA ${d.eta}` : ''}`
                    }
                  </p>
                </div>
              </div>
              {!d.error && (
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${d.percent}%`,
                      backgroundColor: d.done ? '#10b981' : 'var(--primary-color)',
                      boxShadow: d.done ? '0 0 15px rgba(16, 185, 129, 0.4)' : '0 0 15px var(--primary-glow)'
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

export default App;
