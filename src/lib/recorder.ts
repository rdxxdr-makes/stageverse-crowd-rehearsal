// Real webcam + microphone practice recorder built on getUserMedia + MediaRecorder.
export type RecState = "idle" | "ready" | "recording" | "recorded";

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

export class PracticeRecorder {
  stream: MediaStream | null = null;
  blobUrl: string | null = null;
  mimeType = "";
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  static supported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    );
  }

  static errorMessage(e: unknown): string {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError")
      return "Camera and microphone permission was denied. Allow access in your browser's site settings, then try again.";
    if (name === "NotFoundError" || name === "OverconstrainedError")
      return "No camera or microphone was found on this device.";
    if (name === "NotReadableError")
      return "Your camera or microphone is busy in another app. Close it and try again.";
    return "Couldn't access the camera or microphone. Check your device and browser settings.";
  }

  async startCamera(): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    return this.stream;
  }

  start() {
    if (!this.stream) throw new Error("Camera not started");
    this.mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(250);
  }

  stop(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state === "inactive") return resolve(this.blobUrl);
      this.rec.onstop = () => {
        this.discard();
        const blob = new Blob(this.chunks, { type: this.mimeType || "video/webm" });
        this.blobUrl = URL.createObjectURL(blob);
        resolve(this.blobUrl);
      };
      this.rec.stop();
    });
  }

  discard() {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
  }

  stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    this.rec = null;
  }

  get fileExt() {
    return this.mimeType.includes("mp4") ? "mp4" : "webm";
  }
}

/**
 * Records the live 3D stage together with the webcam (as a picture-in-picture),
 * the microphone and the crowd audio — all composited into one MediaStream.
 */
export class StageComposer {
  canvas: HTMLCanvasElement | null = null;
  blobUrl: string | null = null;
  mimeType = "";
  private stage: HTMLCanvasElement | null = null;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private ctx: AudioContext | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  static supported(): boolean {
    return (
      typeof document !== "undefined" &&
      typeof HTMLCanvasElement.prototype.captureStream === "function" &&
      typeof MediaRecorder !== "undefined"
    );
  }

  /** The R3F canvas rendering the auditorium, if present. */
  static findStageCanvas(): HTMLCanvasElement | null {
    return document.querySelector<HTMLCanvasElement>("[data-stage-canvas] canvas");
  }

  private draw = () => {
    const c = this.canvas;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0d0809";
    g.fillRect(0, 0, c.width, c.height);
    const s = this.stage;
    if (s && s.width > 0 && s.height > 0) {
      const k = Math.min(c.width / s.width, c.height / s.height);
      const w = s.width * k;
      const h = s.height * k;
      try {
        g.drawImage(s, (c.width - w) / 2, (c.height - h) / 2, w, h);
      } catch {
        // WebGL canvas not ready this frame — retry on the next one
      }
    }
    const v = this.video;
    if (v && v.readyState >= 2 && v.videoWidth > 0) {
      const pw = Math.round(c.width * 0.24);
      const ph = Math.round((pw * v.videoHeight) / v.videoWidth);
      const px = c.width - pw - 18;
      const py = c.height - ph - 18;
      g.save();
      g.translate(px + pw, py);
      g.scale(-1, 1);
      g.drawImage(v, 0, 0, pw, ph);
      g.restore();
      g.strokeStyle = "rgba(245,185,66,0.85)";
      g.lineWidth = 2;
      g.strokeRect(px, py, pw, ph);
    }
    this.raf = requestAnimationFrame(this.draw);
  };

  /** Builds the composite video+audio stream and starts recording. Returns false when unsupported. */
  start(stage: HTMLCanvasElement | null, camStream: MediaStream, crowdStream: MediaStream | null): boolean {
    if (!StageComposer.supported()) return false;
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    this.canvas = c;
    this.stage = stage;
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = camStream;
    v.play().catch(() => {});
    this.video = v;
    this.draw();

    const tracks: MediaStreamTrack[] = [...c.captureStream(30).getVideoTracks()];
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(camStream).connect(dest);
      if (crowdStream?.getAudioTracks().length) ctx.createMediaStreamSource(crowdStream).connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    } catch {
      // audio mixing unavailable in this browser — record the composite video only
    }
    this.chunks = [];
    this.mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    this.rec = new MediaRecorder(new MediaStream(tracks), this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(250);
    return true;
  }

  stop(): Promise<string | null> {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state === "inactive") return resolve(this.blobUrl);
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType || "video/webm" });
        this.blobUrl = URL.createObjectURL(blob);
        resolve(this.blobUrl);
      };
      this.rec.stop();
    });
  }

  discard() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.canvas = null;
    this.stage = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.chunks = [];
    this.rec = null;
    this.ctx?.close();
    this.ctx = null;
  }

  get fileExt() {
    return this.mimeType.includes("mp4") ? "mp4" : "webm";
  }
}
