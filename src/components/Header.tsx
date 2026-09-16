import React, { useEffect, useState, useRef } from 'react';
import { 
  Clock, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Activity, 
  Wifi, 
  Sparkles,
  Database,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  Share2,
  Copy,
  ExternalLink,
  Tablet,
  Check,
  Server,
  Layers,
  HardDrive
} from 'lucide-react';
import { ShiftConfig } from '../types';
import { formatarDataPtBr, formatarHoraPtBr, obterTurnosAtivosNoMomento } from '../utils/factoryCalculations';
import { flushOfflineQueue } from '../services/nativeDatabaseSync';

interface HeaderProps {
  shifts: ShiftConfig[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  activeCount: number;
  onOpenNewActivity: () => void;
  onQuickShiftAccess: () => void;
  onExportFullBackup?: () => void;
  onRestoreFullBackup?: (payload: any) => Promise<boolean>;
  lastJsonSyncTime?: string;
  onForceSync?: () => void;
  isSyncing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  shifts,
  soundEnabled,
  onToggleSound,
  activeCount,
  onOpenNewActivity,
  onQuickShiftAccess,
  onExportFullBackup,
  onRestoreFullBackup,
  lastJsonSyncTime,
  onForceSync,
  isSyncing = false,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status de conexão e rede
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue().catch(() => {});
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setBackupStatus(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!parsed || (typeof parsed !== 'object')) {
          throw new Error('Formato JSON inválido.');
        }

        if (onRestoreFullBackup) {
          const success = await onRestoreFullBackup(parsed);
          if (success) {
            setBackupStatus({
              type: 'success',
              message: 'Tudo restaurado e sincronizado com sucesso! Registros, colaboradores e configurações aplicados.',
            });
          } else {
            setBackupStatus({
              type: 'error',
              message: 'Falha ao sincronizar restauração no servidor. Tente novamente.',
            });
          }
        }
      } catch (err: any) {
        setBackupStatus({
          type: 'error',
          message: `Erro ao carregar arquivo: ${err?.message || 'Arquivo corrompido ou formato inválido'}`,
        });
      } finally {
        setIsRestoring(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Determine all active shifts respecting days and configured hours (supports overlapping shifts - Foto 3)
  const activeShifts = obterTurnosAtivosNoMomento(shifts, currentTime);
  const activeShift = activeShifts[0];
  const shiftsLabel = activeShifts.length > 1
    ? activeShifts.map(s => s.code || s.name).join(' + ')
    : activeShift
    ? `${activeShift.name} (${activeShift.entrada}-${activeShift.saida})`
    : 'Fora de Turno';

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <>
      <header className="bg-[#111111] border-b border-[#333333] text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-[1200px] mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Identity */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#007BFF] flex items-center justify-center shadow-md">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-black text-sm sm:text-base tracking-wider text-white">
                  MCA <span className="font-normal text-[#888888]">| CONTROLE DE ATIVIDADES</span>
                </h1>
                <div
                  className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 border rounded text-[9.5px] font-bold transition shadow-xs ${
                    isOnline
                      ? 'bg-[#00E676]/15 border-[#00E676]/30 text-[#00E676]'
                      : 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FFB74D]'
                  }`}
                  title={
                    isOnline
                      ? 'Banco de Dados Nativo Central Ativo • Sincronização Contínua em Tempo Real'
                      : 'Modo Offline Ativo • Os dados continuam sendo gravados no tablet e serão enviados assim que a internet reconectar'
                  }
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[#00E676] animate-pulse' : 'bg-[#FF8C00]'}`}></span>
                  <HardDrive className="w-3 h-3" />
                  <span>{isOnline ? 'BANCO ATIVO (NATIVO)' : 'SALVANDO LOCAL (OFFLINE)'}</span>
                </div>
                {/* Discrete JSON Synchronization Indicator requested in Photo 1 */}
                <button
                  type="button"
                  onClick={onForceSync}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#1A2333] hover:bg-[#203047] border border-[#007BFF]/40 rounded text-[10px] font-mono text-[#93C5FD] transition cursor-pointer active:scale-95 shadow-sm"
                  title="Horário do snapshot JSON mestre sincronizado no servidor e tablets (Loop a cada 30s). Clique para forçar sincronização imediata."
                >
                  <Database className={`w-3 h-3 text-[#007BFF] ${isSyncing ? 'animate-spin' : ''}`} />
                  <span className="font-bold text-[#CCCCCC]">JSON:</span>
                  <span className="font-semibold text-[#00E676] tracking-wider font-mono">
                    {lastJsonSyncTime || formatarHoraPtBr(currentTime)}
                  </span>
                  <span className="w-1.5 h-1.5 bg-[#00E676] rounded-full animate-pulse"></span>
                </button>
              </div>
              <p className="text-[10.5px] text-[#888888] font-normal hidden md:block">
                Sistema MES Industrial • Banco Nativo Integrado com Cache Offline para Redes Instáveis
              </p>
            </div>
          </div>

