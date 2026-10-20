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
