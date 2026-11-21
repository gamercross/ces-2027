// 마이크 소리(숫자 줄)를 말 한 토막씩으로 자른다. 폰 안 받아쓰기 모델에 넘길 토막을 만든다.
// 화면과 따로 두어 Node에서도 시험한다. 소리는 이 폰 안에서만 다룬다.

export const RATE = 16000;

// 다른 빠르기로 받은 소리를 16000으로 바꾼다 (줄 사이를 곧게 이어 어림한다).
export function resample(input, from, to = RATE) {
  if (from === to) return input;
  const n = Math.floor((input.length * to) / from);
  const out = new Float32Array(n);
  const step = from / to;
  for (let i = 0; i < n; i++) {
    const at = i * step;
    const a = Math.floor(at);
    const b = Math.min(input.length - 1, a + 1);
    out[i] = input[a] + (input[b] - input[a]) * (at - a);
  }
  return out;
}

export function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / (frame.length || 1));
}

// 말이 끊긴 곳(조용한 0.7초)에서 자른다. 너무 길면(14초) 그냥 자른다. 말이 없는 토막은 넘기지 않는다.
export class Segmenter {
  constructor({ rate = RATE, minSecs = 1.2, maxSecs = 14, quietSecs = 0.7, voicedSecs = 0.35, floor = 0.006 } = {}) {
    Object.assign(this, { rate, min: minSecs * rate, max: maxSecs * rate, quiet: quietSecs * rate, need: voicedSecs * rate, floor });
    this.frame = Math.round(rate * 0.02);
    this.noise = floor;
    this.reset();
    this.rest = new Float32Array(0);
  }

  reset() {
    this.parts = [];
    this.total = 0;
    this.voiced = 0;
    this.quietRun = 0;
  }

  take() {
    const out = new Float32Array(this.total);
    let at = 0;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    this.reset();
    return out;
  }

  // 소리 한 덩이를 넣는다. 다 된 토막들을 돌려준다 (없으면 빈 목록).
  push(chunk) {
    const done = [];
    const all = new Float32Array(this.rest.length + chunk.length);
    all.set(this.rest);
    all.set(chunk, this.rest.length);
    let at = 0;
    for (; at + this.frame <= all.length; at += this.frame) {
      const f = all.subarray(at, at + this.frame);
      const level = rms(f);
      const loud = level > Math.max(this.floor, this.noise * 3);
      if (loud) { this.voiced += f.length; this.quietRun = 0; }
      else { this.quietRun += f.length; this.noise = this.noise * 0.95 + level * 0.05; }
      // 말이 시작되기 전의 긴 조용함은 버린다 (끝의 0.3초만 남긴다).
      if (!this.voiced && this.total > this.rate) {
        const keep = Math.round(this.rate * 0.3);
        const tail = this.take().slice(-keep);
        this.parts = [tail];
        this.total = tail.length;
      }
      this.parts.push(f.slice());
      this.total += f.length;
      const spoke = this.voiced >= this.need;
      if (spoke && ((this.total >= this.min && this.quietRun >= this.quiet) || this.total >= this.max)) done.push(this.take());
      else if (!spoke && this.total >= this.max) this.reset();
    }
    this.rest = all.slice(at);
    return done;
  }

  // 멈출 때: 남은 것에 말이 있으면 돌려준다.
  flush() {
    const spoke = this.voiced >= this.need;
    const out = spoke ? this.take() : null;
    this.reset();
    this.rest = new Float32Array(0);
    return out;
  }
}
