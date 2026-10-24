import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, SlidersHorizontal, X, Video, Square, Download, RefreshCcw } from "lucide-react";
import { Auditorium } from "./Auditorium";
import { INTENSITY_LABELS, MAX_AUDIENCE, MAX_HATER_INTENSITY, MIN_AUDIENCE, validateConfig, type AudienceConfig } from "@/lib/audience";
import { CrowdAudio } from "@/lib/crowd-audio";
import { PracticeRecorder, type RecState } from "@/lib/recorder";

type Status = "idle" | "running" | "paused";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function NumField({ label, value, onChange, max, min = 0, disabled, tone }: {
  label: string; value: number; onChange: (n: number) => void; max: number; min?: number; disabled?: boolean; tone: string;
}) {
  return (
    <label className="sv-field">
      <span className="flex items-center gap-2"><i className={`sv-dot ${tone}`} />{label}</span>
      <input type="range" min={min} max={max} value={Math.min(value, max)} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} className="sv-range" />
      <input type="number" min={min} max={MAX_AUDIENCE} value={Number.isNaN(value) ? "" : value} disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} className="sv-num" />
    </label>
  );
}

function PracticePanel({ audio, onClose }: { audio: CrowdAudio; onClose: () => void }) {
  const rec = useRef<PracticeRecorder | null>(null);
  if (!rec.current) rec.current = new PracticeRecorder();
  const [state, setState] = useState<RecState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const liveRef = useRef<HTMLVideoElement>(null);
  const supported = PracticeRecorder.supported();

  useEffect(() => {
    if (state !== "recording") return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => () => {
    rec.current?.stopCamera();
    rec.current?.discard();
  }, []);

  const enableCamera = async () => {
    setError(null);
    try {
      const stream = await rec.current!.startCamera();
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => {});
      }
      setState("ready");
    } catch (e) {
      setError(PracticeRecorder.errorMessage(e));
    }
  };

  const startRec = () => {
    setError(null);
    try {
      // Records only the user's webcam and microphone, at full quality.
      rec.current!.start();
      setElapsed(0);
      setState("recording");
    } catch {
      setError("Couldn't start recording in this browser.");
    }
  };

  const stopRec = async () => {
    const url = await rec.current!.stop();
    if (liveRef.current) liveRef.current.srcObject = null;
    setVideoUrl(url);
    setState("recorded");
  };

  const retake = () => {
    rec.current!.discard();
    setVideoUrl(null);
    if (liveRef.current && rec.current!.stream) {
      liveRef.current.srcObject = rec.current!.stream;
      liveRef.current.play().catch(() => {});
    }
    setState("ready");
  };

  const close = () => {
    rec.current!.stopCamera();
    rec.current!.discard();
    onClose();
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="sv-panel absolute bottom-24 left-3 right-3 sm:bottom-auto sm:left-auto sm:right-5 sm:top-24 sm:w-80">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Practice studio</h2>
        <button className="sv-icon" onClick={close} aria-label="Close practice studio"><X size={16} /></button>
      </div>
      {!supported ? (
        <p className="mt-3 text-sm text-muted-foreground">
          This browser doesn't support camera recording. Try a recent Chrome, Edge, Firefox or Safari.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {state === "recorded" && videoUrl ? (
            <video src={videoUrl} controls playsInline className="aspect-video w-full rounded-md bg-black" />
          ) : (
            <video ref={liveRef} muted playsInline autoPlay className="aspect-video w-full -scale-x-100 rounded-md bg-black" />
          )}
          {state === "idle" && (
            <button className="sv-btn sv-btn-primary w-full" onClick={enableCamera}>
              <Video size={18} /> Enable camera &amp; mic
            </button>
          )}
          {state === "ready" && (
            <button className="sv-btn sv-btn-primary w-full" onClick={startRec}>
              <span className="inline-block size-3 rounded-full bg-red-500" /> Start recording
            </button>
          )}
          {state === "recording" && (
            <button className="sv-btn w-full" onClick={stopRec}>
              <Square size={16} /> Stop <span className="ml-auto font-mono text-sm text-red-400">● {mm}:{ss}</span>
            </button>
          )}
          {state === "recorded" && (
            <div className="flex gap-2">
              <button className="sv-btn flex-1" onClick={retake}><RefreshCcw size={16} /> Retake</button>
              <a className="sv-btn sv-btn-primary flex-1" href={videoUrl ?? undefined} download={`stageverse-practice.${(composite ? composer.current! : rec.current!).fileExt}`}>
                <Download size={16} /> Download
              </a>
            </div>
          )}
          {error && <p className="sv-error" role="alert">{error}</p>}
          {state === "idle" && !error && (
            <p className="text-xs text-muted-foreground">
              Record the live 3D stage together with your webcam (picture-in-picture), microphone and crowd audio. Falls back to webcam-only if stage capture isn't supported. Nothing leaves your device.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function StageVerse() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<AudienceConfig>({ size: 60, lovers: 15, haters: 10, intensity: 2, stones: true });
  const [config, setConfig] = useState<AudienceConfig>(draft);
  const [status, setStatus] = useState<Status>("idle");
  const [seed, setSeed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [showRoles, setShowRoles] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const running = useRef(false);
  const audio = useRef<CrowdAudio | null>(null);
  if (!audio.current) audio.current = new CrowdAudio();

  useEffect(() => setSupported(hasWebGL()), []);
  useEffect(() => () => audio.current?.dispose(), []);
  useEffect(() => audio.current?.setVolume(volume), [volume]);
  useEffect(() => audio.current?.setMuted(muted), [muted]);

  const v = validateConfig(draft);
  const locked = status !== "idle";

  const start = () => {
    if (status === "idle") {
      if (!v.ok) return;
      setConfig(draft);
      setSeed((s) => s + 1);
    }
    audio.current!.init();
    audio.current!.resume();
    running.current = true;
    setStatus("running");
    if (window.innerWidth < 768) setPanelOpen(false);
  };
  const pause = () => {
    running.current = false;
    audio.current?.suspend();
    setStatus("paused");
  };
  const reset = () => {
    running.current = false;
    audio.current?.suspend();
    setStatus("idle");
    setSeed((s) => s + 1);
    setPanelOpen(true);
  };

  // live preview of the seated crowd while configuring
  useEffect(() => {
    if (status === "idle" && v.ok) setConfig(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.size, draft.lovers, draft.haters, draft.intensity, draft.stones, status]);

  if (supported === false)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="sv-panel max-w-md">
          <h1 className="font-display text-3xl">StageVerse</h1>
          <p className="mt-3 text-muted-foreground">Your device or browser doesn't support 3D graphics (WebGL). Try a recent Chrome, Safari, Firefox or Edge, or enable hardware acceleration.</p>
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {supported && (
        <Auditorium config={config} running={running} audio={audio.current} showRoles={showRoles} seed={seed} />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-5">
        <div className="pointer-events-auto">
          <h1 className="font-display text-2xl leading-none sm:text-3xl">StageVerse</h1>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {status === "running" ? "● Live" : status === "paused" ? "Paused" : "Rehearsal setup"}
          </p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button className="sv-icon" onClick={() => setPracticeOpen((o) => !o)} aria-label="Toggle practice studio" title="Practice studio">
            <Video size={18} />
          </button>
          <button className="sv-icon" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))}
            className="sv-range hidden w-24 sm:block" aria-label="Volume" />
          <button className="sv-icon" onClick={() => setPanelOpen((o) => !o)} aria-label="Toggle settings">
            {panelOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
          </button>
        </div>
      </div>

      {practiceOpen && <PracticePanel audio={audio.current} onClose={() => setPracticeOpen(false)} />}

      {panelOpen && (
        <div className="sv-panel absolute bottom-24 left-3 right-3 sm:bottom-auto sm:left-5 sm:right-auto sm:top-24 sm:w-80">
          <h2 className="font-display text-xl">Your audience</h2>
          <div className="mt-3 space-y-3">
            <NumField label="Audience size" tone="sv-dot-all" value={draft.size} min={MIN_AUDIENCE} max={MAX_AUDIENCE} disabled={locked}
              onChange={(n) => setDraft((d) => ({ ...d, size: n }))} />
            <NumField label="Lovers (supporters)" tone="sv-dot-lover" value={draft.lovers} max={draft.size || MAX_AUDIENCE} disabled={locked}
              onChange={(n) => setDraft((d) => ({ ...d, lovers: n }))} />
            <NumField label="Haters (critics)" tone="sv-dot-hater" value={draft.haters} max={draft.size || MAX_AUDIENCE} disabled={locked}
              onChange={(n) => setDraft((d) => ({ ...d, haters: n }))} />
            <p className="text-sm text-muted-foreground">Neutral: <strong className="text-foreground">{v.neutral}</strong></p>
            <label className="sv-field">
              <span className="flex items-center gap-2"><i className="sv-dot sv-dot-hater" />Hater intensity: <strong>{INTENSITY_LABELS[draft.intensity] ?? draft.intensity}</strong></span>
              <input type="range" min={0} max={MAX_HATER_INTENSITY} step={1} value={draft.intensity} disabled={locked}
                onChange={(e) => setDraft((d) => ({ ...d, intensity: Number(e.target.value) }))} className="sv-range" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.stones} disabled={locked || draft.intensity < 2 || draft.haters === 0}
                onChange={(e) => setDraft((d) => ({ ...d, stones: e.target.checked }))} className="accent-primary" />
              Stone-throwing effect (High/Extreme intensity)
            </label>
            {!v.ok && <p className="sv-error" role="alert">{v.error}</p>}
            {locked && <p className="text-xs text-muted-foreground">Reset to change the audience.</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showRoles} onChange={(e) => setShowRoles(e.target.checked)} className="accent-primary" />
              Show role markers above heads
            </label>
            <div className="flex items-center gap-2 sm:hidden">
              <span className="text-sm">Volume</span>
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="sv-range flex-1" />
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 p-4 sm:p-6">
        {status === "running" ? (
          <button className="sv-btn" onClick={pause}><Pause size={18} /> Pause</button>
        ) : (
          <button className="sv-btn sv-btn-primary" onClick={start} disabled={status === "idle" && !v.ok}>
            <Play size={18} /> {status === "paused" ? "Resume" : "Start"}
          </button>
        )}
        <button className="sv-btn" onClick={reset} disabled={status === "idle"}><RotateCcw size={18} /> Reset</button>
      </div>
    </div>
  );
}