          {/* Center Live Clock & Shift Badge */}
          <div className="flex items-center gap-2.5 sm:gap-3 bg-[#1E1E1E] px-3 py-1.5 rounded-lg border border-[#333333]">
            <Clock className="w-4 h-4 text-[#007BFF] shrink-0" />
            <div className="text-right sm:text-left">
              <div className="font-mono font-black text-sm sm:text-base tracking-widest text-[#00E676] leading-none">
                {formatarHoraPtBr(currentTime)}
              </div>
              <div className="text-[10px] text-[#888888] font-medium font-mono">
                {formatarDataPtBr(currentTime)}
              </div>
            </div>

            <div className="h-5 w-px bg-[#333333] mx-1 hidden sm:block" />

            <button
              onClick={onQuickShiftAccess}
              className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#252525] hover:bg-[#333333] text-[11px] font-bold border border-[#444444] text-[#CCCCCC] transition cursor-pointer"
              title={
                activeShifts.length > 0
                  ? `Turno(s) Ativo(s): ${activeShifts.map(s => `${s.name} (${s.entrada}-${s.saida})`).join(' | ')} • Clique para ver/configurar`
                  : `Nenhum turno em operação no momento • Clique para ver/configurar horários`
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  activeShifts.length > 0 ? 'bg-[#00E676] animate-pulse' : 'bg-[#FF8C00]'
                }`}
              />
              <span className="truncate max-w-[180px]">
                {shiftsLabel}
              </span>
            </button>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            {/* Botão de Link Tablets / PC */}
            <button
              onClick={() => {
                setShowLinkModal(true);
                setCopiedLink(false);
              }}
              className="p-2 rounded-lg border border-[#333333] bg-[#1A1A1A] hover:bg-[#252525] text-[#888888] hover:text-[#38BDF8] hover:border-[#38BDF8]/40 transition cursor-pointer flex items-center gap-1.5"
              title="Link oficial para usar em todos os Tablets da fábrica e computadores"
              aria-label="Link para Tablets e PC"
            >
              <Share2 className="w-4 h-4 text-[#38BDF8]" />
              <span className="hidden lg:inline text-[11px] font-bold text-[#CCCCCC]">Link Tablets & PC</span>
            </button>

            {/* Ícone Discreto para Salvar Tudo (Backup Completo) e Restaurar (Foto 1) */}
            <button
              onClick={() => {
                setShowBackupModal(true);
                setBackupStatus(null);
              }}
              className="p-2 rounded-lg border border-[#333333] bg-[#1A1A1A] hover:bg-[#252525] text-[#888888] hover:text-[#00E676] hover:border-[#00E676]/40 transition cursor-pointer flex items-center gap-1.5"
              title="Backup & Restauração Completa: Salva tudo (registros, colaboradores, turnos e configurações) em arquivo seguro para restaurar quando quiser com um clique."
              aria-label="Backup e Restauração Completa"
            >
              <Database className="w-4 h-4 text-[#00E676]" />
              <span className="hidden xl:inline text-[11px] font-bold text-[#CCCCCC]">Salvar Tudo</span>
            </button>

            <button
              onClick={onToggleSound}
              className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                soundEnabled
                  ? 'bg-[#00E676]/10 border-[#00E676]/40 text-[#00E676] hover:bg-[#00E676]/20'
                  : 'bg-[#222222] border-[#444444] text-[#888888] hover:bg-[#333333]'
              }`}
              title={soundEnabled ? 'Alertas sonoros ativados' : 'Alertas sonoros desativados'}
              aria-label="Controle de áudio"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden md:inline">{soundEnabled ? 'Som Ativo' : 'Mudo'}</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg border border-[#444444] bg-[#222222] text-[#888888] hover:text-white hover:bg-[#333333] transition cursor-pointer"
              title="Alternar Modo Tela Cheia (Ideal para Totens e Tablets)"
              aria-label="Tela cheia"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Input de Arquivo Oculto para Restauração Rápida */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json,application/json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Modal Discreto de Salvar / Restaurar Tudo */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[#161616] border border-[#333333] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#00E676]/10 text-[#00E676]">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-wider text-white">
                    SALVAR / RESTAURAR TUDO
                  </h3>
                  <p className="text-[11px] text-[#888888]">
                    Backup instantâneo de Registros e Configurações
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBackupModal(false)}
                className="p-1 rounded-md text-[#888888] hover:text-white hover:bg-[#252525] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#CCCCCC] leading-relaxed">
              Salve todos os dados atuais do app em um único arquivo de segurança (JSON) para caso precise restaurar mais tarde em qualquer tablet ou computador.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Botão Salvar Tudo */}
              <button
                onClick={() => {
                  if (onExportFullBackup) onExportFullBackup();
                  setBackupStatus({
                    type: 'success',
                    message: 'Backup completo gerado e baixado com sucesso no seu dispositivo!',
                  });
                }}
                className="py-3 px-4 bg-[#00E676] hover:bg-[#00C853] text-black font-black text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-[#00E676]/20"
              >
                <Download className="w-4 h-4" />
                <span>SALVAR TUDO (DOWNLOAD)</span>
              </button>

              {/* Botão Restaurar Tudo */}
              <button
                disabled={isRestoring}
                onClick={() => fileInputRef.current?.click()}
                className="py-3 px-4 bg-[#1E293B] hover:bg-[#334155] text-[#38BDF8] border border-[#38BDF8]/40 hover:border-[#38BDF8] font-black text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>{isRestoring ? 'RESTAURANDO...' : 'CARREGAR / RESTAURAR'}</span>
              </button>
            </div>

            {backupStatus && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  backupStatus.type === 'success'
                    ? 'bg-[#00E676]/10 border border-[#00E676]/30 text-[#00E676]'
                    : 'bg-[#FF5252]/10 border border-[#FF5252]/30 text-[#FF5252]'
                }`}
              >
                {backupStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span className="leading-snug">{backupStatus.message}</span>
              </div>
            )}

            <div className="pt-2 text-[10px] text-[#666666] border-t border-[#262626] flex items-center justify-between">
              <span>Sincronização em tempo real ativa na nuvem</span>
              <button
                onClick={() => setShowBackupModal(false)}
                className="hover:text-white transition cursor-pointer font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal com o Link Único para Tablets e PCs da Fábrica */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[#161616] border border-[#333333] rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#262626] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#38BDF8]/10 text-[#38BDF8]">
                  <Tablet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-wider text-white">
                    LINK PARA TODOS OS TABLETS E COMPUTADORES
                  </h3>
                  <p className="text-[11px] text-[#888888]">
                    Mesmo link central compartilhado com sincronização em tempo real
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLinkModal(false)}
                className="p-1 rounded-md text-[#888888] hover:text-white hover:bg-[#252525] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#CCCCCC] leading-relaxed">
              Use o link abaixo em <strong>todos os tablets do chão de fábrica</strong> e no <strong>computador do líder</strong>. Todas as alterações, inícios de atividades e configurações sincronizam instantaneamente entre os dispositivos.
            </p>

            {/* Caixa do Link com Copiar */}
            {(() => {
              const shareUrl = window.location.origin.includes('ais-dev-')
                ? window.location.origin.replace('ais-dev-', 'ais-pre-')
                : window.location.origin;
              return (
                <div className="space-y-2">
                  <div className="p-3 bg-[#0D0D0D] border border-[#2D2D2D] rounded-xl flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-[#38BDF8] break-all select-all font-semibold">
                      {shareUrl}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 3000);
                      }}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        copiedLink
                          ? 'bg-[#00E676] text-black'
                          : 'bg-[#1E293B] hover:bg-[#334155] text-white border border-[#38BDF8]/30'
                      }`}
                    >
                      {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-[#00E676] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Link público e compartilhado (funciona em qualquer tablet, celular ou computador).</span>
                  </p>
                </div>
              );
            })()}

            <div className="bg-[#1A1A1A] p-3 rounded-xl border border-[#262626] text-xs space-y-1.5 text-[#AAAAAA]">
              <div className="flex items-center gap-2 text-white font-bold">
                <Wifi className="w-4 h-4 text-[#00E676]" />
                <span>Como funciona a sincronização central:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-[#BBBBBB]">
                <li>Qualquer atividade iniciada no Tablet A aparece no mesmo instante no Tablet B e na tela do Líder.</li>
                <li>Os dados ficam salvos permanentemente no banco central em nuvem da fábrica.</li>
                <li>Se a tela for atualizada ou fechar, os dados continuam intactos.</li>
              </ul>
            </div>

            <div className="pt-2 text-[10px] text-[#666666] border-t border-[#262626] flex items-center justify-between">
              <span>MCA Industrial • Conexão Ativa</span>
              <button
                onClick={() => setShowLinkModal(false)}
                className="hover:text-white transition cursor-pointer font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
