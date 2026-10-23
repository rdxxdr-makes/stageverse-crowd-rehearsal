// Lightweight webcam head tracking with zero dependencies: samples a tiny
// video frame, finds the skin-tone centroid and maps it to approximate head
// yaw/pitch. When no face is visible it keeps the last pose, so the guest
// never snaps — and if the camera is unavailable the caller falls back to
// the guest's preset animations.

const W = 64;
const H = 48;
const INTERVAL = 100; // ms between samples — well under any frame budget

export class HeadMimic {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private timer: number | null = null;
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D | null = null;
  yaw = 0;
  pitch = 0;
  active = false;

  static supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Requests the camera (video only, no audio) and starts sampling. */
  async start(): Promise<boolean> {
    if (!HeadMimic.supported()) return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
        audio: false,
      });
    } catch {
      return false; // permission denied or no camera — caller falls back
    }
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!this.ctx) {
      this.stopStream();
      return false;
    }
    this.canvas.width = W;
    this.canvas.height = H;
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = this.stream;
    await v.play().catch(() => {});
    this.video = v;
    this.active = true;
    this.timer = window.setInterval(() => this.sample(), INTERVAL);
    return true;
  }

  private sample() {
    const v = this.video;
    const g = this.ctx;
    if (!v || !g || v.readyState < 2 || !v.videoWidth) return;
    // draw mirrored so left/right match what the user sees of themselves
    g.save();
    g.scale(-1, 1);
    g.drawImage(v, -W, 0, W, H);
    g.restore();
    const data = g.getImageData(0, 0, W, H).data;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = data[i]!;
        const gr = data[i + 1]!;
        const b = data[i + 2]!;
        // classic skin-tone rule; coarse but dependency-free
        if (r > 95 && gr > 40 && b > 20 && r > gr && r > b && r - Math.min(gr, b) > 15) {
          n++;
          sx += x;
          sy += y;
        }
      }
    }
    if (n < W * H * 0.02) return; // too little skin visible — keep the last pose
    const cx = sx / n / W;
    const cy = sy / n / H;
    const tyaw = (0.5 - cx) * 1.6;
    const tpitch = (cy - 0.5) * 0.9;
    const k = 0.25; // per-sample smoothing
    this.yaw += (tyaw - this.yaw) * k;
    this.pitch += (tpitch - this.pitch) * k;
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stopStream();
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.active = false;
  }

  private stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
